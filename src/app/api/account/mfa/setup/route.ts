import { NextResponse } from "next/server";
import { z } from "zod";
import { compare } from "bcryptjs";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createTotpSecret, createTotpUri, encryptTotpSecret } from "@/lib/mfa";
import { readLimitedJson } from "@/lib/request-body";
import { enforceMfaRateLimit } from "@/lib/mfa-rate-limit";

export const runtime = "nodejs";
const schema = z.object({ password: z.string().min(8).max(128) });

export async function POST(request: Request) {
  const limited = await enforceMfaRateLimit(request);
  if (limited) return limited;

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const body = await readLimitedJson(request, 1024);
  if (!body.ok) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const parsed = schema.safeParse(body.value);
  if (!parsed.success) return NextResponse.json({ error: "Enter your current password." }, { status: 400 });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, passwordHash: true, mfaEnabledAt: true }
  });
  if (!user?.passwordHash || !(await compare(parsed.data.password, user.passwordHash))) {
    return NextResponse.json({ error: "Current password is incorrect." }, { status: 403 });
  }
  if (user.mfaEnabledAt) return NextResponse.json({ error: "MFA is already enabled." }, { status: 409 });

  const secret = createTotpSecret();
  const encrypted = encryptTotpSecret(secret);
  await prisma.user.update({
    where: { id: userId },
    data: { mfaSecretEncrypted: encrypted }
  });

  return NextResponse.json({
    secret,
    otpauthUri: createTotpUri(secret, user.email),
    message: "Add this account to an authenticator app, then confirm with its six-digit code."
  }, { headers: { "Cache-Control": "no-store" } });
}
