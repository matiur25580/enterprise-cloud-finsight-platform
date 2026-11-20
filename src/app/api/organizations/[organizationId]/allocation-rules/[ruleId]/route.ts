import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withUserContext } from "@/lib/user-context";
import { withOrganization } from "@/lib/tenant-context";
import { hasPermission } from "@/lib/permissions";

export const runtime = "nodejs";
const schema = z.object({ isActive: z.boolean() });

export async function PATCH(request: Request, { params }: { params: Promise<{ organizationId: string; ruleId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { organizationId, ruleId } = await params;
  const membership = await withUserContext(prisma, session.user.id, (tx) => tx.membership.findFirst({ where: { organizationId, userId: session.user.id }, select: { role: true } }));
  if (!membership) return NextResponse.json({ error: "Organization access denied." }, { status: 403 });
  if (!hasPermission(membership.role, "budgets:manage")) return NextResponse.json({ error: "You do not have permission to manage allocation rules." }, { status: 403 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid rule status." }, { status: 400 });
  try {
    const rule = await withOrganization(prisma, organizationId, async (tx) => {
      const updated = await tx.sharedCostAllocationRule.update({ where: { id: ruleId, organizationId }, data: { isActive: parsed.data.isActive } });
      await tx.auditLog.create({ data: { organizationId, actorUserId: session.user.id, action: "SHARED_COST_ALLOCATION_RULE_STATUS_CHANGED", entityType: "SharedCostAllocationRule", entityId: ruleId, metadata: { isActive: updated.isActive } } });
      return updated;
    });
    return NextResponse.json({ rule });
  } catch { return NextResponse.json({ error: "Allocation rule not found or could not be updated." }, { status: 404 }); }
}
