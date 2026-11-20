import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrganizationPermission } from "@/lib/auth-guards";
import type { MembershipRole } from "@prisma/client";
import { hasPermission } from "@/lib/permissions";
import { getCostAnalytics } from "@/lib/analytics";
import type { AnalyticsRange } from "@/lib/analytics-math";

const ranges: AnalyticsRange[] = ["7d", "30d", "90d", "month"];

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2
    }).format(value);
  } catch {
    return currency + " " + value.toFixed(2);
  }
}

function changeLabel(change: number | null) {
  if (change === null) return "No previous-period baseline";
  if (change === 0) return "No change vs previous period";
  return (change > 0 ? "+" : "") + change.toFixed(1) + "% vs previous period";
}

export default async function OrganizationDashboard({
  params,
  searchParams
}: {
  params: Promise<{ organizationId: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const [{ organizationId }, query] = await Promise.all([params, searchParams]);
  const range = ranges.includes(query.range as AnalyticsRange) ? query.range as AnalyticsRange : "30d";
  let access: { user: { id: string; name?: string | null; email?: string | null }; membership: { id: string; organizationId: string; role: MembershipRole } };
  try {
    access = await requireOrganizationPermission(organizationId, "organization:read");
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") notFound();
    throw error;
  }

  const analytics = await getCostAnalytics(organizationId, range);
  const organizationName = analytics.organizationName;
  const dataPoints = analytics.daily.length;
  const dailyMax = Math.max(1, ...analytics.daily.map((item) => item.spend));
  const serviceMax = Math.max(1, ...analytics.serviceBreakdown.map((item) => item.spend));
  const topCurrency = analytics.summaries[0]?.currency;

  return (
    <main className="analytics-shell">
      <header className="analytics-topbar">
        <Link className="analytics-brand" href="/workspace">fin<span>sight</span></Link>
        <div className="analytics-user">{access.user.name ?? access.user.email} · {access.membership.role.replaceAll("_", " ")}</div>
      </header>
      <div className="analytics-content">
        <div className="analytics-heading">
          <div>
            <p className="analytics-eyebrow">CLOUD FINANCIAL OPERATIONS</p>
            <h1>Cost intelligence</h1>
            <p className="analytics-subtitle">{organizationName} · {analytics.startDate} to {analytics.endDate}</p>
          </div>
          <div className="flex gap-3">{hasPermission(access.membership.role, "budgets:manage") ? <Link className="analytics-back" href={"/workspace/" + organizationId + "/budgets"}>Budgets</Link> : <Link className="analytics-back" href={"/workspace/" + organizationId + "/budgets"}>Budget overview</Link>}{hasPermission(access.membership.role, "organization:manage") ? <Link className="analytics-back" href={"/workspace/" + organizationId + "/settings"}>Workspace settings</Link> : null}{hasPermission(access.membership.role, "members:manage") ? <Link className="analytics-back" href={"/workspace/" + organizationId + "/members"}>Members & access</Link> : null}<Link className="analytics-back" href={"/workspace/" + organizationId + "/cloud-accounts"}>Cloud accounts</Link><Link className="analytics-back" href={"/workspace/" + organizationId + "/billing"}>Import billing CSV</Link><Link className="analytics-back" href={"/workspace/" + organizationId + "/insights"}>Anomalies & optimization</Link><Link className="analytics-back" href="/workspace">All workspaces</Link></div>
        </div>

        <nav className="analytics-ranges" aria-label="Analytics date range">
          {ranges.map((item) => (
            <Link key={item} aria-current={range === item ? "page" : undefined}
              className={range === item ? "analytics-range active" : "analytics-range"}
              href={"/workspace/" + organizationId + "?range=" + item}>
              {item === "7d" ? "7 days" : item === "30d" ? "30 days" : item === "90d" ? "90 days" : "This month"}
            </Link>
          ))}
        </nav>

        {!analytics.hasCostData ? (
          <section className="analytics-empty">
            <h2>No billing data yet</h2>
            <p>Import a billing CSV to populate spend trends, provider allocation, service costs, forecasts and budgets. This dashboard does not use sample figures.</p>
          </section>
        ) : null}

        <section className="analytics-section">
          <div className="analytics-section-title"><h2>Spend summary</h2><span>Amounts remain separated by billing currency</span></div>
          <div className="analytics-kpis">
            {analytics.summaries.map((item) => (
              <article className="analytics-card" key={item.currency}>
                <span>Total cloud spend · {item.currency}</span>
                <strong>{money(item.spend, item.currency)}</strong>
                <small>{changeLabel(item.changePercent)}</small>
              </article>
            ))}
            {analytics.summaries.map((item) => (
              <article className="analytics-card" key={"forecast-" + item.currency}>
                <span>Projected month-end · {item.currency}</span>
                <strong>{money(item.projectedMonthEnd, item.currency)}</strong>
                <small>Run-rate estimate from month-to-date actuals</small>
              </article>
            ))}
          </div>
        </section>

        <section className="analytics-grid">
          <article className="analytics-panel">
            <div className="analytics-panel-heading"><div><h2>Daily spend</h2><p>Actual cost records by usage date</p></div></div>
            {analytics.daily.length ? (
              <div className="analytics-bars">
                {analytics.daily.slice(-30).map((item) => (
                  <div className="analytics-bar-row" key={item.date + item.currency}>
                    <span>{item.date}</span><div className="analytics-bar-track"><i style={{ width: ((item.spend / dailyMax) * 100).toFixed(2) + "%" }} /></div>
                    <strong>{money(item.spend, item.currency)}</strong>
                  </div>
                ))}
              </div>
            ) : <p className="analytics-muted">No cost records in this date range.</p>}
          </article>

          <article className="analytics-panel">
            <div className="analytics-panel-heading"><div><h2>Spend by service</h2><p>Service-level allocation for selected period</p></div></div>
            {analytics.serviceBreakdown.length ? analytics.serviceBreakdown.slice(0, 12).map((item) => (
              <div className="analytics-breakdown" key={item.service + item.currency}>
                <div><span>{item.service}</span><strong>{money(item.spend, item.currency)}</strong></div>
                <div className="analytics-bar-track"><i style={{ width: ((item.spend / serviceMax) * 100).toFixed(2) + "%" }} /></div>
              </div>
            )) : <p className="analytics-muted">Service costs will appear after billing data is imported.</p>}
          </article>
        </section>

        <section className="analytics-grid">
          <article className="analytics-panel">
            <div className="analytics-panel-heading"><div><h2>Provider allocation</h2><p>Cloud accounts contributing to spend</p></div></div>
            {analytics.providers.length ? analytics.providers.map((item) => (
              <div className="analytics-list-row" key={item.accountName + item.currency}>
                <div><strong>{item.provider}</strong><span>{item.accountName}</span></div>
                <strong>{money(item.spend, item.currency)}</strong>
              </div>
            )) : <p className="analytics-muted">Provider spend will appear when cost records are available.</p>}
          </article>
          <article className="analytics-panel">
            <div className="analytics-panel-heading"><div><h2>Budget utilization</h2><p>Active budgets covering today</p></div></div>
            {analytics.budgets.length ? analytics.budgets.map((item) => (
              <div className="analytics-budget" key={item.id}>
                <div><strong>{item.name}</strong><span>{item.period} · {money(item.spent, item.currency)} of {money(item.budget, item.currency)}</span></div>
                <strong>{item.utilization.toFixed(1)}%</strong>
                <div className="analytics-bar-track"><i style={{ width: Math.min(100, item.utilization).toFixed(2) + "%" }} /></div>
                <small>{money(item.remaining, item.currency)} remaining</small>
              </div>
            )) : <p className="analytics-muted">No active budgets cover today.</p>}
          </article>
        </section>

        <section className="analytics-panel analytics-monthly">
          <div className="analytics-panel-heading"><div><h2>Monthly spend history</h2><p>Six-month actuals grouped by calendar month and currency</p></div></div>
          {analytics.monthly.length ? analytics.monthly.map((item) => (
            <div className="analytics-list-row" key={item.month + item.currency}>
              <strong>{item.month}</strong><span>{money(item.spend, item.currency)}</span>
            </div>
          )) : <p className="analytics-muted">Monthly history will appear after billing data is imported.</p>}
        </section>

        <footer className="analytics-footer">
          <span>FinSight · Live database analytics</span>
          <span>{dataPoints} daily currency data points · {topCurrency ? "Top currency: " + topCurrency : "Waiting for billing records"}</span>
        </footer>
      </div>
    </main>
  );
}
