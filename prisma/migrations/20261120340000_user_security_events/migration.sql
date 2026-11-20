CREATE TABLE "user_security_events" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "event_type" VARCHAR(64) NOT NULL,
  "outcome" VARCHAR(16) NOT NULL,
  "reason" VARCHAR(64),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_security_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "user_security_events_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "user_security_events_outcome_check" CHECK ("outcome" IN ('SUCCESS', 'FAILURE')),
  CONSTRAINT "user_security_events_type_check" CHECK ("event_type" IN ('MFA_SETUP', 'MFA_ENABLE', 'MFA_DISABLE', 'MFA_RECOVERY_CODES')),
  CONSTRAINT "user_security_events_reason_check" CHECK ("reason" IS NULL OR "reason" IN ('PASSWORD_REJECTED', 'ALREADY_ENABLED', 'NOT_CONFIGURED', 'INVALID_FACTOR', 'INVALID_TOTP', 'CONCURRENT_CHANGE'))
);
CREATE INDEX "user_security_events_user_id_created_at_idx"
  ON "user_security_events" ("user_id", "created_at" DESC);
CREATE INDEX "user_security_events_event_type_created_at_idx"
  ON "user_security_events" ("event_type", "created_at" DESC);
