import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withUserContext } from "@/lib/user-context";
import { withOrganization } from "@/lib/tenant-context";
import { hasPermission } from "@/lib/permissions";

export const runtime = "nodejs";
const schema = z.object({
  tagKey: z.string().trim().regex(/^[A-Za-z][A-Za-z0-9_.:/-]{0,119}$/),
  displayName: z.string().trim().min(2).max(100),
  isRequired: z.boolean().default(true),
  allowedValues: z.array(z.string().trim().min(1).max(120)).max(100).default([])
}).refine((value) => value.isRequired || value.allowedValues.length > 0, {
  message: "A policy must require the tag or define allowed values."
}).refine((value) => new Set(value.allowedValues.map((item) => item.toLowerCase())).size === value.allowedValues.length, {
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

export async function GET(_request: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const authz = await access(organizationId);
  if ("response" in authz) return authz.response;
  const policies = await withOrganization(prisma, organizationId, (tx) => tx.tagPolicy.findMany({
    where: { organizationId }, orderBy: [{ isActive: "desc" }, { tagKey: "asc" }]
  }));
  return NextResponse.json({ policies });
}

export async function POST(request: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const authz = await access(organizationId);
  if ("response" in authz) return authz.response;
  if (!hasPermission(authz.role, "budgets:manage")) return NextResponse.json({ error: "You do not have permission to manage tag policies." }, { status: 403 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid policy." }, { status: 400 });
  try {
    const policy = await withOrganization(prisma, organizationId, async (tx) => {
      const created = await tx.tagPolicy.create({ data: { organizationId, ...parsed.data } });
      await tx.auditLog.create({ data: {
        organizationId, actorUserId: authz.userId, action: "TAG_POLICY_CREATED",
        entityType: "TagPolicy", entityId: created.id,
        metadata: { tagKey: created.tagKey, isRequired: created.isRequired, allowedValueCount: created.allowedValues.length }
      } });
      return created;
    });
    return NextResponse.json({ policy }, { status: 201 });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return NextResponse.json({ error: "A policy already exists for this tag key. Edit or reactivate the existing policy." }, { status: 409 });
    }
    return NextResponse.json({ error: "Unable to create tag policy." }, { status: 500 });
  }
}
