import assert from "node:assert/strict";
import testCase from "node:test";
import {
  createRecoveryCodes,
  createTotpSecret,
  decryptTotpSecret,
  encryptTotpSecret,
  hashRecoveryCode,
  normalizeRecoveryCode,
  consumeRecoveryCode,
  getMatchingTotpTimeStep,
  verifyTotp
} from "@/lib/mfa-crypto";

process.env.AUTH_SECRET = "finsight-test-secret-that-is-long-enough-for-mfa-unit-tests";

testCase("TOTP verifies RFC 6238 SHA-1 six-digit test vector", () => {
  assert.equal(verifyTotp("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", "287082", 59_000), true);
  assert.equal(verifyTotp("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", "287083", 59_000), false);
  assert.equal(verifyTotp("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", "12345", 59_000), false);
  assert.equal(getMatchingTotpTimeStep("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", "287082", 59_000), 1);
  assert.equal(getMatchingTotpTimeStep("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", "123456", 59_000), null);
  assert.equal(getMatchingTotpTimeStep("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", "287082", 89_000), 1);
  assert.equal(getMatchingTotpTimeStep("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", "287082", 119_000), null);
});

testCase("TOTP secrets are random and AES-GCM encrypted at rest", () => {
  const secret = createTotpSecret();
  assert.equal(secret.length, 32);
  const encrypted = encryptTotpSecret(secret);
  assert.notEqual(encrypted, secret);
  assert.equal(decryptTotpSecret(encrypted), secret);
  assert.notEqual(encryptTotpSecret(secret), encrypted);
  const [version, iv, tag, ciphertext] = encrypted.split(".");
  const changedCiphertext = (ciphertext[0] === "A" ? "B" : "A") + ciphertext.slice(1);
  assert.throws(() => decryptTotpSecret([version, iv, tag, changedCiphertext].join(".")));
});

testCase("recovery codes are unique, formatted and hashed consistently", () => {
  const codes = createRecoveryCodes();
  assert.equal(codes.length, 10);
  assert.equal(new Set(codes).size, 10);
  for (const code of codes) {
    assert.match(code, /^[A-F0-9]{4}(?:-[A-F0-9]{4}){3}$/);
    assert.equal(hashRecoveryCode(code), hashRecoveryCode(code.replace(/-/g, "")));
    assert.equal(hashRecoveryCode(code).length, 64);
    assert.equal(normalizeRecoveryCode(code), code.replace(/-/g, ""));
    assert.equal(normalizeRecoveryCode(code.replace(/-/g, " ")), code.replace(/-/g, ""));
  }
  assert.equal(normalizeRecoveryCode("ABCD-EFGH-IJKL-MNOP"), null);
  assert.equal(normalizeRecoveryCode("ABC!-1234-5678-9ABC"), null);
  assert.equal(normalizeRecoveryCode("ABCD-1234-5678"), null);
  assert.throws(() => hashRecoveryCode("ABCD!123456789ABC"));
});


testCase("recovery code consumption is single-use under concurrent attempts", async () => {
  const code = "A1B2-C3D4-E5F6-7890";
  const storedHash = hashRecoveryCode(code);
  let used = false;
  const atomicConsume = async (candidateHash: string): Promise<number> => {
    if (candidateHash !== storedHash || used) return 0;
    used = true;
    return 1;
  };

  const results = await Promise.all([
    consumeRecoveryCode(code, atomicConsume),
    consumeRecoveryCode(code.toLowerCase().replace(/-/g, " "), atomicConsume)
  ]);
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(used, true);
});

testCase("invalid recovery codes never reach the persistence consumer", async () => {
  let calls = 0;
  const result = await consumeRecoveryCode("ABCD!123456789ABC", async () => {
    calls += 1;
    return 1;
  });
  assert.equal(result, false);
  assert.equal(calls, 0);
});
