import Link from "next/link";
import { requireOrganizationPermission } from "@/lib/auth-guards";
import { withOrganization } from "@/lib/tenant-context";
import { prisma } from "@/lib/prisma";
import MemberManager from "./member-manager";

export default async function OrganizationMembersPage({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const { membership } = await requireOrganizationPermission(organizationId, "members:manage");
  const data = await withOrganization(prisma, organizationId, async (tx) => {
    const [members, invitations] = await Promise.all([
      tx.membership.findMany({ where: { organizationId }, orderBy: [{ role: "asc" }, { createdAt: "asc" }], select: { id: true, role: true, createdAt: true, user: { select: { id: true, name: true, email: true } } } }),
      tx.organizationInvitation.findMany({ where: { organizationId, acceptedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" }, select: { id: true, email: true, role: true, expiresAt: true, createdAt: true } })
    ]);
    return { members, invitations };
  });
  return <main className="analytics-shell">
    <header className="analytics-topbar"><Link className="analytics-brand" href="/workspace">fin<span>sight</span></Link><Link className="analytics-back" href={"/workspace/" + organizationId}>Cost dashboard</Link></header>
    <div className="analytics-content">
      <div className="analytics-heading"><div><p className="analytics-eyebrow">ORGANIZATION GOVERNANCE</p><h1>Members & access</h1><p className="analytics-subtitle">Invite teammates, assign least-privilege roles, and manage organization access.</p></div><Link className="analytics-back" href={"/workspace/" + organizationId + "/audit"}>Audit timeline</Link></div>
      <MemberManager organizationId={organizationId} actorRole={membership.role} initialMembers={data.members.map((member) => ({ ...member, createdAt: member.createdAt.toISOString() }))} initialInvitations={data.invitations.map((invite) => ({ ...invite, createdAt: invite.createdAt.toISOString(), expiresAt: invite.expiresAt.toISOString() }))} />
      <footer className="analytics-footer"><span>FinSight · Organization access controls</span><span>Invitation email delivery uses the configured Resend sender.</span></footer>
    </div>
  </main>;
}
