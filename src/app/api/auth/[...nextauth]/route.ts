import { handlers } from "@/auth";
import { getClientAddress, consumeLoginRateLimit } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";

export const GET = handlers.GET;

export async function POST(request: NextRequest) {
  const pathname = new URL(request.url).pathname;
  if (pathname !== "/api/auth/callback/credentials") {
    return handlers.POST(request);
  }

  const clientAddress = getClientAddress(request);
  if (!clientAddress) {
    return NextResponse.json(
      { error: "Login protection could not verify the client network address. Please try again later." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const decision = await consumeLoginRateLimit(clientAddress);
    if (!decision.allowed) {
      const retryAfter = Math.max(1, Math.ceil((decision.resetAt.getTime() - Date.now()) / 1000));
      return NextResponse.json(
        { error: "Too many login attempts. Please wait before trying again." },
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

    return handlers.POST(request);
  } catch {
    // Fail closed: credential authentication is unavailable if its abuse-control
    // store cannot be reached. Never log the client address or credentials.
    return NextResponse.json(
      { error: "Login is temporarily unavailable. Please try again shortly." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
