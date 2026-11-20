import "server-only";
import { CloudSyncJobStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withOrganization } from "@/lib/tenant-context";
import { executeProviderBillingSync, ProviderConnectorUnavailableError } from "./provider-adapters";

type ClaimedJob = { id: string; organization_id: string; cloud_account_id: string; attempt_count: number; max_attempts: number };
export async function claimNextCloudSyncJob(): Promise<ClaimedJob | null> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.is_sync_worker', 'true', true)`;
    const jobs = await tx.$queryRaw<ClaimedJob[]>(Prisma.sql`
      WITH candidate AS (
        SELECT id FROM cloud_sync_jobs
        WHERE status = 'QUEUED' AND available_at <= NOW()
        ORDER BY available_at ASC, created_at ASC
        FOR UPDATE SKIP LOCKED LIMIT 1
      )
      UPDATE cloud_sync_jobs AS job
      SET status = 'RUNNING', attempt_count = job.attempt_count + 1,
          started_at = NOW(), completed_at = NULL, updated_at = NOW()
      FROM candidate WHERE job.id = candidate.id
      RETURNING job.id, job.organization_id, job.cloud_account_id, job.attempt_count, job.max_attempts
    `);
    return jobs[0] ?? null;
  });
}

export async function processCloudSyncJob(job: ClaimedJob): Promise<void> {
  try {
    const account = await withOrganization(prisma, job.organization_id, (tx) => tx.cloudAccount.findFirst({ where: { id: job.cloud_account_id, organizationId: job.organization_id }, select: { provider: true, externalAccountId: true, status: true } }));
    if (!account || account.status !== "ACTIVE") throw new Error("Cloud account is no longer active.");
    await executeProviderBillingSync(account.provider, account.externalAccountId);
  } catch (error) {
    const blocked = error instanceof ProviderConnectorUnavailableError;
    const message = error instanceof Error ? error.message : "Cloud billing synchronization failed.";
    const errorCode = blocked ? "PROVIDER_CONNECTOR_NOT_CONFIGURED" : "SYNC_EXECUTION_FAILED";
    const retry = !blocked && job.attempt_count < job.max_attempts;
    await withOrganization(prisma, job.organization_id, async (tx) => {
      await tx.cloudSyncJob.update({ where: { id: job.id }, data: { status: blocked ? CloudSyncJobStatus.BLOCKED : retry ? CloudSyncJobStatus.QUEUED : CloudSyncJobStatus.FAILED, availableAt: retry ? new Date(Date.now() + Math.min(60, 2 ** job.attempt_count) * 60_000) : undefined, completedAt: retry ? null : new Date(), errorCode, errorMessage: message.slice(0, 1000) } });
      await tx.cloudAccount.update({ where: { id: job.cloud_account_id }, data: { lastSyncAttemptAt: new Date() } });
    });
    return;
  }
  await withOrganization(prisma, job.organization_id, async (tx) => {
    await tx.cloudSyncJob.update({ where: { id: job.id }, data: { status: CloudSyncJobStatus.SUCCEEDED, completedAt: new Date(), errorCode: null, errorMessage: null } });
    await tx.cloudAccount.update({ where: { id: job.cloud_account_id }, data: { lastSyncedAt: new Date(), lastSyncAttemptAt: new Date() } });
  });
}
