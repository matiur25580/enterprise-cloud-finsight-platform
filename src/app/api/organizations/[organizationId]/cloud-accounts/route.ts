import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withUserContext } from "@/lib/user-context";
import { withOrganization } from "@/lib/tenant-context";
import { hasPermission } from "@/lib/permissions";
import { createCloudAccountSchema } from "@/lib/cloud-accounts/validation";
export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ organizationId: string }> }) {
 const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
 const { organizationId } = await params;
 const membership = await withUserContext(prisma, session.user.id, (tx) => tx.membership.findFirst({ where: { organizationId, userId: session.user.id }, select: { role: true } }));
 if (!membership || !hasPermission(membership.role, "cloud:write")) return NextResponse.json({ error: "Cloud account management permission required." }, { status: 403 });
 let body: unknown; try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 }); }
 const parsed = createCloudAccountSchema.safeParse(body); if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid cloud account details." }, { status: 400 });
 try {
  const account = await withOrganization(prisma, organizationId, async (tx) => {
   const created = await tx.cloudAccount.create({ data: { organizationId, provider: parsed.data.provider, externalAccountId: parsed.data.externalAccountId, name: parsed.data.name, currency: parsed.data.currency, credentialRef: parsed.data.credentialRef || null, status: "PAUSED" }, select: { id: true, provider: true, externalAccountId: true, name: true, currency: true, status: true, createdAt: true } });
   await tx.auditLog.create({ data: { organizationId, actorUserId: session.user.id, action: "CLOUD_ACCOUNT_CREATED", entityType: "CloudAccount", entityId: created.id, metadata: { provider: created.provider, externalAccountId: created.externalAccountId, credentialReferenceConfigured: Boolean(parsed.data.credentialRef) } } }); return created;
  }); return NextResponse.json({ account }, { status: 201 });
 } catch (error) { if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") return NextResponse.json({ error: "This provider account is already registered in the organization." }, { status: 409 }); return NextResponse.json({ error: "Unable to create cloud account." }, { status: 500 }); }
}
