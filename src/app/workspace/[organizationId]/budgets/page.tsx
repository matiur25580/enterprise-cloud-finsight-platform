import Link from "next/link";
import { requireOrganizationPermission } from "@/lib/auth-guards";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { withOrganization } from "@/lib/tenant-context";
import BudgetManager from "./budget-manager";

export default async function BudgetsPage({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const access = await requireOrganizationPermission(organizationId, "organization:read");
  const budgets = await withOrganization(prisma, organizationId, async (tx) => {
    const rows = await tx.budget.findMany({ where: { organizationId }, orderBy: [{ isActive: "desc" }, { startsAt: "desc" }] });
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    return Promise.all(rows.map(async (budget) => {
      const through = budget.endsAt < today ? budget.endsAt : today;
      const totals = through < budget.startsAt ? null : await tx.costRecord.aggregate({
        where: { organizationId, currency: budget.currency, usageDate: { gte: budget.startsAt, lte: through } }, _sum: { amount: true }
      });
      const spent = totals?._sum.amount ? Number(totals._sum.amount.toString()) : 0;
      return { id: budget.id, name: budget.name, amount: Number(budget.amount.toString()), currency: budget.currency, period: budget.period, startsAt: budget.startsAt.toISOString().slice(0, 10), endsAt: budget.endsAt.toISOString().slice(0, 10), alertThresholds: budget.alertThresholds, isActive: budget.isActive, spent, utilization: Number(budget.amount) > 0 ? spent / Number(budget.amount) * 100 : 0 };
    }));
  });
  return <main className="budget-page">
    <header className="budget-header"><div><Link href={"/workspace/" + organizationId}>← Cost intelligence</Link><p className="analytics-eyebrow">FINANCIAL GOVERNANCE</p><h1>Budget management</h1><p className="analytics-subtitle">Create spending limits and monitor actual costs in each billing currency.</p></div><span>{access.membership.role.replaceAll("_", " ")}</span></header>
    <BudgetManager organizationId={organizationId} initialBudgets={budgets} canManage={hasPermission(access.membership.role, "budgets:manage")} />
  </main>;
}
