import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { consumeRegistrationRateLimit, getClientAddress } from "@/lib/rate-limit";
import { readLimitedJson } from "@/lib/request-body";
import { createEmailVerificationToken, isEmailDeliveryConfigured, sendEmailVerification } from "@/lib/email-verification";

export const runtime = "nodejs";

const emailSchema = z.object({ email: z.string().trim().email().max(254) });
const genericResponse = () => NextResponse.json(
  { sent: true, message: "If the account needs verification, an email will be sent shortly." },
  { headers: { "Cache-Control": "no-store" } }
);

export async function POST(request: Request) {
  const address = getClientAddress(request);
  if (!address) {
    return NextResponse.json({ error: "Verification email service is temporarily unavailable." }, { status: 503 });
  }

  try {
    const quota = await consumeRegistrationRateLimit(address, "resend-verification");
    if (!quota.allowed) {
      const retryAfter = Math.max(1, Math.ceil((quota.resetAt.getTime() - Date.now()) / 1000));
      return NextResponse.json(
        { error: "Too many requests. Please wait before trying again." },
        { status: 429, headers: { "Retry-After": String(retryAfter), "Cache-Control": "no-store" } }
      );
    }
  } catch {
    return NextResponse.json({ error: "Verification email service is temporarily unavailable." }, { status: 503 });
  }

  const body = await readLimitedJson(request, 1024);
  if (!body.ok) {
    return NextResponse.json({ error: "Please provide a valid email address." }, { status: 400 });
  }
  const parsed = emailSchema.safeParse(body.value);
  if (!parsed.success) {
    return NextResponse.json({ error: "Please provide a valid email address." }, { status: 400 });
  }
  if (!isEmailDeliveryConfigured()) {
    return NextResponse.json({ error: "Email verification delivery is not configured." }, { status: 503 });
  }

  const email = parsed.data.email.toLowerCase();
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, emailVerified: true }
    });
    if (!user || user.emailVerified) return genericResponse();

    const verification = createEmailVerificationToken();
    await prisma.$transaction(async (tx) => {
      await tx.emailVerificationToken.deleteMany({ where: { userId: user.id } });
      await tx.emailVerificationToken.create({
        data: { tokenHash: verification.tokenHash, userId: user.id, expiresAt: verification.expiresAt }
      });
    });

    try {
      await sendEmailVerification(email, verification.token);
    } catch {
      // Keep the same response for known and unknown accounts.
    }
    return genericResponse();
  } catch {
    return NextResponse.json({ error: "Verification email service is temporarily unavailable." }, { status: 503 });
  }
}
