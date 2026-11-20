import Link from "next/link";
import { requireOrganizationPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { withOrganization } from "@/lib/tenant-context";
import { calculateBudgetForecast } from "@/lib/budget-forecast";
import CaptureForecastButton from "./capture-button";

function money(value: number, currency: string) {
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(value); }
  catch { return currency + " " + value.toFixed(2); }
}

function dayStart(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
function dayDiff(start: Date, end: Date) {
  return Math.floor((dayStart(end).getTime() - dayStart(start).getTime()) / 86_400_000);
}

export default async function BudgetForecastPage({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  await requireOrganizationPermission(organizationId, "organization:read");
  const today = dayStart(new Date());
  const budgets = await withOrganization(prisma, organizationId, async (tx) => {
    const rows = await tx.budget.findMany({ where: { organizationId }, orderBy: [{ isActive: "desc" }, { startsAt: "desc" }] });
    return Promise.all(rows.map(async (budget) => {
      const totalDays = dayDiff(budget.startsAt, budget.endsAt) + 1;
      const through = budget.endsAt < today ? budget.endsAt : today;
      const elapsedDays = through < budget.startsAt ? 0 : Math.min(totalDays, dayDiff(budget.startsAt, through) + 1);
      const aggregate = elapsedDays > 0 ? await tx.costRecord.aggregate({
        where: { organizationId, currency: budget.currency, usageDate: { gte: budget.startsAt, lte: through } },
        _sum: { amount: true }
      }) : null;
      const actualSpend = aggregate?._sum.amount ? Number(aggregate._sum.amount.toString()) : 0;
      const forecast = calculateBudgetForecast({
        budgetAmount: Number(budget.amount.toString()), actualSpend, elapsedDays, totalDays, currency: budget.currency
      });
      return {
        id: budget.id, name: budget.name, amount: Number(budget.amount.toString()), currency: budget.currency,
        startsAt: budget.startsAt.toISOString().slice(0, 10), endsAt: budget.endsAt.toISOString().slice(0, 10),
        isActive: budget.isActive, forecast, isFuture: today < budget.startsAt, isExpired: today > budget.endsAt
      };
    }));
  });
  const active = budgets.filter((item) => item.isActive && !item.isExpired);
  const overPlan = active.filter((item) => item.forecast.pace === "OVER_PLAN").length;
  const projectedOver = active.filter((item) => item.forecast.forecastVariance > 0).length;
  return <main className="budget-page">
    <header className="budget-header"><div><Link href={"/workspace/" + organizationId + "/budgets"}>← Budget management</Link><p><Link href={"/workspace/" + organizationId + "/budgets/forecast/accuracy"}>Forecast accuracy history →</Link></p><p className="analytics-eyebrow">FINANCIAL PLANNING</p><h1>Forecast vs actual</h1><p className="analytics-subtitle">Compare actual cloud spend with the planned budget pace and a transparent period-end run-rate estimate.</p></div></header>
    <section className="analytics-grid budget-forecast-summary">
      <article className="analytics-stat"><span>Budgets tracked</span><strong>{budgets.length}</strong><small>All workspace budgets</small></article>
      <article className="analytics-stat"><span>Above planned pace</span><strong>{overPlan}</strong><small>Active, in-window budgets</small></article>
      <article className="analytics-stat"><span>Forecast over limit</span><strong>{projectedOver}</strong><small>Active budgets projected above limit</small></article>
      <article className="analytics-stat"><span>Forecast method</span><strong>Run rate</strong><small>Actual-to-date ÷ elapsed days</small></article>
    </section>
    <section className="analytics-panel budget-forecast-panel">
      <div className="analytics-panel-heading"><h2>Budget performance</h2><p>All amounts are compared within each budget currency; currencies are never added together.</p></div>
      {budgets.length ? <div className="budget-forecast-list">{budgets.map((item) => {
        const f = item.forecast;
        const status = item.isFuture ? "Not started" : item.isExpired ? "Period ended" : f.pace === "OVER_PLAN" ? "Above plan" : f.pace === "UNDER_PLAN" ? "Below plan" : "On plan";
        return <article className="budget-forecast-card" key={item.id}>
          <div className="budget-forecast-top"><div><strong>{item.name}</strong><span>{item.currency} · {item.startsAt} — {item.endsAt}</span></div><span className={"budget-alert-status " + (f.pace === "OVER_PLAN" && !item.isFuture ? "failed" : "delivered")}>{status}</span></div>
          <div className="budget-forecast-metrics">
            <div><small>Actual spend</small><strong>{money(f.actualSpend, item.currency)}</strong></div>
            <div><small>Planned to date</small><strong>{money(f.plannedSpendToDate, item.currency)}</strong></div>
            <div><small>Period-end forecast</small><strong>{money(f.forecastAtPeriodEnd, item.currency)}</strong></div>
            <div><small>Budget limit</small><strong>{money(item.amount, item.currency)}</strong></div>
          </div>
          <div className="budget-forecast-track"><i style={{ width: Math.min(100, Math.max(0, f.forecastUtilizationPercent)).toFixed(2) + "%" }} /></div>
          <div className="budget-forecast-bottom"><span>Actual vs plan: <b>{f.varianceToPlan >= 0 ? "+" : ""}{money(f.varianceToPlan, item.currency)}</b></span><span>Forecast variance: <b>{f.forecastVariance >= 0 ? "+" : ""}{money(f.forecastVariance, item.currency)}</b></span><span>{f.daysElapsed}/{f.totalDays} days elapsed · {f.daysRemaining} remaining</span></div>
          {!item.isFuture && !item.isExpired && item.isActive ? <CaptureForecastButton organizationId={organizationId} budgetId={item.id} /> : null}
        </article>;
      })}</div> : <div className="budget-empty"><h3>No budgets to forecast</h3><p>Create a budget to compare actual spending with the expected pace.</p></div>}
    </section>
    <p className="budget-forecast-disclaimer">Forecast is a straight-line daily run-rate estimate based on costs imported so far in each budget window. It does not model seasonality, committed future spend, usage changes, credits not yet imported, or missing billing data. Treat it as directional, not a guarantee.</p>
  </main>;
}
