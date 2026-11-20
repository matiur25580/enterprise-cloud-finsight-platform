import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withUserContext } from "@/lib/user-context";
import { withOrganization } from "@/lib/tenant-context";
import { hasPermission } from "@/lib/permissions";

export const runtime = "nodejs";
const schema = z.object({
  displayName: z.string().trim().min(2).max(100).optional(),
  isRequired: z.boolean().optional(),
  allowedValues: z.array(z.string().trim().min(1).max(120)).max(100).optional(),
  isActive: z.boolean().optional()
}).refine((value) => Object.keys(value).length > 0, { message: "At least one field is required." })
.refine((value) => !value.allowedValues || new Set(value.allowedValues.map((item) => item.toLowerCase())).size === value.allowedValues.length, {
  message: "Allowed values must be unique (case-insensitive)."
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

export async function PATCH(request: Request, { params }: { params: Promise<{ organizationId: string; policyId: string }> }) {
  const { organizationId, policyId } = await params;
  const authz = await access(organizationId);
  if ("response" in authz) return authz.response;
  if (!hasPermission(authz.role, "budgets:manage")) return NextResponse.json({ error: "You do not have permission to manage tag policies." }, { status: 403 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid policy update." }, { status: 400 });
  try {
    const policy = await withOrganization(prisma, organizationId, async (tx) => {
      const existing = await tx.tagPolicy.findFirst({ where: { id: policyId, organizationId } });
      if (!existing) throw new Error("NOT_FOUND");
      const nextRequired = parsed.data.isRequired ?? existing.isRequired;
      const nextValues = parsed.data.allowedValues ?? existing.allowedValues;
      if (!nextRequired && nextValues.length === 0) throw new Error("EMPTY_POLICY");
      const updated = await tx.tagPolicy.update({ where: { id: existing.id }, data: parsed.data });
      await tx.auditLog.create({ data: {
        organizationId, actorUserId: authz.userId, action: "TAG_POLICY_UPDATED",
        entityType: "TagPolicy", entityId: updated.id,
        metadata: { tagKey: updated.tagKey, isRequired: updated.isRequired, isActive: updated.isActive, allowedValueCount: updated.allowedValues.length }
      } });
      return updated;
    });
    return NextResponse.json({ policy });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") return NextResponse.json({ error: "Tag policy not found." }, { status: 404 });
    if (error instanceof Error && error.message === "EMPTY_POLICY") return NextResponse.json({ error: "A policy must require the tag or define allowed values." }, { status: 400 });
    return NextResponse.json({ error: "Unable to update tag policy." }, { status: 500 });
  }
}
