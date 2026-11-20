import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withUserContext } from "@/lib/user-context";
import { withOrganization } from "@/lib/tenant-context";
import { hasPermission } from "@/lib/permissions";
import { z } from "zod";

export const runtime = "nodejs";
const schema = z.object({ name: z.string().trim().min(2).max(80) });

function toSlug(value: string) {
  const slug = value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48).replace(/-+$/g, "");
  return slug || "organization";
}

export async function PATCH(request: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { organizationId } = await params;
  const membership = await withUserContext(prisma, session.user.id, (tx) => tx.membership.findFirst({
    where: { organizationId, userId: session.user.id }, select: { role: true }
  }));
  if (!membership || !hasPermission(membership.role, "organization:manage")) return NextResponse.json({ error: "Only organization owners can update workspace settings." }, { status: 403 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Workspace name must contain 2–80 characters." }, { status: 400 });
  const slug = toSlug(parsed.data.name);
  try {
    const updated = await withOrganization(prisma, organizationId, async (tx) => {
      const current = await tx.organization.findUnique({ where: { id: organizationId }, select: { id: true, name: true, slug: true } });
      if (!current) throw new Error("NOT_FOUND");
      const collision = await tx.organization.findFirst({ where: { slug, NOT: { id: organizationId } }, select: { id: true } });
      if (collision) throw new Error("SLUG_TAKEN");
      const organization = await tx.organization.update({ where: { id: organizationId }, data: { name: parsed.data.name, slug }, select: { id: true, name: true, slug: true, updatedAt: true } });
      await tx.auditLog.create({ data: { organizationId, actorUserId: session.user.id, action: "ORGANIZATION_SETTINGS_UPDATED", entityType: "Organization", entityId: organizationId, metadata: { previousName: current.name, newName: organization.name, previousSlug: current.slug, newSlug: organization.slug } } });
      return organization;
    });
    return NextResponse.json({ organization: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "NOT_FOUND") return NextResponse.json({ error: "Organization not found." }, { status: 404 });
    if (message === "SLUG_TAKEN" || (typeof error === "object" && error !== null && "code" in error && error.code === "P2002")) return NextResponse.json({ error: "That workspace URL is already in use. Choose a different name." }, { status: 409 });
    return NextResponse.json({ error: "Unable to update workspace settings." }, { status: 500 });
  }
}
