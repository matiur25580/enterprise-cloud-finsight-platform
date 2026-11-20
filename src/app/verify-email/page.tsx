"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";

export default function VerifyEmailPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function resend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error ?? "Unable to request a verification email.");
      } else {
        setMessage(payload.message ?? "If the account needs verification, an email will be sent shortly.");
      }
    } catch {
      setError("A network error occurred. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <Link className="auth-brand" href="/">fin<span>sight</span></Link>
        <p className="auth-eyebrow">CHECK YOUR INBOX</p>
        <h1>Verify your email address</h1>
        <p className="auth-description">We sent a secure verification link if delivery is available. The link expires after 30 minutes. Verify your email before signing in.</p>
        <form className="auth-form" onSubmit={resend}>
          <label>Email address<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          {error ? <p className="auth-error" role="alert">{error}</p> : null}
          {message ? <p role="status">{message}</p> : null}
          <button type="submit" disabled={busy}>{busy ? "Sending…" : "Resend verification email"}</button>
        </form>
        <p className="auth-switch"><Link href="/login">Return to sign in</Link></p>
      </section>
    </main>
  );
}
