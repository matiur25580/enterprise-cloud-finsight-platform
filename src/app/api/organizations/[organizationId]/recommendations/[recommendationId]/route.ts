import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withUserContext } from "@/lib/user-context";
import { withOrganization } from "@/lib/tenant-context";
import { hasPermission } from "@/lib/permissions";
import { RecommendationStatus, Prisma } from "@prisma/client";

export const runtime = "nodejs";
const schema=z.object({status:z.nativeEnum(RecommendationStatus)});
export async function PATCH(request:Request,{params}:{params:Promise<{organizationId:string;recommendationId:string}>}) {
  const session=await auth(); if(!session?.user?.id) return NextResponse.json({error:"Authentication required."},{status:401});
  const {organizationId,recommendationId}=await params;
  const membership=await withUserContext(prisma,session.user.id,tx=>tx.membership.findFirst({where:{organizationId,userId:session.user.id},select:{role:true}}));
  if(!membership || !hasPermission(membership.role,"recommendations:review")) return NextResponse.json({error:"Recommendation review permission required."},{status:403});
  const parsed=schema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success) return NextResponse.json({error:"Invalid recommendation status."},{status:400});
  const updated=await withOrganization(prisma,organizationId,async tx=>{
    const existing=await tx.recommendation.findFirst({where:{id:recommendationId,organizationId}});
    if(!existing) return null;
    const allowed:Record<RecommendationStatus,RecommendationStatus[]>={NEW:["ACCEPTED","DISMISSED"],ACCEPTED:["IMPLEMENTED","DISMISSED"],DISMISSED:["NEW"],IMPLEMENTED:[]};
    if(!allowed[existing.status].includes(parsed.data.status)) throw new Error("INVALID_TRANSITION");
    const record=await tx.recommendation.update({where:{id:existing.id},data:{status:parsed.data.status}});
    await tx.auditLog.create({data:{organizationId,actorUserId:session.user.id,action:"RECOMMENDATION_STATUS_CHANGED",entityType:"Recommendation",entityId:record.id,metadata:{from:existing.status,to:record.status,title:record.title}}});
    return record;
  }).catch(error=>{if(error instanceof Error && error.message==="INVALID_TRANSITION") return "INVALID_TRANSITION" as const;throw error;});
  if(!updated) return NextResponse.json({error:"Recommendation not found."},{status:404});
  if(updated==="INVALID_TRANSITION") return NextResponse.json({error:"This status transition is not allowed."},{status:409});
  return NextResponse.json({recommendation:{...updated,estimatedMonthlySavings:Number(updated.estimatedMonthlySavings)}});
}
