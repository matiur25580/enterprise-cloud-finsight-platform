import "server-only";

import { prisma } from "@/lib/prisma";
import { decryptTotpSecret, getMatchingTotpTimeStep, hashRecoveryCode } from "@/lib/mfa-crypto";

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
          { mfaLastUsedTimeStep: { lt: matchedTimeStep } }
        ]
      },
      data: { mfaLastUsedTimeStep: matchedTimeStep }
    });
    return consumed.count === 1;
  }

  if (!/^[A-Fa-f0-9- ]{16,24}$/.test(candidate)) return false;
  const codeHash = hashRecoveryCode(candidate);
  const result = await prisma.mfaRecoveryCode.updateMany({
    where: { userId, codeHash, usedAt: null },
    data: { usedAt: new Date() }
  });
  return result.count === 1;
}
