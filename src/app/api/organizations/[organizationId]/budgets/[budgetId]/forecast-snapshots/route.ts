import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withUserContext } from "@/lib/user-context";
import { withOrganization } from "@/lib/tenant-context";
import { hasPermission } from "@/lib/permissions";
import { calculateBudgetForecast } from "@/lib/budget-forecast";

export const runtime = "nodejs";

function utcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
function dayDiff(start: Date, end: Date) {
  return Math.floor((utcDay(end).getTime() - utcDay(start).getTime()) / 86_400_000);
}

export async function POST(_request: Request, { params }: { params: Promise<{ organizationId: string; budgetId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { organizationId, budgetId } = await params;
  const membership = await withUserContext(prisma, session.user.id, (tx) => tx.membership.findFirst({
    where: { organizationId, userId: session.user.id }, select: { role: true }
  }));
  if (!membership) return NextResponse.json({ error: "Organization access denied." }, { status: 403 });
  if (!hasPermission(membership.role, "budgets:manage")) return NextResponse.json({ error: "You do not have permission to capture forecast snapshots." }, { status: 403 });

  try {
    const snapshot = await withOrganization(prisma, organizationId, async (tx) => {
      const budget = await tx.budget.findFirst({ where: { id: budgetId, organizationId, isActive: true } });
      if (!budget) throw new Error("BUDGET_NOT_FOUND");
      const today = utcDay(new Date());
      if (today < budget.startsAt || today > budget.endsAt) throw new Error("BUDGET_OUTSIDE_WINDOW");
      const totalDays = dayDiff(budget.startsAt, budget.endsAt) + 1;
      const elapsedDays = Math.min(totalDays, dayDiff(budget.startsAt, today) + 1);
      const aggregate = await tx.costRecord.aggregate({
        where: { organizationId, currency: budget.currency, usageDate: { gte: budget.startsAt, lte: today } },
        _sum: { amount: true }
      });
      const actualSpend = aggregate._sum.amount ? Number(aggregate._sum.amount.toString()) : 0;
      const forecast = calculateBudgetForecast({
        budgetAmount: Number(budget.amount.toString()), actualSpend, elapsedDays, totalDays, currency: budget.currency
      });
      const event = await tx.auditLog.create({
        data: {
          organizationId, actorUserId: session.user.id, action: "BUDGET_FORECAST_SNAPSHOT_CAPTURED",
          entityType: "BudgetForecast", entityId: budget.id,
          metadata: {
            budgetId: budget.id, budgetName: budget.name, currency: budget.currency,
            budgetAmount: Number(budget.amount.toString()), forecastAtPeriodEnd: forecast.forecastAtPeriodEnd,
            actualSpendAtCapture: actualSpend, capturedAt: today.toISOString(),
            startsAt: budget.startsAt.toISOString(), endsAt: budget.endsAt.toISOString(),
            elapsedDays, totalDays, method: "STRAIGHT_LINE_RUN_RATE"
          }
        }
      });
      return { id: event.id, budgetName: budget.name, forecastAtPeriodEnd: forecast.forecastAtPeriodEnd, currency: budget.currency };
    });
    return NextResponse.json({ snapshot }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "BUDGET_NOT_FOUND") return NextResponse.json({ error: "Active budget not found." }, { status: 404 });
    if (error instanceof Error && error.message === "BUDGET_OUTSIDE_WINDOW") return NextResponse.json({ error: "Snapshots can only be captured during an active budget window." }, { status: 409 });
    return NextResponse.json({ error: "Unable to capture forecast snapshot." }, { status: 500 });
  }
}
