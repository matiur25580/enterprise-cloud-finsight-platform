import test from "node:test";
import assert from "node:assert/strict";
import { createPasswordResetToken, hashPasswordResetToken } from "./password-reset-token";

test("password reset tokens are random, hashed and expire after 30 minutes", () => {
  const now = new Date("2026-11-20T12:00:00.000Z");
  const first = createPasswordResetToken(now);
  const second = createPasswordResetToken(now);

  assert.match(first.token, /^[a-f0-9]{64}$/);
  assert.match(first.tokenHash, /^[a-f0-9]{64}$/);
  assert.equal(first.tokenHash, hashPasswordResetToken(first.token));
  assert.notEqual(first.token, second.token);
  assert.notEqual(first.tokenHash, first.token);
  assert.equal(first.expiresAt.getTime() - now.getTime(), 30 * 60 * 1000);
});
