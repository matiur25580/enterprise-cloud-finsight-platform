"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("token") ?? "";
    // Keep the one-time reset credential out of the address bar and browser history.
    if (value) {
      window.history.replaceState(window.history.state, "", window.location.pathname);
    }
    setToken(value);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!token) {
      setError("The reset link is missing. Request a new one.");
      return;
    }
    if (password !== confirmation) {
      setError("The passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password })
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error ?? "Unable to reset your password.");
        return;
      }
      router.replace("/login?passwordReset=success");
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
        <p className="auth-eyebrow">SECURE ACCOUNT RECOVERY</p>
        <h1>Choose a new password</h1>
        <p className="auth-description">Use at least 12 characters. If multi-factor authentication is enabled, you will still need your authenticator or recovery code when signing in.</p>
        <form className="auth-form" onSubmit={submit}>
          <label>New password<input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          <label>Confirm new password<input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>
          {error ? <p className="auth-error" role="alert">{error}</p> : null}
          <button type="submit" disabled={busy || !token}>{busy ? "Updating password…" : "Update password"}</button>
        </form>
        <p className="auth-switch"><Link href="/forgot-password">Request another reset link</Link></p>
      </section>
    </main>
  );
}
