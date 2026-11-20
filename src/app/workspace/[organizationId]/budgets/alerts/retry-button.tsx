"use client";

import { useState } from "react";

export default function RetryBudgetAlertButton({ organizationId, alertId, status }: { organizationId: string; alertId: string; status: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  if (!["FAILED", "PARTIAL", "NOT_CONFIGURED"].includes(status)) return null;
  async function retry() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/organizations/" + organizationId + "/budgets/alerts/" + alertId + "/retry", { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to retry alert.");
      setMessage(payload.deliveryStatus === "DELIVERED" ? "Retry delivered." : payload.deliveryStatus === "PARTIAL" ? "Retry partially delivered." : payload.deliveryStatus === "FAILED" ? "Retry failed." : "No channel configured.");
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to retry alert.");
    } finally { setBusy(false); }
  }
  return <div className="budget-alert-retry"><button type="button" onClick={retry} disabled={busy}>{busy ? "Retrying…" : "Retry delivery"}</button>{message ? <small role="status">{message}</small> : null}</div>;
}
