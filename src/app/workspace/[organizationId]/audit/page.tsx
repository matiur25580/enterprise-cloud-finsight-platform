import Link from "next/link";
import { requireOrganizationPermission } from "@/lib/auth-guards";
import { withOrganization } from "@/lib/tenant-context";
import { prisma } from "@/lib/prisma";

function describeAction(action: string): string {
  const labels: Record<string, string> = {
    CLOUD_SYNC_QUEUED: "Sync job queued",
    CLOUD_SYNC_RETRY_REQUESTED: "Manual retry requested",
    CLOUD_SYNC_STARTED: "Sync execution started",
    CLOUD_SYNC_SUCCEEDED: "Sync completed successfully",
    CLOUD_SYNC_FAILED: "Sync failed",
    CLOUD_SYNC_BLOCKED: "Sync blocked by configuration",
    CLOUD_ACCOUNT_CREATED: "Cloud account registered",
    CLOUD_ACCOUNT_UPDATED: "Cloud account settings updated",
    ORGANIZATION_SETTINGS_UPDATED: "Workspace profile updated",
    ORGANIZATION_INVITATION_SENT: "Organization invitation sent",
    ORGANIZATION_INVITATION_ACCEPTED: "Organization invitation accepted",
    ORGANIZATION_MEMBER_ROLE_UPDATED: "Member role updated",
    ORGANIZATION_MEMBER_REMOVED: "Organization member removed",
    BUDGET_CREATED: "Budget created",
    BUDGET_UPDATED: "Budget updated",
    BUDGET_DELETED: "Budget deleted",
    BUDGET_THRESHOLD_ALERT_SENT: "Budget threshold alert recorded",
    BUDGET_THRESHOLD_ALERT_RETRY_REQUESTED: "Budget threshold alert retry requested",
    BUDGET_FORECAST_SNAPSHOT_CAPTURED: "Budget forecast snapshot captured",
    SHARED_COST_ALLOCATION_RULE_CREATED: "Shared cost allocation rule created",
    SHARED_COST_ALLOCATION_RULE_STATUS_CHANGED: "Shared cost allocation rule status changed",
    SHARED_COST_ALLOCATION_APPLIED: "Shared cost allocation applied",
    BUSINESS_METRIC_RECORDED: "Business volume metric recorded"
  };
  return labels[action] ?? action.replaceAll("_", " ").toLowerCase();
}

export default async function AuditPage({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  await requireOrganizationPermission(organizationId, "audit:read");
  const events = await withOrganization(prisma, organizationId, (tx) => tx.auditLog.findMany({
    where: { entityType: { in: ["CloudSyncJob", "CloudAccount", "Membership", "OrganizationInvitation", "Organization", "Budget", "BusinessMetric"] } },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true, action: true, entityType: true, entityId: true, metadata: true, createdAt: true,
      actor: { select: { name: true, email: true } }
    }
  }));
  const syncEvents = events.filter((event) => event.entityType === "CloudSyncJob");
  const retryCount = events.filter((event) => event.action === "CLOUD_SYNC_RETRY_REQUESTED").length;
  const failedCount = syncEvents.filter((event) => ["CLOUD_SYNC_FAILED", "CLOUD_SYNC_BLOCKED"].includes(event.action)).length;
  return <main className="analytics-shell">
    <header className="analytics-topbar"><Link className="analytics-brand" href="/workspace">fin<span>sight</span></Link><Link className="analytics-back" href={"/workspace/" + organizationId}>Back to cost dashboard</Link></header>
    <div className="analytics-content">
      <div className="analytics-heading"><div><p className="analytics-eyebrow">GOVERNANCE & COMPLIANCE</p><h1>Operational audit timeline</h1><p className="analytics-subtitle">Organization-scoped access, cloud account and sync activity · latest 100 events · CSV export supports date and action filters</p></div><div className="audit-page-actions"><a className="analytics-back" href={"/api/organizations/" + organizationId + "/audit/export"}>Export CSV</a><Link className="analytics-back" href={"/workspace/" + organizationId + "/cloud-accounts"}>Cloud accounts</Link></div></div>
      <section className="analytics-grid">
        <article className="analytics-stat"><span>Events shown</span><strong>{events.length}</strong><small>Newest first</small></article>
        <article className="analytics-stat"><span>Sync events</span><strong>{syncEvents.length}</strong><small>Queue, retry and execution</small></article>
        <article className="analytics-stat"><span>Retry requests</span><strong>{retryCount}</strong><small>Manual operator actions</small></article>
        <article className="analytics-stat"><span>Failure / blocked events</span><strong>{failedCount}</strong><small>Within this page window</small></article>
      </section>
      <section className="analytics-panel">
        <div className="analytics-panel-heading"><h2>Activity timeline</h2><p>System-generated events have no human actor. Sensitive provider error text and credentials are not displayed.</p></div>
        {events.length ? <div className="audit-timeline">{events.map((event) => {
          const metadata = event.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata) ? event.metadata as Record<string, unknown> : {};
          return <article className="audit-event" key={event.id}>
            <div className="audit-event-marker" />
            <div className="audit-event-content">
              <div className="audit-event-heading"><strong>{describeAction(event.action)}</strong><time dateTime={event.createdAt.toISOString()}>{event.createdAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC</time></div>
              <p>{event.actor?.name || event.actor?.email || "System / background worker"} · {event.entityType} · {event.entityId ?? "No entity ID"}</p>
              {Object.keys(metadata).length ? <small>{Object.entries(metadata).filter(([key, value]) => !/secret|credential|token|password|message/i.test(key) && ["string", "number", "boolean"].includes(typeof value)).map(([key, value]) => key + ": " + String(value)).join(" · ")}</small> : null}
            </div>
          </article>;
        })}</div> : <p className="analytics-muted">No cloud governance events have been recorded yet.</p>}
      </section>
    </div>
  </main>;
}
