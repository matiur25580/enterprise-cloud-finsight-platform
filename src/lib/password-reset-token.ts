import { createHash, randomBytes } from "node:crypto";

const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;

export function createPasswordResetToken(now = new Date()) {
  const token = randomBytes(32).toString("hex");
  return {
    token,
    tokenHash: hashPasswordResetToken(token),
    expiresAt: new Date(now.getTime() + PASSWORD_RESET_TTL_MS)
  };
}

export function hashPasswordResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
