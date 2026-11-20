import Link from "next/link";
import { requireOrganizationPermission } from "@/lib/auth-guards";
import { withOrganization } from "@/lib/tenant-context";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";
import CloudAccountManager from "./cloud-account-manager";

export default async function CloudAccountsPage({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const access = await requireOrganizationPermission(organizationId, "organization:read");
  const accounts = await withOrganization(prisma, organizationId, (tx) => tx.cloudAccount.findMany({
    where: { organizationId }, orderBy: [{ provider: "asc" }, { name: "asc" }],
    select: {
      id: true, provider: true, externalAccountId: true, name: true, currency: true, status: true,
      credentialRef: true, lastSyncedAt: true, lastSyncAttemptAt: true, syncEnabled: true,
      syncIntervalMinutes: true, nextSyncAt: true,
      syncJobs: { take: 5, orderBy: { createdAt: "desc" }, select: { status: true, trigger: true, attemptCount: true, totalRows: true, importedRows: true, rejectedRows: true, duplicateRows: true, errorMessage: true, createdAt: true } }
    }
  }));
  return <main className="analytics-shell">
    <header className="analytics-topbar"><Link className="analytics-brand" href="/workspace">fin<span>sight</span></Link><Link className="analytics-back" href={"/workspace/" + organizationId}>Back to cost dashboard</Link></header>
    <div className="analytics-content">
      <div className="analytics-heading"><div><p className="analytics-eyebrow">CLOUD GOVERNANCE</p><h1>Cloud accounts</h1><p className="analytics-subtitle">Manage provider accounts, sync schedules, and job history · {access.membership.role.replaceAll("_", " ")}</p></div><div className="flex gap-3"><Link className="analytics-back" href={"/workspace/" + organizationId + "/cloud-accounts/health"}>Sync health</Link><Link className="analytics-back" href={"/workspace/" + organizationId + "/billing"}>Import billing CSV</Link></div></div>
      <section className="analytics-empty cloud-integration-notice"><h2>Live provider connectors are available after credential setup</h2><p>Manual and scheduled jobs can query AWS Cost Explorer, Azure Cost Management, and GCP BigQuery. Configure a per-account secret reference and the worker-only secret resolver before queueing a live sync. Provider CSV imports remain available.</p></section>
      <CloudAccountManager organizationId={organizationId} canWrite={hasPermission(access.membership.role, "cloud:write")} initialAccounts={accounts.map((account) => ({
        id: account.id, provider: account.provider, externalAccountId: account.externalAccountId, name: account.name,
        currency: account.currency, status: account.status, credentialReferenceConfigured: Boolean(account.credentialRef),
        lastSyncedAt: account.lastSyncedAt?.toISOString() ?? null, lastSyncAttemptAt: account.lastSyncAttemptAt?.toISOString() ?? null,
        syncEnabled: account.syncEnabled, syncIntervalMinutes: account.syncIntervalMinutes, nextSyncAt: account.nextSyncAt?.toISOString() ?? null,
        syncJobs: account.syncJobs.map((job) => ({ status: job.status, trigger: job.trigger, attemptCount: job.attemptCount, totalRows: job.totalRows, importedRows: job.importedRows, rejectedRows: job.rejectedRows, duplicateRows: job.duplicateRows, errorMessage: job.errorMessage, createdAt: job.createdAt.toISOString() }))
      }))} />
    </div>
  </main>;
}
