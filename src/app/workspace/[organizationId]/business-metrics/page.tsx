import Link from "next/link";
import { requireOrganizationPermission } from "@/lib/auth-guards";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { withOrganization } from "@/lib/tenant-context";
import BusinessMetricsManager from "./business-metrics-manager";

export default async function BusinessMetricsPage({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const access = await requireOrganizationPermission(organizationId, "billing:read");
  const end = new Date(); end.setUTCHours(23, 59, 59, 999);
  const start = new Date(end); start.setUTCDate(start.getUTCDate() - 29); start.setUTCHours(0, 0, 0, 0);
  const data = await withOrganization(prisma, organizationId, async (tx) => {
    const [metrics, metricTotals, spendTotals] = await Promise.all([
      tx.businessMetric.findMany({ where: { organizationId, metricDate: { gte: start, lte: end } }, orderBy: [{ metricDate: "desc" }, { createdAt: "desc" }], take: 100 }),
      tx.businessMetric.groupBy({ by: ["metricName", "unit"], where: { organizationId, metricDate: { gte: start, lte: end } }, _sum: { value: true }, _count: { _all: true } }),
      tx.costRecord.groupBy({ by: ["currency"], where: { organizationId, usageDate: { gte: start, lte: end } }, _sum: { amount: true }, _count: { _all: true } })
    ]);
    return {
      metrics: metrics.map((item) => ({ id: item.id, metricName: item.metricName, unit: item.unit, value: Number(item.value), metricDate: item.metricDate.toISOString().slice(0, 10), notes: item.notes })),
      metricTotals: metricTotals.map((item) => ({ metricName: item.metricName, unit: item.unit, total: Number(item._sum.value ?? 0), observations: item._count._all })),
      spendTotals: spendTotals.map((item) => ({ currency: item.currency, spend: Number(item._sum.amount ?? 0), records: item._count._all }))
    };
  });
  return <main className="analytics-shell">
    <header className="analytics-topbar"><Link className="analytics-brand" href="/workspace">fin<span>sight</span></Link><Link className="analytics-back" href={"/workspace/" + organizationId}>Cost dashboard</Link></header>
    <div className="analytics-content">
      <div className="analytics-heading"><div><p className="analytics-eyebrow">FINOPS · UNIT ECONOMICS</p><h1>Business unit economics</h1><p className="analytics-subtitle">Connect reported business volumes with actual cloud spend · last 30 calendar days</p></div></div>
      <p className="analytics-muted">Cost per unit is an organization-wide showback ratio: total imported cloud spend divided by the reported business volume. It is not service-level attribution or profitability. Metrics are manually reported and are never fabricated.</p>
      <section className="analytics-section"><div className="analytics-section-title"><h2>Cloud cost per business unit</h2><span>Spend and metric totals remain visible by currency and unit</span></div>
        <div className="analytics-kpis">{data.spendTotals.flatMap((spend) => data.metricTotals.map((metric) => <article className="analytics-card" key={spend.currency + metric.metricName + metric.unit}><span>{spend.currency} per {metric.metricName} ({metric.unit})</span><strong>{metric.total > 0 ? new Intl.NumberFormat("en-US", { style: "currency", currency: spend.currency, maximumFractionDigits: 4 }).format(spend.spend / metric.total) : "—"}</strong><small>{new Intl.NumberFormat("en-US").format(metric.total)} reported · {spend.records.toLocaleString()} cost records</small></article>))}</div>
        {!data.spendTotals.length || !data.metricTotals.length ? <div className="analytics-empty"><h2>Not enough source data yet</h2><p>Import cloud billing data and record a business volume metric to calculate unit economics. No sample or estimated business counts are inserted.</p></div> : null}
      </section>
      <BusinessMetricsManager organizationId={organizationId} initialMetrics={data.metrics} canManage={hasPermission(access.membership.role, "billing:import")} />
    </div>
  </main>;
}
