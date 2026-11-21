import { CloudSyncJobStatus, Prisma } from "@prisma/client";

type ClaimedJobFence = {
  id: string;
  organization_id: string;
  attempt_count: number;
};

/**
 * A worker may finish after its lease expires and another worker reclaims the job.
 * Only the worker holding the current attempt number may change the job's terminal
 * or retry state. The attempt counter is incremented atomically when a job is claimed.
 */
export async function updateClaimedCloudSyncJob(
  tx: Pick<Prisma.TransactionClient, "cloudSyncJob">,
  job: ClaimedJobFence,
  data: Prisma.CloudSyncJobUpdateManyMutationInput
): Promise<boolean> {
  const result = await tx.cloudSyncJob.updateMany({
    where: {
      id: job.id,
      organizationId: job.organization_id,
      status: CloudSyncJobStatus.RUNNING,
      attemptCount: job.attempt_count
    },
    data
  });

  return result.count === 1;
}
