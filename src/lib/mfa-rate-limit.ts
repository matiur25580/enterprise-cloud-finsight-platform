import { NextResponse } from "next/server";
import type { RateLimitDecision } from "@/lib/rate-limit";
import { consumeLoginRateLimit, getClientAddress } from "@/lib/rate-limit";

/** Converts an MFA quota decision into the shared HTTP response contract. */
export function getMfaRateLimitResponse(decision: RateLimitDecision): Response | null {
  if (decision.allowed) return null;
  const retryAfter = Math.max(1, Math.ceil((decision.resetAt.getTime() - Date.now()) / 1000));
  return NextResponse.json(
    { error: "Too many account security attempts. Please wait before trying again." },
    { status: 429, headers: { "Retry-After": String(retryAfter), "Cache-Control": "no-store" } }
  );
}

function unavailableResponse(): Response {
  return NextResponse.json(
    { error: "Account security service is temporarily unavailable." },
    { status: 503, headers: { "Cache-Control": "no-store" } }
  );
}

export async function enforceMfaRateLimit(request: Request): Promise<Response | null> {
  const address = getClientAddress(request);
  if (!address) return unavailableResponse();
  try {
    return getMfaRateLimitResponse(await consumeLoginRateLimit(address, "mfa"));
  } catch {
    return unavailableResponse();
  }
}

/** Adds a per-account quota so rotating client IPs cannot bypass MFA throttling. */
export async function enforceMfaAccountRateLimit(userId: string): Promise<Response | null> {
  try {
    return getMfaRateLimitResponse(await consumeLoginRateLimit(`account:${userId}`, "mfa"));
  } catch {
    return unavailableResponse();
  }
}
