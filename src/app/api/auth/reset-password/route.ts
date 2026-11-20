import { hash } from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { consumeRegistrationRateLimit, getClientAddress } from "@/lib/rate-limit";
import { readLimitedJson } from "@/lib/request-body";
import { hashPasswordResetToken } from "@/lib/password-reset-token";

export const runtime = "nodejs";

const schema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/i),
  password: z.string().min(12).max(128)
});

export async function POST(request: Request) {
  const address = getClientAddress(request);
  if (!address) {
    return NextResponse.json({ error: "Password reset is temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const quota = await consumeRegistrationRateLimit(address, "reset-password");
    if (!quota.allowed) {
      const retryAfter = Math.max(1, Math.ceil((quota.resetAt.getTime() - Date.now()) / 1000));
      return NextResponse.json(
        { error: "Too many requests. Please wait before trying again." },
        { status: 429, headers: { "Retry-After": String(retryAfter), "Cache-Control": "no-store" } }
      );
    }
  } catch {
    return NextResponse.json({ error: "Password reset is temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  const body = await readLimitedJson(request, 2048);
  if (!body.ok) return NextResponse.json({ error: "Invalid password reset request." }, { status: 400 });
  const parsed = schema.safeParse(body.value);
  if (!parsed.success) {
    return NextResponse.json({ error: "Use a valid reset link and a password with at least 12 characters." }, { status: 400 });
  }

  const tokenHash = hashPasswordResetToken(parsed.data.token);
  const now = new Date();
  try {
    const token = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      select: { userId: true, expiresAt: true }
    });
    if (!token || token.expiresAt <= now) {
      if (token) await prisma.passwordResetToken.deleteMany({ where: { tokenHash } });
      return NextResponse.json({ error: "This password reset link is invalid or expired. Request a new one." }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }

    const passwordHash = await hash(parsed.data.password, 12);
    const consumed = await prisma.$transaction(async (tx) => {
      const result = await tx.passwordResetToken.deleteMany({
        where: { tokenHash, expiresAt: { gt: now } }
      });
      if (result.count !== 1) return false;
      await tx.user.update({ where: { id: token.userId }, data: { passwordHash, sessionVersion: { increment: 1 } } });
      await tx.passwordResetToken.deleteMany({ where: { userId: token.userId } });
      return true;
    });

    if (!consumed) {
      return NextResponse.json({ error: "This password reset link is invalid or expired. Request a new one." }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    // MFA settings and recovery codes are deliberately preserved: email recovery does not bypass MFA.
    return NextResponse.json({ reset: true, message: "Your password has been updated. You can now sign in." }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Password reset is temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
