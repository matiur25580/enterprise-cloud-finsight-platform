"use client";

import { useState } from "react";

type Budget = { id: string; name: string; amount: number; currency: string; period: "MONTHLY" | "QUARTERLY" | "ANNUAL"; startsAt: string; endsAt: string; alertThresholds: number[]; isActive: boolean; spent: number; utilization: number };
type Draft = Omit<Budget, "id" | "spent" | "utilization">;
const today = new Date().toISOString().slice(0, 10);
const emptyDraft = (): Draft => ({ name: "", amount: 1000, currency: "USD", period: "MONTHLY", startsAt: today, endsAt: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 0)).toISOString().slice(0, 10), alertThresholds: [50, 80, 100], isActive: true });
const money = (value: number, currency: string) => {
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(value); }
  catch { return currency + " " + value.toFixed(2); }
};

export default function BudgetManager({ organizationId, initialBudgets, canManage }: { organizationId: string; initialBudgets: Budget[]; canManage: boolean }) {
  const [budgets, setBudgets] = useState(initialBudgets);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const endpoint = "/api/organizations/" + organizationId + "/budgets";
  function edit(item: Budget) {
    setEditing(item.id);
    setDraft({ name: item.name, amount: item.amount, currency: item.currency, period: item.period, startsAt: item.startsAt, endsAt: item.endsAt, alertThresholds: item.alertThresholds, isActive: item.isActive });
    setError(""); setNotice("");
  }
  function reset() { setEditing(null); setDraft(emptyDraft()); setError(""); }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(editing ? endpoint + "/" + editing : endpoint, { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to save budget.");
      setNotice(editing ? "Budget updated." : "Budget created."); reset();
      const refreshed = await fetch(endpoint, { cache: "no-store" });
      const data = await refreshed.json();
      if (refreshed.ok) setBudgets(data.budgets);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save budget."); }
    finally { setBusy(false); }
  }
  async function remove(id: string) {
    if (!window.confirm("Delete this budget? This cannot be undone.")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(endpoint + "/" + id, { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to delete budget.");
      setBudgets((items) => items.filter((item) => item.id !== id)); setNotice("Budget deleted.");
      if (editing === id) reset();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to delete budget."); }
    finally { setBusy(false); }
  }
  function toggleThreshold(value: number) {
    setDraft((current) => ({ ...current, alertThresholds: current.alertThresholds.includes(value) ? current.alertThresholds.filter((item) => item !== value) : [...current.alertThresholds, value].sort((a, b) => a - b) }));
  }
  return <div className="budget-layout">
    {canManage ? <section className="budget-panel">
      <div className="budget-panel-heading"><div><h2>{editing ? "Edit budget" : "Create a budget"}</h2><p>Set a limit, date range, and alert thresholds.</p></div></div>
      <form className="budget-form" onSubmit={submit}>
        <label>Budget name<input required minLength={2} maxLength={80} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Production cloud spend" /></label>
        <div className="budget-form-grid">
          <label>Amount<input required type="number" min="0.00000001" step="0.01" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: Number(e.target.value) })} /></label>
          <label>Currency<input required maxLength={3} minLength={3} value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value.toUpperCase() })} /></label>
          <label>Period<select value={draft.period} onChange={(e) => setDraft({ ...draft, period: e.target.value as Draft["period"] })}><option value="MONTHLY">Monthly</option><option value="QUARTERLY">Quarterly</option><option value="ANNUAL">Annual</option></select></label>
          <label>Start date<input required type="date" value={draft.startsAt} onChange={(e) => setDraft({ ...draft, startsAt: e.target.value })} /></label>
          <label>End date<input required type="date" min={draft.startsAt} value={draft.endsAt} onChange={(e) => setDraft({ ...draft, endsAt: e.target.value })} /></label>
        </div>
        <fieldset className="budget-thresholds"><legend>Alert thresholds</legend>{[50, 80, 90, 100].map((value) => <label key={value}><input type="checkbox" checked={draft.alertThresholds.includes(value)} onChange={() => toggleThreshold(value)} /> {value}%</label>)}</fieldset>
        <label className="budget-active"><input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} /> Budget is active</label>
        {error ? <p className="budget-error" role="alert">{error}</p> : null}
        {notice ? <p className="budget-notice" role="status">{notice}</p> : null}
        <div className="budget-actions"><button disabled={busy || draft.alertThresholds.length === 0}>{busy ? "Saving…" : editing ? "Save changes" : "Create budget"}</button>{editing ? <button type="button" className="budget-secondary" onClick={reset}>Cancel</button> : null}</div>
      </form>
    </section> : <section className="budget-panel"><h2>Budget overview</h2><p className="analytics-muted">You have read-only access. An owner, administrator, or FinOps analyst can manage budgets.</p></section>}
    <section className="budget-list">
      <div className="budget-panel-heading"><div><h2>Workspace budgets</h2><p>{budgets.length} budget{budgets.length === 1 ? "" : "s"} · spend is matched by currency</p></div></div>
      {budgets.length ? budgets.map((item) => <article className="budget-item" key={item.id}>
        <div className="budget-item-top"><div><strong>{item.name}</strong><span>{item.period} · {item.currency} · {item.startsAt} — {item.endsAt}</span></div><span className={item.isActive ? "budget-status active" : "budget-status"}>{item.isActive ? "Active" : "Paused"}</span></div>
        <div className="budget-figures"><strong>{money(item.spent, item.currency)} <small>spent</small></strong><span>{money(item.amount, item.currency)} limit</span><b>{item.utilization.toFixed(1)}%</b></div>
        <div className="budget-progress"><i style={{ width: Math.min(100, item.utilization).toFixed(2) + "%" }} /></div>
        <div className="budget-item-bottom"><span>Alerts at {item.alertThresholds.map((value) => value + "%").join(", ")}</span>{canManage ? <div><button type="button" onClick={() => edit(item)} disabled={busy}>Edit</button><button type="button" className="budget-delete" onClick={() => remove(item.id)} disabled={busy}>Delete</button></div> : null}</div>
      </article>) : <div className="budget-empty"><h3>No budgets configured</h3><p>Create a budget to track cloud spending against a defined limit.</p></div>}
    </section>
  </div>;
}
