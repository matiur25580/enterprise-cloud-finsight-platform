import { NextResponse } from "next/server";
import { consumeLoginRateLimit, getClientAddress } from "@/lib/rate-limit";

export async function enforceMfaRateLimit(request: Request): Promise<Response | null> {
  const address = getClientAddress(request);
  if (!address) {
    return NextResponse.json(
      { error: "Account security service is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const decision = await consumeLoginRateLimit(address, "mfa");
    if (decision.allowed) return null;
    const retryAfter = Math.max(1, Math.ceil((decision.resetAt.getTime() - Date.now()) / 1000));
    return NextResponse.json(
      { error: "Too many account security attempts. Please wait before trying again." },
      { status: 429, headers: { "Retry-After": String(retryAfter), "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json(
      { error: "Account security service is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
