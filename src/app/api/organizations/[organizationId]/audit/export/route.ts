import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withUserContext } from "@/lib/user-context";
import { withOrganization } from "@/lib/tenant-context";
import { hasPermission } from "@/lib/permissions";

export const runtime = "nodejs";

function csvCell(value: unknown): string {
  let text = value == null ? "" : value instanceof Date ? value.toISOString() : typeof value === "string" ? value : JSON.stringify(value);
  // Prevent spreadsheet formula injection in exported cells.
  if (/^[\s]*[=+@\-]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}

export async function GET(request: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { organizationId } = await params;
  const membership = await withUserContext(prisma, session.user.id, (tx) => tx.membership.findFirst({
    where: { organizationId, userId: session.user.id }, select: { role: true }
  }));
  if (!membership || !hasPermission(membership.role, "audit:read")) return NextResponse.json({ error: "Audit read permission required." }, { status: 403 });

  const url = new URL(request.url);
  const fromRaw = url.searchParams.get("from");
  const toRaw = url.searchParams.get("to");
  const action = url.searchParams.get("action")?.trim().slice(0, 100);
  const from = fromRaw ? new Date(fromRaw) : null;
  const to = toRaw ? new Date(toRaw) : null;
  if ((from && !Number.isFinite(from.getTime())) || (to && !Number.isFinite(to.getTime())) || (from && to && from > to)) {
    return NextResponse.json({ error: "Invalid date range." }, { status: 400 });
  }
  if (from && to && to.getTime() - from.getTime() > 366 * 24 * 60 * 60 * 1000) {
    return NextResponse.json({ error: "Export date range cannot exceed 366 days." }, { status: 400 });
  }
  const events = await withOrganization(prisma, organizationId, (tx) => tx.auditLog.findMany({
    where: {
      entityType: { in: ["CloudSyncJob", "CloudAccount", "Budget", "BusinessMetric", "RevenueRecord"] },
      ...(action ? { action: { contains: action, mode: "insensitive" as const } } : {}),
      ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {})
    },
    orderBy: { createdAt: "desc" }, take: 5000,
    select: { id: true, action: true, entityType: true, entityId: true, metadata: true, createdAt: true, actor: { select: { name: true, email: true } } }
  }));
  const header = ["id", "created_at_utc", "action", "entity_type", "entity_id", "actor", "metadata"];
  const rows = events.map((event) => [
    event.id, event.createdAt, event.action, event.entityType, event.entityId,
    event.actor?.name || event.actor?.email || "System / background worker", event.metadata
  ]);
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="finsight-audit-events.csv"',
      "Cache-Control": "private, no-store",
      "X-Export-Row-Limit": "5000"
    }
  });
}
