import assert from "node:assert/strict";
import testCase from "node:test";
import { PrismaClient } from "@prisma/client";
import { hashRecoveryCode } from "../src/lib/mfa-crypto";

const prisma = new PrismaClient();

testCase("PostgreSQL enforces single-use recovery codes and protects concurrent MFA re-enrollment", { timeout: 30_000 }, async () => {
  const userId = `mfa-integration-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const originalEnabledAt = new Date("2026-01-01T00:00:00.000Z");
  const originalSecret = "integration-encrypted-secret-v1";
  const recoveryCode = "A1B2-C3D4-E5F6-7890";
  const recoveryCodeHash = hashRecoveryCode(recoveryCode);

  try {
    await prisma.user.create({
      data: {
        id: userId,
        email: `${userId}@example.invalid`,
        mfaEnabledAt: originalEnabledAt,
        mfaSecretEncrypted: originalSecret
      }
    });
    await prisma.mfaRecoveryCode.create({
      data: { userId, codeHash: recoveryCodeHash }
    });
    await prisma.userSecurityEvent.create({
      data: { userId, eventType: "MFA_ENABLE", outcome: "FAILURE", reason: "INVALID_TOTP" }
    });
    const auditEvent = await prisma.userSecurityEvent.findFirstOrThrow({
      where: { userId, eventType: "MFA_ENABLE" }
    });
    assert.equal(auditEvent.outcome, "FAILURE");
    assert.equal(auditEvent.reason, "INVALID_TOTP");
    assert.equal(JSON.stringify(auditEvent).includes(recoveryCode), false);

    const attempts = await Promise.all([
      prisma.mfaRecoveryCode.updateMany({
        where: { userId, codeHash: recoveryCodeHash, usedAt: null },
        data: { usedAt: new Date() }
      }),
      prisma.mfaRecoveryCode.updateMany({
        where: { userId, codeHash: recoveryCodeHash, usedAt: null },
        data: { usedAt: new Date() }
      })
    ]);

    assert.deepEqual(attempts.map((result) => result.count).sort(), [0, 1]);
    const consumed = await prisma.mfaRecoveryCode.findUniqueOrThrow({
      where: { codeHash: recoveryCodeHash }
    });
    assert.ok(consumed.usedAt);

    const nextEnabledAt = new Date("2026-02-01T00:00:00.000Z");
    await prisma.user.update({
      where: { id: userId },
      data: {
        mfaEnabledAt: nextEnabledAt,
        mfaSecretEncrypted: "integration-encrypted-secret-v2"
      }
    });
    const nextRecoveryHash = hashRecoveryCode("0A1B-2C3D-4E5F-6789");
    await prisma.mfaRecoveryCode.create({
      data: { userId, codeHash: nextRecoveryHash }
    });

    const staleDisable = await prisma.user.updateMany({
      where: {
        id: userId,
        mfaEnabledAt: originalEnabledAt,
        mfaSecretEncrypted: originalSecret
      },
      data: {
        mfaEnabledAt: null,
        mfaSecretEncrypted: null,
        mfaLastUsedTimeStep: null
      }
    });

    assert.equal(staleDisable.count, 0);
    const currentUser = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    assert.equal(currentUser.mfaEnabledAt?.toISOString(), nextEnabledAt.toISOString());
    assert.equal(currentUser.mfaSecretEncrypted, "integration-encrypted-secret-v2");
    const remainingRecoveryCode = await prisma.mfaRecoveryCode.findUniqueOrThrow({
      where: { codeHash: nextRecoveryHash }
    });
    assert.equal(remainingRecoveryCode.usedAt, null);
  } finally {
    await prisma.user.deleteMany({ where: { id: userId } });
  }
});

testCase("disconnect Prisma integration client", async () => {
  await prisma.$disconnect();
});
