import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashEmailVerificationToken } from "@/lib/email-verification";

export const runtime = "nodejs";

const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/i);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = tokenSchema.safeParse(url.searchParams.get("token") ?? "");
  const destination = new URL("/login", request.url);

  if (!parsed.success) {
    destination.searchParams.set("verification", "invalid");
    return NextResponse.redirect(destination);
  }

  const tokenHash = hashEmailVerificationToken(parsed.data);
  const now = new Date();

  try {
    const token = await prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
      select: { userId: true, expiresAt: true }
    });
    if (!token || token.expiresAt <= now) {
      if (token) {
        await prisma.emailVerificationToken.deleteMany({ where: { tokenHash } });
      }
      destination.searchParams.set("verification", "expired");
      return NextResponse.redirect(destination);
    }

    const verified = await prisma.$transaction(async (tx) => {
      const consumed = await tx.emailVerificationToken.deleteMany({
        where: { tokenHash, expiresAt: { gt: now } }
      });
      if (consumed.count !== 1) return false;

      await tx.user.update({
        where: { id: token.userId },
        data: { emailVerified: now }
      });
      await tx.emailVerificationToken.deleteMany({ where: { userId: token.userId } });
      return true;
    });

    destination.searchParams.set("verification", verified ? "success" : "expired");
    return NextResponse.redirect(destination);
  } catch {
    destination.searchParams.set("verification", "unavailable");
    return NextResponse.redirect(destination);
  }
}
