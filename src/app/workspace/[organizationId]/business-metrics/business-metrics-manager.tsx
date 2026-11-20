"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Metric = { id: string; metricName: string; unit: string; value: number; metricDate: string; notes: string | null };

export default function BusinessMetricsManager({ organizationId, initialMetrics, canManage }: {
  organizationId: string; initialMetrics: Metric[]; canManage: boolean;
}) {
  const router = useRouter();
  const [metrics, setMetrics] = useState(initialMetrics);
  const [metricName, setMetricName] = useState("API requests");
  const [unit, setUnit] = useState("requests");
  const [value, setValue] = useState("");
  const [metricDate, setMetricDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/organizations/" + organizationId + "/business-metrics", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metricName, unit, value: Number(value), metricDate, notes: notes || undefined })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to record business metric.");
      setMetrics((current) => [payload.metric, ...current].slice(0, 100));
      setValue(""); setNotes(""); setMessage("Business metric recorded and audit event created.");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to record metric."); }
    finally { setBusy(false); }
  }

  return <section className="analytics-section">
    {canManage ? <article className="analytics-panel">
      <div className="analytics-panel-heading"><div><h2>Record business volume</h2><p>Enter a verified daily count from your product analytics, data warehouse or finance system.</p></div></div>
      <form className="budget-form" onSubmit={submit}>
        <div className="budget-form-grid">
          <label>Metric name<input required minLength={2} maxLength={100} value={metricName} onChange={(event) => setMetricName(event.target.value)} placeholder="Active users"/></label>
          <label>Unit<input required maxLength={40} value={unit} onChange={(event) => setUnit(event.target.value)} placeholder="users"/></label>
          <label>Reported value<input required type="number" min="0" step="0.0001" value={value} onChange={(event) => setValue(event.target.value)} placeholder="12500"/></label>
          <label>Metric date<input required type="date" value={metricDate} onChange={(event) => setMetricDate(event.target.value)}/></label>
        </div>
        <label>Source notes (optional)<input maxLength={500} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="e.g. Product analytics daily active users export"/></label>
        <button type="submit" disabled={busy || !value}>{busy ? "Saving…" : "Record business metric"}</button>
      </form>
      {message ? <p role="status" className="analytics-muted">{message}</p> : null}
    </article> : <p className="analytics-muted">Your role has read-only access. A FinOps Analyst, Admin or Owner can record business metrics.</p>}
    <article className="analytics-panel">
      <div className="analytics-panel-heading"><div><h2>Reported business metrics</h2><p>Latest 100 observations · source values are retained as entered</p></div></div>
      {metrics.length ? <div className="budget-alert-table-wrap"><table className="budget-alert-table"><thead><tr><th>Date</th><th>Metric</th><th>Reported volume</th><th>Source notes</th></tr></thead><tbody>{metrics.map((metric) => <tr key={metric.id}><td>{metric.metricDate}</td><td><strong>{metric.metricName}</strong></td><td>{new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(metric.value)} {metric.unit}</td><td>{metric.notes || "Manual entry"}</td></tr>)}</tbody></table></div> : <div className="budget-empty"><h3>No business metrics recorded</h3><p>Record daily API requests, active users, transactions, orders or customers to calculate unit economics.</p></div>}
    </article>
  </section>;
}
