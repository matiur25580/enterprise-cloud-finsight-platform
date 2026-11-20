import type { MembershipRole } from "@prisma/client";

const ROLE_PERMISSIONS: Record<MembershipRole, readonly string[]> = {
  OWNER: ["organization:read", "organization:manage", "members:manage", "cloud:read", "cloud:write", "billing:read", "billing:import", "budgets:manage", "recommendations:review", "audit:read"],
  ADMIN: ["organization:read", "members:manage", "cloud:read", "cloud:write", "billing:read", "billing:import", "budgets:manage", "recommendations:review", "audit:read"],
  FINOPS_ANALYST: ["organization:read", "cloud:read", "billing:read", "billing:import", "budgets:manage", "recommendations:review"],
  VIEWER: ["organization:read", "cloud:read", "billing:read"]
};

export function hasPermission(role: MembershipRole, permission: string): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function hasAnyRole(role: MembershipRole, allowedRoles: readonly MembershipRole[]): boolean {
  return allowedRoles.includes(role);
}
