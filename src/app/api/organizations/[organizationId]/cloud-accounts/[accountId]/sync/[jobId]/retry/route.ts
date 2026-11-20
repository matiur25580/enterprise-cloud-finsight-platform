import { NextResponse } from "next/server";
import { CloudSyncJobStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withUserContext } from "@/lib/user-context";
import { withOrganization } from "@/lib/tenant-context";
import { hasPermission } from "@/lib/permissions";

export const runtime = "nodejs";

export async function POST(_request: Request, { params }: { params: Promise<{ organizationId: string; accountId: string; jobId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { organizationId, accountId, jobId } = await params;
  const membership = await withUserContext(prisma, session.user.id, (tx) => tx.membership.findFirst({
    where: { organizationId, userId: session.user.id }, select: { role: true }
  }));
  if (!membership || !hasPermission(membership.role, "cloud:write")) {
    return NextResponse.json({ error: "Cloud account management permission required." }, { status: 403 });
  }

  try {
    const result = await withOrganization(prisma, organizationId, async (tx) => {
      const account = await tx.cloudAccount.findFirst({
        where: { id: accountId, organizationId }, select: { id: true, status: true }
      });
      if (!account) return { error: "Cloud account not found.", status: 404 as const };
      if (account.status !== "ACTIVE") return { error: "Activate the cloud account before retrying a sync.", status: 409 as const };
      const active = await tx.cloudSyncJob.findFirst({
        where: { organizationId, cloudAccountId: accountId, status: { in: [CloudSyncJobStatus.QUEUED, CloudSyncJobStatus.RUNNING] } },
        select: { id: true }
      });
      if (active) return { error: "Another sync job is already queued or running.", status: 409 as const };
      const changed = await tx.cloudSyncJob.updateMany({
        where: { id: jobId, organizationId, cloudAccountId: accountId, status: { in: [CloudSyncJobStatus.FAILED, CloudSyncJobStatus.BLOCKED] } },
        data: {
          status: CloudSyncJobStatus.QUEUED, attemptCount: 0, availableAt: new Date(),
          startedAt: null, completedAt: null, errorCode: null, errorMessage: null,
          totalRows: 0, importedRows: 0, rejectedRows: 0, duplicateRows: 0
        }
      });
      if (changed.count !== 1) return { error: "Only failed or blocked jobs can be retried. Refresh the job history and try again.", status: 409 as const };
      await tx.auditLog.create({
        data: {
          organizationId, actorUserId: session.user.id, action: "CLOUD_SYNC_RETRY_REQUESTED",
          entityType: "CloudSyncJob", entityId: jobId,
          metadata: { cloudAccountId: accountId, previousStatus: "FAILED_OR_BLOCKED" }
        }
      });
      const job = await tx.cloudSyncJob.findFirst({ where: { id: jobId, organizationId, cloudAccountId: accountId } });
      return { job, status: 202 as const };
    });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ job: result.job }, { status: result.status });
  } catch {
    return NextResponse.json({ error: "Unable to queue this sync retry." }, { status: 500 });
  }
}
