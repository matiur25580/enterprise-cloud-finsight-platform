import type { Prisma, PrismaClient } from "@prisma/client";

/** Establishes the authenticated user context for membership discovery under RLS. */
export async function withUserContext<T>(
  prisma: PrismaClient,
  userId: string,
  callback: (transaction: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  if (!userId.trim()) throw new Error("A verified user ID is required.");
  return prisma.$transaction(async (transaction) => {
    await transaction.$queryRaw`SELECT set_config('app.current_user_id', ${userId}, true)`;
    return callback(transaction);
  });
}
