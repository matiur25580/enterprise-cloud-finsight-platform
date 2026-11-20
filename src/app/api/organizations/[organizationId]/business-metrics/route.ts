import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withUserContext } from "@/lib/user-context";
import { withOrganization } from "@/lib/tenant-context";
import { hasPermission } from "@/lib/permissions";

export const runtime = "nodejs";

const metricSchema = z.object({
  metricName: z.string().trim().min(2).max(100),
  unit: z.string().trim().min(1).max(40),
  value: z.number().finite().min(0).max(1_000_000_000_000),
  metricDate: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/),
  notes: z.string().trim().max(500).optional()
});

async function getMembership(organizationId: string, userId: string) {
  return withUserContext(prisma, userId, (tx) => tx.membership.findFirst({
    where: { organizationId, userId }, select: { role: true }
  }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { organizationId } = await params;
  const membership = await getMembership(organizationId, session.user.id);
  if (!membership) return NextResponse.json({ error: "Organization access denied." }, { status: 403 });
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - 89);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date();
  end.setUTCHours(23, 59, 59, 999);
  const data = await withOrganization(prisma, organizationId, async (tx) => {
    const [metrics, metricTotals, spendTotals] = await Promise.all([
      tx.businessMetric.findMany({ where: { organizationId, metricDate: { gte: start, lte: end } }, orderBy: [{ metricDate: "desc" }, { createdAt: "desc" }], take: 100 }),
      tx.businessMetric.groupBy({ by: ["metricName", "unit"], where: { organizationId, metricDate: { gte: start, lte: end } }, _sum: { value: true }, _count: { _all: true } }),
      tx.costRecord.groupBy({ by: ["currency"], where: { organizationId, usageDate: { gte: start, lte: end } }, _sum: { amount: true }, _count: { _all: true } })
    ]);
    return {
      metrics: metrics.map((item) => ({ id: item.id, metricName: item.metricName, unit: item.unit, value: Number(item.value), metricDate: item.metricDate.toISOString().slice(0, 10), notes: item.notes })),
      metricTotals: metricTotals.map((item) => ({ metricName: item.metricName, unit: item.unit, total: Number(item._sum.value ?? 0), observations: item._count._all })),
      spendTotals: spendTotals.map((item) => ({ currency: item.currency, spend: Number(item._sum.amount ?? 0), records: item._count._all })),
      startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10)
    };
  });
  return NextResponse.json(data);
}

export async function POST(request: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { organizationId } = await params;
  const membership = await getMembership(organizationId, session.user.id);
  if (!membership) return NextResponse.json({ error: "Organization access denied." }, { status: 403 });
  if (!hasPermission(membership.role, "billing:import")) return NextResponse.json({ error: "Business metric import permission required." }, { status: 403 });
  const parsed = metricSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid business metric.", details: parsed.error.flatten() }, { status: 400 });
  const metricDate = new Date(parsed.data.metricDate + "T00:00:00.000Z");
  if (Number.isNaN(metricDate.getTime()) || metricDate.toISOString().slice(0, 10) !== parsed.data.metricDate) {
    return NextResponse.json({ error: "Metric date is invalid." }, { status: 400 });
  }
  const metric = await withOrganization(prisma, organizationId, async (tx) => {
    const created = await tx.businessMetric.create({
      data: { organizationId, createdByUserId: session.user.id, metricName: parsed.data.metricName, unit: parsed.data.unit, value: parsed.data.value, metricDate, notes: parsed.data.notes }
    });
    await tx.auditLog.create({
      data: { organizationId, actorUserId: session.user.id, action: "BUSINESS_METRIC_RECORDED", entityType: "BusinessMetric", entityId: created.id,
        metadata: { metricName: created.metricName, unit: created.unit, value: Number(created.value), metricDate: parsed.data.metricDate } }
    });
    return created;
  });
  return NextResponse.json({ metric: { id: metric.id, metricName: metric.metricName, unit: metric.unit, value: Number(metric.value), metricDate: metric.metricDate.toISOString().slice(0, 10) } }, { status: 201 });
}
