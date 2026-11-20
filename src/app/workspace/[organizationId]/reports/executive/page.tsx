import Link from "next/link";
import { requireOrganizationPermission } from "@/lib/auth-guards";
import { getCostAnalytics } from "@/lib/analytics";
import { getCostIntelligence } from "@/lib/cost-intelligence";
import { prisma } from "@/lib/prisma";
import { withOrganization } from "@/lib/tenant-context";

function money(value: number, currency: string) {
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(value); }
  catch { return currency + " " + value.toFixed(2); }
}

export default async function ExecutiveReportPage({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  await requireOrganizationPermission(organizationId, "billing:read");
  const [analytics, intelligence, revenue] = await Promise.all([
    getCostAnalytics(organizationId, "90d"),
    getCostIntelligence(organizationId),
    withOrganization(prisma, organizationId, (tx) => tx.revenueRecord.groupBy({
      by: ["currency"], where: { organizationId, revenueDate: { gte: new Date(Date.now() - 89 * 86400000), lte: new Date() } },
      _sum: { amount: true }, _count: { _all: true }
    }))
  ]);
  const revenueByCurrency = new Map(revenue.map((row) => [row.currency, { amount: Number(row._sum.amount ?? 0), count: row._count._all }]));
  const currencies = [...new Set([...analytics.summaries.map((row) => row.currency), ...revenue.map((row) => row.currency)])].sort();
  return <main className="analytics-shell">
    <header className="analytics-topbar"><Link className="analytics-brand" href="/workspace">fin<span>sight</span></Link><Link className="analytics-back" href={"/workspace/" + organizationId}>Cost dashboard</Link></header>
    <div className="analytics-content">
      <div className="analytics-heading"><div><p className="analytics-eyebrow">FINOPS · EXECUTIVE BRIEFING</p><h1>Executive FinOps report</h1><p className="analytics-subtitle">{analytics.organizationName} · {analytics.startDate} to {analytics.endDate} · 90-day reporting window</p></div><a className="analytics-back" href={"/api/organizations/" + organizationId + "/reports/executive?days=90"}>Download executive CSV</a></div>
      <p className="analytics-muted">Actual imported cloud costs and manually reported revenue only. Currency totals are kept separate; cloud contribution is revenue less cloud spend, not net profit or a complete P&amp;L. Budget utilization uses active budgets covering today. Anomaly and savings signals are indicative, not realized savings.</p>
      <section className="analytics-section"><div className="analytics-section-title"><h2>Financial snapshot by currency</h2><span>90-day actuals · no FX conversion</span></div>
        <div className="analytics-kpis">{currencies.map((currency) => {
          const spend = analytics.summaries.find((row) => row.currency === currency)?.spend ?? 0;
          const reported = revenueByCurrency.get(currency);
          return <article className="analytics-card" key={currency}><span>{currency} · Cloud spend</span><strong>{money(spend,currency)}</strong><small>{reported ? "Reported revenue: " + money(reported.amount,currency) : "Revenue not reported"}{reported ? " · Cloud contribution: " + money(reported.amount-spend,currency) : ""}</small></article>;
        })}</div>
        {!currencies.length ? <div className="analytics-empty"><h2>No reportable financial data</h2><p>Import billing records and add verified revenue observations to populate this report. No sample values are generated.</p></div> : null}
      </section>
      <section className="analytics-grid">
        <article className="analytics-panel"><div className="analytics-panel-heading"><div><h2>Budget control</h2><p>Active budgets covering the current date</p></div></div>
          {analytics.budgets.length ? analytics.budgets.map((budget) => <div className="analytics-list-row" key={budget.id}><div><strong>{budget.name} · {budget.currency}</strong><span>{money(budget.spent,budget.currency)} / {money(budget.budget,budget.currency)}</span></div><strong>{budget.utilization.toFixed(1)}%</strong></div>) : <p className="analytics-muted">No active budget covers today.</p>}
        </article>
        <article className="analytics-panel"><div className="analytics-panel-heading"><div><h2>Cost risk & optimization</h2><p>Signals from imported billing records</p></div></div>
          <div className="analytics-list-row"><strong>Detected cost anomalies</strong><strong>{intelligence.anomalies.length}</strong></div>
          <div className="analytics-list-row"><strong>Budget threshold alerts</strong><strong>{intelligence.budgetAlerts.length}</strong></div>
          <div className="analytics-list-row"><strong>Optimization candidates</strong><strong>{intelligence.optimizationRecommendations.length}</strong></div>
          <p className="analytics-muted">Modeled savings are illustrative scenarios, not guaranteed or realized savings.</p>
          <Link className="analytics-back" href={"/workspace/"+organizationId+"/insights"}>Review cost intelligence</Link>
        </article>
      </section>
      <section className="analytics-panel"><div className="analytics-panel-heading"><div><h2>Top cloud services</h2><p>90-day spend ranked independently within each currency</p></div></div>
        {analytics.serviceBreakdown.length ? analytics.serviceBreakdown.slice(0,15).map((item) => <div className="analytics-list-row" key={item.service+item.currency}><strong>{item.service} · {item.currency}</strong><strong>{money(item.spend,item.currency)}</strong></div>) : <p className="analytics-muted">Service spend appears after billing data is imported.</p>}
      </section>
      <section className="analytics-panel"><div className="analytics-panel-heading"><div><h2>Monthly cloud spend</h2><p>Calendar-month actuals · currency-isolated</p></div></div>
        {analytics.monthly.length ? analytics.monthly.map((item) => <div className="analytics-list-row" key={item.month+item.currency}><strong>{item.month} · {item.currency}</strong><strong>{money(item.spend,item.currency)}</strong></div>) : <p className="analytics-muted">No monthly spend records in the reporting window.</p>}
      </section>
      <footer className="analytics-footer"><span>FinSight · Executive reporting</span><span>Source: tenant billing records, budgets, reported revenue and cost intelligence</span></footer>
    </div>
  </main>;
}
