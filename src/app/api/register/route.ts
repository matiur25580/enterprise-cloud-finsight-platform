import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { consumeRegistrationRateLimit, getClientAddress } from "@/lib/rate-limit";
import { readLimitedJson } from "@/lib/request-body";
import { createEmailVerificationToken, isEmailDeliveryConfigured, sendEmailVerification } from "@/lib/email-verification";

export const runtime = "nodejs";

const registrationSchema = z.object({
  name: z.string().trim().min(2).max(100),
  organizationName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(128)
});

export async function POST(request: Request) {
  const clientAddress = getClientAddress(request);
  if (!clientAddress) {
    return NextResponse.json(
      { error: "Registration protection could not verify the client network address. Please try again later." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const decision = await consumeRegistrationRateLimit(clientAddress);
    if (!decision.allowed) {
      const retryAfter = Math.max(1, Math.ceil((decision.resetAt.getTime() - Date.now()) / 1000));
      return NextResponse.json(
        { error: "Too many account creation attempts. Please wait before trying again." },
        {
          status: 429,
          headers: {
            "Cache-Control": "no-store",
            "Retry-After": String(retryAfter),
            "X-RateLimit-Limit": String(decision.limit),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(Math.ceil(decision.resetAt.getTime() / 1000))
          }
        }
      );
    }
  } catch {
    // Fail closed: public account creation must not bypass its abuse-control store.
    return NextResponse.json(
      { error: "Registration is temporarily unavailable. Please try again shortly." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
  const body = await readLimitedJson(request);
  if (!body.ok) {
    return NextResponse.json(
      { error: body.reason === "too_large" ? "Request body is too large." : "Invalid JSON request." },
      { status: body.reason === "too_large" ? 413 : 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const parsed = registrationSchema.safeParse(body.value);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please provide a valid name, organization, email, and a password of at least 12 characters." },
      { status: 400 }
    );
  }

  const { name, organizationName, email, password } = parsed.data;
  if (!isEmailDeliveryConfigured()) {
    return NextResponse.json(
      { error: "Email verification is not configured. Please contact the workspace administrator." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
  const normalizedEmail = email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail }, select: { id: true } });
  if (existing) {
    return NextResponse.json({ error: "Unable to create this account. Check the details or sign in." }, { status: 409 });
  }

  const passwordHash = await hash(password, 12);
  const organizationId = randomUUID();
  const userId = randomUUID();
  const slugBase = organizationName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "workspace";
  const slug = slugBase + "-" + organizationId.slice(0, 8);
  const verification = createEmailVerificationToken();

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('app.current_org_id', ${organizationId}, true)`;
      await tx.$queryRaw`SELECT set_config('app.current_user_id', ${userId}, true)`;

      await tx.user.create({
        data: { id: userId, name, email: normalizedEmail, passwordHash }
      });
      await tx.organization.create({
        data: { id: organizationId, name: organizationName, slug }
      });
      await tx.membership.create({
        data: { organizationId, userId, role: "OWNER" }
      });
      await tx.emailVerificationToken.create({
        data: { tokenHash: verification.tokenHash, userId, expiresAt: verification.expiresAt }
      });
    });
  } catch {
    return NextResponse.json({ error: "Unable to create this account. Check the details or try again." }, { status: 409 });
  }

  try {
    await sendEmailVerification(normalizedEmail, verification.token);
    return NextResponse.json({ created: true, verificationEmailSent: true }, { status: 201 });
  } catch {
    // Keep the account unverified; the user can request a fresh email.
    return NextResponse.json(
      { created: true, verificationEmailSent: false, message: "Your account was created, but the verification email could not be delivered. Request a new email to continue." },
      { status: 201, headers: { "Cache-Control": "no-store" } }
    );
  }
}
