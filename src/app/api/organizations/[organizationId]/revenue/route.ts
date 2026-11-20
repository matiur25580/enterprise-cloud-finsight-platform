import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withUserContext } from "@/lib/user-context";
import { withOrganization } from "@/lib/tenant-context";
import { hasPermission } from "@/lib/permissions";

export const runtime = "nodejs";

const revenueSchema = z.object({
  amount: z.number().finite().min(0).max(1_000_000_000_000),
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/).transform((value) => value.toUpperCase()),
  revenueDate: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/),
  source: z.string().trim().min(2).max(40).default("MANUAL"),
  notes: z.string().trim().max(500).optional()
});

async function membershipFor(organizationId: string, userId: string) {
  return withUserContext(prisma, userId, (tx) => tx.membership.findFirst({
    where: { organizationId, userId }, select: { role: true }
  }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { organizationId } = await params;
  const membership = await membershipFor(organizationId, session.user.id);
  if (!membership || !hasPermission(membership.role, "billing:read")) return NextResponse.json({ error: "Revenue read permission required." }, { status: 403 });
  const end = new Date(); end.setUTCHours(23, 59, 59, 999);
  const start = new Date(end); start.setUTCDate(start.getUTCDate() - 89); start.setUTCHours(0, 0, 0, 0);
  const records = await withOrganization(prisma, organizationId, (tx) => tx.revenueRecord.findMany({
    where: { organizationId, revenueDate: { gte: start, lte: end } },
    orderBy: [{ revenueDate: "desc" }, { createdAt: "desc" }], take: 200
  }));
  return NextResponse.json({ records: records.map((record) => ({
    id: record.id, amount: Number(record.amount), currency: record.currency,
    revenueDate: record.revenueDate.toISOString().slice(0, 10), source: record.source, notes: record.notes
  })) });
}

export async function POST(request: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { organizationId } = await params;
  const membership = await membershipFor(organizationId, session.user.id);
  if (!membership) return NextResponse.json({ error: "Organization access denied." }, { status: 403 });
  if (!hasPermission(membership.role, "billing:import")) return NextResponse.json({ error: "Revenue entry permission required." }, { status: 403 });
  const parsed = revenueSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid revenue record.", details: parsed.error.flatten() }, { status: 400 });
  const revenueDate = new Date(parsed.data.revenueDate + "T00:00:00.000Z");
  if (Number.isNaN(revenueDate.getTime()) || revenueDate.toISOString().slice(0, 10) !== parsed.data.revenueDate) {
    return NextResponse.json({ error: "Revenue date is invalid." }, { status: 400 });
  }
  const record = await withOrganization(prisma, organizationId, async (tx) => {
    const created = await tx.revenueRecord.create({ data: {
      organizationId, createdByUserId: session.user.id, amount: parsed.data.amount,
      currency: parsed.data.currency, revenueDate, source: parsed.data.source, notes: parsed.data.notes
    } });
    await tx.auditLog.create({ data: {
      organizationId, actorUserId: session.user.id, action: "REVENUE_RECORDED",
      entityType: "RevenueRecord", entityId: created.id,
      metadata: { amount: Number(created.amount), currency: created.currency, revenueDate: parsed.data.revenueDate, source: created.source }
    } });
    return created;
  });
  return NextResponse.json({ record: {
    id: record.id, amount: Number(record.amount), currency: record.currency,
    revenueDate: record.revenueDate.toISOString().slice(0, 10), source: record.source, notes: record.notes
  } }, { status: 201 });
}
