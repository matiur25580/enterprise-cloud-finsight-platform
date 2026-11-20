import "server-only";
import { CloudSyncJobStatus, CloudSyncTrigger, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withOrganization } from "@/lib/tenant-context";

export async function enqueueCloudSync(input: { organizationId: string; cloudAccountId: string; trigger?: CloudSyncTrigger }) {
  return withOrganization(prisma, input.organizationId, async (tx) => {
    const account = await tx.cloudAccount.findFirst({ where: { id: input.cloudAccountId, organizationId: input.organizationId }, select: { id: true, status: true } });
    if (!account) throw new Error("Cloud account not found in this organization.");
    if (account.status !== "ACTIVE") throw new Error("Only ACTIVE cloud accounts can be synchronized.");
    const existing = await tx.cloudSyncJob.findFirst({ where: { organizationId: input.organizationId, cloudAccountId: input.cloudAccountId, status: { in: [CloudSyncJobStatus.QUEUED, CloudSyncJobStatus.RUNNING] } }, orderBy: { createdAt: "desc" } });
    if (existing) return { job: existing, alreadyQueued: true };
    const job = await tx.cloudSyncJob.create({ data: { organizationId: input.organizationId, cloudAccountId: input.cloudAccountId, trigger: input.trigger ?? CloudSyncTrigger.MANUAL } });
    return { job, alreadyQueued: false };
  });
}

export async function listCloudSyncJobs(organizationId: string, cloudAccountId: string, take = 20) {
  return withOrganization(prisma, organizationId, (tx) => tx.cloudSyncJob.findMany({
    where: { organizationId, cloudAccountId }, orderBy: { createdAt: "desc" }, take,
    select: { id: true, status: true, trigger: true, attemptCount: true, maxAttempts: true, availableAt: true, startedAt: true, completedAt: true, errorCode: true, errorMessage: true, createdAt: true }
  }));
}

export async function updateSyncSchedule(input: { organizationId: string; cloudAccountId: string; enabled: boolean; intervalMinutes: number }) {
  return withOrganization(prisma, input.organizationId, async (tx) => {
    const account = await tx.cloudAccount.findFirst({ where: { id: input.cloudAccountId, organizationId: input.organizationId }, select: { id: true } });
    if (!account) throw new Error("Cloud account not found in this organization.");
    return tx.cloudAccount.update({ where: { id: account.id }, data: { syncEnabled: input.enabled, syncIntervalMinutes: input.intervalMinutes, nextSyncAt: input.enabled ? new Date(Date.now() + input.intervalMinutes * 60_000) : null }, select: { id: true, syncEnabled: true, syncIntervalMinutes: true, nextSyncAt: true } });
  });
}
