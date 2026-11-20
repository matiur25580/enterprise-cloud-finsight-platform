import { prisma } from "@/lib/prisma";

export type MfaSecurityEventType = "MFA_SETUP" | "MFA_ENABLE" | "MFA_DISABLE" | "MFA_RECOVERY_CODES";
export type MfaSecurityEventOutcome = "SUCCESS" | "FAILURE";
export type MfaSecurityEventReason =
  | "PASSWORD_REJECTED"
  | "ALREADY_ENABLED"
  | "NOT_CONFIGURED"
  | "INVALID_FACTOR"
  | "INVALID_TOTP"
  | "CONCURRENT_CHANGE";

/**
 * Persist an account-level MFA audit event without recording passwords,
 * authenticator values, recovery codes, secrets, IP addresses, or request bodies.
 * Audit persistence is best-effort and must never change the authentication result.
 */
export async function recordMfaSecurityEvent(
  userId: string,
  eventType: MfaSecurityEventType,
  outcome: MfaSecurityEventOutcome,
  reason?: MfaSecurityEventReason
): Promise<void> {
  try {
    await prisma.userSecurityEvent.create({
      data: { userId, eventType, outcome, reason: outcome === "FAILURE" ? reason : null }
    });
  } catch {
    // Keep the security operation available; emit a static diagnostic without user data.
    console.error("Unable to persist MFA security audit event.");
  }
}
