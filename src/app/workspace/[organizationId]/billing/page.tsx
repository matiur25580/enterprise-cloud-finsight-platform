import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { withOrganization } from "@/lib/tenant-context";
import { requireOrganizationPermission } from "@/lib/auth-guards";
import BillingUpload from "../billing-upload";

export default async function BillingImportPage({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  let access;
  try { access = await requireOrganizationPermission(organizationId, "billing:import"); }
  catch (error) { if (error instanceof Error && error.message === "FORBIDDEN") notFound(); throw error; }
  const data = await withOrganization(prisma, organizationId, async (tx) => {
    const [accounts, batches] = await Promise.all([
      tx.cloudAccount.findMany({ where: { organizationId, status: "ACTIVE" }, select: { id: true, name: true, provider: true, externalAccountId: true }, orderBy: { name: "asc" } }),
      tx.importBatch.findMany({ where: { organizationId }, select: { id: true, fileName: true, status: true, totalRows: true, importedRows: true, rejectedRows: true, duplicateRows: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 20 })
    ]);
    return { accounts, batches };
  });
  return <main className="analytics-shell"><header className="analytics-topbar"><Link className="analytics-brand" href="/workspace">fin<span>sight</span></Link><Link className="analytics-back" href={"/workspace/" + organizationId}>Back to cost dashboard</Link></header><div className="analytics-content"><div className="analytics-heading"><div><p className="analytics-eyebrow">BILLING DATA MANAGEMENT</p><h1>Import cloud costs</h1><p className="analytics-subtitle">Signed in as {access.user.email} · {access.membership.role.replaceAll("_", " ")}</p></div></div><BillingUpload organizationId={organizationId} accounts={data.accounts} batches={data.batches.map((batch) => ({ ...batch, createdAt: batch.createdAt.toISOString() }))}/></div></main>;
}
