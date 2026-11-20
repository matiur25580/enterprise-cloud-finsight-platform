import assert from "node:assert/strict";
import testCase from "node:test";
import { getMfaRateLimitResponse } from "@/lib/mfa-rate-limit";

testCase("MFA quota allows requests while capacity remains", () => {
  assert.equal(getMfaRateLimitResponse({
    allowed: true, limit: 10, remaining: 1, resetAt: new Date(Date.now() + 60_000)
  }), null);
});

testCase("MFA quota returns a no-store 429 with a positive Retry-After", async () => {
  const response = getMfaRateLimitResponse({
    allowed: false, limit: 10, remaining: 0, resetAt: new Date(Date.now() + 30_000)
  });
  assert.ok(response);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.ok(Number(response.headers.get("Retry-After")) > 0);
  const body = await response.json() as { error: string };
  assert.match(body.error, /account security attempts/i);
});

testCase("MFA quota never emits a zero or negative Retry-After", () => {
  const response = getMfaRateLimitResponse({
    allowed: false, limit: 10, remaining: 0, resetAt: new Date(Date.now() - 5_000)
  });
  assert.ok(response);
  assert.equal(response.headers.get("Retry-After"), "1");
});
