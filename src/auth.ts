import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { verifyAndConsumeMfaFactor } from "@/lib/mfa";

const credentialsSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(128),
  code: z.string().trim().max(24).optional()
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        code: { label: "Authenticator or recovery code", type: "text" }
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const email = parsed.data.email.toLowerCase();
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user?.passwordHash || !user.emailVerified) return null;

        const valid = await compare(parsed.data.password, user.passwordHash);
        if (!valid) return null;
        if (user.mfaEnabledAt) {
          if (!user.mfaSecretEncrypted || !parsed.data.code) return null;
          const factorValid = await verifyAndConsumeMfaFactor(user.id, user.mfaSecretEncrypted, parsed.data.code);
          if (!factorValid) return null;
        }

        return { id: user.id, email: user.email, name: user.name, sessionVersion: user.sessionVersion };
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        token.userId = user.id;
        token.sessionVersion = typeof user.sessionVersion === "number" ? user.sessionVersion : 0;
        delete token.invalidated;
        return token;
      }

      if (typeof token.userId === "string" && !token.invalidated) {
        const current = await prisma.user.findUnique({
          where: { id: token.userId },
          select: { sessionVersion: true }
        });
        const issuedVersion = typeof token.sessionVersion === "number" ? token.sessionVersion : 0;
        if (!current || current.sessionVersion !== issuedVersion) {
          delete token.userId;
          token.invalidated = true;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && typeof token.userId === "string" && !token.invalidated) {
        session.user.id = token.userId;
      }
      return session;
    }
  }
});
