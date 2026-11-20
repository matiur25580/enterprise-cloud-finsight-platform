import { CloudSyncJobStatus, CloudSyncTrigger, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withOrganization } from "@/lib/tenant-context";

export async function enqueueCloudSync(input: { organizationId: string; cloudAccountId: string; trigger?: CloudSyncTrigger }) {
  try {
    return await withOrganization(prisma, input.organizationId, async (tx) => {
      const account = await tx.cloudAccount.findFirst({ where: { id: input.cloudAccountId, organizationId: input.organizationId }, select: { id: true, status: true } });
      if (!account) throw new Error("Cloud account not found in this organization.");
      if (account.status !== "ACTIVE") throw new Error("Only ACTIVE cloud accounts can be synchronized.");
      const existing = await tx.cloudSyncJob.findFirst({ where: { organizationId: input.organizationId, cloudAccountId: input.cloudAccountId, status: { in: [CloudSyncJobStatus.QUEUED, CloudSyncJobStatus.RUNNING] } }, orderBy: { createdAt: "desc" } });
      if (existing) return { job: existing, alreadyQueued: true };
      const job = await tx.cloudSyncJob.create({ data: { organizationId: input.organizationId, cloudAccountId: input.cloudAccountId, trigger: input.trigger ?? CloudSyncTrigger.MANUAL } });
      return { job, alreadyQueued: false };
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      const existing = await withOrganization(prisma, input.organizationId, (tx) => tx.cloudSyncJob.findFirst({
        where: { organizationId: input.organizationId, cloudAccountId: input.cloudAccountId, status: { in: [CloudSyncJobStatus.QUEUED, CloudSyncJobStatus.RUNNING] } },
        orderBy: { createdAt: "desc" }
      }));
      if (existing) return { job: existing, alreadyQueued: true };
    }
    throw error;
  }
}

export async function listCloudSyncJobs(organizationId: string, cloudAccountId: string, take = 20) {
  return withOrganization(prisma, organizationId, (tx) => tx.cloudSyncJob.findMany({
    where: { organizationId, cloudAccountId }, orderBy: { createdAt: "desc" }, take,
    select: { id: true, status: true, trigger: true, attemptCount: true, maxAttempts: true, availableAt: true, startedAt: true, completedAt: true, errorCode: true, errorMessage: true, createdAt: true }
  }));
}

export async function enqueueDueScheduledSyncs(limit = 50): Promise<number> {
  const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
  return prisma.$transaction(async (tx) => {
    const due = await tx.$queryRaw<Array<{ id: string; organization_id: string; sync_interval_minutes: number }>>(Prisma.sql`
      WITH candidates AS (
        SELECT id FROM cloud_accounts
        WHERE sync_enabled = true AND status = 'ACTIVE'
          AND next_sync_at IS NOT NULL AND next_sync_at <= NOW()
        ORDER BY next_sync_at ASC
        LIMIT ${safeLimit} FOR UPDATE SKIP LOCKED
      )
      UPDATE cloud_accounts AS account
      SET next_sync_at = NOW() + make_interval(mins => account.sync_interval_minutes),
          updated_at = NOW()
      FROM candidates
      WHERE account.id = candidates.id
      RETURNING account.id, account.organization_id, account.sync_interval_minutes
    `);
    let queued = 0;
    for (const account of due) {
      const result = await tx.cloudSyncJob.createMany({
        data: [{ organizationId: account.organization_id, cloudAccountId: account.id, trigger: CloudSyncTrigger.SCHEDULED }],
        skipDuplicates: true
      });
      queued += result.count;
    }
    return queued;
  });
}
