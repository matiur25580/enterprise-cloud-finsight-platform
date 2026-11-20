import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { consumeRegistrationRateLimit, getClientAddress } from "@/lib/rate-limit";
import { readLimitedJson } from "@/lib/request-body";
import { createPasswordResetToken } from "@/lib/password-reset-token";
import { sendPasswordResetEmail } from "@/lib/password-reset-email";
import { isEmailDeliveryConfigured } from "@/lib/email-verification";

export const runtime = "nodejs";

const schema = z.object({ email: z.string().trim().email().max(254) });
const genericResponse = () => NextResponse.json(
  { sent: true, message: "If an account exists for that address, a password reset link will arrive shortly." },
  { headers: { "Cache-Control": "no-store" } }
);

export async function POST(request: Request) {
  const address = getClientAddress(request);
  if (!address) {
    return NextResponse.json({ error: "Password reset is temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const quota = await consumeRegistrationRateLimit(address, "forgot-password");
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

  const body = await readLimitedJson(request, 1024);
  if (!body.ok) return NextResponse.json({ error: "Please provide a valid email address." }, { status: 400 });
  const parsed = schema.safeParse(body.value);
  if (!parsed.success) return NextResponse.json({ error: "Please provide a valid email address." }, { status: 400 });
  if (!isEmailDeliveryConfigured()) {
    return NextResponse.json({ error: "Password reset email delivery is not configured." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const email = parsed.data.email.toLowerCase();
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, passwordHash: true }
    });
    if (!user?.passwordHash) return genericResponse();

    const reset = createPasswordResetToken();
    await prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.deleteMany({ where: { userId: user.id } });
      await tx.passwordResetToken.create({
        data: { tokenHash: reset.tokenHash, userId: user.id, expiresAt: reset.expiresAt }
      });
    });

    try {
      await sendPasswordResetEmail(user.email, reset.token);
    } catch {
      // Keep the same response for existing and unknown accounts.
    }
    return genericResponse();
  } catch {
    return NextResponse.json({ error: "Password reset is temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
