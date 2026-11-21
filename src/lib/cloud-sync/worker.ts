import { CloudSyncJobStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withOrganization } from "@/lib/tenant-context";
import { importBillingCsv } from "@/lib/billing/import-service";
import { executeProviderBillingSync } from "./provider-adapters";
import { ProviderCredentialConfigurationError } from "./errors";
import { deliverSyncAlert } from "./notifications";
import { updateClaimedCloudSyncJob } from "./attempt-fence";

type ClaimedJob = { id: string; organization_id: string; cloud_account_id: string; attempt_count: number; max_attempts: number };

async function notifyTerminalOutcome(job: ClaimedJob, status: "FAILED" | "BLOCKED" | "RECOVERED", details: {
  errorCode?: string | null; importedRows?: number; rejectedRows?: number; duplicateRows?: number;
} = {}): Promise<void> {
  try {
    const account = await withOrganization(prisma, job.organization_id, (tx) => tx.cloudAccount.findFirst({
      where: { id: job.cloud_account_id, organizationId: job.organization_id },
      select: { name: true, provider: true }
    }));
    if (!account) return;
    await deliverSyncAlert({
      status, provider: account.provider, accountName: account.name,
      errorCode: details.errorCode, attemptCount: job.attempt_count,
      importedRows: details.importedRows, rejectedRows: details.rejectedRows,
      duplicateRows: details.duplicateRows
    });
  } catch {
    // Alert delivery and lookup are best-effort; never roll back or reclassify a sync job.
  }
}


async function writeSyncAudit(job: ClaimedJob, action: string, metadata: Record<string, string | number | boolean | null>): Promise<void> {
  try {
    await withOrganization(prisma, job.organization_id, (tx) => tx.auditLog.create({
      data: {
        organizationId: job.organization_id, actorUserId: null, action,
        entityType: "CloudSyncJob", entityId: job.id, metadata
      }
    }));
  } catch {
    // Audit instrumentation must not interrupt provider execution or job recovery.
  }
}

export async function claimNextCloudSyncJob(): Promise<ClaimedJob | null> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      UPDATE cloud_sync_jobs
      SET status = 'FAILED', completed_at = NOW(), error_code = 'WORKER_LEASE_EXPIRED',
          error_message = 'Worker lease expired after the maximum number of attempts.', updated_at = NOW()
      WHERE status = 'RUNNING' AND started_at < NOW() - INTERVAL '10 minutes'
        AND attempt_count >= max_attempts
    `;
    const jobs = await tx.$queryRaw<ClaimedJob[]>(Prisma.sql`
      WITH candidate AS (
        SELECT id FROM cloud_sync_jobs
        WHERE (status = 'QUEUED' AND available_at <= NOW())
           OR (status = 'RUNNING' AND started_at < NOW() - INTERVAL '10 minutes' AND attempt_count < max_attempts)
        ORDER BY available_at ASC, created_at ASC
        LIMIT 1 FOR UPDATE SKIP LOCKED
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
  const attemptedAt = new Date();
  await writeSyncAudit(job, "CLOUD_SYNC_STARTED", { attempt: job.attempt_count, maxAttempts: job.max_attempts });
  try {
    const account = await withOrganization(prisma, job.organization_id, (tx) => tx.cloudAccount.findFirst({
      where: { id: job.cloud_account_id, organizationId: job.organization_id },
      select: { provider: true, externalAccountId: true, status: true, credentialRef: true, currency: true, name: true }
    }));
    if (!account || account.status !== "ACTIVE") throw new Error("Cloud account is no longer active.");
    const result = await executeProviderBillingSync({
      provider: account.provider, externalAccountId: account.externalAccountId,
      organizationId: job.organization_id, cloudAccountId: job.cloud_account_id,
      credentialRef: account.credentialRef, defaultCurrency: account.currency
    });
    const imported = await importBillingCsv({
      organizationId: job.organization_id, cloudAccountId: job.cloud_account_id,
      fileName: account.provider.toLowerCase() + "-live-sync-" + attemptedAt.toISOString().replace(/[:.]/g, "-") + ".csv",
      csvText: result.csv
    });
    const completelyRejected = imported.totalRows > 0 && imported.importedRows === 0 && imported.duplicateRows === 0;
    const previousJob = completelyRejected ? null : await withOrganization(prisma, job.organization_id, (tx) => tx.cloudSyncJob.findFirst({
      where: { organizationId: job.organization_id, cloudAccountId: job.cloud_account_id, id: { not: job.id } },
      orderBy: { createdAt: "desc" }, select: { status: true }
    }));
    const finalized = await withOrganization(prisma, job.organization_id, async (tx) => {
      const claimed = await updateClaimedCloudSyncJob(tx, job, {
        status: completelyRejected ? CloudSyncJobStatus.FAILED : CloudSyncJobStatus.SUCCEEDED,
        completedAt: new Date(),
        errorCode: imported.rejectedRows > 0 ? "BILLING_ROWS_REJECTED" : null,
        errorMessage: imported.rejectedRows > 0 ? imported.rejectedRows + " billing row(s) were rejected by the canonical import validator." : null,
        totalRows: imported.totalRows, importedRows: imported.importedRows,
        rejectedRows: imported.rejectedRows, duplicateRows: imported.duplicateRows
      });
      if (!claimed) return false;
      await tx.cloudAccount.update({ where: { id: job.cloud_account_id }, data: { lastSyncedAt: completelyRejected ? undefined : new Date(), lastSyncAttemptAt: new Date() } });
      return true;
    });
    // A newer worker owns this job now. Do not emit stale completion audits or alerts.
    if (!finalized) return;
    await writeSyncAudit(job, completelyRejected ? "CLOUD_SYNC_FAILED" : "CLOUD_SYNC_SUCCEEDED", {
      attempt: job.attempt_count, totalRows: imported.totalRows, importedRows: imported.importedRows,
      rejectedRows: imported.rejectedRows, duplicateRows: imported.duplicateRows,
      errorCode: completelyRejected ? "BILLING_ROWS_REJECTED" : null
    });
    if (completelyRejected) {
      await notifyTerminalOutcome(job, "FAILED", { errorCode: "BILLING_ROWS_REJECTED", importedRows: imported.importedRows, rejectedRows: imported.rejectedRows, duplicateRows: imported.duplicateRows });
    } else if (previousJob && (previousJob.status === CloudSyncJobStatus.FAILED || previousJob.status === CloudSyncJobStatus.BLOCKED)) {
      await notifyTerminalOutcome(job, "RECOVERED", { importedRows: imported.importedRows, rejectedRows: imported.rejectedRows, duplicateRows: imported.duplicateRows });
    }
  } catch (error) {
    const blocked = error instanceof ProviderCredentialConfigurationError;
    const message = error instanceof Error ? error.message : "Cloud billing synchronization failed.";
    const retry = !blocked && job.attempt_count < job.max_attempts;
    const finalized = await withOrganization(prisma, job.organization_id, async (tx) => {
      const claimed = await updateClaimedCloudSyncJob(tx, job, {
        status: blocked ? CloudSyncJobStatus.BLOCKED : retry ? CloudSyncJobStatus.QUEUED : CloudSyncJobStatus.FAILED,
        availableAt: retry ? new Date(Date.now() + Math.min(60, 2 ** job.attempt_count) * 60_000) : undefined,
        completedAt: retry ? null : new Date(),
        errorCode: blocked ? "PROVIDER_CREDENTIALS_NOT_CONFIGURED" : "SYNC_EXECUTION_FAILED",
        errorMessage: message.slice(0, 1000)
      });
      if (!claimed) return false;
      await tx.cloudAccount.update({ where: { id: job.cloud_account_id }, data: { lastSyncAttemptAt: new Date() } });
      return true;
    });
    if (!finalized) return;
    if (blocked || !retry) {
      await writeSyncAudit(job, blocked ? "CLOUD_SYNC_BLOCKED" : "CLOUD_SYNC_FAILED", {
        attempt: job.attempt_count, maxAttempts: job.max_attempts,
        errorCode: blocked ? "PROVIDER_CREDENTIALS_NOT_CONFIGURED" : "SYNC_EXECUTION_FAILED"
      });
      await notifyTerminalOutcome(job, blocked ? "BLOCKED" : "FAILED", { errorCode: blocked ? "PROVIDER_CREDENTIALS_NOT_CONFIGURED" : "SYNC_EXECUTION_FAILED" });
    }
  }
}
