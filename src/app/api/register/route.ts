import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const registrationSchema = z.object({
  name: z.string().trim().min(2).max(100),
  organizationName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(128)
});

export async function POST(request: Request) {
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
