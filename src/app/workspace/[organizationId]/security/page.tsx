import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrganizationRole } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { withOrganization } from "@/lib/tenant-context";
import { summarizeSecurityEvents } from "@/lib/security-events";

function label(value: string) {
  return value.replaceAll(":", " · ").replaceAll("_", " ");
}

export default async function SecurityDashboardPage({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  let access;
  try {
    access = await requireOrganizationRole(organizationId, ["OWNER", "ADMIN"]);
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") notFound();
    throw error;
  }

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const events = await withOrganization(prisma, organizationId, (tx) =>
    tx.apiSecurityEvent.findMany({
      where: { organizationId, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, routeBucket: true, requestCount: true, requestLimit: true, createdAt: true }
    })
  );
  const summary = summarizeSecurityEvents(events);
  const maxDay = Math.max(1, ...summary.days.map((day) => day.count));
  const maxRoute = Math.max(1, ...summary.routes.map((route) => route.count));

  return <main className="analytics-shell">
    <header className="analytics-topbar">
      <Link className="analytics-brand" href="/workspace">fin<span>sight</span></Link>
      <div className="analytics-user">{access.user.name ?? access.user.email} · {access.membership.role.replaceAll("_", " ")}</div>
    </header>
    <div className="analytics-content">
      <div className="analytics-heading">
        <div><p className="analytics-eyebrow">SECURITY OPERATIONS · ADMIN ONLY</p><h1>Security activity</h1><p className="analytics-subtitle">API abuse signals · trailing 30 days · latest 100 recorded events</p></div>
        <Link className="analytics-back" href={"/workspace/" + organizationId}>Back to cost dashboard</Link>
      </div>

      <section className="analytics-section">
        <div className="analytics-section-title"><h2>Security posture signals</h2><span>Based on persisted rate-limit threshold crossings</span></div>
        <div className="analytics-kpis">
          <article className="analytics-card"><span>Recorded threshold crossings</span><strong>{summary.total}</strong><small>Latest 100 events within 30 days</small></article>
          <article className="analytics-card"><span>Routes affected</span><strong>{summary.routes.length}</strong><small>Distinct protected API buckets</small></article>
          <article className="analytics-card"><span>Most recent signal</span><strong>{summary.latestAt ? summary.latestAt.toISOString().slice(0, 10) : "—"}</strong><small>{summary.latestAt ? summary.latestAt.toISOString().slice(11, 16) + " UTC" : "No recorded events"}</small></article>
          <article className="analytics-card"><span>Monitoring window</span><strong>30 days</strong><small>Tenant-isolated event history</small></article>
        </div>
      </section>

      <section className="analytics-grid">
        <article className="analytics-panel">
          <div className="analytics-panel-heading"><div><h2>14-day activity trend</h2><p>Recorded threshold crossings by UTC date</p></div></div>
          <div className="analytics-bars">
            {summary.days.map((day) => <div className="analytics-bar-row" key={day.date}>
              <span>{day.date.slice(5)}</span><div className="analytics-bar-track"><i style={{ width: (day.count / maxDay * 100).toFixed(2) + "%" }} /></div><strong>{day.count}</strong>
            </div>)}
          </div>
        </article>
        <article className="analytics-panel">
          <div className="analytics-panel-heading"><div><h2>Signals by API route</h2><p>Ranked by event count in the returned sample</p></div></div>
          {summary.routes.length ? summary.routes.map((route) => <div className="analytics-breakdown" key={route.routeBucket}>
            <div><span>{label(route.routeBucket)}</span><strong>{route.count}</strong></div>
            <div className="analytics-bar-track"><i style={{ width: (route.count / maxRoute * 100).toFixed(2) + "%" }} /></div>
          </div>) : <p className="analytics-muted">No route threshold crossings recorded in this period.</p>}
        </article>
      </section>

      <section className="analytics-panel">
        <div className="analytics-panel-heading"><div><h2>Incident signal timeline</h2><p>Each row represents the first request beyond a configured route limit</p></div></div>
        {events.length ? events.map((event) => <div className="analytics-list-row" key={event.id}>
          <div><strong>{label(event.routeBucket)}</strong><span>{event.createdAt.toISOString().replace("T", " ").slice(0, 19)} UTC · threshold crossed</span></div>
          <strong>{event.requestCount} / {event.requestLimit} requests</strong>
        </div>) : <div className="analytics-empty"><h2>No security events recorded</h2><p>When a protected API route crosses its configured limit, a tenant-scoped event will appear here. No sample incidents are shown.</p></div>}
      </section>

      <aside className="analytics-muted" style={{ marginTop: 16 }}>
        <strong>Interpretation and coverage:</strong> These records indicate API rate-limit threshold crossings, not confirmed attacks, compromised accounts, or malicious intent. Events are recorded once per rate-limit window crossing; repeated blocked requests are not separate incidents. This dashboard does not yet include tenant-attributed credential-login attempts or provider threat-intelligence feeds. No raw client IP addresses, credentials, or user identifiers are displayed.
      </aside>
      <footer className="analytics-footer"><span>FinSight · Security activity</span><span>Source: tenant-scoped API security events · PostgreSQL RLS</span></footer>
    </div>
  </main>;
}
