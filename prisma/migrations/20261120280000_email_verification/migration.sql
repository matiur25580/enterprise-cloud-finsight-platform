-- Existing accounts predate mandatory verification; preserve their access.
UPDATE "users"
SET "email_verified" = "created_at"
WHERE "email_verified" IS NULL;

CREATE TABLE "email_verification_tokens" (
  "token_hash" CHAR(64) NOT NULL,
  "user_id" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("token_hash"),
  CONSTRAINT "email_verification_tokens_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "email_verification_tokens_user_id_expires_at_idx"
  ON "email_verification_tokens"("user_id", "expires_at");
CREATE INDEX "email_verification_tokens_expires_at_idx"
  ON "email_verification_tokens"("expires_at");
