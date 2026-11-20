import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withUserContext } from "@/lib/user-context";
import { withOrganization } from "@/lib/tenant-context";
import { hasPermission } from "@/lib/permissions";
import { deliverBudgetThresholdAlert } from "@/lib/cloud-sync/notifications";

export const runtime = "nodejs";

export async function POST(_request: Request, { params }: { params: Promise<{ organizationId: string; alertId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { organizationId, alertId } = await params;
  const membership = await withUserContext(prisma, session.user.id, (tx) => tx.membership.findFirst({
    where: { organizationId, userId: session.user.id }, select: { role: true }
  }));
  if (!membership) return NextResponse.json({ error: "Organization access denied." }, { status: 403 });
  if (!hasPermission(membership.role, "budgets:manage")) return NextResponse.json({ error: "Budget management permission required." }, { status: 403 });

  let claimed: { id: string; budgetId: string; alert: {
    budgetName: string; currency: string; budgetAmount: number; spent: number;
    utilizationPercent: number; thresholdPercent: number; startsAt: string; endsAt: string;
  }; metadata: Record<string, unknown>; skipChannels: string[] } | null = null;
  try {
    claimed = await withOrganization(prisma, organizationId, async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${organizationId}), hashtext(${alertId}))`;
      const event = await tx.auditLog.findFirst({
        where: { id: alertId, organizationId, entityType: "Budget", action: "BUDGET_THRESHOLD_ALERT_SENT" },
        select: { id: true, entityId: true, metadata: true }
      });
      if (!event || !event.entityId) throw new Error("NOT_FOUND");
      const metadata = event.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata)
        ? event.metadata as Record<string, unknown> : {};
      const status = typeof metadata.deliveryStatus === "string" ? metadata.deliveryStatus : "PENDING";
      if (!["FAILED", "PARTIAL", "NOT_CONFIGURED"].includes(status)) throw new Error(status === "PENDING" || status === "RETRYING" ? "IN_PROGRESS" : "NOT_RETRYABLE");
      const fields = ["budgetName", "currency", "budgetAmount", "spent", "utilizationPercent", "thresholdPercent", "startsAt", "endsAt"] as const;
      if (fields.some((field) => metadata[field] === undefined)) throw new Error("INVALID_EVENT");
      const alert = Object.fromEntries(fields.map((field) => [field, metadata[field]])) as {
        budgetName: string; currency: string; budgetAmount: number; spent: number;
        utilizationPercent: number; thresholdPercent: number; startsAt: string; endsAt: string;
      };
      const budget = await tx.budget.findFirst({ where: { id: event.entityId, organizationId }, select: { id: true } });
      if (!budget) throw new Error("BUDGET_NOT_FOUND");
      await tx.auditLog.update({ where: { id: event.id }, data: { metadata: {
        ...metadata, deliveryStatus: "RETRYING", retryCount: (typeof metadata.retryCount === "number" ? metadata.retryCount : 0) + 1,
        lastAttemptAt: new Date().toISOString()
      } } });
      await tx.auditLog.create({ data: {
        organizationId, actorUserId: session.user.id, action: "BUDGET_THRESHOLD_ALERT_RETRY_REQUESTED",
        entityType: "Budget", entityId: event.entityId,
        metadata: { alertEventId: event.id, thresholdPercent: alert.thresholdPercent }
      } });
      const previousResults = metadata.channelResults && typeof metadata.channelResults === "object" && !Array.isArray(metadata.channelResults) ? metadata.channelResults as Record<string, unknown> : {};
      const skipChannels = Object.entries(previousResults).filter(([, result]) => result === "DELIVERED").map(([channel]) => channel);
      return { id: event.id, budgetId: event.entityId, alert, metadata, skipChannels };
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "";
    if (reason === "NOT_FOUND" || reason === "BUDGET_NOT_FOUND") return NextResponse.json({ error: "Budget alert not found." }, { status: 404 });
    if (reason === "IN_PROGRESS") return NextResponse.json({ error: "This alert is already being processed." }, { status: 409 });
    if (reason === "NOT_RETRYABLE") return NextResponse.json({ error: "Only failed, partial, or unconfigured alerts can be retried." }, { status: 409 });
    if (reason === "INVALID_EVENT") return NextResponse.json({ error: "This alert does not contain enough delivery information to retry." }, { status: 422 });
    return NextResponse.json({ error: "Unable to prepare budget alert retry." }, { status: 500 });
  }

  let outcome: { attempted: number; delivered: number; channelResults: Record<string, "DELIVERED" | "FAILED" | "SKIPPED"> } = { attempted: 0, delivered: 0, channelResults: {} };
  let deliveryStatus = "NOT_CONFIGURED";
  try {
    outcome = await deliverBudgetThresholdAlert(claimed.alert, fetch, process.env, claimed.skipChannels);
    deliveryStatus = outcome.attempted === 0 ? "NOT_CONFIGURED"
      : outcome.delivered === outcome.attempted ? "DELIVERED"
      : outcome.delivered > 0 ? "PARTIAL" : "FAILED";
  } catch {
    deliveryStatus = "FAILED";
  }
  const channels = [
    ...(process.env.SLACK_SYNC_ALERT_WEBHOOK_URL ? ["SLACK"] : []),
    ...(process.env.RESEND_API_KEY && process.env.SYNC_ALERT_EMAIL_FROM && process.env.SYNC_ALERT_EMAIL_TO ? ["EMAIL"] : [])
  ];
  try {
    await withOrganization(prisma, organizationId, async (tx) => {
      const current = await tx.auditLog.findFirst({ where: { id: claimed!.id, organizationId }, select: { metadata: true } });
      const metadata = current?.metadata && typeof current.metadata === "object" && !Array.isArray(current.metadata)
        ? current.metadata as Record<string, unknown> : {};
      await tx.auditLog.updateMany({
        where: { id: claimed!.id, organizationId, entityType: "Budget", entityId: claimed!.budgetId },
        data: { metadata: {
          ...metadata, deliveryStatus, attempted: (typeof metadata.attempted === "number" ? metadata.attempted : 0) + outcome.attempted,
          delivered: (typeof metadata.delivered === "number" ? metadata.delivered : 0) + outcome.delivered,
          channels, channelResults: { ...(metadata.channelResults && typeof metadata.channelResults === "object" && !Array.isArray(metadata.channelResults) ? metadata.channelResults as Record<string, unknown> : {}), ...outcome.channelResults }, lastAttemptAt: new Date().toISOString()
        } as Prisma.InputJsonValue }
      });
    });
  } catch {
    return NextResponse.json({ error: "Delivery was attempted, but its status could not be saved. Refresh the alert history." }, { status: 500 });
  }
  return NextResponse.json({ success: true, deliveryStatus, attempted: outcome.attempted, delivered: outcome.delivered });
}
