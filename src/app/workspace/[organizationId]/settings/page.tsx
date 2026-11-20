import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrganizationPermission } from "@/lib/auth-guards";
import { withOrganization } from "@/lib/tenant-context";
import { prisma } from "@/lib/prisma";
import SettingsForm from "./settings-form";

export default async function OrganizationSettingsPage({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  let access;
  try {
    access = await requireOrganizationPermission(organizationId, "organization:manage");
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") notFound();
    throw error;
  }
  const organization = await withOrganization(prisma, organizationId, (tx) => tx.organization.findUnique({
    where: { id: organizationId }, select: { id: true, name: true, slug: true, createdAt: true, updatedAt: true }
  }));
  if (!organization) notFound();
  return <main className="analytics-shell">
    <header className="analytics-topbar"><Link className="analytics-brand" href="/workspace">fin<span>sight</span></Link><Link className="analytics-back" href={"/workspace/" + organizationId}>Back to cost dashboard</Link></header>
    <div className="analytics-content">
      <div className="analytics-heading"><div><p className="analytics-eyebrow">ORGANIZATION GOVERNANCE</p><h1>Workspace settings</h1><p className="analytics-subtitle">Manage the identity and profile of {organization.name}.</p></div><Link className="analytics-back" href={"/workspace/" + organizationId + "/members"}>Members & access</Link></div>
      <SettingsForm organizationId={organization.id} initialName={organization.name} slug={organization.slug} />
      <footer className="analytics-footer"><span>Workspace created {organization.createdAt.toISOString().slice(0, 10)}</span><span>Last updated {organization.updatedAt.toISOString().slice(0, 10)} · {access.membership.role}</span></footer>
    </div>
  </main>;
}
