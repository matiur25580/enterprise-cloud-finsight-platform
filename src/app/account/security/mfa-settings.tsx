"use client";

import { useState } from "react";
import Link from "next/link";

type ApiResult = {
  error?: string;
  message?: string;
  secret?: string;
  otpauthUri?: string;
  recoveryCodes?: string[];
  enabled?: boolean;
  disabled?: boolean;
};

export default function MfaSettings({
  enabled: initialEnabled,
  initialRecoveryCodeCount
}: {
  enabled: boolean;
  initialRecoveryCodeCount: number;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [recoveryCount, setRecoveryCount] = useState(initialRecoveryCodeCount);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [secret, setSecret] = useState("");
  const [otpauthUri, setOtpauthUri] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function post(path: string): Promise<ApiResult | null> {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, code })
      });
      const result = await response.json() as ApiResult;
      if (!response.ok) {
        setError(result.error ?? "The request could not be completed.");
        return null;
      }
      return result;
    } catch {
      setError("A network error occurred. Please try again.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function startSetup() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/account/mfa/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      });
      const result = await response.json() as ApiResult;
      if (!response.ok) {
        setError(result.error ?? "Unable to start MFA setup.");
        return;
      }
      setSecret(result.secret ?? "");
      setOtpauthUri(result.otpauthUri ?? "");
      setMessage("Add the secret to your authenticator app, then enter its current six-digit code.");
    } catch {
      setError("A network error occurred. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmSetup() {
    const result = await post("/api/account/mfa/confirm");
    if (!result) return;
    setEnabled(true);
    setRecoveryCodes(result.recoveryCodes ?? []);
    setRecoveryCount(result.recoveryCodes?.length ?? 0);
    setSecret("");
    setOtpauthUri("");
    setCode("");
    setMessage(result.message ?? "MFA enabled.");
  }

  async function disableMfa() {
    const result = await post("/api/account/mfa/disable");
    if (!result) return;
    setEnabled(false);
    setRecoveryCount(0);
    setRecoveryCodes([]);
    setCode("");
    setSecret("");
    setOtpauthUri("");
    setMessage("Multi-factor authentication has been disabled.");
  }

  async function rotateRecoveryCodes() {
    const result = await post("/api/account/mfa/recovery-codes");
    if (!result) return;
    setRecoveryCodes(result.recoveryCodes ?? []);
    setRecoveryCount(result.recoveryCodes?.length ?? 0);
    setCode("");
    setMessage(result.message ?? "Recovery codes have been replaced.");
  }

  return (
    <section className="auth-card" style={{ width: "min(100%, 620px)" }}>
      <Link className="auth-brand" href="/workspace">fin<span>sight</span></Link>
      <p className="auth-eyebrow">ACCOUNT SECURITY</p>
      <h1>Multi-factor authentication</h1>
      <p className="auth-description">Protect your FinSight account with an authenticator app and one-time recovery codes.</p>
      <p role="status">{enabled ? "MFA is enabled for this account." : "MFA is not currently enabled."}</p>
      {error ? <p className="auth-error" role="alert">{error}</p> : null}
      {message ? <p role="status">{message}</p> : null}

      {!enabled ? (
        <>
          <label>Current password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          {!secret ? (
            <button type="button" disabled={busy || password.length < 8} onClick={startSetup}>{busy ? "Starting…" : "Set up authenticator"}</button>
          ) : (
            <>
              <p>In your authenticator app, choose manual setup and enter this key:</p>
              <p><strong>{secret}</strong></p>
              <p><small>Setup URI (for compatible authenticator apps)</small></p>
              <textarea readOnly rows={3} value={otpauthUri} aria-label="Authenticator setup URI" />
              <label>Six-digit authenticator code<input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value)} /></label>
              <button type="button" disabled={busy || code.length !== 6 || password.length < 8} onClick={confirmSetup}>{busy ? "Verifying…" : "Confirm and enable MFA"}</button>
            </>
          )}
        </>
      ) : (
        <>
          <p>Unused recovery codes: <strong>{recoveryCount}</strong></p>
          <label>Current password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          <label>Authenticator or unused recovery code<input value={code} onChange={(event) => setCode(event.target.value)} autoComplete="one-time-code" /></label>
          <button type="button" disabled={busy || password.length < 8 || code.length < 6} onClick={rotateRecoveryCodes}>{busy ? "Working…" : "Generate new recovery codes"}</button>
          <button type="button" disabled={busy || password.length < 8 || code.length < 6} onClick={disableMfa}>Disable MFA</button>
        </>
      )}

      {recoveryCodes.length > 0 ? (
        <section aria-live="polite">
          <h2>Save your recovery codes</h2>
          <p>Each code works once. Store them somewhere safe. They are only displayed now.</p>
          <ul>{recoveryCodes.map((item) => <li key={item}><code>{item}</code></li>)}</ul>
          <button type="button" onClick={() => navigator.clipboard?.writeText(recoveryCodes.join("\n"))}>Copy recovery codes</button>
        </section>
      ) : null}
      <p className="auth-switch"><Link href="/workspace">Return to workspace</Link></p>
    </section>
  );
}
