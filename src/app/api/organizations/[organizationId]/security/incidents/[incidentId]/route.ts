import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withUserContext } from "@/lib/user-context";
import { withOrganization } from "@/lib/tenant-context";
import { hasAnyRole } from "@/lib/permissions";
import { consumeApiRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { transitionIncidentStatus, type SecurityIncidentStatus } from "@/lib/security-incidents";

export const runtime = "nodejs";
const statuses = new Set<SecurityIncidentStatus>(["OPEN", "ACKNOWLEDGED", "RESOLVED", "FALSE_POSITIVE"]);

export async function PATCH(request: Request, { params }: { params: Promise<{ organizationId: string; incidentId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { organizationId, incidentId } = await params;
  const membership = await withUserContext(prisma, session.user.id, (tx) => tx.membership.findFirst({
    where: { organizationId, userId: session.user.id }, select: { role: true }
  }));
  if (!membership || !hasAnyRole(membership.role, ["OWNER", "ADMIN"])) {
    return NextResponse.json({ error: "Organization administrator access required." }, { status: 403 });
  }
  const rateLimit = await consumeApiRateLimit({ organizationId, userId: session.user.id, bucket: "security:incident:update", limit: 60, windowSeconds: 3600 });
  const limited = rateLimitResponse(rateLimit);
  if (limited) return limited;

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "A valid JSON body is required." }, { status: 400 }); }
  const nextStatus = body && typeof body === "object" && "status" in body && typeof body.status === "string" ? body.status as SecurityIncidentStatus : null;
  if (!nextStatus || !statuses.has(nextStatus)) return NextResponse.json({ error: "Unsupported incident status." }, { status: 400 });

  const result = await withOrganization(prisma, organizationId, async (tx) => {
    const current = await tx.securityIncident.findFirst({ where: { id: incidentId, organizationId } });
    if (!current) return { kind: "missing" as const };
    const transition = transitionIncidentStatus(current.status as SecurityIncidentStatus, nextStatus);
    if (!transition) return { kind: "invalid" as const, current: current.status };
    const now = new Date();
    const incident = await tx.securityIncident.update({
      where: { id: current.id },
      data: {
        status: transition.status,
        updatedByUserId: session.user.id,
        acknowledgedAt: transition.acknowledged ? now : current.acknowledgedAt,
        resolvedAt: transition.resolved ? now : null
      }
    });
    await tx.auditLog.create({
      data: {
        organizationId, actorUserId: session.user.id, action: "security.incident.status_changed",
        entityType: "SecurityIncident", entityId: incident.id,
        metadata: { from: current.status, to: transition.status }
      }
    });
    return { kind: "updated" as const, incident };
  });
  if (result.kind === "missing") return NextResponse.json({ error: "Incident not found." }, { status: 404 });
  if (result.kind === "invalid") return NextResponse.json({ error: "Invalid status transition.", current: result.current }, { status: 409 });
  return NextResponse.json({ incident: result.incident }, { headers: { "Cache-Control": "private, no-store" } });
}
