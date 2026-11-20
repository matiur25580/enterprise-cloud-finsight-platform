"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type RevenueRecord = { id: string; amount: number; currency: string; revenueDate: string; source: string; notes: string | null };

export default function RevenueManager({ organizationId, initialRecords, canManage }: {
  organizationId: string; initialRecords: RevenueRecord[]; canManage: boolean;
}) {
  const router = useRouter();
  const [records, setRecords] = useState(initialRecords);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [revenueDate, setRevenueDate] = useState(new Date().toISOString().slice(0,10));
  const [source, setSource] = useState("MANUAL");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/organizations/"+organizationId+"/revenue", {
        method: "POST", headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ amount: Number(amount), currency, revenueDate, source, notes: notes || undefined })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to record revenue.");
      setRecords((current) => [payload.record, ...current].slice(0,100));
      setAmount(""); setNotes(""); setMessage("Revenue record saved and audit event created."); router.refresh();
    } catch(error) { setMessage(error instanceof Error ? error.message : "Unable to save revenue."); }
    finally { setBusy(false); }
  }

  return <section className="analytics-section">
    {canManage ? <article className="analytics-panel">
      <div className="analytics-panel-heading"><div><h2>Record verified revenue</h2><p>Enter dated revenue from your finance system, billing platform or accounting export.</p></div></div>
      <form className="budget-form" onSubmit={submit}>
        <div className="budget-form-grid">
          <label>Revenue amount<input required type="number" min="0" step="0.00000001" value={amount} onChange={(event)=>setAmount(event.target.value)} placeholder="25000.00"/></label>
          <label>Currency<select value={currency} onChange={(event)=>setCurrency(event.target.value)}><option>USD</option><option>EUR</option><option>GBP</option><option>INR</option><option>CAD</option><option>AUD</option><option>JPY</option><option>SGD</option></select></label>
          <label>Revenue date<input required type="date" value={revenueDate} onChange={(event)=>setRevenueDate(event.target.value)}/></label>
          <label>Source<input required minLength={2} maxLength={40} value={source} onChange={(event)=>setSource(event.target.value)} placeholder="MANUAL / FINANCE_EXPORT"/></label>
        </div>
        <label>Source notes (optional)<input maxLength={500} value={notes} onChange={(event)=>setNotes(event.target.value)} placeholder="e.g. Monthly recognized revenue from accounting export"/></label>
        <button type="submit" disabled={busy || !amount}>{busy ? "Saving…" : "Record revenue"}</button>
      </form>
      {message ? <p className="analytics-muted" role="status">{message}</p> : null}
    </article> : <p className="analytics-muted">Your role has read-only access. A FinOps Analyst, Admin or Owner can record revenue.</p>}
    <article className="analytics-panel">
      <div className="analytics-panel-heading"><div><h2>Revenue source records</h2><p>Latest 100 observations · values are retained in the entered currency</p></div></div>
      {records.length ? <div className="budget-alert-table-wrap"><table className="budget-alert-table"><thead><tr><th>Date</th><th>Amount</th><th>Currency</th><th>Source</th><th>Notes</th></tr></thead><tbody>{records.map((record)=><tr key={record.id}><td>{record.revenueDate}</td><td>{new Intl.NumberFormat("en-US",{maximumFractionDigits:2}).format(record.amount)}</td><td>{record.currency}</td><td>{record.source}</td><td>{record.notes || "—"}</td></tr>)}</tbody></table></div> : <div className="budget-empty"><h3>No revenue records</h3><p>Enter verified revenue observations to compare financial performance with cloud infrastructure costs.</p></div>}
    </article>
  </section>;
}
