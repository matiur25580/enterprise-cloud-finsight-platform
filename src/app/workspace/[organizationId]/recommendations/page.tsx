import Link from "next/link";
import { requireOrganizationPermission } from "@/lib/auth-guards";
import { withOrganization } from "@/lib/tenant-context";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";
import RecommendationManager from "./recommendation-manager";

export default async function RecommendationsPage({params}:{params:Promise<{organizationId:string}>}) {
 const {organizationId}=await params;
 const access=await requireOrganizationPermission(organizationId,"billing:read");
 const records=await withOrganization(prisma,organizationId,tx=>tx.recommendation.findMany({where:{organizationId},orderBy:[{updatedAt:"desc"},{createdAt:"desc"}],take:200,include:{impacts:{orderBy:{createdAt:"desc"},take:10}}}));
 const initial=records.map(r=>({id:r.id,title:r.title,description:r.description,provider:r.provider,estimatedMonthlySavings:Number(r.estimatedMonthlySavings),currency:r.currency,confidence:r.confidence,status:r.status,createdAt:r.createdAt.toISOString(),impacts:r.impacts.map(i=>({id:i.id,currency:i.currency,scope:i.scope,baselineStartsAt:i.baselineStartsAt.toISOString().slice(0,10),baselineEndsAt:i.baselineEndsAt.toISOString().slice(0,10),observedStartsAt:i.observedStartsAt.toISOString().slice(0,10),observedEndsAt:i.observedEndsAt.toISOString().slice(0,10),baselineSpend:Number(i.baselineSpend),observedSpend:Number(i.observedSpend),realizedSavings:Number(i.realizedSavings),periodDays:i.periodDays,baselineRecords:i.baselineRecords,observedRecords:i.observedRecords,createdAt:i.createdAt.toISOString()}))}));
 return <main className="analytics-shell"><header className="analytics-topbar"><Link className="analytics-brand" href="/workspace">fin<span>sight</span></Link><Link className="analytics-back" href={"/workspace/"+organizationId}>Cost dashboard</Link></header><div className="analytics-content">
 <div className="analytics-heading"><div><p className="analytics-eyebrow">FINOPS · GOVERNED OPTIMIZATION</p><h1>Recommendation workflow</h1><p className="analytics-subtitle">Capture optimization opportunities, review decisions and track implementation through an auditable lifecycle.</p></div></div>
 <p className="analytics-muted">Savings are estimates supplied by the reviewer, not verified savings. Mark an item implemented only after validating the change in the cloud provider and observing the resulting bill.</p>
 <RecommendationManager organizationId={organizationId} initialRecords={initial} canManage={hasPermission(access.membership.role,"recommendations:review")}/>
 </div></main>;
}
