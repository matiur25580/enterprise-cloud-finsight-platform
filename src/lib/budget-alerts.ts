import { prisma } from "@/lib/prisma";
import { withOrganization } from "@/lib/tenant-context";
import { deliverBudgetThresholdAlert } from "@/lib/cloud-sync/notifications";

/**
 * Evaluates active budgets after a billing import. A durable audit event is
 * written before delivery, then updated with the actual provider outcome.
 * A PostgreSQL advisory transaction lock prevents duplicate threshold events.
 */
export async function evaluateBudgetThresholdAlerts(organizationId: string): Promise<void> {
  try {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const budgets = await withOrganization(prisma, organizationId, (tx) => tx.budget.findMany({
      where: { organizationId, isActive: true, startsAt: { lte: today }, endsAt: { gte: today } },
      select: { id: true, name: true, amount: true, currency: true, startsAt: true, endsAt: true, alertThresholds: true }
    }));
    for (const budget of budgets) {
      const pending = await withOrganization(prisma, organizationId, async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${organizationId}), hashtext(${budget.id}))`;
        const aggregate = await tx.costRecord.aggregate({
          where: { organizationId, currency: budget.currency, usageDate: { gte: budget.startsAt, lte: today } },
          _sum: { amount: true }
        });
        const spent = aggregate._sum.amount ? Number(aggregate._sum.amount.toString()) : 0;
        const amount = Number(budget.amount.toString());
        if (amount <= 0) return [];
        const utilizationPercent = spent / amount * 100;
        const thresholds = [...new Set(budget.alertThresholds)]
          .filter((threshold) => Number.isInteger(threshold) && threshold > 0 && threshold <= 100 && utilizationPercent >= threshold)
          .sort((a, b) => a - b);
        if (!thresholds.length) return [];
        const prior = await tx.auditLog.findMany({
          where: { organizationId, entityType: "Budget", entityId: budget.id, action: "BUDGET_THRESHOLD_ALERT_SENT" },
          orderBy: { createdAt: "desc" }, take: 1000, select: { metadata: true }
        });
        const alreadySent = new Set(prior.flatMap((event) => {
          const metadata = event.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata)
            ? event.metadata as Record<string, unknown> : {};
          if (metadata.startsAt !== budget.startsAt.toISOString().slice(0, 10) || metadata.endsAt !== budget.endsAt.toISOString().slice(0, 10)) return [];
          return typeof metadata.thresholdPercent === "number" ? [metadata.thresholdPercent] : [];
        }));
        const created: Array<{ id: string; alert: {
          budgetName: string; currency: string; budgetAmount: number; spent: number;
          utilizationPercent: number; thresholdPercent: number; startsAt: string; endsAt: string;
        } }> = [];
        for (const thresholdPercent of thresholds) {
          if (alreadySent.has(thresholdPercent)) continue;
          const alert = {
            budgetName: budget.name, currency: budget.currency, budgetAmount: amount,
            spent, utilizationPercent, thresholdPercent,
            startsAt: budget.startsAt.toISOString().slice(0, 10),
            endsAt: budget.endsAt.toISOString().slice(0, 10)
          };
          const event = await tx.auditLog.create({
            data: {
              organizationId, actorUserId: null, action: "BUDGET_THRESHOLD_ALERT_SENT",
              entityType: "Budget", entityId: budget.id,
              metadata: { ...alert, deliveryStatus: "PENDING", attempted: 0, delivered: 0, channels: [] }
            },
            select: { id: true }
          });
          created.push({ id: event.id, alert });
        }
        return created;
      });
      for (const item of pending) {
        let outcome: { attempted: number; delivered: number; channelResults: Record<string, "DELIVERED" | "FAILED" | "SKIPPED"> } = { attempted: 0, delivered: 0, channelResults: {} };
        let deliveryStatus = "NOT_CONFIGURED";
        try {
          outcome = await deliverBudgetThresholdAlert(item.alert);
          deliveryStatus = outcome.attempted === 0 ? "NOT_CONFIGURED"
            : outcome.delivered === outcome.attempted ? "DELIVERED"
            : outcome.delivered > 0 ? "PARTIAL" : "FAILED";
        } catch {
          deliveryStatus = "FAILED";
        }
        try {
          await withOrganization(prisma, organizationId, (tx) => tx.auditLog.updateMany({
            where: { id: item.id, organizationId, entityType: "Budget", entityId: budget.id },
            data: { metadata: {
              ...item.alert, deliveryStatus, attempted: outcome.attempted, delivered: outcome.delivered,
              channels: [
                ...(process.env.SLACK_SYNC_ALERT_WEBHOOK_URL ? ["SLACK"] : []),
                ...(process.env.RESEND_API_KEY && process.env.SYNC_ALERT_EMAIL_FROM && process.env.SYNC_ALERT_EMAIL_TO ? ["EMAIL"] : [])
              ]
            } }
          }));
        } catch { /* The initial PENDING audit event remains visible if status persistence fails. */ }
      }
    }
  } catch {
    // Budget alert evaluation and delivery never roll back an accepted billing import.
  }
}
