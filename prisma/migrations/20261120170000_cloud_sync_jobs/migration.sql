CREATE TYPE "cloud_sync_job_status" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'BLOCKED');
CREATE TYPE "cloud_sync_trigger" AS ENUM ('MANUAL', 'SCHEDULED');

ALTER TABLE "cloud_accounts"
  ADD COLUMN "sync_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "sync_interval_minutes" INTEGER NOT NULL DEFAULT 1440,
  ADD COLUMN "next_sync_at" TIMESTAMPTZ(6),
  ADD CONSTRAINT "cloud_accounts_sync_interval_check" CHECK ("sync_interval_minutes" BETWEEN 15 AND 10080);

CREATE TABLE "cloud_sync_jobs" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "cloud_account_id" TEXT NOT NULL,
  "status" "cloud_sync_job_status" NOT NULL DEFAULT 'QUEUED',
  "trigger" "cloud_sync_trigger" NOT NULL DEFAULT 'MANUAL',
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER NOT NULL DEFAULT 3,
  "available_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "started_at" TIMESTAMPTZ(6),
  "completed_at" TIMESTAMPTZ(6),
  "error_code" VARCHAR(100),
  "error_message" VARCHAR(1000),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "cloud_sync_jobs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cloud_sync_jobs_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "cloud_sync_jobs_org_cloud_account_fkey" FOREIGN KEY ("organization_id", "cloud_account_id") REFERENCES "cloud_accounts"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "cloud_sync_jobs_attempts_check" CHECK ("attempt_count" >= 0 AND "max_attempts" BETWEEN 1 AND 10)
);
CREATE INDEX "cloud_sync_jobs_status_available_created_idx" ON "cloud_sync_jobs"("status", "available_at", "created_at");
CREATE INDEX "cloud_sync_jobs_org_account_created_idx" ON "cloud_sync_jobs"("organization_id", "cloud_account_id", "created_at" DESC);
CREATE INDEX "cloud_accounts_sync_due_idx" ON "cloud_accounts"("sync_enabled", "next_sync_at") WHERE "sync_enabled" = true;

ALTER TABLE "cloud_sync_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cloud_sync_jobs" FORCE ROW LEVEL SECURITY;
CREATE POLICY "cloud_sync_jobs_tenant_policy" ON "cloud_sync_jobs"
  USING ("organization_id" = current_setting('app.current_org_id', true))
  WITH CHECK ("organization_id" = current_setting('app.current_org_id', true));
