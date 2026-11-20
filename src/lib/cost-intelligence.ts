import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withOrganization } from "@/lib/tenant-context";
import { requireOrganizationPermission } from "@/lib/auth-guards";
import { detectCostAnomalies, estimateOptimizationScenario, getBudgetThresholdAlerts } from "@/lib/cost-intelligence-math";

function numeric(value: Prisma.Decimal | null | undefined) {
  return value ? Number(value.toString()) : 0;
}

function day(value: Date) {
  return value.toISOString().slice(0, 10);
}

/** Computes organization-scoped, explainable FinOps signals from imported billing records. */
export async function getCostIntelligence(organizationId: string) {
  await requireOrganizationPermission(organizationId, "billing:read");
  const today = new Date();
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const historyStart = new Date(end.getTime() - 44 * 24 * 60 * 60 * 1000);
  const monthStart = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0));

  return withOrganization(prisma, organizationId, async (tx) => {
    const [dailyRows, budgets, serviceMonthRows] = await Promise.all([
      tx.costRecord.groupBy({
        by: ["service", "currency", "usageDate"],
        where: { organizationId, usageDate: { gte: historyStart, lte: end } },
        _sum: { amount: true }, orderBy: { usageDate: "asc" }
      }),
      tx.budget.findMany({
        where: { organizationId, isActive: true, startsAt: { lte: end }, endsAt: { gte: end } },
        select: { name: true, amount: true, currency: true, startsAt: true, alertThresholds: true }
      }),
      tx.costRecord.groupBy({
        by: ["service", "currency"],
        where: { organizationId, usageDate: { gte: monthStart, lte: end } },
        _sum: { amount: true }, orderBy: { service: "asc" }
      })
    ]);

    const daily = dailyRows.map((row) => ({
      date: day(row.usageDate), service: row.service, currency: row.currency,
      spend: numeric(row._sum.amount)
    }));
    const anomalies = detectCostAnomalies(daily);

    const budgetSignals = await Promise.all(budgets.map(async (budget) => {
      const aggregate = await tx.costRecord.aggregate({
        where: { organizationId, currency: budget.currency, usageDate: { gte: budget.startsAt, lte: end } },
        _sum: { amount: true }
      });
      return {
        name: budget.name, currency: budget.currency, budget: numeric(budget.amount),
        spent: numeric(aggregate._sum.amount), thresholds: budget.alertThresholds
      };
    }));
    const budgetAlerts = getBudgetThresholdAlerts(budgetSignals);

    const optimizationRecommendations = serviceMonthRows
      .map((row) => {
        const spend = numeric(row._sum.amount);
        return {
          service: row.service, currency: row.currency, monthToDateSpend: spend,
          modeledMonthlySavings: estimateOptimizationScenario(spend) * (monthEnd.getUTCDate() / Math.max(1, end.getUTCDate())),
          scenarioRatePercent: 5,
          rationale: "Review usage patterns, commitments, and resource sizing for this high-spend service. Savings are an illustrative 5% scenario, not a guaranteed outcome."
        };
      })
      .filter((row) => row.monthToDateSpend > 0)
      .sort((a, b) => b.monthToDateSpend - a.monthToDateSpend)
      .slice(0, 8);

    return {
      generatedAt: new Date().toISOString(),
      baselineDays: 14,
      anomalies: anomalies.slice(0, 20),
      budgetAlerts,
      optimizationRecommendations,
      hasBillingData: daily.length > 0
    };
  });
}
