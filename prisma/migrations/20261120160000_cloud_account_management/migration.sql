ALTER TABLE "cloud_accounts"
  ADD COLUMN "credential_ref" VARCHAR(500),
  ADD COLUMN "last_sync_attempt_at" TIMESTAMPTZ(6);

-- credential_ref is a pointer to an external secret manager resource, never a secret value.
-- Existing accounts remain valid and can be configured without provider credentials.
