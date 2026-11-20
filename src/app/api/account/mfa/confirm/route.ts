import { NextResponse } from "next/server";
import { z } from "zod";
import { compare } from "bcryptjs";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createRecoveryCodes, decryptTotpSecret, getMatchingTotpTimeStep, hashRecoveryCode } from "@/lib/mfa";
import { readLimitedJson } from "@/lib/request-body";
import { enforceMfaRateLimit, enforceMfaAccountRateLimit } from "@/lib/mfa-rate-limit";

export const runtime = "nodejs";
const schema = z.object({
  password: z.string().min(8).max(128),
  code: z.string().trim().regex(/^\d{6}$/)
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
  if (!parsed.success) return NextResponse.json({ error: "Enter your password and six-digit authenticator code." }, { status: 400 });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true, mfaSecretEncrypted: true, mfaEnabledAt: true }
  });
  if (!user?.passwordHash || !(await compare(parsed.data.password, user.passwordHash))) {
    return NextResponse.json({ error: "Current password is incorrect." }, { status: 403 });
  }
  if (user.mfaEnabledAt) return NextResponse.json({ error: "MFA is already enabled." }, { status: 409 });
  if (!user.mfaSecretEncrypted) return NextResponse.json({ error: "Start MFA setup first." }, { status: 409 });

  let matchedTimeStep: number | null = null;
  try {
    matchedTimeStep = getMatchingTotpTimeStep(decryptTotpSecret(user.mfaSecretEncrypted), parsed.data.code);
  } catch {
    matchedTimeStep = null;
  }
  if (matchedTimeStep === null) return NextResponse.json({ error: "Authenticator code is incorrect or expired." }, { status: 400 });

  const codes = createRecoveryCodes();
  const now = new Date();
  try {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.user.updateMany({
        where: { id: userId, mfaEnabledAt: null, mfaSecretEncrypted: user.mfaSecretEncrypted, mfaLastUsedTimeStep: null },
        data: { mfaEnabledAt: now, mfaLastUsedTimeStep: BigInt(matchedTimeStep) }
      });
      if (updated.count !== 1) throw new Error("MFA setup changed concurrently");
      await tx.mfaRecoveryCode.deleteMany({ where: { userId } });
      await tx.mfaRecoveryCode.createMany({
        data: codes.map((codeHash) => ({ userId, codeHash: hashRecoveryCode(codeHash) }))
      });
    });
  } catch {
    return NextResponse.json({ error: "Unable to enable MFA. Please restart setup." }, { status: 409 });
  }

  return NextResponse.json({
    enabled: true,
    recoveryCodes: codes,
    message: "MFA is enabled. Save these recovery codes now; they will not be shown again."
  }, { headers: { "Cache-Control": "no-store" } });
}
