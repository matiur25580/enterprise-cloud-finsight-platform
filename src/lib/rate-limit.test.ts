import test from "node:test";
import assert from "node:assert/strict";
import { getRateLimitDecision, getRateLimitSecret, rateLimitResponse } from "./rate-limit";

test("allows requests up to the configured limit", () => {
  const startedAt = new Date("2026-11-20T10:00:00.000Z");
  const decision = getRateLimitDecision(10, 10, startedAt, 900);
  assert.equal(decision.allowed, true);
  assert.equal(decision.remaining, 0);
  assert.equal(decision.resetAt.toISOString(), "2026-11-20T10:15:00.000Z");
});

test("blocks requests beyond the limit and never reports negative remaining capacity", () => {
  const decision = getRateLimitDecision(11, 10, new Date("2026-11-20T10:00:00.000Z"), 900);
  assert.equal(decision.allowed, false);
  assert.equal(decision.remaining, 0);
});

test("calculates reset time from the fixed window start", () => {
  const startedAt = new Date("2026-11-20T10:04:30.000Z");
  const decision = getRateLimitDecision(3, 10, startedAt, 900);
  assert.equal(decision.allowed, true);
  assert.equal(decision.remaining, 7);
  assert.equal(decision.resetAt.toISOString(), "2026-11-20T10:19:30.000Z");
});


test("returns a retryable 429 response when a request exceeds its limit", async () => {
  const decision = getRateLimitDecision(6, 5, new Date("2026-11-20T10:00:00.000Z"), 900);
  const response = rateLimitResponse(decision);
  assert.ok(response);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("X-RateLimit-Limit"), "5");
  assert.equal(response.headers.get("X-RateLimit-Remaining"), "0");
  assert.ok(Number(response.headers.get("Retry-After")) > 0);
  const body = await response.json() as { error: string };
  assert.match(body.error, /rate limit/i);
});

test("does not create a response for requests inside the limit", () => {
  const decision = getRateLimitDecision(4, 5, new Date("2026-11-20T10:00:00.000Z"), 900);
  assert.equal(rateLimitResponse(decision), null);
});


test("requires a configured strong secret in production", () => {
  assert.throws(
    () => getRateLimitSecret({ NODE_ENV: "production" }),
    /strong AUTH_SECRET is required/
  );
});

test("rejects weak configured secrets instead of silently using them", () => {
  assert.throws(
    () => getRateLimitSecret({ NODE_ENV: "production", AUTH_SECRET: "too-short" }),
    /at least 32 characters/
  );
  assert.throws(
    () => getRateLimitSecret({ NODE_ENV: "development", NEXTAUTH_SECRET: "weak" }),
    /at least 32 characters/
  );
});

test("prefers AUTH_SECRET and supports NEXTAUTH_SECRET fallback", () => {
  const authSecret = "a".repeat(32);
  const nextAuthSecret = "b".repeat(32);
  assert.equal(getRateLimitSecret({ AUTH_SECRET: authSecret, NEXTAUTH_SECRET: nextAuthSecret }), authSecret);
  assert.equal(getRateLimitSecret({ NEXTAUTH_SECRET: nextAuthSecret }), nextAuthSecret);
});

test("uses a development-only fallback when no secret is configured", () => {
  assert.equal(
    getRateLimitSecret({ NODE_ENV: "development" }),
    "finsight-development-rate-limit-key"
  );
});
