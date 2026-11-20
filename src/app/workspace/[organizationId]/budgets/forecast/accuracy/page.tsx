import Link from "next/link";
import { requireOrganizationPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { withOrganization } from "@/lib/tenant-context";

function money(value: number, currency: string) {
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(value); }
  catch { return currency + " " + value.toFixed(2); }
}

export default async function ForecastAccuracyPage({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  await requireOrganizationPermission(organizationId, "organization:read");
  const events = await withOrganization(prisma, organizationId, (tx) => tx.auditLog.findMany({
    where: { organizationId, entityType: "BudgetForecast", action: "BUDGET_FORECAST_SNAPSHOT_CAPTURED" },
    orderBy: { createdAt: "desc" }, take: 100,
    select: { id: true, entityId: true, metadata: true, createdAt: true }
  }));
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const snapshots = await withOrganization(prisma, organizationId, async (tx) => Promise.all(events.map(async (event) => {
    const meta = event.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata) ? event.metadata as Record<string, unknown> : {};
    const currency = typeof meta.currency === "string" ? meta.currency : "USD";
    const forecast = typeof meta.forecastAtPeriodEnd === "number" ? meta.forecastAtPeriodEnd : 0;
    const endsAt = typeof meta.endsAt === "string" ? new Date(meta.endsAt) : today;
    const startsAt = typeof meta.startsAt === "string" ? new Date(meta.startsAt) : today;
    const budgetId = typeof meta.budgetId === "string" ? meta.budgetId : event.entityId;
    const closed = today > endsAt;
    const actual = closed ? await tx.costRecord.aggregate({
      where: { organizationId, currency, usageDate: { gte: startsAt, lte: endsAt } }, _sum: { amount: true }
    }) : null;
    const actualSpend = actual?._sum.amount ? Number(actual._sum.amount.toString()) : null;
    const errorAmount = actualSpend === null ? null : forecast - actualSpend;
    const errorPercent = actualSpend === null || actualSpend === 0 ? null : Math.abs(forecast - actualSpend) / actualSpend * 100;
    return {
      id: event.id, budgetId, name: typeof meta.budgetName === "string" ? meta.budgetName : "Budget",
      currency, forecast, actualSpend, errorAmount, errorPercent, closed, createdAt: event.createdAt,
      endsAt: endsAt.toISOString().slice(0, 10), budgetAmount: typeof meta.budgetAmount === "number" ? meta.budgetAmount : 0
    };
  })));
  const completed = snapshots.filter((item) => item.closed && item.errorPercent !== null);
  const meanAbsolutePercentageError = completed.length ? completed.reduce((sum, item) => sum + (item.errorPercent ?? 0), 0) / completed.length : null;
  return <main className="budget-page">
    <header className="budget-header"><div><Link href={"/workspace/" + organizationId + "/budgets/forecast"}>← Forecast vs actual</Link><p className="analytics-eyebrow">FORECAST QUALITY</p><h1>Forecast accuracy</h1><p className="analytics-subtitle">Compare saved period-end forecasts with realized spend after each budget window closes.</p></div></header>
    <section className="analytics-grid">
      <article className="analytics-stat"><span>Snapshots</span><strong>{snapshots.length}</strong><small>Latest 100 captured forecasts</small></article>
      <article className="analytics-stat"><span>Completed periods</span><strong>{completed.length}</strong><small>Closed windows with non-zero actual spend</small></article>
      <article className="analytics-stat"><span>Mean absolute percentage error</span><strong>{meanAbsolutePercentageError === null ? "—" : meanAbsolutePercentageError.toFixed(1) + "%"}</strong><small>Lower is better; excludes zero actuals</small></article>
      <article className="analytics-stat"><span>Awaiting close</span><strong>{snapshots.filter((item) => !item.closed).length}</strong><small>Actual spend not final yet</small></article>
    </section>
    <section className="analytics-panel budget-alert-history"><div className="analytics-panel-heading"><h2>Captured forecasts</h2><p>Each snapshot is immutable; actual spend is recalculated from imported records once the window has ended.</p></div>
      {snapshots.length ? <div className="budget-alert-table-wrap"><table className="budget-alert-table"><thead><tr><th>Budget</th><th>Captured forecast</th><th>Final actual</th><th>Forecast error</th><th>Period end</th><th>Status</th></tr></thead><tbody>{snapshots.map((item) => <tr key={item.id}><td><strong>{item.name}</strong><small>{item.currency} · limit {money(item.budgetAmount, item.currency)}</small></td><td>{money(item.forecast, item.currency)}<small>{item.createdAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC</small></td><td>{item.actualSpend === null ? "—" : money(item.actualSpend, item.currency)}</td><td>{item.errorAmount === null ? "—" : <>{money(item.errorAmount, item.currency)}<small>{item.errorPercent === null ? "Actual spend is zero" : item.errorPercent.toFixed(1) + "% absolute error"}</small></>}</td><td>{item.endsAt}</td><td><span className={"budget-alert-status " + (item.closed ? "delivered" : "pending")}>{item.closed ? "Finalized" : "Awaiting close"}</span></td></tr>)}</tbody></table></div> : <div className="budget-empty"><h3>No forecast snapshots yet</h3><p>Capture a forecast from the Forecast vs actual page during an active budget window.</p></div>}
    </section>
    <p className="budget-forecast-disclaimer">Accuracy reflects the billing data currently imported for the budget currency and date range. Missing or late provider data can change the measured error. A zero final spend is reported separately and excluded from percentage-error averaging.</p>
  </main>;
}
