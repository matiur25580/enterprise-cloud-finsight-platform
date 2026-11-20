"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function InvitationAccept({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  async function accept() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/invitations/accept", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to accept invitation.");
      router.replace("/workspace/" + data.organizationId); router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to accept invitation."); }
    finally { setBusy(false); }
  }
  return <section className="auth-card">
    <p className="auth-eyebrow">ORGANIZATION INVITATION</p>
    <h1>Join your FinSight workspace</h1>
    <p className="auth-description">Accept this invitation using the same email address that received it. Invitation links expire after 7 days and can only be used once.</p>
    <button type="button" onClick={accept} disabled={busy || !token}>{busy ? "Accepting…" : "Accept invitation"}</button>
    {error ? <p className="auth-error" role="alert">{error}</p> : null}
  </section>;
}
