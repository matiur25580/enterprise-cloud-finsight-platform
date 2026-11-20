ALTER TABLE "users"
  ADD COLUMN "mfa_secret_encrypted" TEXT,
  ADD COLUMN "mfa_enabled_at" TIMESTAMPTZ(6);

CREATE TABLE "mfa_recovery_codes" (
  "code_hash" CHAR(64) NOT NULL,
  "user_id" TEXT NOT NULL,
  "used_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mfa_recovery_codes_pkey" PRIMARY KEY ("code_hash"),
  CONSTRAINT "mfa_recovery_codes_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "mfa_recovery_codes_user_id_used_at_idx"
  ON "mfa_recovery_codes"("user_id", "used_at");
