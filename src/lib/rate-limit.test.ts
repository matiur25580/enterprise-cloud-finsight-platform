import test from "node:test";
import assert from "node:assert/strict";
import { getRateLimitDecision } from "./rate-limit";

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
