import { NextResponse } from "next/server";
import { z } from "zod";
import { compare } from "bcryptjs";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { verifyAndConsumeMfaFactor } from "@/lib/mfa";
import { readLimitedJson } from "@/lib/request-body";
import { enforceMfaRateLimit, enforceMfaAccountRateLimit } from "@/lib/mfa-rate-limit";
import { recordMfaSecurityEvent } from "@/lib/mfa-security-audit";

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
    await recordMfaSecurityEvent(userId, "MFA_DISABLE", "FAILURE", "PASSWORD_REJECTED");
    return NextResponse.json({ error: "Current password is incorrect." }, { status: 403 });
  }
  if (!user.mfaEnabledAt || !user.mfaSecretEncrypted) {
    await recordMfaSecurityEvent(userId, "MFA_DISABLE", "FAILURE", "NOT_CONFIGURED");
    return NextResponse.json({ error: "MFA is not enabled." }, { status: 409 });
  }
  const valid = await verifyAndConsumeMfaFactor(userId, user.mfaSecretEncrypted, parsed.data.code);
  if (!valid) {
    await recordMfaSecurityEvent(userId, "MFA_DISABLE", "FAILURE", "INVALID_FACTOR");
    return NextResponse.json({ error: "Authenticator or recovery code is incorrect." }, { status: 403 });
  }

  const disabled = await prisma.$transaction(async (tx) => {
    // Compare-and-set against the exact MFA configuration that was verified above.
    // A concurrent re-enrollment must never be cleared by this stale disable request.
    const updated = await tx.user.updateMany({
      where: {
        id: userId,
        mfaEnabledAt: user.mfaEnabledAt,
        mfaSecretEncrypted: user.mfaSecretEncrypted
      },
      data: { mfaEnabledAt: null, mfaSecretEncrypted: null, mfaLastUsedTimeStep: null }
    });
    if (updated.count !== 1) return false;

    await tx.mfaRecoveryCode.deleteMany({ where: { userId } });
    return true;
  });

  if (!disabled) {
    await recordMfaSecurityEvent(userId, "MFA_DISABLE", "FAILURE", "CONCURRENT_CHANGE");
    return NextResponse.json({ error: "MFA settings changed. Refresh and try again." }, { status: 409 });
  }
  await recordMfaSecurityEvent(userId, "MFA_DISABLE", "SUCCESS");
  return NextResponse.json({ disabled: true });
}
