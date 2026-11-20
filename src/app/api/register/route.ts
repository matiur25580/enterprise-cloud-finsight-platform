import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { consumeRegistrationRateLimit, getClientAddress } from "@/lib/rate-limit";

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
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON request." }, { status: 400 });
  }

  const parsed = registrationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please provide a valid name, organization, email, and a password of at least 12 characters." },
      { status: 400 }
    );
  }

  const { name, organizationName, email, password } = parsed.data;
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
    });
  } catch {
    return NextResponse.json({ error: "Unable to create this account. Check the details or try again." }, { status: 409 });
  }

  return NextResponse.json({ created: true }, { status: 201 });
}
