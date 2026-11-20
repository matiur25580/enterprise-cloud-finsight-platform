import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withUserContext } from "@/lib/user-context";
import { withOrganization } from "@/lib/tenant-context";
import { hasPermission } from "@/lib/permissions";
import { calculateRealizedSavings, validateImpactPeriods } from "@/lib/recommendation-impact";

export const runtime = "nodejs";
const schema = z.object({
  baselineStartsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  baselineEndsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  observedStartsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  observedEndsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

export async function POST(request: Request, { params }: { params: Promise<{ organizationId: string; recommendationId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { organizationId, recommendationId } = await params;
  const membership = await withUserContext(prisma, session.user.id, (tx) =>
    tx.membership.findFirst({ where: { organizationId, userId: session.user.id }, select: { role: true } })
  );
  if (!membership || !hasPermission(membership.role, "recommendations:review")) {
    return NextResponse.json({ error: "Recommendation review permission required." }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Provide four valid calendar dates.", details: parsed.error.flatten() }, { status: 400 });
  const periods = validateImpactPeriods(parsed.data);
  if (!periods.valid) return NextResponse.json({ error: periods.error }, { status: 400 });

  try {
    const impact = await withOrganization(prisma, organizationId, async (tx) => {
      const recommendation = await tx.recommendation.findFirst({
        where: { id: recommendationId, organizationId },
        select: { id: true, title: true, status: true, currency: true, evidence: true }
      });
      if (!recommendation) return { kind: "NOT_FOUND" as const };
      if (recommendation.status !== "IMPLEMENTED") return { kind: "NOT_IMPLEMENTED" as const };

      const evidence = recommendation.evidence;
      const service = evidence && typeof evidence === "object" && !Array.isArray(evidence) &&
        typeof evidence.service === "string" ? evidence.service : null;
      const baseWhere = { organizationId, currency: recommendation.currency, ...(service ? { service } : {}) };
      const [baseline, observed] = await Promise.all([
        tx.costRecord.aggregate({
          where: { ...baseWhere, usageDate: { gte: periods.baselineStart, lte: periods.baselineEnd } },
          _sum: { amount: true }, _count: { _all: true }
        }),
        tx.costRecord.aggregate({
          where: { ...baseWhere, usageDate: { gte: periods.observedStart, lte: periods.observedEnd } },
          _sum: { amount: true }, _count: { _all: true }
        })
      ]);
      if (baseline._count._all === 0 || observed._count._all === 0) return { kind: "INSUFFICIENT_DATA" as const };
      const baselineSpend = Number(baseline._sum.amount ?? 0);
      const observedSpend = Number(observed._sum.amount ?? 0);
      const realizedSavings = calculateRealizedSavings(baselineSpend, observedSpend);
      const record = await tx.recommendationImpact.create({ data: {
        organizationId, recommendationId, currency: recommendation.currency,
        scope: service ? "Service: " + service : "Organization-wide cloud spend",
        baselineStartsAt: periods.baselineStart, baselineEndsAt: periods.baselineEnd,
        observedStartsAt: periods.observedStart, observedEndsAt: periods.observedEnd,
        periodDays: periods.periodDays, baselineSpend, observedSpend, realizedSavings,
        baselineRecords: baseline._count._all, observedRecords: observed._count._all,
        recordedByUserId: session.user.id
      }});
      await tx.auditLog.create({ data: {
        organizationId, actorUserId: session.user.id, action: "RECOMMENDATION_IMPACT_RECORDED",
        entityType: "Recommendation", entityId: recommendation.id,
        metadata: { impactId: record.id, currency: record.currency, scope: record.scope,
          baselineSpend, observedSpend, realizedSavings, periodDays: record.periodDays }
      }});
      return { kind: "CREATED" as const, record, title: recommendation.title };
    });
    if (impact.kind === "NOT_FOUND") return NextResponse.json({ error: "Recommendation not found." }, { status: 404 });
    if (impact.kind === "NOT_IMPLEMENTED") return NextResponse.json({ error: "Only implemented recommendations can be measured." }, { status: 409 });
    if (impact.kind === "INSUFFICIENT_DATA") return NextResponse.json({ error: "Both periods must contain imported billing records. Missing data is not treated as zero spend." }, { status: 422 });
    return NextResponse.json({ impact: { ...impact.record,
      baselineSpend: Number(impact.record.baselineSpend), observedSpend: Number(impact.record.observedSpend),
      realizedSavings: Number(impact.record.realizedSavings) }, title: impact.title }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "An impact snapshot already exists for these comparison periods." }, { status: 409 });
    }
    throw error;
  }
}
