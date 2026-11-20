import "server-only";

import { prisma } from "@/lib/prisma";
import { decryptTotpSecret, getMatchingTotpTimeStep, hashRecoveryCode, normalizeRecoveryCode } from "@/lib/mfa-crypto";

export {
  createTotpSecret,
  encryptTotpSecret,
  decryptTotpSecret,
  verifyTotp,
  getMatchingTotpTimeStep,
  createRecoveryCodes,
  hashRecoveryCode,
  createTotpUri
} from "@/lib/mfa-crypto";

export async function verifyAndConsumeMfaFactor(
  userId: string,
  encryptedSecret: string,
  candidate: string
): Promise<boolean> {
  let secret: string;
  try {
    secret = decryptTotpSecret(encryptedSecret);
  } catch {
    return false;
  }
  const matchedTimeStep = getMatchingTotpTimeStep(secret, candidate);
  if (matchedTimeStep !== null) {
    const consumed = await prisma.user.updateMany({
      where: {
        id: userId,
        OR: [
          { mfaLastUsedTimeStep: null },
          { mfaLastUsedTimeStep: { lt: BigInt(matchedTimeStep) } }
        ]
      },
      data: { mfaLastUsedTimeStep: BigInt(matchedTimeStep) }
    });
    return consumed.count === 1;
  }

  if (!normalizeRecoveryCode(candidate)) return false;
  const codeHash = hashRecoveryCode(candidate);
  const result = await prisma.mfaRecoveryCode.updateMany({
    where: { userId, codeHash, usedAt: null },
    data: { usedAt: new Date() }
  });
  return result.count === 1;
}
