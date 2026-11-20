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
  isActive: z.boolean()
});
function dateValue(value: string) {
  const date = new Date(value + "T00:00:00.000Z");
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}
async function authorize(organizationId: string) {
  const session = await auth();
  if (!session?.user?.id) return { response: NextResponse.json({ error: "Authentication required." }, { status: 401 }) };
  const membership = await withUserContext(prisma, session.user.id, (tx) => tx.membership.findFirst({
    where: { organizationId, userId: session.user.id }, select: { role: true }
  }));
  if (!membership) return { response: NextResponse.json({ error: "Organization access denied." }, { status: 403 }) };
  if (!hasPermission(membership.role, "budgets:manage")) return { response: NextResponse.json({ error: "You do not have permission to manage budgets." }, { status: 403 }) };
  return { userId: session.user.id };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ organizationId: string; budgetId: string }> }) {
  const { organizationId, budgetId } = await params;
  const authz = await authorize(organizationId);
  if ("response" in authz) return authz.response;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Check the budget fields and try again." }, { status: 400 });
  const startsAt = dateValue(parsed.data.startsAt);
  const endsAt = dateValue(parsed.data.endsAt);
  if (!startsAt || !endsAt || endsAt < startsAt) return NextResponse.json({ error: "End date must be on or after the start date." }, { status: 400 });
  try {
    const budget = await withOrganization(prisma, organizationId, async (tx) => {
      const existing = await tx.budget.findFirst({ where: { id: budgetId, organizationId }, select: { id: true } });
      if (!existing) throw new Error("NOT_FOUND");
      const updated = await tx.budget.update({ where: { id: budgetId }, data: { ...parsed.data, amount: parsed.data.amount.toFixed(8), startsAt, endsAt } });
      await tx.auditLog.create({ data: { organizationId, actorUserId: authz.userId, action: "BUDGET_UPDATED", entityType: "Budget", entityId: budgetId, metadata: { name: updated.name, currency: updated.currency, period: updated.period, amount: updated.amount.toString(), isActive: updated.isActive } } });
      return updated;
    });
    return NextResponse.json({ budget });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") return NextResponse.json({ error: "Budget not found." }, { status: 404 });
    return NextResponse.json({ error: "Unable to update budget." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ organizationId: string; budgetId: string }> }) {
  const { organizationId, budgetId } = await params;
  const authz = await authorize(organizationId);
  if ("response" in authz) return authz.response;
  try {
    await withOrganization(prisma, organizationId, async (tx) => {
      const existing = await tx.budget.findFirst({ where: { id: budgetId, organizationId }, select: { id: true, name: true } });
      if (!existing) throw new Error("NOT_FOUND");
      await tx.budget.delete({ where: { id: budgetId } });
      await tx.auditLog.create({ data: { organizationId, actorUserId: authz.userId, action: "BUDGET_DELETED", entityType: "Budget", entityId: budgetId, metadata: { name: existing.name } } });
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") return NextResponse.json({ error: "Budget not found." }, { status: 404 });
    return NextResponse.json({ error: "Unable to delete budget." }, { status: 500 });
  }
}
