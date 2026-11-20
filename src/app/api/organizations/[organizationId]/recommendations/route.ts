import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withUserContext } from "@/lib/user-context";
import { withOrganization } from "@/lib/tenant-context";
import { hasPermission } from "@/lib/permissions";
import { Prisma, RecommendationStatus, CloudProvider } from "@prisma/client";

export const runtime = "nodejs";
const createSchema = z.object({
  title: z.string().trim().min(4).max(160),
  description: z.string().trim().min(10).max(2000),
  provider: z.nativeEnum(CloudProvider).nullable().optional(),
  estimatedMonthlySavings: z.number().finite().min(0).max(1_000_000_000_000),
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/).transform(v => v.toUpperCase()),
  confidence: z.number().int().min(0).max(100),
  evidence: z.record(z.string(), z.unknown()).default({})
});
async function getMembership(organizationId: string, userId: string) {
  return withUserContext(prisma,userId,tx=>tx.membership.findFirst({where:{organizationId,userId},select:{role:true}}));
}
export async function GET(_request: Request,{params}:{params:Promise<{organizationId:string}>}) {
  const session=await auth(); if(!session?.user?.id) return NextResponse.json({error:"Authentication required."},{status:401});
  const {organizationId}=await params; const membership=await getMembership(organizationId,session.user.id);
  if(!membership || !hasPermission(membership.role,"billing:read")) return NextResponse.json({error:"Organization access denied."},{status:403});
  const recommendations=await withOrganization(prisma,organizationId,tx=>tx.recommendation.findMany({where:{organizationId},orderBy:[{updatedAt:"desc"},{createdAt:"desc"}],take:200}));
  return NextResponse.json({recommendations:recommendations.map(r=>({...r,estimatedMonthlySavings:Number(r.estimatedMonthlySavings)}))});
}
export async function POST(request:Request,{params}:{params:Promise<{organizationId:string}>}) {
  const session=await auth(); if(!session?.user?.id) return NextResponse.json({error:"Authentication required."},{status:401});
  const {organizationId}=await params; const membership=await getMembership(organizationId,session.user.id);
  if(!membership || !hasPermission(membership.role,"recommendations:review")) return NextResponse.json({error:"Recommendation management permission required."},{status:403});
  const parsed=createSchema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success) return NextResponse.json({error:"Invalid recommendation.",details:parsed.error.flatten()},{status:400});
  const record=await withOrganization(prisma,organizationId,async tx=>{
    const created=await tx.recommendation.create({data:{
      organizationId,title:parsed.data.title,description:parsed.data.description,provider:parsed.data.provider??null,
      estimatedMonthlySavings:parsed.data.estimatedMonthlySavings,currency:parsed.data.currency,
      confidence:parsed.data.confidence,evidence:parsed.data.evidence as Prisma.InputJsonValue
    }});
    await tx.auditLog.create({data:{organizationId,actorUserId:session.user.id,action:"RECOMMENDATION_CREATED",entityType:"Recommendation",entityId:created.id,metadata:{title:created.title,status:created.status,currency:created.currency}}});
    return created;
  });
  return NextResponse.json({recommendation:{...record,estimatedMonthlySavings:Number(record.estimatedMonthlySavings)}},{status:201});
}
