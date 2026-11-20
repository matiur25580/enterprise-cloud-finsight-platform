import Link from "next/link";
import { requireOrganizationPermission } from "@/lib/auth-guards";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { withOrganization } from "@/lib/tenant-context";
import RevenueManager from "./revenue-manager";

function money(value: number, currency: string) {
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(value); }
  catch { return currency + " " + value.toFixed(2); }
}

export default async function RevenueEfficiencyPage({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const access = await requireOrganizationPermission(organizationId, "billing:read");
  const end = new Date(); end.setUTCHours(23, 59, 59, 999);
  const start = new Date(end); start.setUTCDate(start.getUTCDate() - 89); start.setUTCHours(0, 0, 0, 0);
  const data = await withOrganization(prisma, organizationId, async (tx) => {
    const [revenueRows, costRows, metricRows, records] = await Promise.all([
      tx.revenueRecord.groupBy({ by: ["revenueDate", "currency"], where: { organizationId, revenueDate: { gte: start, lte: end } }, _sum: { amount: true }, orderBy: { revenueDate: "asc" } }),
      tx.costRecord.groupBy({ by: ["usageDate", "currency"], where: { organizationId, usageDate: { gte: start, lte: end } }, _sum: { amount: true }, orderBy: { usageDate: "asc" } }),
      tx.businessMetric.groupBy({ by: ["metricDate", "metricName", "unit"], where: { organizationId, metricDate: { gte: start, lte: end } }, _sum: { value: true }, _count: { _all: true }, orderBy: { metricDate: "asc" } }),
      tx.revenueRecord.findMany({ where: { organizationId, revenueDate: { gte: start, lte: end } }, orderBy: [{ revenueDate: "desc" }, { createdAt: "desc" }], take: 100 })
    ]);
    const totals = new Map<string, { revenue: number; spend: number; revenueRecords: number; costRecords: number }>();
    const monthly = new Map<string, { month: string; currency: string; revenue: number; spend: number }>();
    for (const row of revenueRows) {
      const currency = row.currency; const value = Number(row._sum.amount ?? 0);
      const total = totals.get(currency) ?? { revenue: 0, spend: 0, revenueRecords: 0, costRecords: 0 };
      total.revenue += value; total.revenueRecords += 1; totals.set(currency, total);
      const month = row.revenueDate.toISOString().slice(0, 7); const key = month + ":" + currency;
      const item = monthly.get(key) ?? { month, currency, revenue: 0, spend: 0 }; item.revenue += value; monthly.set(key, item);
    }
    for (const row of costRows) {
      const currency = row.currency; const value = Number(row._sum.amount ?? 0);
      const total = totals.get(currency) ?? { revenue: 0, spend: 0, revenueRecords: 0, costRecords: 0 };
      total.spend += value; total.costRecords += 1; totals.set(currency, total);
      const month = row.usageDate.toISOString().slice(0, 7); const key = month + ":" + currency;
      const item = monthly.get(key) ?? { month, currency, revenue: 0, spend: 0 }; item.spend += value; monthly.set(key, item);
    }
    const metricTotals = new Map<string, { metricName: string; unit: string; value: number; observations: number }>();
    for (const row of metricRows) {
      const key = row.metricName + ":" + row.unit;
      const item = metricTotals.get(key) ?? { metricName: row.metricName, unit: row.unit, value: 0, observations: 0 };
      item.value += Number(row._sum.value ?? 0); item.observations += row._count._all; metricTotals.set(key, item);
    }
    return {
      totals: [...totals.entries()].map(([currency, value]) => ({ currency, ...value })),
      monthly: [...monthly.values()].sort((a, b) => a.month.localeCompare(b.month) || a.currency.localeCompare(b.currency)),
      metricTotals: [...metricTotals.values()],
      records: records.map((record) => ({ id: record.id, amount: Number(record.amount), currency: record.currency, revenueDate: record.revenueDate.toISOString().slice(0, 10), source: record.source, notes: record.notes }))
    };
  });
  return <main className="analytics-shell">
    <header className="analytics-topbar"><Link className="analytics-brand" href="/workspace">fin<span>sight</span></Link><Link className="analytics-back" href={"/workspace/" + organizationId}>Cost dashboard</Link></header>
    <div className="analytics-content">
      <div className="analytics-heading"><div><p className="analytics-eyebrow">FINOPS · FINANCIAL PERFORMANCE</p><h1>Revenue vs cloud spend</h1><p className="analytics-subtitle">90-day financial efficiency view · revenue and costs are compared only within the same currency</p></div></div>
      <p className="analytics-muted">Cloud contribution = reported revenue minus imported cloud infrastructure spend. This is not net profit, gross margin, or a full P&amp;L; it excludes payroll, payment fees, taxes and other operating costs. Revenue is manually reported and never inferred from billing data.</p>
      <section className="analytics-section"><div className="analytics-section-title"><h2>Financial performance by currency</h2><span>90 calendar days · no cross-currency conversion</span></div>
        <div className="analytics-kpis">{data.totals.map((item) => <article className="analytics-card" key={item.currency}><span>Reported revenue · {item.currency}</span><strong>{money(item.revenue, item.currency)}</strong><small>{item.revenueRecords} dated revenue groups</small></article>)}
          {data.totals.map((item) => <article className="analytics-card" key={"cost-"+item.currency}><span>Cloud spend · {item.currency}</span><strong>{money(item.spend, item.currency)}</strong><small>{item.costRecords.toLocaleString()} date groups</small></article>)}
          {data.totals.map((item) => <article className="analytics-card" key={"contribution-"+item.currency}><span>Revenue less cloud spend · {item.currency}</span><strong>{money(item.revenue-item.spend, item.currency)}</strong><small>{item.revenue > 0 ? ((item.spend/item.revenue)*100).toFixed(1)+"% of revenue consumed by cloud" : "Revenue baseline not reported"}</small></article>)}
        </div>
        {!data.totals.length ? <div className="analytics-empty"><h2>No financial source data yet</h2><p>Import billing records and record verified revenue to populate the comparison. The dashboard does not insert sample figures.</p></div> : null}
      </section>
      <section className="analytics-grid">
        <article className="analytics-panel"><div className="analytics-panel-heading"><div><h2>Monthly revenue vs cloud spend</h2><p>Actuals grouped by calendar month and currency</p></div></div>
          {data.monthly.length ? <div className="budget-alert-table-wrap"><table className="budget-alert-table"><thead><tr><th>Month</th><th>Currency</th><th>Revenue</th><th>Cloud spend</th><th>Contribution</th></tr></thead><tbody>{data.monthly.map((row) => <tr key={row.month+row.currency}><td>{row.month}</td><td>{row.currency}</td><td>{money(row.revenue,row.currency)}</td><td>{money(row.spend,row.currency)}</td><td>{money(row.revenue-row.spend,row.currency)}</td></tr>)}</tbody></table></div> : <p className="analytics-muted">Monthly comparison will appear when source data is available.</p>}
        </article>
        <article className="analytics-panel"><div className="analytics-panel-heading"><div><h2>Cost efficiency indicators</h2><p>Cloud spend divided by reported business volume</p></div></div>
          {data.metricTotals.length && data.totals.length ? data.totals.map((spend) => data.metricTotals.map((metric) => <div className="analytics-list-row" key={spend.currency+metric.metricName+metric.unit}><div><strong>{spend.currency} / {metric.metricName}</strong><span>{metric.value.toLocaleString("en-US",{maximumFractionDigits:4})} {metric.unit} reported</span></div><strong>{metric.value>0?money(spend.spend/metric.value,spend.currency):"—"}</strong></div>)) : <p className="analytics-muted">Add verified business volume observations in Unit economics to calculate cost per unit.</p>}
          <Link className="analytics-back" href={"/workspace/"+organizationId+"/business-metrics"}>Manage business metrics</Link>
        </article>
      </section>
      <RevenueManager organizationId={organizationId} initialRecords={data.records} canManage={hasPermission(access.membership.role,"billing:import")} />
    </div>
  </main>;
}
