import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withUserContext } from "@/lib/user-context";
import { withOrganization } from "@/lib/tenant-context";
import { hasPermission } from "@/lib/permissions";
import { enqueueCloudSync, listCloudSyncJobs } from "@/lib/cloud-sync/queue";

export const runtime = "nodejs";

async function authorize(organizationId: string, userId: string) {
  const membership = await withUserContext(prisma, userId, (tx) => tx.membership.findFirst({ where: { organizationId, userId }, select: { role: true } }));
  return membership && hasPermission(membership.role, "cloud:write");
}

export async function GET(_request: Request, { params }: { params: Promise<{ organizationId: string; accountId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { organizationId, accountId } = await params;
  if (!await authorize(organizationId, session.user.id)) return NextResponse.json({ error: "Cloud account management permission required." }, { status: 403 });
  const account = await withOrganization(prisma, organizationId, (tx) => tx.cloudAccount.findFirst({ where: { id: accountId, organizationId }, select: { id: true } }));
  if (!account) return NextResponse.json({ error: "Cloud account not found." }, { status: 404 });
  const jobs = await listCloudSyncJobs(organizationId, accountId);
  return NextResponse.json({ jobs });
}

export async function POST(_request: Request, { params }: { params: Promise<{ organizationId: string; accountId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { organizationId, accountId } = await params;
  if (!await authorize(organizationId, session.user.id)) return NextResponse.json({ error: "Cloud account management permission required." }, { status: 403 });
  try {
    const result = await enqueueCloudSync({ organizationId, cloudAccountId: accountId });
    await withOrganization(prisma, organizationId, (tx) => tx.auditLog.create({ data: { organizationId, actorUserId: session.user.id, action: "CLOUD_SYNC_QUEUED", entityType: "CloudSyncJob", entityId: result.job.id, metadata: { cloudAccountId: accountId, alreadyQueued: result.alreadyQueued } } }));
    return NextResponse.json({ job: result.job, alreadyQueued: result.alreadyQueued }, { status: result.alreadyQueued ? 200 : 202 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to queue cloud sync." }, { status: 400 });
  }
}
