"use client";

import { useState } from "react";

type Account = { id: string; name: string; provider: string; externalAccountId: string };
type Batch = { id: string; fileName: string; status: string; totalRows: number; importedRows: number; rejectedRows: number; duplicateRows: number; createdAt: string };

export default function BillingUpload({ organizationId, accounts, batches }: { organizationId: string; accounts: Account[]; batches: Batch[] }) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const preview = useMemo(() => {
    if (!file) return [];
    return [];
  }, [file]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !accountId) { setMessage("Choose a cloud account and CSV file first."); return; }
    if (!file.name.toLowerCase().endsWith(".csv")) { setMessage("Only CSV files are accepted."); return; }
    if (file.size > 5 * 1024 * 1024) { setMessage("File exceeds the 5 MB limit."); return; }
    setBusy(true); setMessage("");
    try {
      const body = new FormData(); body.set("file", file); body.set("cloudAccountId", accountId);
      const response = await fetch("/api/organizations/" + organizationId + "/billing/import", { method: "POST", body });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Import failed.");
      setMessage("Import complete: " + result.importedRows + " imported, " + result.rejectedRows + " rejected, " + result.duplicateRows + " duplicates.");
      setFile(null);
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to import this CSV.");
    } finally { setBusy(false); }
  }

  return <>
    <section className="analytics-panel upload-panel">
      <div className="analytics-panel-heading"><h2>Upload billing CSV</h2><p>Maximum 5 MB · up to 20,000 rows · UTF-8 CSV</p></div>
      {accounts.length ? <form className="billing-upload-form" onSubmit={submit}>
        <label>Cloud account<select value={accountId} onChange={(event) => setAccountId(event.target.value)}>{accounts.map((account) => <option key={account.id} value={account.id}>{account.provider} · {account.name} ({account.externalAccountId})</option>)}</select></label>
        <label>Billing CSV<input type="file" accept=".csv,text/csv" onChange={(event) => setFile(event.target.files?.[0] ?? null)}/></label>
        {file ? <p className="analytics-muted">Selected: {file.name} · {(file.size / 1024).toFixed(1)} KB</p> : null}
        <button type="submit" disabled={busy || !file}>{busy ? "Importing…" : "Validate & import CSV"}</button>
        {message ? <p className="upload-message" role="status">{message}</p> : null}
      </form> : <p className="analytics-muted">No cloud accounts are configured. Add a cloud account before importing billing data.</p>}
      <div className="upload-format"><strong>Required columns</strong><code>service, amount, currency, usageDate</code><span>Optional: externalId, region, usageType, resourceId, tag:* columns. Date format: YYYY-MM-DD.</span><a href="/billing-import-template.csv" download>Download CSV template</a></div>
    </section>
    <section className="analytics-panel upload-history"><div className="analytics-panel-heading"><h2>Import history</h2><p>Most recent 20 organization imports</p></div>
      {batches.length ? batches.map((batch) => <article className="analytics-list-row" key={batch.id}><div><strong>{batch.fileName}</strong><span>{new Date(batch.createdAt).toLocaleString()} · {batch.status}</span><small>{batch.importedRows} imported · {batch.rejectedRows} rejected · {batch.duplicateRows} duplicates / {batch.totalRows} rows</small></div></article>) : <p className="analytics-muted">No billing imports yet.</p>}
    </section>
  </>;
}
