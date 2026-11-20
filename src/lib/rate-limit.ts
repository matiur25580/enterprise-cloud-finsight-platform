import { createHmac } from "node:crypto";
import { prisma } from "@/lib/prisma";

const LOGIN_WINDOW_SECONDS = 15 * 60;
const LOGIN_MAX_ATTEMPTS = 10;
const DEVELOPMENT_RATE_LIMIT_KEY = "finsight-development-rate-limit-key";

export function getRateLimitSecret(environment: NodeJS.ProcessEnv = process.env): string {
  const configuredSecret = environment.AUTH_SECRET ?? environment.NEXTAUTH_SECRET;
  if (!configuredSecret) {
    if (environment.NODE_ENV === "production") {
      throw new Error("A strong AUTH_SECRET is required for production login rate limiting");
    }
    return DEVELOPMENT_RATE_LIMIT_KEY;
  }
  if (configuredSecret.length < 32) {
    throw new Error("AUTH_SECRET must contain at least 32 characters for rate limiting");
  }
  return configuredSecret;
}

export type RateLimitDecision = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
};

export function getRateLimitDecision(
  requestCount: number,
  limit: number,
  windowStartedAt: Date,
  windowSeconds: number
): RateLimitDecision {
  const resetAt = new Date(windowStartedAt.getTime() + windowSeconds * 1000);
  return {
    allowed: requestCount <= limit,
    limit,
    remaining: Math.max(0, limit - requestCount),
    resetAt
  };
}

/**
 * Uses a keyed digest so raw client addresses are never persisted.
 * The reverse proxy must overwrite forwarded-address headers.
 */
export async function consumeLoginRateLimit(
  clientAddress: string,
  action: "credentials" | "mfa" = "credentials"
): Promise<RateLimitDecision> {
  const secret = getRateLimitSecret();
  const keyHash = createHmac("sha256", secret)
    .update(`login:${action}:${clientAddress}`)
    .digest("hex");

  const rows = await prisma.$queryRaw<
    Array<{ request_count: number; window_started_at: Date }>
  >`
    WITH expired AS (
      DELETE FROM "api_rate_limit_buckets"
      WHERE "key_hash" IN (
        SELECT "key_hash"
        FROM "api_rate_limit_buckets"
        WHERE "expires_at" <= CURRENT_TIMESTAMP
        ORDER BY "expires_at"
        LIMIT 50
      )
      RETURNING 1
    ),
    cleanup AS (
      SELECT COUNT(*) FROM expired
    )
    INSERT INTO "api_rate_limit_buckets"
      ("key_hash", "window_started_at", "request_count", "expires_at")
    SELECT
      ${keyHash},
      CURRENT_TIMESTAMP,
      1,
      CURRENT_TIMESTAMP + (${LOGIN_WINDOW_SECONDS} * INTERVAL '1 second')
    FROM cleanup
    ON CONFLICT ("key_hash") DO UPDATE SET
      "request_count" = CASE
        WHEN "api_rate_limit_buckets"."window_started_at"
          <= CURRENT_TIMESTAMP - (${LOGIN_WINDOW_SECONDS} * INTERVAL '1 second')
        THEN 1
        ELSE "api_rate_limit_buckets"."request_count" + 1
      END,
      "window_started_at" = CASE
        WHEN "api_rate_limit_buckets"."window_started_at"
          <= CURRENT_TIMESTAMP - (${LOGIN_WINDOW_SECONDS} * INTERVAL '1 second')
        THEN CURRENT_TIMESTAMP
        ELSE "api_rate_limit_buckets"."window_started_at"
      END,
      "expires_at" = CASE
        WHEN "api_rate_limit_buckets"."window_started_at"
          <= CURRENT_TIMESTAMP - (${LOGIN_WINDOW_SECONDS} * INTERVAL '1 second')
        THEN CURRENT_TIMESTAMP + (${LOGIN_WINDOW_SECONDS} * INTERVAL '1 second')
        ELSE "api_rate_limit_buckets"."expires_at"
      END
    RETURNING "request_count", "window_started_at"
  `;

  const row = rows[0];
  if (!row) throw new Error("Rate limit storage did not return a counter");
  return getRateLimitDecision(
    Number(row.request_count),
    LOGIN_MAX_ATTEMPTS,
    row.window_started_at,
    LOGIN_WINDOW_SECONDS
  );
}

/**
 * Applies the same bounded login quota to a normalized account identifier.
 * The email address is used only as HMAC input; only the keyed digest is stored.
 */
export function normalizeLoginIdentifier(email: string): string {
  return email.trim().toLowerCase();
}

export async function consumeLoginAccountRateLimit(email: string): Promise<RateLimitDecision> {
  const normalized = normalizeLoginIdentifier(email);
  if (!normalized || normalized.length > 254) {
    throw new Error("Invalid login account identifier");
  }
  return consumeLoginRateLimit(`account:${normalized}`, "credentials");
}

export function getClientAddress(request: Request): string | null {
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  const forwardedFor = request.headers.get("x-forwarded-for");
  const firstForwardedAddress = forwardedFor?.split(",")[0]?.trim();
  if (firstForwardedAddress) return firstForwardedAddress;

  return process.env.NODE_ENV === "production" ? null : "127.0.0.1";
}


export async function consumeApiRateLimit(input: {
  organizationId: string;
  userId: string;
  bucket: string;
  limit: number;
  windowSeconds: number;
}): Promise<RateLimitDecision> {
  if (!/^[a-z0-9:_-]{1,100}$/i.test(input.bucket) ||
      !Number.isInteger(input.limit) || input.limit < 1 ||
      !Number.isInteger(input.windowSeconds) || input.windowSeconds < 1) {
    throw new Error("Invalid API rate limit configuration");
  }

  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("A strong AUTH_SECRET is required for API rate limiting");
  }
  const keyHash = createHmac("sha256", secret)
    .update(`api:${input.organizationId}:${input.userId}:${input.bucket}`)
    .digest("hex");

  const rows = await prisma.$queryRaw<
    Array<{ request_count: number; window_started_at: Date }>
  >`
    WITH expired AS (
      DELETE FROM "api_rate_limit_buckets"
      WHERE "key_hash" IN (
        SELECT "key_hash" FROM "api_rate_limit_buckets"
        WHERE "expires_at" <= CURRENT_TIMESTAMP
        ORDER BY "expires_at" LIMIT 50
      )
      RETURNING 1
    ),
    cleanup AS (SELECT COUNT(*) FROM expired)
    INSERT INTO "api_rate_limit_buckets"
      ("key_hash", "window_started_at", "request_count", "expires_at")
    SELECT ${keyHash}, CURRENT_TIMESTAMP, 1,
      CURRENT_TIMESTAMP + (${input.windowSeconds} * INTERVAL '1 second')
    FROM cleanup
    ON CONFLICT ("key_hash") DO UPDATE SET
      "request_count" = CASE
        WHEN "api_rate_limit_buckets"."window_started_at"
          <= CURRENT_TIMESTAMP - (${input.windowSeconds} * INTERVAL '1 second')
        THEN 1 ELSE "api_rate_limit_buckets"."request_count" + 1 END,
      "window_started_at" = CASE
        WHEN "api_rate_limit_buckets"."window_started_at"
          <= CURRENT_TIMESTAMP - (${input.windowSeconds} * INTERVAL '1 second')
        THEN CURRENT_TIMESTAMP ELSE "api_rate_limit_buckets"."window_started_at" END,
      "expires_at" = CASE
        WHEN "api_rate_limit_buckets"."window_started_at"
          <= CURRENT_TIMESTAMP - (${input.windowSeconds} * INTERVAL '1 second')
        THEN CURRENT_TIMESTAMP + (${input.windowSeconds} * INTERVAL '1 second')
        ELSE "api_rate_limit_buckets"."expires_at" END
    RETURNING "request_count", "window_started_at"
  `;

  const row = rows[0];
  if (!row) throw new Error("Rate limit storage did not return a counter");
  const decision = getRateLimitDecision(
    Number(row.request_count), input.limit, row.window_started_at, input.windowSeconds
  );

  if (!decision.allowed && Number(row.request_count) === input.limit + 1) {
    const { withOrganization } = await import("@/lib/tenant-context");
    await withOrganization(prisma, input.organizationId, (tx) =>
      tx.apiSecurityEvent.create({
        data: {
          organizationId: input.organizationId,
          routeBucket: input.bucket,
          requestCount: Number(row.request_count),
          requestLimit: input.limit
        }
      })
    );
    console.warn(JSON.stringify({
      event: "api_rate_limit_exceeded",
      organizationId: input.organizationId,
      routeBucket: input.bucket,
      requestCount: Number(row.request_count),
      requestLimit: input.limit,
      occurredAt: new Date().toISOString()
    }));
  }

  return decision;
}


export function rateLimitResponse(decision: RateLimitDecision): Response | null {
  if (decision.allowed) return null;
  const retryAfter = Math.max(1, Math.ceil((decision.resetAt.getTime() - Date.now()) / 1000));
  return Response.json(
    { error: "Rate limit exceeded. Please wait before retrying." },
    {
      status: 429,
      headers: {
        "Cache-Control": "private, no-store",
        "Retry-After": String(retryAfter),
        "X-RateLimit-Limit": String(decision.limit),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(Math.ceil(decision.resetAt.getTime() / 1000))
      }
    }
  );
}


const REGISTRATION_WINDOW_SECONDS = 60 * 60;
const REGISTRATION_MAX_ATTEMPTS = 5;

/** Apply a separate IP-based quota to public account creation. */
export async function consumeRegistrationRateLimit(
  clientAddress: string,
  action: "create-account" | "resend-verification" | "forgot-password" | "reset-password" = "create-account"
): Promise<RateLimitDecision> {
  const secret = getRateLimitSecret();
  const keyHash = createHmac("sha256", secret)
    .update(`registration:${action}:${clientAddress}`)
    .digest("hex");

  const rows = await prisma.$queryRaw<
    Array<{ request_count: number; window_started_at: Date }>
  >`
    WITH expired AS (
      DELETE FROM "api_rate_limit_buckets"
      WHERE "key_hash" IN (
        SELECT "key_hash" FROM "api_rate_limit_buckets"
        WHERE "expires_at" <= CURRENT_TIMESTAMP
        ORDER BY "expires_at" LIMIT 50
      )
      RETURNING 1
    ),
    cleanup AS (SELECT COUNT(*) FROM expired)
    INSERT INTO "api_rate_limit_buckets"
      ("key_hash", "window_started_at", "request_count", "expires_at")
    SELECT ${keyHash}, CURRENT_TIMESTAMP, 1,
      CURRENT_TIMESTAMP + (${REGISTRATION_WINDOW_SECONDS} * INTERVAL '1 second')
    FROM cleanup
    ON CONFLICT ("key_hash") DO UPDATE SET
      "request_count" = CASE
        WHEN "api_rate_limit_buckets"."window_started_at"
          <= CURRENT_TIMESTAMP - (${REGISTRATION_WINDOW_SECONDS} * INTERVAL '1 second')
        THEN 1 ELSE "api_rate_limit_buckets"."request_count" + 1 END,
      "window_started_at" = CASE
        WHEN "api_rate_limit_buckets"."window_started_at"
          <= CURRENT_TIMESTAMP - (${REGISTRATION_WINDOW_SECONDS} * INTERVAL '1 second')
        THEN CURRENT_TIMESTAMP ELSE "api_rate_limit_buckets"."window_started_at" END,
      "expires_at" = CASE
        WHEN "api_rate_limit_buckets"."window_started_at"
          <= CURRENT_TIMESTAMP - (${REGISTRATION_WINDOW_SECONDS} * INTERVAL '1 second')
        THEN CURRENT_TIMESTAMP + (${REGISTRATION_WINDOW_SECONDS} * INTERVAL '1 second')
        ELSE "api_rate_limit_buckets"."expires_at" END
    RETURNING "request_count", "window_started_at"
  `;

  const row = rows[0];
  if (!row) throw new Error("Registration rate limit storage did not return a counter");
  return getRateLimitDecision(
    Number(row.request_count),
    REGISTRATION_MAX_ATTEMPTS,
    row.window_started_at,
    REGISTRATION_WINDOW_SECONDS
  );
}
