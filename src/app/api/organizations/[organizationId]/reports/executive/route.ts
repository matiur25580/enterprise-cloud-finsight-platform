import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withUserContext } from "@/lib/user-context";
import { withOrganization } from "@/lib/tenant-context";
import { hasPermission } from "@/lib/permissions";

export const runtime = "nodejs";

function cell(value: unknown) {
  let text = value == null ? "" : value instanceof Date ? value.toISOString() : String(value);
  if (/^[\\s]*[=+@\\-]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}

export async function GET(request: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { organizationId } = await params;
  const membership = await withUserContext(prisma, session.user.id, (tx) => tx.membership.findFirst({
    where: { organizationId, userId: session.user.id }, select: { role: true }
  }));
  if (!membership || !hasPermission(membership.role, "billing:read")) return NextResponse.json({ error: "Billing read permission required." }, { status: 403 });
  const rawDays = new URL(request.url).searchParams.get("days") ?? "90";
  const days = Number(rawDays);
  if (!Number.isInteger(days) || days < 1 || days > 366) return NextResponse.json({ error: "days must be an integer from 1 to 366." }, { status: 400 });
  const end = new Date(); end.setUTCHours(23,59,59,999);
  const start = new Date(end); start.setUTCDate(start.getUTCDate() - (days - 1)); start.setUTCHours(0,0,0,0);
  const data = await withOrganization(prisma, organizationId, async (tx) => {
    const [costs, revenue, budgets, organization] = await Promise.all([
      tx.costRecord.groupBy({ by: ["service","currency"], where: { organizationId, usageDate: { gte: start, lte: end } }, _sum: { amount: true }, _count: { _all: true }, orderBy: { service: "asc" } }),
      tx.revenueRecord.groupBy({ by: ["currency"], where: { organizationId, revenueDate: { gte: start, lte: end } }, _sum: { amount: true }, _count: { _all: true } }),
      tx.budget.findMany({ where: { organizationId, isActive: true, startsAt: { lte: end }, endsAt: { gte: end } }, orderBy: { name: "asc" } }),
      tx.organization.findUnique({ where: { id: organizationId }, select: { name: true } })
    ]);
    const rows: unknown[][] = [["record_type","organization","period_start","period_end","name","currency","amount","record_count","notes"]];
    for (const row of costs) rows.push(["CLOUD_SERVICE_SPEND",organization?.name,start.toISOString().slice(0,10),end.toISOString().slice(0,10),row.service,row.currency,Number(row._sum.amount ?? 0),row._count._all,"Imported billing actual"]);
    for (const row of revenue) rows.push(["REPORTED_REVENUE",organization?.name,start.toISOString().slice(0,10),end.toISOString().slice(0,10),"All reported revenue",row.currency,Number(row._sum.amount ?? 0),row._count._all,"Manually reported; not inferred"]);
    for (const budget of budgets) {
      const budgetSpend = await tx.costRecord.aggregate({
        where: { organizationId, currency: budget.currency, usageDate: { gte: budget.startsAt, lte: end } },
        _sum: { amount: true }
      });
      const budgetAmount = Number(budget.amount);
      const utilization = budgetAmount > 0 ? Number(budgetSpend._sum.amount ?? 0) / budgetAmount * 100 : 0;
      rows.push(["ACTIVE_BUDGET",organization?.name,budget.startsAt.toISOString().slice(0,10),budget.endsAt.toISOString().slice(0,10),budget.name,budget.currency,budgetAmount,null,"Current utilization: "+utilization.toFixed(2)+"%"]);
    }
    return rows;
  });
  const csv = "\uFEFF" + data.map((row) => row.map(cell).join(",")).join("\r\n");
  return new NextResponse(csv, { headers: {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": 'attachment; filename="finsight-executive-report.csv"',
    "Cache-Control": "private, no-store",
    "X-Report-Period-Days": String(days)
  }});
}
