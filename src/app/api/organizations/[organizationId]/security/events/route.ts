import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withUserContext } from "@/lib/user-context";
import { withOrganization } from "@/lib/tenant-context";
import { hasAnyRole } from "@/lib/permissions";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { organizationId } = await params;
  const membership = await withUserContext(prisma, session.user.id, (tx) =>
    tx.membership.findFirst({
      where: { organizationId, userId: session.user.id },
      select: { role: true }
    })
  );

  if (!membership || !hasAnyRole(membership.role, ["OWNER", "ADMIN"])) {
    return NextResponse.json({ error: "Organization administrator access required." }, { status: 403 });
  }

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const events = await withOrganization(prisma, organizationId, (tx) =>
    tx.apiSecurityEvent.findMany({
      where: { organizationId, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        routeBucket: true,
        requestCount: true,
        requestLimit: true,
        createdAt: true
      }
    })
  );

  return NextResponse.json({
    events,
    windowDays: 30,
    limit: 100,
    note: "Only rate-limit threshold violations are recorded. Client IP addresses and credentials are never included."
  }, {
    headers: { "Cache-Control": "private, no-store" }
  });
}
