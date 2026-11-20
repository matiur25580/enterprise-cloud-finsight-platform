import { prisma } from "@/lib/prisma";
import { withOrganization } from "@/lib/tenant-context";
import { deliverBudgetThresholdAlert } from "@/lib/cloud-sync/notifications";

/**
 * Evaluates active budgets after a billing import. Audit rows act as a durable
 * per-budget/per-threshold notification ledger; an advisory transaction lock
 * prevents concurrent imports from delivering the same threshold twice.
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
        const until = budget.endsAt < today ? budget.endsAt : today;
        const aggregate = await tx.costRecord.aggregate({
          where: { organizationId, currency: budget.currency, usageDate: { gte: budget.startsAt, lte: until } },
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
        const created: number[] = [];
        for (const thresholdPercent of thresholds) {
          if (alreadySent.has(thresholdPercent)) continue;
          await tx.auditLog.create({
            data: {
              organizationId, actorUserId: null, action: "BUDGET_THRESHOLD_ALERT_SENT",
              entityType: "Budget", entityId: budget.id,
              metadata: {
                budgetName: budget.name, currency: budget.currency, budgetAmount: amount,
                spent, utilizationPercent, thresholdPercent,
                startsAt: budget.startsAt.toISOString().slice(0, 10),
                endsAt: budget.endsAt.toISOString().slice(0, 10)
              }
            }
          });
          created.push(thresholdPercent);
        }
        return created.map((thresholdPercent) => ({
          budgetName: budget.name, currency: budget.currency, budgetAmount: amount,
          spent, utilizationPercent, thresholdPercent,
          startsAt: budget.startsAt.toISOString().slice(0, 10),
          endsAt: budget.endsAt.toISOString().slice(0, 10)
        }));
      });
      for (const alert of pending) {
        try { await deliverBudgetThresholdAlert(alert); } catch { /* Notification delivery must not fail a billing import. */ }
      }
    }
  } catch {
    // Budget alert evaluation is best-effort and never rolls back an accepted import.
  }
}
