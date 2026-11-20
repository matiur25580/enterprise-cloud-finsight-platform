"use client";
import { useState } from "react";

type SyncJob = { status: string; trigger: string; attemptCount: number; totalRows: number; importedRows: number; rejectedRows: number; duplicateRows: number; errorMessage: string | null; createdAt: string };
type Account = {
  id: string; provider: string; externalAccountId: string; name: string; currency: string; status: string;
  credentialReferenceConfigured: boolean; lastSyncedAt: string | null; lastSyncAttemptAt: string | null;
  syncEnabled: boolean; syncIntervalMinutes: number; nextSyncAt: string | null; syncJobs: SyncJob[];
};
const providers = [{ value: "AWS", label: "Amazon Web Services" }, { value: "AZURE", label: "Microsoft Azure" }, { value: "GCP", label: "Google Cloud" }];
const intervals = [{ value: 15, label: "Every 15 minutes" }, { value: 60, label: "Hourly" }, { value: 360, label: "Every 6 hours" }, { value: 1440, label: "Daily" }, { value: 10080, label: "Weekly" }];

export default function CloudAccountManager({ organizationId, initialAccounts, canWrite }: { organizationId: string; initialAccounts: Account[]; canWrite: boolean }) {
  const [accounts, setAccounts] = useState(initialAccounts);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [credentialRefs, setCredentialRefs] = useState<Record<string, string>>({});
  const [provider, setProvider] = useState("AWS");
  const [name, setName] = useState("");
  const [externalAccountId, setExternalAccountId] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [credentialRef, setCredentialRef] = useState("");

  async function createAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy("create"); setMessage("");
    try {
      const response = await fetch("/api/organizations/" + organizationId + "/cloud-accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider, name, externalAccountId, currency, credentialRef }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Unable to create account.");
      setMessage("Cloud account registered in PAUSED state."); window.location.reload();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Request failed."); }
    finally { setBusy(null); }
  }

  async function updateAccount(accountId: string, update: Record<string, string | number | boolean>) {
    setBusy(accountId); setMessage("");
    try {
      const response = await fetch("/api/organizations/" + organizationId + "/cloud-accounts/" + accountId, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(update) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Unable to update account.");
      setAccounts((current) => current.map((account) => account.id === accountId ? { ...account, ...result.account, ...(Object.prototype.hasOwnProperty.call(update, "credentialRef") ? { credentialReferenceConfigured: Boolean(update.credentialRef) } : {}) } : account));
      if (Object.prototype.hasOwnProperty.call(update, "credentialRef")) setCredentialRefs((current) => ({ ...current, [accountId]: "" }));
      setMessage("Cloud account settings updated.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Request failed."); }
    finally { setBusy(null); }
  }

  async function syncNow(account: Account) {
    setBusy(account.id); setMessage("");
    try {
      const response = await fetch("/api/organizations/" + organizationId + "/cloud-accounts/" + account.id + "/sync", { method: "POST" });
      const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Unable to queue sync.");
      setMessage(result.alreadyQueued ? "A sync job is already queued or running." : "Sync job queued. Its final status will appear in job history.");
      window.location.reload();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Sync request failed."); }
    finally { setBusy(null); }
  }

  return <div className="cloud-manager">
    {canWrite ? <section className="analytics-panel cloud-create-panel">
      <div className="analytics-panel-heading"><h2>Register cloud account</h2><p>Register provider account metadata; credentials must remain in an external secret manager.</p></div>
      <form className="cloud-account-form" onSubmit={createAccount}>
        <label>Cloud provider<select value={provider} onChange={(event) => setProvider(event.target.value)}>{providers.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
        <label>Display name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Production workload" minLength={2} maxLength={120} required /></label>
        <label>Provider account / subscription / project ID<input value={externalAccountId} onChange={(event) => setExternalAccountId(event.target.value)} placeholder="123456789012" maxLength={255} required /></label>
        <label>Billing currency<input value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} placeholder="USD" maxLength={3} required /></label>
        <label>Secret manager reference (optional)<input value={credentialRef} onChange={(event) => setCredentialRef(event.target.value)} placeholder="aws-secretsmanager://prod/finsight/role" maxLength={500} /></label>
        <p className="cloud-security-note">Never paste access keys, passwords, certificates, or JSON credentials. Only a secret-manager URI/reference is accepted. New accounts start paused.</p>
        <button type="submit" disabled={busy !== null}>{busy === "create" ? "Saving…" : "Register cloud account"}</button>
      </form>
    </section> : null}
    {message ? <p className="cloud-message" role="status">{message}</p> : null}
    <section className="analytics-panel cloud-list-panel">
      <div className="analytics-panel-heading"><h2>Cloud account inventory</h2><p>{accounts.length} registered account(s) · sync history is tenant-scoped</p></div>
      {accounts.length ? accounts.map((account) => <article className="cloud-account-row" key={account.id}>
        <div className="cloud-account-main"><div className="cloud-provider-mark">{account.provider}</div><div><strong>{account.name}</strong><span>{account.externalAccountId} · {account.currency}</span><small>{account.credentialReferenceConfigured ? "Secret manager reference configured" : "No secret reference configured"}</small></div></div>
        <div className="cloud-account-state"><span className={"cloud-status " + account.status.toLowerCase()}>{account.status}</span>{account.lastSyncedAt ? <small>Last successful sync: {new Date(account.lastSyncedAt).toLocaleString()}</small> : <small>No successful sync recorded</small>}{account.syncJobs.length ? <div className="cloud-job-history">{account.syncJobs.map((job, index) => <small key={job.createdAt + "-" + index}>{job.status} · {job.trigger.toLowerCase()} · attempt {job.attemptCount} · {job.importedRows}/{job.totalRows} imported · {job.rejectedRows} rejected · {job.duplicateRows} duplicate · {new Date(job.createdAt).toLocaleString()}{job.errorMessage ? " — " + job.errorMessage : ""}</small>)}</div> : <small>No sync jobs yet</small>}</div>
        {canWrite ? <div className="cloud-account-actions">
          <input aria-label={"Secret manager reference for " + account.name} value={credentialRefs[account.id] ?? ""} onChange={(event) => setCredentialRefs((current) => ({ ...current, [account.id]: event.target.value }))} placeholder="vault://organization/account/secret" maxLength={500} />
          <button type="button" disabled={busy !== null} onClick={() => updateAccount(account.id, { credentialRef: credentialRefs[account.id] ?? "" })}>Save secret reference</button>
          <button type="button" disabled={busy !== null || account.status !== "ACTIVE"} onClick={() => syncNow(account)}>Sync now</button>
          <select aria-label={"Sync schedule for " + account.name} value={account.syncEnabled ? String(account.syncIntervalMinutes) : "off"} disabled={busy !== null || account.status !== "ACTIVE"} onChange={(event) => { const value = event.target.value; updateAccount(account.id, { syncEnabled: value !== "off", syncIntervalMinutes: value === "off" ? account.syncIntervalMinutes : Number(value) }); }}>
            <option value="off">Schedule off</option>{intervals.map((interval) => <option key={interval.value} value={String(interval.value)}>{interval.label}</option>)}
          </select>
          <button type="button" disabled={busy !== null || account.status === "ACTIVE"} onClick={() => updateAccount(account.id, { status: "ACTIVE" })}>Activate</button>
          <button type="button" disabled={busy !== null || account.status === "PAUSED"} onClick={() => updateAccount(account.id, { status: "PAUSED", syncEnabled: false })}>Pause</button>
          <button type="button" disabled={busy !== null || account.status === "ERROR"} onClick={() => updateAccount(account.id, { status: "ERROR", syncEnabled: false })}>Mark error</button>
        </div> : null}
      </article>) : <p className="analytics-muted">No cloud accounts registered yet. Register an AWS, Azure, or GCP account to organize billing sources.</p>}
    </section>
  </div>;
}
