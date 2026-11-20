import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { withOrganization } from "@/lib/tenant-context";
import { requireOrganizationPermission } from "@/lib/auth-guards";
import { hasPermission } from "@/lib/permissions";
import SharedAllocationManager from "./shared-allocation-manager";

export default async function SharedAllocationPage({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const { membership } = await requireOrganizationPermission(organizationId, "billing:read");
  const rules = await withOrganization(prisma, organizationId, (tx) => tx.sharedCostAllocationRule.findMany({
    where: { organizationId }, orderBy: [{ isActive: "desc" }, { createdAt: "desc" }]
  }));
  const today = new Date();
  const end = today.toISOString().slice(0, 10);
  const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 29)).toISOString().slice(0, 10);
  const serialized = rules.map((rule) => ({ ...rule, createdAt: rule.createdAt.toISOString() }));
  return <main className="analytics-shell">
    <header className="analytics-topbar"><Link className="analytics-brand" href="/workspace">fin<span>sight</span></Link><Link className="analytics-back" href={"/workspace/" + organizationId + "/allocation"}>← Cost allocation</Link></header>
    <div className="analytics-content">
      <div className="analytics-heading"><div><p className="analytics-eyebrow">FINOPS GOVERNANCE · SHARED SERVICES</p><h1>Shared cost allocation</h1><p className="analytics-subtitle">Distribute shared platform, network, security and infrastructure costs across accountable teams using transparent, auditable rules.</p></div></div>
      <section className="analytics-kpis">
        <article className="analytics-card"><span>Configured rules</span><strong>{rules.length}</strong><small>Tenant-specific allocation policies</small></article>
        <article className="analytics-card"><span>Active rules</span><strong>{rules.filter((rule) => rule.isActive).length}</strong><small>Available for preview</small></article>
        <article className="analytics-card"><span>Distribution methods</span><strong>2</strong><small>Equal and weighted</small></article>
      </section>
      <SharedAllocationManager organizationId={organizationId} initialRules={serialized} initialStart={first} initialEnd={end} canManage={hasPermission(membership.role, "budgets:manage")} />
      <footer className="analytics-footer"><span>FinSight · Shared cost allocation</span><span>Tenant-scoped · Preview-only · Audited rules</span></footer>
    </div>
  </main>;
}
