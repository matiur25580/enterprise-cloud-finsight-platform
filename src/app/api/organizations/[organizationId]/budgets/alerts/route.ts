import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withUserContext } from "@/lib/user-context";
import { withOrganization } from "@/lib/tenant-context";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { organizationId } = await params;
  const membership = await withUserContext(prisma, session.user.id, (tx) => tx.membership.findFirst({
    where: { organizationId, userId: session.user.id }, select: { id: true }
  }));
  if (!membership) return NextResponse.json({ error: "Organization access denied." }, { status: 403 });
  const events = await withOrganization(prisma, organizationId, (tx) => tx.auditLog.findMany({
    where: { organizationId, entityType: "Budget", action: "BUDGET_THRESHOLD_ALERT_SENT" },
    orderBy: { createdAt: "desc" }, take: 100,
    select: { id: true, entityId: true, metadata: true, createdAt: true }
  }));
  const alerts = events.map((event) => {
    const metadata = event.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata)
      ? event.metadata as Record<string, unknown> : {};
    return {
      id: event.id, budgetId: event.entityId, createdAt: event.createdAt.toISOString(),
      budgetName: typeof metadata.budgetName === "string" ? metadata.budgetName : "Budget",
      currency: typeof metadata.currency === "string" ? metadata.currency : "",
      spent: typeof metadata.spent === "number" ? metadata.spent : 0,
      budgetAmount: typeof metadata.budgetAmount === "number" ? metadata.budgetAmount : 0,
      utilizationPercent: typeof metadata.utilizationPercent === "number" ? metadata.utilizationPercent : 0,
      thresholdPercent: typeof metadata.thresholdPercent === "number" ? metadata.thresholdPercent : 0,
      startsAt: typeof metadata.startsAt === "string" ? metadata.startsAt : "",
      endsAt: typeof metadata.endsAt === "string" ? metadata.endsAt : "",
      deliveryStatus: typeof metadata.deliveryStatus === "string" ? metadata.deliveryStatus : "PENDING",
      attempted: typeof metadata.attempted === "number" ? metadata.attempted : 0,
      delivered: typeof metadata.delivered === "number" ? metadata.delivered : 0,
      channels: Array.isArray(metadata.channels) ? metadata.channels.filter((item): item is string => typeof item === "string") : []
    };
  });
  return NextResponse.json({ alerts });
}
