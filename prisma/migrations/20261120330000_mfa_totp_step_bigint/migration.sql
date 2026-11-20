ALTER TABLE "users"
  ALTER COLUMN "mfa_last_used_time_step" TYPE BIGINT
  USING "mfa_last_used_time_step"::BIGINT;
