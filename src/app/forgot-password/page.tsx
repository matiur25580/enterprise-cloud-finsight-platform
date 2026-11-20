"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      const payload = await response.json();
      if (!response.ok) setError(payload.error ?? "Unable to request a password reset.");
      else setMessage(payload.message ?? "If an account exists, a reset link will be sent shortly.");
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
        <p className="auth-eyebrow">ACCOUNT RECOVERY</p>
        <h1>Reset your password</h1>
        <p className="auth-description">Enter the email address associated with your FinSight account. If it exists, we will send a one-time reset link that expires in 30 minutes.</p>
        <form className="auth-form" onSubmit={submit}>
          <label>Email address<input type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          {error ? <p className="auth-error" role="alert">{error}</p> : null}
          {message ? <p role="status">{message}</p> : null}
          <button type="submit" disabled={busy}>{busy ? "Sending…" : "Send reset link"}</button>
        </form>
        <p className="auth-switch"><Link href="/login">Return to sign in</Link></p>
      </section>
    </main>
  );
}
