import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * Run tenant-owned database work inside a transaction-scoped PostgreSQL RLS context.
 * organizationId must come from a server-verified membership, never a client claim.
 */
export async function withOrganization<T>(
  prisma: PrismaClient,
  organizationId: string,
  callback: (transaction: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  if (!organizationId.trim()) {
    throw new Error("A verified organization ID is required.");
  }

  return prisma.$transaction(async (transaction) => {
    await transaction.$queryRaw`SELECT set_config('app.current_org_id', ${organizationId}, true)`;
    return callback(transaction);
  });
}
