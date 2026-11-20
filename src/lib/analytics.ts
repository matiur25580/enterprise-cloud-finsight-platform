import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withOrganization } from "@/lib/tenant-context";

import { getAnalyticsWindow, projectMonthEnd, type AnalyticsRange } from "@/lib/analytics-math";

function amount(value: Prisma.Decimal | null | undefined): number {
  return value ? Number(value.toString()) : 0;
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function getCostAnalytics(organizationId: string, range: AnalyticsRange = "30d") {
  const now = new Date();
  const window = getAnalyticsWindow(now, range);
  const today = window.end;
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0));
  const elapsedMonthDays = today.getUTCDate();
  const daysInMonth = monthEnd.getUTCDate();
  const sixMonthsAgo = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 5, 1));

  return withOrganization(prisma, organizationId, async (tx) => {
    const [organization, current, previous, dailyRows, serviceRows, accountRows, accounts, monthRows, monthlyRows, budgets] = await Promise.all([
      tx.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
      tx.costRecord.groupBy({
        by: ["currency"],
        where: { organizationId, usageDate: { gte: window.start, lte: window.end } },
        _sum: { amount: true }
      }),
      tx.costRecord.groupBy({
        by: ["currency"],
        where: { organizationId, usageDate: { gte: window.previousStart, lte: window.previousEnd } },
        _sum: { amount: true }
      }),
      tx.costRecord.groupBy({
        by: ["usageDate", "currency"],
        where: { organizationId, usageDate: { gte: window.start, lte: window.end } },
        _sum: { amount: true },
        orderBy: { usageDate: "asc" }
      }),
      tx.costRecord.groupBy({
        by: ["service", "currency"],
        where: { organizationId, usageDate: { gte: window.start, lte: window.end } },
        _sum: { amount: true },
        orderBy: { service: "asc" }
      }),
      tx.costRecord.groupBy({
        by: ["cloudAccountId", "currency"],
        where: { organizationId, usageDate: { gte: window.start, lte: window.end } },
        _sum: { amount: true }
      }),
      tx.cloudAccount.findMany({
        where: { organizationId },
        select: { id: true, name: true, provider: true }
      }),
      tx.costRecord.groupBy({
        by: ["currency"],
        where: { organizationId, usageDate: { gte: monthStart, lte: today } },
        _sum: { amount: true }
      }),
      tx.costRecord.groupBy({
        by: ["usageDate", "currency"],
        where: { organizationId, usageDate: { gte: sixMonthsAgo, lte: today } },
        _sum: { amount: true },
        orderBy: { usageDate: "asc" }
      }),
      tx.budget.findMany({
        where: { organizationId, isActive: true, startsAt: { lte: today }, endsAt: { gte: today } },
        orderBy: { name: "asc" },
        select: { id: true, name: true, amount: true, currency: true, period: true, startsAt: true, endsAt: true }
      })
    ]);

    const currentByCurrency = new Map(current.map((row) => [row.currency, amount(row._sum.amount)]));
    const previousByCurrency = new Map(previous.map((row) => [row.currency, amount(row._sum.amount)]));
    const monthByCurrency = new Map(monthRows.map((row) => [row.currency, amount(row._sum.amount)]));
    const currencies = [...new Set([...currentByCurrency.keys(), ...previousByCurrency.keys(), ...monthByCurrency.keys()])].sort();

    const daily = dailyRows.map((row) => ({
      date: dateKey(row.usageDate),
      currency: row.currency,
      spend: amount(row._sum.amount)
    }));
    const monthlyMap = new Map<string, number>();
    for (const row of monthlyRows) {
      const month = dateKey(row.usageDate).slice(0, 7);
      const key = month + ":" + row.currency;
      monthlyMap.set(key, (monthlyMap.get(key) ?? 0) + amount(row._sum.amount));
    }
    const monthly = [...monthlyMap.entries()].map(([key, spend]) => {
      const [month, currency] = key.split(":");
      return { month, currency, spend };
    });

    const accountMap = new Map(accounts.map((account) => [account.id, account]));
    const providers = accountRows.map((row) => ({
      provider: accountMap.get(row.cloudAccountId)?.provider ?? "UNKNOWN",
      accountName: accountMap.get(row.cloudAccountId)?.name ?? "Unknown account",
      currency: row.currency,
      spend: amount(row._sum.amount)
    })).sort((a, b) => b.spend - a.spend);

    const serviceBreakdown = serviceRows.map((row) => ({
      service: row.service,
      currency: row.currency,
      spend: amount(row._sum.amount)
    })).sort((a, b) => b.spend - a.spend);

    const budgetResults = await Promise.all(budgets.map(async (budget) => {
      const spent = await tx.costRecord.aggregate({
        where: {
          organizationId,
          currency: budget.currency,
          usageDate: { gte: budget.startsAt, lte: today }
        },
        _sum: { amount: true }
      });
      const budgetAmount = amount(budget.amount);
      const actualSpend = amount(spent._sum.amount);
      return {
        id: budget.id,
        name: budget.name,
        currency: budget.currency,
        period: budget.period,
        budget: budgetAmount,
        spent: actualSpend,
        utilization: budgetAmount > 0 ? (actualSpend / budgetAmount) * 100 : 0,
        remaining: Math.max(0, budgetAmount - actualSpend)
      };
    }));

    const summaries = currencies.map((currency) => {
      const spend = currentByCurrency.get(currency) ?? 0;
      const priorSpend = previousByCurrency.get(currency) ?? 0;
      const monthSpend = monthByCurrency.get(currency) ?? 0;
      return {
        currency,
        spend,
        previousSpend: priorSpend,
        changePercent: priorSpend === 0 ? (spend > 0 ? null : 0) : ((spend - priorSpend) / priorSpend) * 100,
        monthToDateSpend: monthSpend,
        projectedMonthEnd: projectMonthEnd(monthSpend, elapsedMonthDays, daysInMonth)
      };
    }).sort((a, b) => b.spend - a.spend);

    return {
      organizationName: organization?.name ?? "Organization workspace",
      range,
      startDate: dateKey(window.start),
      endDate: dateKey(window.end),
      durationDays: window.durationDays,
      summaries,
      daily,
      monthly,
      providers,
      serviceBreakdown,
      budgets: budgetResults,
      hasCostData: current.length > 0 || monthRows.length > 0
    };
  });
}
