import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withUserContext } from "@/lib/user-context";
import { withOrganization } from "@/lib/tenant-context";
import { z } from "zod";

export const runtime = "nodejs";
const schema = z.object({ token: z.string().min(32).max(128) });

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) return NextResponse.json({ error: "Sign in with the invited email address first." }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid invitation token." }, { status: 400 });
  const tokenHash = createHash("sha256").update(parsed.data.token).digest("hex");
  const invitation = await withUserContext(prisma, session.user.id, (tx) => tx.organizationInvitation.findUnique({
    where: { tokenHash }, select: { id: true, organizationId: true, email: true, role: true, expiresAt: true, acceptedAt: true }
  }));
  if (!invitation || invitation.email.toLowerCase() !== session.user.email.toLowerCase()) return NextResponse.json({ error: "Invitation not found for this signed-in email address." }, { status: 404 });
  if (invitation.acceptedAt || invitation.expiresAt <= new Date()) return NextResponse.json({ error: "This invitation has expired or has already been used." }, { status: 410 });
  try {
    await withOrganization(prisma, invitation.organizationId, async (tx) => {
      const claimed = await tx.organizationInvitation.updateMany({ where: { id: invitation.id, acceptedAt: null, expiresAt: { gt: new Date() } }, data: { acceptedAt: new Date() } });
      if (claimed.count !== 1) throw new Error("INVITATION_USED");
      await tx.membership.create({ data: { organizationId: invitation.organizationId, userId: session.user.id, role: invitation.role } });
      await tx.auditLog.create({ data: { organizationId: invitation.organizationId, actorUserId: session.user.id, action: "ORGANIZATION_INVITATION_ACCEPTED", entityType: "OrganizationInvitation", entityId: invitation.id, metadata: { email: invitation.email, role: invitation.role } } });
    });
    return NextResponse.json({ accepted: true, organizationId: invitation.organizationId });
  } catch (error) {
    if (error instanceof Error && error.message === "INVITATION_USED") return NextResponse.json({ error: "This invitation has already been accepted." }, { status: 409 });
    return NextResponse.json({ error: "Unable to accept invitation. You may already be a member." }, { status: 409 });
  }
}
