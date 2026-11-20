import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withUserContext } from "@/lib/user-context";
import { withOrganization } from "@/lib/tenant-context";
import { hasAnyRole } from "@/lib/permissions";
import { consumeApiRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { buildIncidentFromEvent } from "@/lib/security-incidents";

export const runtime = "nodejs";

async function adminMembership(organizationId: string, userId: string) {
  return withUserContext(prisma, userId, (tx) => tx.membership.findFirst({
    where: { organizationId, userId }, select: { role: true }
  }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { organizationId } = await params;
  const membership = await adminMembership(organizationId, session.user.id);
  if (!membership || !hasAnyRole(membership.role, ["OWNER", "ADMIN"])) {
    return NextResponse.json({ error: "Organization administrator access required." }, { status: 403 });
  }
  const incidents = await withOrganization(prisma, organizationId, (tx) => tx.securityIncident.findMany({
    where: { organizationId }, orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 200
  }));
  return NextResponse.json({ incidents, limit: 200 }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { organizationId } = await params;
  const membership = await adminMembership(organizationId, session.user.id);
  if (!membership || !hasAnyRole(membership.role, ["OWNER", "ADMIN"])) {
    return NextResponse.json({ error: "Organization administrator access required." }, { status: 403 });
  }
  const rateLimit = await consumeApiRateLimit({ organizationId, userId: session.user.id, bucket: "security:incident:create", limit: 20, windowSeconds: 3600 });
  const limited = rateLimitResponse(rateLimit);
  if (limited) return limited;

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "A valid JSON body is required." }, { status: 400 }); }
  const sourceEventId = body && typeof body === "object" && "sourceEventId" in body && typeof body.sourceEventId === "string" ? body.sourceEventId.trim() : "";
  if (!sourceEventId || sourceEventId.length > 128) return NextResponse.json({ error: "sourceEventId is required." }, { status: 400 });

  const created = await withOrganization(prisma, organizationId, async (tx) => {
    const existing = await tx.securityIncident.findFirst({ where: { organizationId, sourceEventId } });
    if (existing) return { incident: existing, duplicate: true };
    const event = await tx.apiSecurityEvent.findFirst({ where: { id: sourceEventId, organizationId } });
    if (!event) return null;
    const hourAgo = new Date(event.createdAt.getTime() - 60 * 60 * 1000);
    const correlated = await tx.apiSecurityEvent.count({
      where: { organizationId, routeBucket: event.routeBucket, createdAt: { gte: hourAgo, lte: event.createdAt } }
    });
    const details = buildIncidentFromEvent(event, correlated);
    const incident = await tx.securityIncident.create({
      data: {
        organizationId, sourceEventId, ...details,
        createdByUserId: session.user.id, updatedByUserId: session.user.id
      }
    });
    await tx.auditLog.create({
      data: {
        organizationId, actorUserId: session.user.id, action: "security.incident.created",
        entityType: "SecurityIncident", entityId: incident.id,
        metadata: { sourceEventId, severity: incident.severity, routeBucket: event.routeBucket }
      }
    });
    return { incident, duplicate: false };
  });
  if (!created) return NextResponse.json({ error: "Security event not found in this organization." }, { status: 404 });
  return NextResponse.json(created, { status: created.duplicate ? 200 : 201, headers: { "Cache-Control": "private, no-store" } });
}
