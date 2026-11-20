"use client";
import { useState } from "react";
type Policy = { id: string; tagKey: string; displayName: string; isRequired: boolean; allowedValues: string[]; isActive: boolean };
export default function TagPolicyManager({ organizationId, initialPolicies, canManage }: { organizationId: string; initialPolicies: Policy[]; canManage: boolean }) {
  const [policies, setPolicies] = useState(initialPolicies);
  const [tagKey, setTagKey] = useState("team"); const [displayName, setDisplayName] = useState("Team");
  const [isRequired, setIsRequired] = useState(true); const [allowedValues, setAllowedValues] = useState("platform\ndata\nsecurity");
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  async function createPolicy(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/organizations/" + organizationId + "/tag-policies", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tagKey, displayName, isRequired, allowedValues: allowedValues.split("\n").map((item) => item.trim()).filter(Boolean) }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error ?? "Unable to create policy.");
      setPolicies((current) => [...current, payload.policy].sort((a, b) => a.tagKey.localeCompare(b.tagKey))); setMessage("Tag policy saved and audit event recorded.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to create policy."); } finally { setBusy(false); }
  }
  async function togglePolicy(policy: Policy) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/organizations/" + organizationId + "/tag-policies/" + policy.id, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: !policy.isActive }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error ?? "Unable to update policy.");
      setPolicies((current) => current.map((item) => item.id === policy.id ? payload.policy : item));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to update policy."); } finally { setBusy(false); }
  }
  return <div className="analytics-content">
    <section className="analytics-panel"><div className="analytics-panel-heading"><div><h2>Organization tag policies</h2><p>Rules are evaluated against imported billing records from the last 30 calendar days.</p></div></div>
      {policies.length ? <div className="budget-alert-table-wrap"><table className="budget-alert-table"><thead><tr><th>Tag key</th><th>Requirement</th><th>Allowed values</th><th>Status</th>{canManage ? <th>Action</th> : null}</tr></thead><tbody>
        {policies.map((policy) => <tr key={policy.id}><td><strong>{policy.displayName}</strong><small><code>{policy.tagKey}</code></small></td><td>{policy.isRequired ? "Mandatory" : "Optional"}</td><td>{policy.allowedValues.length ? policy.allowedValues.join(", ") : "Any non-empty value"}</td><td><span className={"budget-alert-status " + (policy.isActive ? "delivered" : "pending")}>{policy.isActive ? "Active" : "Paused"}</span></td>{canManage ? <td><button type="button" disabled={busy} onClick={() => togglePolicy(policy)}>{policy.isActive ? "Pause" : "Activate"}</button></td> : null}</tr>)}
      </tbody></table></div> : <div className="budget-empty"><p>No tag policies configured. Add mandatory keys and approved values to start governance checks.</p></div>}
    </section>
    {canManage ? <section className="analytics-panel"><div className="analytics-panel-heading"><div><h2>Create tag policy</h2><p>Policy creation and updates are recorded in the organization audit log.</p></div></div>
      <form className="budget-form" onSubmit={createPolicy}><div className="budget-form-grid">
        <label>Tag key<input required pattern="[A-Za-z][A-Za-z0-9_.:/-]{0,119}" maxLength={120} value={tagKey} onChange={(event) => setTagKey(event.target.value)}/></label>
        <label>Display name<input required minLength={2} maxLength={100} value={displayName} onChange={(event) => setDisplayName(event.target.value)}/></label>
        <label>Requirement<select value={isRequired ? "required" : "optional"} onChange={(event) => setIsRequired(event.target.value === "required")}><option value="required">Mandatory tag</option><option value="optional">Optional tag</option></select></label>
      </div><label>Allowed values (one per line)<textarea rows={4} value={allowedValues} onChange={(event) => setAllowedValues(event.target.value)} placeholder={"production\nstaging\ndevelopment"}/></label>
      <p className="analytics-muted">Allowed-value matching is case-insensitive. Leave values empty to allow any non-empty value for a mandatory tag. Optional policies must define allowed values.</p><button type="submit" disabled={busy}>{busy ? "Saving…" : "Create policy"}</button></form>
    </section> : <p className="analytics-muted">Only members with policy-management permission can create or pause policies.</p>}
    {message ? <p role="status" className="analytics-muted">{message}</p> : null}
  </div>;
}