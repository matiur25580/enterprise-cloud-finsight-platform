import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withUserContext } from "@/lib/user-context";
import { withOrganization } from "@/lib/tenant-context";
import { distributeSharedCost, type AllocationRecipient, type SharedCostMethod } from "@/lib/shared-cost-allocation-math";

export const runtime = "nodejs";
const schema = z.object({
  ruleId: z.string().min(1),
  startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});
function dateValue(value: string) {
  const date = new Date(value + "T00:00:00.000Z");
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

export async function POST(request: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { organizationId } = await params;
  const membership = await withUserContext(prisma, session.user.id, (tx) => tx.membership.findFirst({
    where: { organizationId, userId: session.user.id }, select: { id: true }
  }));
  if (!membership) return NextResponse.json({ error: "Organization access denied." }, { status: 403 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Provide a valid rule and date range." }, { status: 400 });
  const startsAt = dateValue(parsed.data.startsAt);
  const endsAt = dateValue(parsed.data.endsAt);
  if (!startsAt || !endsAt || endsAt < startsAt || endsAt.getTime() - startsAt.getTime() > 366 * 86400000) {
    return NextResponse.json({ error: "Date range must be valid and no longer than 367 calendar days." }, { status: 400 });
  }
  try {
    const preview = await withOrganization(prisma, organizationId, async (tx) => {
      const rule = await tx.sharedCostAllocationRule.findFirst({ where: { id: parsed.data.ruleId, organizationId, isActive: true } });
      if (!rule) throw new Error("RULE_NOT_FOUND");
      const rows = await tx.$queryRaw<{ currency: string; spend: string | number; records: bigint | number }[]>(Prisma.sql`
        SELECT currency, SUM(amount) AS spend, COUNT(*)::bigint AS records
        FROM cost_records
        WHERE organization_id = ${organizationId}
          AND usage_date >= ${startsAt} AND usage_date <= ${endsAt}
          AND LOWER(service) = LOWER(${rule.servicePattern})
          AND BTRIM(tags ->> ${rule.sourceTagKey}) = ${rule.sourceTagValue}
        GROUP BY currency ORDER BY currency
      `);
      const recipients = rule.recipients as unknown as AllocationRecipient[];
      const allocations = rows.map((row) => {
        const sharedSpend = Number(row.spend.toString());
        const distributed = distributeSharedCost(sharedSpend, rule.method as SharedCostMethod, recipients);
        return { currency: row.currency, sourceSpend: sharedSpend, allocatedSpend: distributed.reduce((sum, item) => sum + item.amount, 0), records: Number(row.records), recipients: distributed };
      });
      return { rule: { id: rule.id, name: rule.name, targetDimension: rule.targetDimension, method: rule.method }, startsAt: parsed.data.startsAt, endsAt: parsed.data.endsAt, allocations, matchedRecords: allocations.reduce((sum, item) => sum + item.records, 0) };
    });
    return NextResponse.json({ preview });
  } catch (error) {
    if (error instanceof Error && error.message === "RULE_NOT_FOUND") return NextResponse.json({ error: "Active allocation rule not found." }, { status: 404 });
    return NextResponse.json({ error: "Unable to preview shared cost allocation." }, { status: 500 });
  }
}
