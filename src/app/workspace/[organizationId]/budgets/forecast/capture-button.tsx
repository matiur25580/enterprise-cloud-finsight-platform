"use client";

import { useState } from "react";

export default function CaptureForecastButton({ organizationId, budgetId }: { organizationId: string; budgetId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function capture() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/organizations/" + organizationId + "/budgets/" + budgetId + "/forecast-snapshots", { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to capture snapshot.");
      setMessage("Snapshot captured.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to capture snapshot.");
    } finally { setBusy(false); }
  }
  return <div className="budget-alert-retry"><button type="button" onClick={capture} disabled={busy}>{busy ? "Capturing…" : "Capture forecast"}</button>{message ? <small role="status">{message}</small> : null}</div>;
}
