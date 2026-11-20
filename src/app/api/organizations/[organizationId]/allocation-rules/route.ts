import { NextResponse } from "next/server";
import { Prisma, SharedCostAllocationMethod } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withUserContext } from "@/lib/user-context";
import { withOrganization } from "@/lib/tenant-context";
import { hasPermission } from "@/lib/permissions";
import { validateAllocationRecipients } from "@/lib/shared-cost-allocation-math";

export const runtime = "nodejs";
const recipientSchema = z.object({ value: z.string().trim().min(1).max(120), weight: z.number().finite().positive().max(100).optional() });
const schema = z.object({
  name: z.string().trim().min(2).max(100),
  servicePattern: z.string().trim().min(1).max(160),
  sourceTagKey: z.string().trim().min(1).max(120),
  sourceTagValue: z.string().trim().min(1).max(160),
  targetDimension: z.enum(["team", "department", "project", "namespace", "costCenter"]),
  method: z.nativeEnum(SharedCostAllocationMethod),
  recipients: z.array(recipientSchema).min(2).max(50)
});

async function access(organizationId: string) {
  const session = await auth();
  if (!session?.user?.id) return { response: NextResponse.json({ error: "Authentication required." }, { status: 401 }) };
  const membership = await withUserContext(prisma, session.user.id, (tx) => tx.membership.findFirst({
    where: { organizationId, userId: session.user.id }, select: { role: true }
  }));
  if (!membership) return { response: NextResponse.json({ error: "Organization access denied." }, { status: 403 }) };
  return { userId: session.user.id, role: membership.role };
}

export async function GET(_request: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const authz = await access(organizationId);
  if ("response" in authz) return authz.response;
  const rules = await withOrganization(prisma, organizationId, (tx) => tx.sharedCostAllocationRule.findMany({
    where: { organizationId }, orderBy: [{ isActive: "desc" }, { createdAt: "desc" }]
  }));
  return NextResponse.json({ rules });
}

export async function POST(request: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const authz = await access(organizationId);
  if ("response" in authz) return authz.response;
  if (!hasPermission(authz.role, "budgets:manage")) return NextResponse.json({ error: "You do not have permission to manage allocation rules." }, { status: 403 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Check the rule fields and recipient allocation." }, { status: 400 });
  const recipientError = validateAllocationRecipients(parsed.data.method, parsed.data.recipients);
  if (recipientError) return NextResponse.json({ error: recipientError }, { status: 400 });
  try {
    const rule = await withOrganization(prisma, organizationId, async (tx) => {
      const duplicate = await tx.sharedCostAllocationRule.findFirst({ where: { organizationId, isActive: true, servicePattern: { equals: parsed.data.servicePattern, mode: "insensitive" }, sourceTagKey: parsed.data.sourceTagKey, sourceTagValue: parsed.data.sourceTagValue } });
      if (duplicate) throw new Error("DUPLICATE_RULE");
      const created = await tx.sharedCostAllocationRule.create({
        data: { organizationId, ...parsed.data, recipients: parsed.data.recipients as Prisma.InputJsonValue }
      });
      await tx.auditLog.create({
        data: { organizationId, actorUserId: authz.userId, action: "SHARED_COST_ALLOCATION_RULE_CREATED",
          entityType: "SharedCostAllocationRule", entityId: created.id,
          metadata: { name: created.name, servicePattern: created.servicePattern, targetDimension: created.targetDimension, method: created.method, recipientCount: parsed.data.recipients.length } }
      });
      return created;
    });
    return NextResponse.json({ rule }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "DUPLICATE_RULE") return NextResponse.json({ error: "An active rule already matches this exact service and tag selector. Pause it before creating a replacement." }, { status: 409 });
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") return NextResponse.json({ error: "An active rule already matches this service and tag selector." }, { status: 409 });
    return NextResponse.json({ error: "Unable to create allocation rule." }, { status: 500 });
  }
}
