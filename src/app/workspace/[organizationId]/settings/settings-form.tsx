"use client";

import { useState } from "react";

export default function SettingsForm({ organizationId, initialName, slug }: { organizationId: string; initialName: string; slug: string }) {
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setMessage(""); setError(false);
    try {
      const response = await fetch("/api/organizations/" + organizationId + "/settings", {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save settings.");
      setName(data.organization.name);
      setMessage("Workspace settings saved. Your workspace URL is now /workspace/" + data.organization.id + ".");
      window.location.assign("/workspace/" + data.organization.id + "/settings");
    } catch (err) {
      setError(true); setMessage(err instanceof Error ? err.message : "Unable to save settings.");
    } finally { setBusy(false); }
  }

  return <div className="organization-settings-grid">
    <section className="analytics-panel">
      <div className="analytics-panel-heading"><div><h2>Workspace profile</h2><p>Update the organization name shown throughout FinSight.</p></div></div>
      <form className="organization-settings-form" onSubmit={save}>
        <label>Organization name<input value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={80} required /></label>
        <div className="organization-slug"><span>Current workspace slug</span><strong>{slug}</strong><small>Changing the name also regenerates this slug. Existing organization IDs and billing data remain unchanged.</small></div>
        <button type="submit" disabled={busy || name.trim() === initialName}>{busy ? "Saving…" : "Save workspace profile"}</button>
      </form>
      {message ? <p className={error ? "organization-settings-message error" : "organization-settings-message"} role={error ? "alert" : "status"}>{message}</p> : null}
    </section>
    <section className="analytics-panel organization-settings-info">
      <div className="analytics-panel-heading"><div><h2>Workspace governance</h2><p>Access and data boundaries</p></div></div>
      <div><strong>Owner-managed settings</strong><span>Only the organization owner can rename this workspace.</span></div>
      <div><strong>Tenant data preserved</strong><span>Changing the display name or slug does not move or delete cloud accounts, billing records, budgets, or audit history.</span></div>
      <div><strong>Audited changes</strong><span>Every successful update records the previous and new workspace identity in the organization audit timeline.</span></div>
    </section>
  </div>;
}
