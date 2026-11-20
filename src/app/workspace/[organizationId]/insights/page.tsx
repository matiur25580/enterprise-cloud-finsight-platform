import Link from "next/link";
import { getCostIntelligence } from "@/lib/cost-intelligence";

function money(value: number, currency: string) {
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(value); }
  catch { return currency + " " + value.toFixed(2); }
}

export default async function CostInsightsPage({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const insights = await getCostIntelligence(organizationId);
  return (
    <main className="analytics-shell">
      <header className="analytics-topbar"><Link className="analytics-brand" href="/workspace">fin<span>sight</span></Link><Link className="analytics-back" href={"/workspace/" + organizationId}>Cost dashboard</Link></header>
      <div className="analytics-content">
        <div className="analytics-heading"><Link className="analytics-back" href={"/workspace/" + organizationId + "/recommendations"}>Open recommendation workflow</Link></div>
        <div className="analytics-heading"><div><p className="analytics-eyebrow">FINOPS INTELLIGENCE</p><h1>Anomalies & optimization</h1><p className="analytics-subtitle">Signals calculated from your imported billing records · Generated {new Date(insights.generatedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</p></div></div>
        {!insights.hasBillingData ? <section className="analytics-empty"><h2>Waiting for billing data</h2><p>Import billing records to detect cost spikes, evaluate budget thresholds, and rank optimization opportunities. No sample alerts are generated.</p></section> : null}
        <section className="analytics-section"><div className="analytics-section-title"><h2>Cost anomalies</h2><span>14-day service baseline · minimum 7 observations</span></div>
          {insights.anomalies.length ? insights.anomalies.map((item) => <article className="analytics-card" key={item.service + item.currency + item.date}><div className="analytics-list-row"><strong>{item.service}</strong><span>{item.date} · {item.severity}</span></div><strong>{money(item.spend, item.currency)} actual vs {money(item.baselineAverage, item.currency)} baseline</strong><small>{item.increasePercent.toFixed(1)}% above baseline · 3σ / 2× threshold rule</small></article>) : <p className="analytics-muted">No service-level cost anomalies met the detection threshold.</p>}
        </section>
        <section className="analytics-section"><div className="analytics-section-title"><h2>Budget threshold alerts</h2><span>Configured budget thresholds</span></div>
          {insights.budgetAlerts.length ? insights.budgetAlerts.map((item) => <article className="analytics-card" key={item.name + item.currency}><div className="analytics-list-row"><strong>{item.name}</strong><span>{item.exceeded ? "Budget exceeded" : "Threshold reached"}</span></div><strong>{item.utilization.toFixed(1)}% utilized · {money(item.spent, item.currency)} / {money(item.budget, item.currency)}</strong><small>Highest crossed threshold: {item.highestThreshold}%</small></article>) : <p className="analytics-muted">No configured budget thresholds have been crossed.</p>}
        </section>
        <section className="analytics-section"><div className="analytics-section-title"><h2>Optimization opportunities</h2><span>Ranked by current-month service spend</span></div>
          {insights.optimizationRecommendations.length ? insights.optimizationRecommendations.map((item) => <article className="analytics-card" key={item.service + item.currency}><div className="analytics-list-row"><strong>{item.service}</strong><span>{money(item.monthToDateSpend, item.currency)} month-to-date</span></div><p>{item.rationale}</p><strong>Illustrative savings scenario: {money(item.modeledMonthlySavings, item.currency)} / month</strong><small>Assumed reduction: {item.scenarioRatePercent}% · Not a guaranteed or realized saving</small></article>) : <p className="analytics-muted">Optimization signals will appear when service costs are available.</p>}
        </section>
        <footer className="analytics-footer"><span>FinSight · Explainable cost intelligence</span><span>Signals are informational; validate changes before modifying production resources.</span></footer>
      </div>
    </main>
  );
}
