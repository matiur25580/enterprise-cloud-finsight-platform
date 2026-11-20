import { NextResponse } from "next/server";
import { z } from "zod";
import { compare } from "bcryptjs";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { verifyAndConsumeMfaFactor } from "@/lib/mfa";
import { readLimitedJson } from "@/lib/request-body";
import { enforceMfaRateLimit, enforceMfaAccountRateLimit } from "@/lib/mfa-rate-limit";

export const runtime = "nodejs";
const schema = z.object({
  password: z.string().min(8).max(128),
  code: z.string().trim().min(6).max(24)
});

export async function POST(request: Request) {
  const limited = await enforceMfaRateLimit(request);
  if (limited) return limited;

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const accountLimited = await enforceMfaAccountRateLimit(userId);
  if (accountLimited) return accountLimited;

  const body = await readLimitedJson(request, 1024);
  if (!body.ok) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const parsed = schema.safeParse(body.value);
  if (!parsed.success) return NextResponse.json({ error: "Enter your password and authenticator or recovery code." }, { status: 400 });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true, mfaSecretEncrypted: true, mfaEnabledAt: true }
  });
  if (!user?.passwordHash || !(await compare(parsed.data.password, user.passwordHash))) {
    return NextResponse.json({ error: "Current password is incorrect." }, { status: 403 });
  }
  if (!user.mfaEnabledAt || !user.mfaSecretEncrypted) {
    return NextResponse.json({ error: "MFA is not enabled." }, { status: 409 });
  }
  const valid = await verifyAndConsumeMfaFactor(userId, user.mfaSecretEncrypted, parsed.data.code);
  if (!valid) return NextResponse.json({ error: "Authenticator or recovery code is incorrect." }, { status: 403 });

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { mfaEnabledAt: null, mfaSecretEncrypted: null, mfaLastUsedTimeStep: null }
    });
    await tx.mfaRecoveryCode.deleteMany({ where: { userId } });
  });
  return NextResponse.json({ disabled: true });
}
