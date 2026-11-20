import { NextResponse } from "next/server";
import { BudgetPeriod } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withUserContext } from "@/lib/user-context";
import { withOrganization } from "@/lib/tenant-context";
import { hasPermission } from "@/lib/permissions";

export const runtime = "nodejs";

const schema = z.object({
  name: z.string().trim().min(2).max(80),
  amount: z.number().finite().positive().max(1_000_000_000_000),
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/).transform((value) => value.toUpperCase()),
  period: z.nativeEnum(BudgetPeriod),
  startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  alertThresholds: z.array(z.number().int().min(1).max(100)).min(1).max(5).refine((items) => new Set(items).size === items.length),
  isActive: z.boolean().default(true)
});

function dateValue(value: string) {
  const date = new Date(value + "T00:00:00.000Z");
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

async function access(organizationId: string) {
  const session = await auth();
  if (!session?.user?.id) return { response: NextResponse.json({ error: "Authentication required." }, { status: 401 }) };
  const membership = await withUserContext(prisma, session.user.id, (tx) =>
    tx.membership.findFirst({ where: { organizationId, userId: session.user.id }, select: { role: true } })
  );
  if (!membership) return { response: NextResponse.json({ error: "Organization access denied." }, { status: 403 }) };
  return { userId: session.user.id, role: membership.role };
}

export async function GET(_request: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const authz = await access(organizationId);
  if ("response" in authz) return authz.response;
  const budgets = await withOrganization(prisma, organizationId, async (tx) => {
    const rows = await tx.budget.findMany({ where: { organizationId }, orderBy: [{ isActive: "desc" }, { startsAt: "desc" }, { name: "asc" }] });
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    return Promise.all(rows.map(async (budget) => {
      const through = budget.endsAt < today ? budget.endsAt : today;
      const spend = through < budget.startsAt ? null : await tx.costRecord.aggregate({
        where: { organizationId, currency: budget.currency, usageDate: { gte: budget.startsAt, lte: through } },
        _sum: { amount: true }
      });
      const spent = spend?._sum.amount ? Number(spend._sum.amount.toString()) : 0;
      const amount = Number(budget.amount.toString());
      return { ...budget, amount, startsAt: budget.startsAt.toISOString().slice(0, 10), endsAt: budget.endsAt.toISOString().slice(0, 10), spent, utilization: amount > 0 ? spent / amount * 100 : 0 };
    }));
  });
  return NextResponse.json({ budgets });
}

export async function POST(request: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const authz = await access(organizationId);
  if ("response" in authz) return authz.response;
  if (!hasPermission(authz.role, "budgets:manage")) return NextResponse.json({ error: "You do not have permission to manage budgets." }, { status: 403 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Check the budget fields and try again." }, { status: 400 });
  const startsAt = dateValue(parsed.data.startsAt);
  const endsAt = dateValue(parsed.data.endsAt);
  if (!startsAt || !endsAt || endsAt < startsAt) return NextResponse.json({ error: "End date must be on or after the start date." }, { status: 400 });
  try {
    const budget = await withOrganization(prisma, organizationId, async (tx) => {
      const created = await tx.budget.create({ data: { organizationId, ...parsed.data, amount: parsed.data.amount.toFixed(8), startsAt, endsAt } });
      await tx.auditLog.create({ data: { organizationId, actorUserId: authz.userId, action: "BUDGET_CREATED", entityType: "Budget", entityId: created.id, metadata: { name: created.name, currency: created.currency, period: created.period, amount: created.amount.toString() } } });
      return created;
    });
    return NextResponse.json({ budget }, { status: 201 });
  } catch { return NextResponse.json({ error: "Unable to create budget." }, { status: 500 }); }
}
