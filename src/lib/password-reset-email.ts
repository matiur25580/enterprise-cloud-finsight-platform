import "server-only";

import { isEmailDeliveryConfigured } from "@/lib/email-verification";

export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  const baseUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;

  if (!isEmailDeliveryConfigured() || !apiKey || !from || !baseUrl) {
    throw new Error("Password reset email delivery is not configured");
  }

  const appUrl = new URL(baseUrl);
  if (process.env.NODE_ENV === "production" && appUrl.protocol !== "https:") {
    throw new Error("Production password reset requires an HTTPS application URL");
  }

  const resetUrl = new URL("/reset-password", appUrl);
  resetUrl.searchParams.set("token", token);
  const link = resetUrl.toString();
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "Reset your FinSight password",
      html: `<p>We received a request to reset your FinSight password.</p><p><a href="${link}">Choose a new password</a></p><p>This one-time link expires in 30 minutes. If you did not request this, you can ignore this email; your password will remain unchanged.</p>`,
      text: `Reset your FinSight password within 30 minutes: ${link} If you did not request this, you can ignore this email.`
    }),
    signal: AbortSignal.timeout(10_000)
  });

  if (!response.ok) {
    throw new Error(`Email provider rejected password reset delivery (HTTP ${response.status})`);
  }
}
