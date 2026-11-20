import Link from "next/link";
import { requireOrganizationPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { withOrganization } from "@/lib/tenant-context";
import RetryBudgetAlertButton from "./retry-button";

function statusLabel(status: string) {
  if (status === "DELIVERED") return "Delivered";
  if (status === "PARTIAL") return "Partially delivered";
  if (status === "FAILED") return "Failed";
  if (status === "NOT_CONFIGURED") return "Not configured";
  return "Pending";
}

export default async function BudgetAlertsPage({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  await requireOrganizationPermission(organizationId, "organization:read");
  const events = await withOrganization(prisma, organizationId, (tx) => tx.auditLog.findMany({
    where: { organizationId, entityType: "Budget", action: "BUDGET_THRESHOLD_ALERT_SENT" },
    orderBy: { createdAt: "desc" }, take: 100,
    select: { id: true, entityId: true, metadata: true, createdAt: true }
  }));
  const alerts = events.map((event) => {
    const metadata = event.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata)
      ? event.metadata as Record<string, unknown> : {};
    return {
      id: event.id,
      budgetName: typeof metadata.budgetName === "string" ? metadata.budgetName : "Budget",
      currency: typeof metadata.currency === "string" ? metadata.currency : "",
      spent: typeof metadata.spent === "number" ? metadata.spent : 0,
      threshold: typeof metadata.thresholdPercent === "number" ? metadata.thresholdPercent : 0,
      utilization: typeof metadata.utilizationPercent === "number" ? metadata.utilizationPercent : 0,
      status: typeof metadata.deliveryStatus === "string" ? metadata.deliveryStatus : "PENDING",
      attempted: typeof metadata.attempted === "number" ? metadata.attempted : 0,
      delivered: typeof metadata.delivered === "number" ? metadata.delivered : 0,
      channels: Array.isArray(metadata.channels) ? metadata.channels.filter((item): item is string => typeof item === "string") : [],
      createdAt: event.createdAt
    };
  });
  const delivered = alerts.filter((alert) => alert.status === "DELIVERED").length;
  const failed = alerts.filter((alert) => alert.status === "FAILED" || alert.status === "PARTIAL").length;
  const pending = alerts.filter((alert) => alert.status === "PENDING" || alert.status === "NOT_CONFIGURED").length;
  return <main className="budget-page">
    <header className="budget-header"><div><Link href={"/workspace/" + organizationId + "/budgets"}>← Budget management</Link><p className="analytics-eyebrow">FINANCIAL GOVERNANCE</p><h1>Budget alert history</h1><p className="analytics-subtitle">Notification attempts and provider delivery outcomes · latest 100 events</p></div></header>
    <section className="analytics-grid">
      <article className="analytics-stat"><span>Alerts recorded</span><strong>{alerts.length}</strong><small>Latest 100 events</small></article>
      <article className="analytics-stat"><span>Delivered</span><strong>{delivered}</strong><small>All configured channels accepted</small></article>
      <article className="analytics-stat"><span>Failed / partial</span><strong>{failed}</strong><small>At least one channel failed</small></article>
      <article className="analytics-stat"><span>Pending / unconfigured</span><strong>{pending}</strong><small>Delivery needs attention</small></article>
    </section>
    <section className="analytics-panel budget-alert-history">
      <div className="analytics-panel-heading"><h2>Notification events</h2><p>Provider HTTP acceptance is recorded; it does not guarantee final inbox delivery.</p></div>
      {alerts.length ? <div className="budget-alert-table-wrap"><table className="budget-alert-table"><thead><tr><th>Budget / threshold</th><th>Spend at alert</th><th>Delivery</th><th>Channels</th><th>Recorded (UTC)</th><th>Action</th></tr></thead><tbody>{alerts.map((alert) => <tr key={alert.id}><td><strong>{alert.budgetName}</strong><small>{alert.threshold}% threshold · {alert.utilization.toFixed(1)}% usage</small></td><td>{new Intl.NumberFormat("en-US", { style: "currency", currency: alert.currency || "USD" }).format(alert.spent)}</td><td><span className={"budget-alert-status " + alert.status.toLowerCase()}>{statusLabel(alert.status)}</span><small>{alert.delivered}/{alert.attempted} channels accepted</small></td><td>{alert.channels.length ? alert.channels.join(", ") : "None configured"}</td><td>{alert.createdAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC<small>{alert.retryCount} retry attempt(s)</small></td><td><RetryBudgetAlertButton organizationId={organizationId} alertId={alert.id} status={alert.status} /></td></tr>)}</tbody></table></div> : <div className="budget-empty"><h3>No budget alerts yet</h3><p>Threshold events will appear after a billing import crosses an active budget threshold.</p></div>}
    </section>
  </main>;
}
