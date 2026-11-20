"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const status = new URLSearchParams(window.location.search).get("verification");
    if (status === "success") setNotice("Your email is verified. You can now sign in.");
    else if (status === "expired") setNotice("That verification link has expired. Request a new one below.");
    else if (status === "invalid") setNotice("That verification link is invalid. Request a new one below.");
    else if (status === "unavailable") setNotice("Verification could not be completed. Please try again.");
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const result = await signIn("credentials", { email, password, redirect: false });
    setBusy(false);
    if (result?.error) {
      setError("Email or password is incorrect.");
      return;
    }
    router.push("/workspace");
    router.refresh();
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <Link className="auth-brand" href="/">fin<span>sight</span></Link>
        <p className="auth-eyebrow">WELCOME BACK</p>
        <h1>Sign in to your workspace</h1>
        <p className="auth-description">Access your cloud cost intelligence workspace.</p>
        {notice ? <p role="status">{notice}</p> : null}
        <form className="auth-form" onSubmit={submit}>
          <label>Email address<input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          {error ? <p className="auth-error" role="alert">{error}</p> : null}
          <button type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        </form>
        <p className="auth-switch">Need to verify your email? <Link href="/verify-email">Resend verification email</Link></p>
        <p className="auth-switch">New to FinSight? <Link href="/register">Create an account</Link></p>
      </section>
    </main>
  );
}
