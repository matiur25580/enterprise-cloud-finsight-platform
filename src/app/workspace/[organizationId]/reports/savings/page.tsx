import Link from "next/link";
import { requireOrganizationPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { withOrganization } from "@/lib/tenant-context";

function money(value: number, currency: string) {
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(value); }
  catch { return currency + " " + value.toFixed(2); }
}

export default async function SavingsRoiPage({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const access = await requireOrganizationPermission(organizationId, "billing:read");
  const data = await withOrganization(prisma, organizationId, async (tx) => {
    const [impacts, implemented] = await Promise.all([
      tx.recommendationImpact.findMany({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
        take: 500,
        select: { currency: true, realizedSavings: true, baselineSpend: true, observedSpend: true, periodDays: true, createdAt: true, scope: true, recommendation: { select: { title: true, estimatedMonthlySavings: true } } }
      }),
      tx.recommendation.findMany({
        where: { organizationId, status: "IMPLEMENTED" },
        select: { currency: true, estimatedMonthlySavings: true }
      })
    ]);
    return { impacts, implemented };
  });
  const currencies = [...new Set([...data.impacts.map((x) => x.currency), ...data.implemented.map((x) => x.currency)])].sort();
  const summaries = currencies.map((currency) => {
    const rows = data.impacts.filter((x) => x.currency === currency);
    const estimated = data.implemented.filter((x) => x.currency === currency).reduce((sum, x) => sum + Number(x.estimatedMonthlySavings), 0);
    const realized = rows.reduce((sum, x) => sum + Number(x.realizedSavings), 0);
    const monthlyRunRate = rows.reduce((sum, x) => sum + Number(x.realizedSavings) * 30 / x.periodDays, 0);
    const positive = rows.filter((x) => Number(x.realizedSavings) > 0).length;
    return { currency, rows, estimated, realized, monthlyRunRate, positive, successRate: rows.length ? positive / rows.length * 100 : null };
  });
  return <main className="analytics-shell">
    <header className="analytics-topbar"><Link className="analytics-brand" href="/workspace">fin<span>sight</span></Link><Link className="analytics-back" href={"/workspace/" + organizationId}>Cost dashboard</Link></header>
    <div className="analytics-content">
      <div className="analytics-heading"><div><p className="analytics-eyebrow">FINOPS · VALUE REALIZATION</p><h1>Savings & ROI analytics</h1><p className="analytics-subtitle">Recommendation impact snapshots · {access.membership.role.replaceAll("_", " ")}</p></div><Link className="analytics-back" href={"/workspace/" + organizationId + "/recommendations"}>Review recommendations</Link></div>
      <p className="analytics-muted">Actuals below come from saved before/after billing comparisons. Estimated monthly savings are reviewer-entered estimates for implemented recommendations. Currency totals are isolated; no FX conversion is applied. This is an operational value-realization view, not audited financial ROI or proof of causation.</p>
      {summaries.length ? summaries.map((item) => <section className="analytics-section" key={item.currency}>
        <div className="analytics-section-title"><h2>{item.currency} · Value realization</h2><span>{item.rows.length} impact snapshots</span></div>
        <div className="analytics-kpis">
          <article className="analytics-card"><span>Estimated monthly savings</span><strong>{money(item.estimated,item.currency)}</strong><small>Implemented recommendations · reviewer estimates</small></article>
          <article className="analytics-card"><span>Net realized savings</span><strong>{money(item.realized,item.currency)}</strong><small>Sum of recorded comparison snapshots</small></article>
          <article className="analytics-card"><span>Normalized 30-day run rate</span><strong>{money(item.monthlyRunRate,item.currency)}</strong><small>Each snapshot normalized by its comparison length</small></article>
          <article className="analytics-card"><span>Positive impact rate</span><strong>{item.successRate === null ? "—" : item.successRate.toFixed(1) + "%"}</strong><small>{item.positive} positive of {item.rows.length} snapshots</small></article>
        </div>
        <div className="analytics-panel"><div className="analytics-panel-heading"><div><h2>Recent measured outcomes</h2><p>Latest saved snapshots; repeated periods are prevented by the database</p></div></div>
          {item.rows.slice(0, 20).map((row, index) => <div className="analytics-list-row" key={item.currency + row.createdAt.toISOString() + index}>
            <div><strong>{row.recommendation.title}</strong><span>{row.scope} · {row.periodDays}-day comparison · {row.createdAt.toISOString().slice(0,10)}</span></div>
            <strong>{money(Number(row.realizedSavings),item.currency)}</strong>
          </div>)}
        </div>
      </section>) : <section className="analytics-empty"><h2>No measured savings yet</h2><p>Mark a recommendation as implemented, record a valid before/after billing comparison, and this dashboard will populate from those saved snapshots. No sample or projected realized savings are displayed.</p><Link className="analytics-back" href={"/workspace/" + organizationId + "/recommendations"}>Open recommendations</Link></section>}
      <footer className="analytics-footer"><span>FinSight · Savings & ROI analytics</span><span>Source: tenant-scoped recommendation impact snapshots</span></footer>
    </div>
  </main>;
}
