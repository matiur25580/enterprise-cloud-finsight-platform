"use client";

import { useState } from "react";

type Rule = { id: string; name: string; servicePattern: string; sourceTagKey: string; sourceTagValue: string; targetDimension: string; method: string; recipients: unknown; isActive: boolean; createdAt: string };
type Preview = { rule: { name: string; targetDimension: string; method: string }; startsAt: string; endsAt: string; matchedRecords: number; allocations: { currency: string; sourceSpend: number; allocatedSpend: number; records: number; recipients: { recipient: string; weightPercent: number; amount: number }[] }[] };

export default function SharedAllocationManager({ organizationId, initialRules, initialStart, initialEnd, canManage }: {
  organizationId: string; initialRules: Rule[]; initialStart: string; initialEnd: string; canManage: boolean;
}) {
  const [rules, setRules] = useState(initialRules);
  const [name, setName] = useState("Shared platform services");
  const [service, setService] = useState("Amazon Elastic Compute Cloud");
  const [tagKey, setTagKey] = useState("shared");
  const [tagValue, setTagValue] = useState("true");
  const [dimension, setDimension] = useState("team");
  const [method, setMethod] = useState("EQUAL");
  const [recipients, setRecipients] = useState("Platform\nData\nSecurity");
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);

  function parseRecipients() {
    return recipients.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
      const parts = line.split(":");
      return method === "WEIGHTED"
        ? { value: parts.slice(0, -1).join(":").trim(), weight: Number(parts.at(-1)) }
        : { value: line };
    });
  }
  async function createRule(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(""); setPreview(null);
    try {
      const response = await fetch("/api/organizations/" + organizationId + "/allocation-rules", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, servicePattern: service, sourceTagKey: tagKey, sourceTagValue: tagValue, targetDimension: dimension, method, recipients: parseRecipients() })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to create rule.");
      setRules((current) => [payload.rule, ...current]);
      setMessage("Allocation rule created. Preview it before using the distribution.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to create rule."); }
    finally { setBusy(false); }
  }
  async function runPreview(ruleId: string) {
    setBusy(true); setMessage(""); setPreview(null);
    try {
      const response = await fetch("/api/organizations/" + organizationId + "/allocation-rules/preview", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ruleId, startsAt: start, endsAt: end })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to preview allocation.");
      setPreview(payload.preview);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to preview allocation."); }
    finally { setBusy(false); }
  }
  async function toggleRule(rule: Rule) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/organizations/" + organizationId + "/allocation-rules/" + rule.id, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: !rule.isActive })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to update rule.");
      setRules((current) => current.map((item) => item.id === rule.id ? payload.rule : item));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to update rule."); }
    finally { setBusy(false); }
  }
  function money(value: number, currency: string) {
    try { return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(value); }
    catch { return currency + " " + value.toFixed(2); }
  }

  return <div className="analytics-content">
    <section className="analytics-panel">
      <div className="analytics-panel-heading"><div><h2>Allocation rules</h2><p>Match shared infrastructure line items using an exact service and resource tag.</p></div></div>
      {rules.length ? <div className="budget-alert-table-wrap"><table className="budget-alert-table"><thead><tr><th>Rule</th><th>Match condition</th><th>Distribution</th><th>Status</th><th>Actions</th></tr></thead><tbody>
        {rules.map((rule) => <tr key={rule.id}><td><strong>{rule.name}</strong><small>To {rule.targetDimension}</small></td><td>{rule.servicePattern}<small>{rule.sourceTagKey} = {rule.sourceTagValue}</small></td><td>{rule.method}<small>{Array.isArray(rule.recipients) ? rule.recipients.length : 0} recipients</small></td><td><span className={"budget-alert-status " + (rule.isActive ? "delivered" : "pending")}>{rule.isActive ? "Active" : "Paused"}</span></td><td><div className="budget-alert-retry"><button type="button" disabled={busy || !rule.isActive} onClick={() => runPreview(rule.id)}>Preview</button>{canManage ? <button type="button" disabled={busy} onClick={() => toggleRule(rule)}>{rule.isActive ? "Pause" : "Activate"}</button> : null}</div></td></tr>)}
      </tbody></table></div> : <div className="budget-empty"><h3>No shared-cost rules yet</h3><p>Create a rule to preview distribution of common infrastructure costs.</p></div>}
    </section>
    <section className="analytics-panel">
      <div className="analytics-panel-heading"><div><h2>Preview period</h2><p>Choose the billing dates to inspect matching shared infrastructure costs.</p></div></div>
      <div className="budget-form-grid"><label>From<input type="date" value={start} onChange={(e) => setStart(e.target.value)}/></label><label>To<input type="date" value={end} onChange={(e) => setEnd(e.target.value)}/></label></div>
    </section>
    {canManage ? <section className="analytics-panel">
      <div className="analytics-panel-heading"><div><h2>Create allocation rule</h2><p>Rule creation is audited. Rules only calculate preview allocations; they do not rewrite source billing records.</p></div></div>
      <form className="budget-form" onSubmit={createRule}>
        <div className="budget-form-grid">
          <label>Rule name<input required minLength={2} maxLength={100} value={name} onChange={(e) => setName(e.target.value)}/></label>
          <label>Exact billing service<input required maxLength={160} value={service} onChange={(e) => setService(e.target.value)}/></label>
          <label>Source tag key<input required maxLength={120} value={tagKey} onChange={(e) => setTagKey(e.target.value)}/></label>
          <label>Source tag value<input required maxLength={160} value={tagValue} onChange={(e) => setTagValue(e.target.value)}/></label>
          <label>Allocate to<select value={dimension} onChange={(e) => setDimension(e.target.value)}><option value="team">Team</option><option value="department">Department</option><option value="project">Project</option><option value="namespace">Kubernetes namespace</option><option value="costCenter">Cost center</option></select></label>
          <label>Distribution method<select value={method} onChange={(e) => setMethod(e.target.value)}><option value="EQUAL">Equal split</option><option value="WEIGHTED">Weighted split</option></select></label>
        </div>
        <label>Recipients {method === "WEIGHTED" ? "(one per line: Name:percentage)" : "(one recipient per line)"}<textarea required rows={5} value={recipients} onChange={(e) => setRecipients(e.target.value)} placeholder={method === "WEIGHTED" ? "Platform:50\nData:30\nSecurity:20" : "Platform\nData\nSecurity"}/></label>
        <p className="analytics-muted">Weighted percentages must total exactly 100%. Equal splits are rounded to 8 decimal places, with any remainder assigned to the final recipient to preserve reconciliation.</p>
        <button type="submit" disabled={busy}>{busy ? "Saving…" : "Create allocation rule"}</button>
      </form>
    </section> : null}
    {message ? <p role="status" className="analytics-muted">{message}</p> : null}
    {preview ? <section className="analytics-panel"><div className="analytics-panel-heading"><div><h2>Allocation preview: {preview.rule.name}</h2><p>{preview.startsAt} – {preview.endsAt} · {preview.matchedRecords.toLocaleString()} matched billing records · {preview.rule.method}</p></div></div>
      {!preview.allocations.length ? <div className="budget-empty"><p>No billing rows matched this rule and date range. Check exact service and tag key/value.</p></div> : preview.allocations.map((item) => <div key={item.currency} className="budget-alert-table-wrap"><h3>{item.currency} · Source {money(item.sourceSpend, item.currency)} · Allocated {money(item.allocatedSpend, item.currency)}</h3><table className="budget-alert-table"><thead><tr><th>{preview.rule.targetDimension}</th><th>Weight</th><th>Allocated amount</th></tr></thead><tbody>{item.recipients.map((recipient) => <tr key={recipient.recipient}><td>{recipient.recipient}</td><td>{recipient.weightPercent.toFixed(2)}%</td><td>{money(recipient.amount, item.currency)}</td></tr>)}</tbody></table></div>)}
      <p className="analytics-muted">Preview only. Source cost records remain unchanged. Reconciliation is maintained per currency to 8 decimal places; credits are distributed proportionally as negative values.</p>
    </section> : null}
  </div>;
}
