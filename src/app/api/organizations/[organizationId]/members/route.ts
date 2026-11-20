import { randomBytes, createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withUserContext } from "@/lib/user-context";
import { withOrganization } from "@/lib/tenant-context";
import { hasPermission } from "@/lib/permissions";
import { z } from "zod";

export const runtime = "nodejs";
const inviteSchema = z.object({
  email: z.string().trim().email().max(254),
  role: z.enum(["ADMIN", "FINOPS_ANALYST", "VIEWER"])
});

async function access(organizationId: string, userId: string) {
  return withUserContext(prisma, userId, (tx) => tx.membership.findFirst({
    where: { organizationId, userId }, select: { role: true }
  }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { organizationId } = await params;
  const membership = await access(organizationId, session.user.id);
  if (!membership || !hasPermission(membership.role, "members:manage")) return NextResponse.json({ error: "Member management permission required." }, { status: 403 });
  const result = await withOrganization(prisma, organizationId, async (tx) => {
    const [members, invitations] = await Promise.all([
      tx.membership.findMany({ where: { organizationId }, orderBy: [{ role: "asc" }, { createdAt: "asc" }], select: { id: true, role: true, createdAt: true, user: { select: { id: true, name: true, email: true } } } }),
      tx.organizationInvitation.findMany({ where: { organizationId, acceptedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" }, select: { id: true, email: true, role: true, expiresAt: true, createdAt: true } })
    ]);
    return { members, invitations };
  });
  return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { organizationId } = await params;
  const membership = await access(organizationId, session.user.id);
  if (!membership || !hasPermission(membership.role, "members:manage")) return NextResponse.json({ error: "Member management permission required." }, { status: 403 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Provide a valid email and an assignable role." }, { status: 400 });
  if (membership.role === "ADMIN" && parsed.data.role === "ADMIN") return NextResponse.json({ error: "Administrators cannot invite another administrator." }, { status: 403 });
  const email = parsed.data.email.toLowerCase();
  if (email === session.user.email.toLowerCase()) return NextResponse.json({ error: "You are already a member of this organization." }, { status: 409 });
  const existingUser = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existingUser) {
    const existingMembership = await withUserContext(prisma, existingUser.id, (tx) => tx.membership.findFirst({ where: { organizationId, userId: existingUser.id }, select: { id: true } }));
    if (existingMembership) return NextResponse.json({ error: "This user is already a member." }, { status: 409 });
  }
  const from = process.env.SYNC_ALERT_EMAIL_FROM;
  const apiKey = process.env.RESEND_API_KEY;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!from || !apiKey || !baseUrl) return NextResponse.json({ error: "Invitation email is not configured. Set RESEND_API_KEY, SYNC_ALERT_EMAIL_FROM, and NEXT_PUBLIC_APP_URL." }, { status: 503 });
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const invitation = await withOrganization(prisma, organizationId, async (tx) => {
    await tx.organizationInvitation.deleteMany({ where: { organizationId, email, acceptedAt: null } });
    return tx.organizationInvitation.create({ data: { organizationId, email, role: parsed.data.role, tokenHash, invitedByUserId: session.user.id, expiresAt }, select: { id: true } });
  });
  const inviteUrl = new URL("/invite/accept?token=" + encodeURIComponent(token), baseUrl).toString();
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { authorization: "Bearer " + apiKey, "content-type": "application/json" },
      body: JSON.stringify({ from, to: [email], subject: "You are invited to FinSight", text: "You have been invited to join a FinSight organization as " + parsed.data.role + ". Sign in or create an account using " + email + ", then accept this invitation: " + inviteUrl + "\n\nThis link expires in 7 days." }),
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw new Error("Email delivery failed.");
  } catch {
    await withOrganization(prisma, organizationId, (tx) => tx.organizationInvitation.delete({ where: { id: invitation.id } }));
    return NextResponse.json({ error: "Invitation email could not be delivered. Check the Resend configuration and try again." }, { status: 502 });
  }
  await withOrganization(prisma, organizationId, (tx) => tx.auditLog.create({ data: { organizationId, actorUserId: session.user.id, action: "ORGANIZATION_INVITATION_SENT", entityType: "OrganizationInvitation", entityId: invitation.id, metadata: { email, role: parsed.data.role, expiresAt: expiresAt.toISOString() } } }));
  return NextResponse.json({ invited: true }, { status: 201 });
}
