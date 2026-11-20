import Link from "next/link";
import { requireOrganizationPermission } from "@/lib/auth-guards";
import { withOrganization } from "@/lib/tenant-context";
import { prisma } from "@/lib/prisma";

function dateLabel(value: Date | null) {
  return value ? value.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC" : "—";
}

const statusLabels: Record<string, string> = {
  QUEUED: "Queued", RUNNING: "Running", SUCCEEDED: "Succeeded", FAILED: "Failed", BLOCKED: "Blocked"
};

export default async function CloudSyncHealthPage({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  await requireOrganizationPermission(organizationId, "cloud:read");

  const [accounts, jobs, grouped] = await withOrganization(prisma, organizationId, async (tx) => Promise.all([
    tx.cloudAccount.findMany({
      where: { organizationId }, orderBy: [{ provider: "asc" }, { name: "asc" }],
      select: { id: true, name: true, provider: true, status: true, syncEnabled: true, syncIntervalMinutes: true, nextSyncAt: true, lastSyncedAt: true, lastSyncAttemptAt: true, credentialRef: true }
    }),
    tx.cloudSyncJob.findMany({
      where: { organizationId }, orderBy: { createdAt: "desc" }, take: 50,
      select: { id: true, cloudAccountId: true, status: true, trigger: true, attemptCount: true, maxAttempts: true, errorCode: true, totalRows: true, importedRows: true, rejectedRows: true, duplicateRows: true, createdAt: true, startedAt: true, completedAt: true, cloudAccount: { select: { name: true, provider: true } } }
    }),
    tx.cloudSyncJob.groupBy({ by: ["status"], where: { organizationId }, _count: { _all: true } })
  ]));

  const counts = Object.fromEntries(grouped.map((item) => [item.status, item._count._all])) as Record<string, number>;
  const failed = (counts.FAILED ?? 0) + (counts.BLOCKED ?? 0);
  const attentionAccounts = accounts.filter((account) => account.status === "ERROR" || (account.syncEnabled && !account.credentialRef));
  const running = counts.RUNNING ?? 0;
  const queued = counts.QUEUED ?? 0;

  return <main className="analytics-shell">
    <header className="analytics-topbar"><Link className="analytics-brand" href="/workspace">fin<span>sight</span></Link><Link className="analytics-back" href={"/workspace/" + organizationId + "/cloud-accounts"}>Cloud accounts</Link></header>
    <div className="analytics-content">
      <div className="analytics-heading"><div><p className="analytics-eyebrow">OPERATIONS & RELIABILITY</p><h1>Cloud sync health</h1><p className="analytics-subtitle">Tenant-scoped worker activity, schedule readiness, and recent outcomes</p></div><Link className="analytics-back" href={"/workspace/" + organizationId}>Cost dashboard</Link></div>

      <section className="analytics-section">
        <div className="analytics-section-title"><h2>Job status overview</h2><span>All recorded jobs · {jobs.length} most recent jobs shown below</span></div>
        <div className="analytics-kpis">
          {[
            ["Queued", queued, "queued"],
            ["Running", running, "running"],
            ["Succeeded", counts.SUCCEEDED ?? 0, "succeeded"],
            ["Failed", counts.FAILED ?? 0, "failed"],
            ["Blocked", counts.BLOCKED ?? 0, "blocked"]
          ].map(([label, value, tone]) => <article className="analytics-card sync-health-kpi" key={String(label)}><span>{label}</span><strong className={"sync-health-number " + tone}>{value}</strong></article>)}
        </div>
      </section>

      {failed > 0 || attentionAccounts.length > 0 ? <section className="sync-health-alert" role="status"><strong>Operational attention required</strong><span>{failed} failed or blocked job(s), {attentionAccounts.length} account(s) needing configuration or status review. Open the account inventory to correct credentials or account state.</span></section> : <section className="sync-health-ok"><strong>No current failure signals</strong><span>No failed/blocked jobs or obvious account configuration gaps were found in the current database snapshot.</span></section>}

      <section className="analytics-panel sync-health-panel">
        <div className="analytics-panel-heading"><h2>Account readiness & schedules</h2><p>{accounts.length} registered cloud account(s)</p></div>
        {accounts.length ? accounts.map((account) => <article className="sync-account-health" key={account.id}>
          <div><strong>{account.name}</strong><span>{account.provider} · {account.status}</span></div>
          <div><strong>{account.syncEnabled ? "Scheduled" : "Schedule off"}</strong><span>{account.syncEnabled ? "Every " + account.syncIntervalMinutes + " minutes" : "Manual sync only"}</span></div>
          <div><strong>{account.credentialRef ? "Secret reference set" : "Secret reference missing"}</strong><span>Next run: {dateLabel(account.nextSyncAt)}</span></div>
          <div><strong>Last success</strong><span>{dateLabel(account.lastSyncedAt)}</span><small>Last attempt: {dateLabel(account.lastSyncAttemptAt)}</small></div>
        </article>) : <p className="analytics-muted">No cloud accounts have been registered.</p>}
      </section>

      <section className="analytics-panel sync-health-panel">
        <div className="analytics-panel-heading"><h2>Recent sync activity</h2><p>Latest 50 jobs · sensitive provider error text is intentionally not displayed</p></div>
        {jobs.length ? <div className="sync-job-table-wrap"><table className="sync-job-table">
          <thead><tr><th>Account</th><th>Status</th><th>Trigger</th><th>Rows imported</th><th>Rejected / duplicate</th><th>Attempt</th><th>Created (UTC)</th><th>Error code</th></tr></thead>
          <tbody>{jobs.map((job) => <tr key={job.id}>
            <td><strong>{job.cloudAccount.name}</strong><small>{job.cloudAccount.provider}</small></td>
            <td><span className={"cloud-status " + job.status.toLowerCase()}>{statusLabels[job.status] ?? job.status}</span></td>
            <td>{job.trigger.toLowerCase()}</td>
            <td>{job.importedRows} / {job.totalRows}</td>
            <td>{job.rejectedRows} / {job.duplicateRows}</td>
            <td>{job.attemptCount} / {job.maxAttempts}</td>
            <td>{dateLabel(job.createdAt)}</td>
            <td>{job.errorCode ?? "—"}</td>
          </tr>)}</tbody>
        </table></div> : <p className="analytics-muted">No sync jobs recorded yet. Queue a manual sync from Cloud accounts to begin monitoring worker activity.</p>}
      </section>
      <footer className="analytics-footer"><span>FinSight · Sync health snapshot</span><span>Job counts are database-backed; this page does not claim external provider connectivity.</span></footer>
    </div>
  </main>;
}
