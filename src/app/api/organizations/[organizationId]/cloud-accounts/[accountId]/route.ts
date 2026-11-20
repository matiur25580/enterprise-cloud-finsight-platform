import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withUserContext } from "@/lib/user-context";
import { withOrganization } from "@/lib/tenant-context";
import { hasPermission } from "@/lib/permissions";
import { updateCloudAccountSchema } from "@/lib/cloud-accounts/validation";
export const runtime = "nodejs";
export async function PATCH(request: Request, { params }: { params: Promise<{ organizationId: string; accountId: string }> }) {
 const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
 const { organizationId, accountId } = await params;
 const membership = await withUserContext(prisma, session.user.id, (tx) => tx.membership.findFirst({ where: { organizationId, userId: session.user.id }, select: { role: true } }));
 if (!membership || !hasPermission(membership.role, "cloud:write")) return NextResponse.json({ error: "Cloud account management permission required." }, { status: 403 });
 let body: unknown; try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 }); }
 const parsed = updateCloudAccountSchema.safeParse(body); if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid update." }, { status: 400 });
 try {
  const account = await withOrganization(prisma, organizationId, async (tx) => {
   const existing = await tx.cloudAccount.findFirst({ where: { id: accountId, organizationId }, select: { id: true, status: true, syncEnabled: true, syncIntervalMinutes: true } }); if (!existing) return null;
   const enabled = parsed.data.syncEnabled ?? existing.syncEnabled;\n   const interval = parsed.data.syncIntervalMinutes ?? existing.syncIntervalMinutes;\n   if (parsed.data.syncEnabled === true && existing.status !== "ACTIVE") throw new Error("Activate the cloud account before enabling scheduled sync.");\n   const data = { ...parsed.data, credentialRef: parsed.data.credentialRef === undefined ? undefined : parsed.data.credentialRef || null, nextSyncAt: parsed.data.syncEnabled !== undefined || parsed.data.syncIntervalMinutes !== undefined ? enabled ? new Date(Date.now() + interval * 60_000) : null : undefined };
   const updated = await tx.cloudAccount.update({ where: { id: existing.id }, data, select: { id: true, provider: true, externalAccountId: true, name: true, currency: true, status: true, lastSyncedAt: true, lastSyncAttemptAt: true, syncEnabled: true, syncIntervalMinutes: true, nextSyncAt: true } });
   await tx.auditLog.create({ data: { organizationId, actorUserId: session.user.id, action: "CLOUD_ACCOUNT_UPDATED", entityType: "CloudAccount", entityId: updated.id, metadata: { changedFields: Object.keys(parsed.data), previousStatus: existing.status, newStatus: updated.status } } }); return updated;
  }); if (!account) return NextResponse.json({ error: "Cloud account not found." }, { status: 404 }); return NextResponse.json({ account });
 } catch { return NextResponse.json({ error: "Unable to update cloud account." }, { status: 500 }); }
}
