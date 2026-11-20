"use client";

import { useState } from "react";

type Incident = {
  id: string; sourceEventId: string | null; title: string; description: string;
  severity: string; status: string; createdAt: string; acknowledgedAt: string | null; resolvedAt: string | null;
};
type Signal = { id: string; routeBucket: string; requestCount: number; requestLimit: number; createdAt: string };

const nextActions: Record<string, string[]> = {
  OPEN: ["ACKNOWLEDGED", "FALSE_POSITIVE"],
  ACKNOWLEDGED: ["OPEN", "RESOLVED", "FALSE_POSITIVE"],
  RESOLVED: ["OPEN"],
  FALSE_POSITIVE: ["OPEN"]
};

function pretty(value: string) { return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()); }

export function IncidentManager({ organizationId, initialIncidents, signals }: {
  organizationId: string; initialIncidents: Incident[]; signals: Signal[];
}) {
  const [incidents, setIncidents] = useState(initialIncidents);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function createIncident(sourceEventId: string) {
    setBusy(sourceEventId); setMessage("");
    try {
      const response = await fetch(`/api/organizations/${organizationId}/security/incidents`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceEventId })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not create incident.");
      setIncidents((current) => [data.incident, ...current.filter((item) => item.id !== data.incident.id)]);
      setMessage(data.duplicate ? "An incident already exists for this signal." : "Incident created and audit event recorded.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Incident creation failed."); }
    finally { setBusy(null); }
  }

  async function updateStatus(incident: Incident, status: string) {
    setBusy(incident.id); setMessage("");
    try {
      const response = await fetch(`/api/organizations/${organizationId}/security/incidents/${incident.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not update incident.");
      setIncidents((current) => current.map((item) => item.id === incident.id ? data.incident : item));
      setMessage(`Incident status updated to ${pretty(status)}.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Incident update failed."); }
    finally { setBusy(null); }
  }

  const linkedEvents = new Set(incidents.map((incident) => incident.sourceEventId).filter(Boolean));
  return <div className="space-y-8">
    {message ? <p role="status" className="rounded-lg border border-slate-300 p-3 text-sm">{message}</p> : null}
    <section className="analytics-panel">
      <div className="analytics-panel-heading"><div><h2>Untriaged security signals</h2><p>Promote a recorded rate-limit crossing into an actionable incident</p></div></div>
      {signals.filter((signal) => !linkedEvents.has(signal.id)).length ? signals.filter((signal) => !linkedEvents.has(signal.id)).map((signal) => (
        <div className="analytics-list-row" key={signal.id}>
          <div><strong>{pretty(signal.routeBucket)}</strong><span>{new Date(signal.createdAt).toLocaleString()} · {signal.requestCount} / {signal.requestLimit} requests</span></div>
          <button disabled={busy === signal.id} onClick={() => createIncident(signal.id)} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50">{busy === signal.id ? "Creating…" : "Create incident"}</button>
        </div>
      )) : <p className="analytics-muted">No untriaged signals in the latest event sample.</p>}
    </section>
    <section className="analytics-panel">
      <div className="analytics-panel-heading"><div><h2>Incident register</h2><p>Each status change is recorded in the organization audit log</p></div></div>
      {incidents.length ? incidents.map((incident) => (
        <article key={incident.id} className="border-b py-4 last:border-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><div className="flex flex-wrap items-center gap-2"><strong>{incident.title}</strong><span className="rounded-full border px-2 py-1 text-xs">{pretty(incident.severity)}</span><span className="rounded-full border px-2 py-1 text-xs">{pretty(incident.status)}</span></div><p className="mt-1 text-xs opacity-70">Created {new Date(incident.createdAt).toLocaleString()}</p></div>
            <div className="flex flex-wrap gap-2">{(nextActions[incident.status] || []).map((status) => <button key={status} disabled={busy === incident.id} onClick={() => updateStatus(incident, status)} className="rounded-lg border px-3 py-2 text-xs disabled:opacity-50">{pretty(status)}</button>)}</div>
          </div>
          <p className="mt-3 text-sm opacity-80">{incident.description}</p>
        </article>
      )) : <div className="analytics-empty"><h2>No incidents created</h2><p>Promote a signal above to begin triage. No synthetic incidents are generated.</p></div>}
    </section>
    <p className="analytics-muted">Severity is a heuristic based on request-limit ratio and repeated threshold crossings for the same route within a rolling hour. It is a prioritization aid, not a verified threat assessment.</p>
  </div>;
}
