import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withUserContext } from "@/lib/user-context";
import { withOrganization } from "@/lib/tenant-context";
import { hasPermission } from "@/lib/permissions";
import { getCostIntelligence } from "@/lib/cost-intelligence";
import { Prisma } from "@prisma/client";

export const runtime = "nodejs";

type Candidate = {
  signalKey: string;
  title: string;
  description: string;
  currency: string;
  estimatedMonthlySavings: number;
  confidence: number;
  evidence: Record<string, unknown>;
};

export async function POST(_request: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { organizationId } = await params;
  const membership = await withUserContext(prisma, session.user.id, (tx) =>
    tx.membership.findFirst({ where: { organizationId, userId: session.user.id }, select: { role: true } })
  );
  if (!membership || !hasPermission(membership.role, "recommendations:review")) {
    return NextResponse.json({ error: "Recommendation management permission required." }, { status: 403 });
  }

  const intelligence = await getCostIntelligence(organizationId);
  const candidates: Candidate[] = [
    ...intelligence.optimizationRecommendations.map((item) => ({
      signalKey: "SERVICE_SPEND:" + item.service + ":" + item.currency,
      title: "Review optimization for " + item.service,
      description: "This service has " + item.currency + " " + item.monthToDateSpend.toFixed(2) +
        " in month-to-date spend. Review utilization, idle resources, commitments and sizing opportunities. " +
        "The estimated monthly saving is an illustrative 5% spend scenario, not a verified saving.",
      currency: item.currency,
      estimatedMonthlySavings: Math.max(0, item.modeledMonthlySavings),
      confidence: 60,
      evidence: { source: "COST_INTELLIGENCE", signalType: "SERVICE_SPEND", service: item.service,
        currency: item.currency, monthToDateSpend: item.monthToDateSpend, scenarioRatePercent: 5,
        generatedAt: intelligence.generatedAt }
    })),
    ...intelligence.anomalies.slice(0, 10).map((item) => ({
      signalKey: "COST_ANOMALY:" + item.service + ":" + item.currency + ":" + item.date,
      title: "Investigate cost spike in " + item.service,
      description: item.service + " recorded " + item.currency + " " + item.spend.toFixed(2) +
        " on " + item.date + ", " + item.increasePercent.toFixed(1) +
        "% above its 14-day baseline. Validate usage changes, deployments and billing dimensions before taking action.",
      currency: item.currency,
      estimatedMonthlySavings: 0,
      confidence: item.severity === "HIGH" ? 90 : 80,
      evidence: { source: "COST_INTELLIGENCE", signalType: "COST_ANOMALY", service: item.service,
        currency: item.currency, date: item.date, spend: item.spend, baselineAverage: item.baselineAverage,
        increasePercent: item.increasePercent, severity: item.severity, generatedAt: intelligence.generatedAt }
    }))
  ].slice(0, 25);

  const result = await withOrganization(prisma, organizationId, async (tx) => {
    const existing = await tx.recommendation.findMany({
      where: { organizationId }, select: { evidence: true }
    });
    const known = new Set(existing.map((row) => {
      const evidence = row.evidence;
      return evidence && typeof evidence === "object" && !Array.isArray(evidence) &&
        typeof evidence.signalKey === "string" ? evidence.signalKey : null;
    }).filter((key): key is string => key !== null));
    const created = [];
    let skipped = 0;
    for (const candidate of candidates) {
      if (known.has(candidate.signalKey)) { skipped += 1; continue; }
      const record = await tx.recommendation.create({ data: {
        organizationId, title: candidate.title, description: candidate.description,
        estimatedMonthlySavings: candidate.estimatedMonthlySavings, currency: candidate.currency,
        confidence: candidate.confidence, evidence: { ...candidate.evidence, signalKey: candidate.signalKey } as Prisma.InputJsonValue
      }});
      await tx.auditLog.create({ data: {
        organizationId, actorUserId: session.user.id, action: "RECOMMENDATION_AUTO_GENERATED",
        entityType: "Recommendation", entityId: record.id,
        metadata: { title: record.title, currency: record.currency, signalKey: candidate.signalKey }
      }});
      known.add(candidate.signalKey);
      created.push({ id: record.id, title: record.title, currency: record.currency });
    }
    return { created, skipped };
  });

  return NextResponse.json({ generated: result.created.length, skipped: result.skipped, recommendations: result.created });
}
