import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrganizationRole } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { withOrganization } from "@/lib/tenant-context";
import { IncidentManager } from "./incident-manager";

export default async function SecurityIncidentsPage({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  let access;
  try { access = await requireOrganizationRole(organizationId, ["OWNER", "ADMIN"]); }
  catch (error) { if (error instanceof Error && error.message === "FORBIDDEN") notFound(); throw error; }

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [incidents, signals] = await withOrganization(prisma, organizationId, async (tx) => Promise.all([
    tx.securityIncident.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, take: 200 }),
    tx.apiSecurityEvent.findMany({
      where: { organizationId, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" }, take: 100,
      select: { id: true, routeBucket: true, requestCount: true, requestLimit: true, createdAt: true }
    })
  ]));

  return <main className="analytics-shell">
    <header className="analytics-topbar"><Link className="analytics-brand" href="/workspace">fin<span>sight</span></Link><div className="analytics-user">{access.user.name ?? access.user.email} · {access.membership.role.replaceAll("_", " ")}</div></header>
    <div className="analytics-content">
      <div className="analytics-heading"><div><p className="analytics-eyebrow">SECURITY OPERATIONS · ADMIN ONLY</p><h1>Incident response</h1><p className="analytics-subtitle">Triage, acknowledge, resolve, and audit security signals</p></div><Link className="analytics-back" href={`/workspace/${organizationId}/security`}>Back to security activity</Link></div>
      <section className="analytics-kpis">
        <article className="analytics-card"><span>Total incidents</span><strong>{incidents.length}</strong><small>Latest 200 records</small></article>
        <article className="analytics-card"><span>Open</span><strong>{incidents.filter((item) => item.status === "OPEN").length}</strong><small>Awaiting triage</small></article>
        <article className="analytics-card"><span>Acknowledged</span><strong>{incidents.filter((item) => item.status === "ACKNOWLEDGED").length}</strong><small>Under investigation</small></article>
        <article className="analytics-card"><span>Resolved / false positive</span><strong>{incidents.filter((item) => ["RESOLVED", "FALSE_POSITIVE"].includes(item.status)).length}</strong><small>Closed workflow items</small></article>
      </section>
      <IncidentManager organizationId={organizationId} initialIncidents={incidents.map((item) => ({ ...item, createdAt: item.createdAt.toISOString(), acknowledgedAt: item.acknowledgedAt?.toISOString() ?? null, resolvedAt: item.resolvedAt?.toISOString() ?? null }))} signals={signals.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() }))} />
      <footer className="analytics-footer"><span>FinSight · Incident response</span><span>Tenant-scoped · PostgreSQL RLS · Audit logged</span></footer>
    </div>
  </main>;
}
