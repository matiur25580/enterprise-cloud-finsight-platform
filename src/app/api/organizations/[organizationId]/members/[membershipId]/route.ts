import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withUserContext } from "@/lib/user-context";
import { withOrganization } from "@/lib/tenant-context";
import { hasPermission } from "@/lib/permissions";
import { z } from "zod";

export const runtime = "nodejs";
const roleSchema = z.object({ role: z.enum(["ADMIN", "FINOPS_ANALYST", "VIEWER"]) });

async function getActor(organizationId: string, userId: string) {
  return withUserContext(prisma, userId, (tx) => tx.membership.findFirst({ where: { organizationId, userId }, select: { id: true, role: true } }));
}

export async function PATCH(request: Request, { params }: { params: Promise<{ organizationId: string; membershipId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { organizationId, membershipId } = await params;
  const actor = await getActor(organizationId, session.user.id);
  if (!actor || !hasPermission(actor.role, "members:manage")) return NextResponse.json({ error: "Member management permission required." }, { status: 403 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = roleSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid role." }, { status: 400 });
  if (actor.role === "ADMIN" && parsed.data.role === "ADMIN") return NextResponse.json({ error: "Administrators cannot assign the administrator role." }, { status: 403 });
  try {
    const result = await withOrganization(prisma, organizationId, async (tx) => {
      const target = await tx.membership.findFirst({ where: { id: membershipId, organizationId }, select: { id: true, role: true, userId: true } });
      if (!target) throw new Error("NOT_FOUND");
      if (target.role === "OWNER") throw new Error("OWNER_PROTECTED");
      if (actor.role === "ADMIN" && target.role === "ADMIN") throw new Error("ADMIN_PROTECTED");
      const updated = await tx.membership.update({ where: { id: target.id }, data: { role: parsed.data.role }, select: { id: true, role: true, user: { select: { email: true } } } });
      await tx.auditLog.create({ data: { organizationId, actorUserId: session.user.id, action: "ORGANIZATION_MEMBER_ROLE_UPDATED", entityType: "Membership", entityId: target.id, metadata: { previousRole: target.role, newRole: parsed.data.role, memberEmail: updated.user.email } } });
      return updated;
    });
    return NextResponse.json({ member: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "NOT_FOUND") return NextResponse.json({ error: "Member not found." }, { status: 404 });
    if (message === "OWNER_PROTECTED") return NextResponse.json({ error: "Owner accounts are protected from role changes." }, { status: 409 });
    if (message === "ADMIN_PROTECTED") return NextResponse.json({ error: "Administrators cannot manage another administrator." }, { status: 403 });
    return NextResponse.json({ error: "Unable to update member role." }, { status: 400 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ organizationId: string; membershipId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { organizationId, membershipId } = await params;
  const actor = await getActor(organizationId, session.user.id);
  if (!actor || !hasPermission(actor.role, "members:manage")) return NextResponse.json({ error: "Member management permission required." }, { status: 403 });
  try {
    await withOrganization(prisma, organizationId, async (tx) => {
      const target = await tx.membership.findFirst({ where: { id: membershipId, organizationId }, select: { id: true, role: true, userId: true, user: { select: { email: true } } } });
      if (!target) throw new Error("NOT_FOUND");
      if (target.role === "OWNER") throw new Error("OWNER_PROTECTED");
      if (actor.role === "ADMIN" && target.role === "ADMIN") throw new Error("ADMIN_PROTECTED");
      if (target.userId === session.user.id) throw new Error("SELF_REMOVE");
      await tx.membership.delete({ where: { id: target.id } });
      await tx.auditLog.create({ data: { organizationId, actorUserId: session.user.id, action: "ORGANIZATION_MEMBER_REMOVED", entityType: "Membership", entityId: target.id, metadata: { memberEmail: target.user.email, previousRole: target.role } } });
    });
    return NextResponse.json({ removed: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "NOT_FOUND") return NextResponse.json({ error: "Member not found." }, { status: 404 });
    if (message === "OWNER_PROTECTED") return NextResponse.json({ error: "Owner accounts cannot be removed." }, { status: 409 });
    if (message === "ADMIN_PROTECTED") return NextResponse.json({ error: "Administrators cannot remove another administrator." }, { status: 403 });
    if (message === "SELF_REMOVE") return NextResponse.json({ error: "Use a different administrator to remove your own membership." }, { status: 409 });
    return NextResponse.json({ error: "Unable to remove member." }, { status: 400 });
  }
}
