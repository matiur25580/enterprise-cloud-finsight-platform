import "server-only";

import type { MembershipRole } from "@prisma/client";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withUserContext } from "@/lib/user-context";
import { hasPermission } from "@/lib/permissions";

export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return session.user;
}

export async function requireOrganizationPermission(
  organizationId: string,
  permission: string
) {
  const user = await requireUser();
  const membership = await withUserContext(prisma, user.id, (tx) =>
    tx.membership.findFirst({
      where: { organizationId, userId: user.id },
      select: { id: true, organizationId: true, role: true }
    })
  );

  if (!membership || !hasPermission(membership.role, permission)) {
    throw new Error("FORBIDDEN");
  }
  return { user, membership };
}

export async function requireOrganizationRole(
  organizationId: string,
  allowedRoles: readonly MembershipRole[]
) {
  const user = await requireUser();
  const membership = await withUserContext(prisma, user.id, (tx) =>
    tx.membership.findFirst({
      where: { organizationId, userId: user.id },
      select: { id: true, organizationId: true, role: true }
    })
  );

  if (!membership || !allowedRoles.includes(membership.role)) {
    throw new Error("FORBIDDEN");
  }
  return { user, membership };
}
