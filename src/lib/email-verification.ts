import "server-only";

import { createHash, randomBytes } from "node:crypto";

const TOKEN_TTL_MS = 30 * 60 * 1000;

export function createEmailVerificationToken() {
  const token = randomBytes(32).toString("hex");
  return {
    token,
    tokenHash: createHash("sha256").update(token).digest("hex"),
    expiresAt: new Date(Date.now() + TOKEN_TTL_MS)
  };
}

export function hashEmailVerificationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function isEmailDeliveryConfigured(environment: NodeJS.ProcessEnv = process.env): boolean {
  const baseUrl = environment.APP_URL || environment.NEXT_PUBLIC_APP_URL;
  if (!environment.RESEND_API_KEY || !environment.EMAIL_FROM || !baseUrl ||
      environment.EMAIL_FROM.includes("your-verified-domain.example")) return false;
  try {
    const url = new URL(baseUrl);
    return environment.NODE_ENV !== "production" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export async function sendEmailVerification(to: string, token: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  const baseUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;

  if (!apiKey || !from || !baseUrl) {
    throw new Error("Email verification delivery is not configured");
  }

  const appUrl = new URL(baseUrl);
  if (process.env.NODE_ENV === "production" && appUrl.protocol !== "https:") {
    throw new Error("Production email verification requires an HTTPS application URL");
  }

  const verificationUrl = new URL("/api/auth/verify-email", appUrl);
  verificationUrl.searchParams.set("token", token);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "Verify your FinSight email address",
      html: `<p>Welcome to FinSight.</p><p>Verify your email address to activate your account:</p><p><a href="${verificationUrl.toString()}">Verify email address</a></p><p>This link expires in 30 minutes. If you did not create this account, you can ignore this email.</p>`,
      text: `Welcome to FinSight. Verify your email address within 30 minutes: ${verificationUrl.toString()} If you did not create this account, you can ignore this email.`
    }),
    signal: AbortSignal.timeout(10_000)
  });

  if (!response.ok) {
    // Do not expose provider responses or secrets to callers.
    throw new Error(`Email provider rejected verification delivery (HTTP ${response.status})`);
  }
}
