CREATE TYPE "membership_role" AS ENUM ('OWNER', 'ADMIN', 'FINOPS_ANALYST', 'VIEWER');
CREATE TYPE "cloud_provider" AS ENUM ('AWS', 'AZURE', 'GCP');
CREATE TYPE "cloud_account_status" AS ENUM ('ACTIVE', 'PAUSED', 'ERROR');
CREATE TYPE "budget_period" AS ENUM ('MONTHLY', 'QUARTERLY', 'ANNUAL');
CREATE TYPE "recommendation_status" AS ENUM ('NEW', 'ACCEPTED', 'DISMISSED', 'IMPLEMENTED');

CREATE TABLE "organizations" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL, "slug" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

CREATE TABLE "users" (
  "id" TEXT NOT NULL, "email" TEXT NOT NULL, "name" TEXT, "password_hash" TEXT,
  "email_verified" TIMESTAMPTZ(6), "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL, CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

CREATE TABLE "memberships" (
  "id" TEXT NOT NULL, "organization_id" TEXT NOT NULL, "user_id" TEXT NOT NULL,
  "role" "membership_role" NOT NULL DEFAULT 'VIEWER',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "memberships_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "memberships_organization_id_user_id_key" ON "memberships"("organization_id", "user_id");
CREATE INDEX "memberships_user_id_idx" ON "memberships"("user_id");
CREATE INDEX "memberships_organization_id_role_idx" ON "memberships"("organization_id", "role");

CREATE TABLE "cloud_accounts" (
  "id" TEXT NOT NULL, "organization_id" TEXT NOT NULL, "provider" "cloud_provider" NOT NULL,
  "external_account_id" TEXT NOT NULL, "name" TEXT NOT NULL,
  "status" "cloud_account_status" NOT NULL DEFAULT 'ACTIVE', "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
  "last_synced_at" TIMESTAMPTZ(6), "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL, CONSTRAINT "cloud_accounts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cloud_accounts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "cloud_accounts_organization_id_id_key" ON "cloud_accounts"("organization_id", "id");
CREATE UNIQUE INDEX "cloud_accounts_org_provider_external_key" ON "cloud_accounts"("organization_id", "provider", "external_account_id");
CREATE INDEX "cloud_accounts_org_provider_status_idx" ON "cloud_accounts"("organization_id", "provider", "status");

CREATE TABLE "cost_records" (
  "id" TEXT NOT NULL, "organization_id" TEXT NOT NULL, "cloud_account_id" TEXT NOT NULL,
  "external_id" TEXT, "service" TEXT NOT NULL, "region" TEXT, "usage_type" TEXT, "resource_id" TEXT,
  "amount" DECIMAL(20,8) NOT NULL, "currency" VARCHAR(3) NOT NULL, "usage_date" DATE NOT NULL,
  "tags" JSONB NOT NULL DEFAULT '{}'::jsonb, "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cost_records_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cost_records_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "cost_records_org_cloud_account_fkey" FOREIGN KEY ("organization_id", "cloud_account_id") REFERENCES "cloud_accounts"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "cost_records_cloud_account_id_external_id_key" ON "cost_records"("cloud_account_id", "external_id");
CREATE INDEX "cost_records_organization_id_usage_date_idx" ON "cost_records"("organization_id", "usage_date");
CREATE INDEX "cost_records_organization_id_service_usage_date_idx" ON "cost_records"("organization_id", "service", "usage_date");
CREATE INDEX "cost_records_cloud_account_id_usage_date_idx" ON "cost_records"("cloud_account_id", "usage_date");

CREATE TABLE "budgets" (
  "id" TEXT NOT NULL, "organization_id" TEXT NOT NULL, "name" TEXT NOT NULL,
  "amount" DECIMAL(20,8) NOT NULL, "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
  "period" "budget_period" NOT NULL DEFAULT 'MONTHLY', "starts_at" DATE NOT NULL, "ends_at" DATE NOT NULL,
  "alert_thresholds" INTEGER[] NOT NULL DEFAULT ARRAY[50,80,100], "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "budgets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "budgets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "budgets_valid_date_range_check" CHECK ("ends_at" >= "starts_at"),
  CONSTRAINT "budgets_positive_amount_check" CHECK ("amount" > 0)
);
CREATE INDEX "budgets_organization_id_is_active_starts_at_ends_at_idx" ON "budgets"("organization_id", "is_active", "starts_at", "ends_at");

CREATE TABLE "audit_logs" (
  "id" TEXT NOT NULL, "organization_id" TEXT NOT NULL, "actor_user_id" TEXT,
  "action" TEXT NOT NULL, "entity_type" TEXT NOT NULL, "entity_id" TEXT, "metadata" JSONB, "ip_address" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "audit_logs_organization_id_created_at_idx" ON "audit_logs"("organization_id", "created_at");
CREATE INDEX "audit_logs_organization_id_entity_type_entity_id_idx" ON "audit_logs"("organization_id", "entity_type", "entity_id");
CREATE INDEX "audit_logs_actor_user_id_created_at_idx" ON "audit_logs"("actor_user_id", "created_at");

CREATE TABLE "recommendations" (
  "id" TEXT NOT NULL, "organization_id" TEXT NOT NULL, "title" TEXT NOT NULL, "description" TEXT NOT NULL,
  "provider" "cloud_provider", "estimated_monthly_savings" DECIMAL(20,8) NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'USD', "confidence" INTEGER NOT NULL,
  "status" "recommendation_status" NOT NULL DEFAULT 'NEW', "evidence" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "recommendations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "recommendations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "recommendations_confidence_check" CHECK ("confidence" BETWEEN 0 AND 100),
  CONSTRAINT "recommendations_savings_nonnegative_check" CHECK ("estimated_monthly_savings" >= 0)
);
CREATE INDEX "recommendations_organization_id_status_created_at_idx" ON "recommendations"("organization_id", "status", "created_at");

-- Defense in depth: every tenant query must set this value inside its transaction.
-- Runtime DB role must not be a superuser and must not have BYPASSRLS.
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organizations" FORCE ROW LEVEL SECURITY;
CREATE POLICY "organizations_tenant_policy" ON "organizations"
  USING ("id" = current_setting('app.current_org_id', true))
  WITH CHECK ("id" = current_setting('app.current_org_id', true));
ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "memberships" FORCE ROW LEVEL SECURITY;
CREATE POLICY "memberships_tenant_policy" ON "memberships"
  USING ("organization_id" = current_setting('app.current_org_id', true))
  WITH CHECK ("organization_id" = current_setting('app.current_org_id', true));
ALTER TABLE "cloud_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cloud_accounts" FORCE ROW LEVEL SECURITY;
CREATE POLICY "cloud_accounts_tenant_policy" ON "cloud_accounts"
  USING ("organization_id" = current_setting('app.current_org_id', true))
  WITH CHECK ("organization_id" = current_setting('app.current_org_id', true));
ALTER TABLE "cost_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cost_records" FORCE ROW LEVEL SECURITY;
CREATE POLICY "cost_records_tenant_policy" ON "cost_records"
  USING ("organization_id" = current_setting('app.current_org_id', true))
  WITH CHECK ("organization_id" = current_setting('app.current_org_id', true));
ALTER TABLE "budgets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "budgets" FORCE ROW LEVEL SECURITY;
CREATE POLICY "budgets_tenant_policy" ON "budgets"
  USING ("organization_id" = current_setting('app.current_org_id', true))
  WITH CHECK ("organization_id" = current_setting('app.current_org_id', true));
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;
CREATE POLICY "audit_logs_tenant_policy" ON "audit_logs"
  USING ("organization_id" = current_setting('app.current_org_id', true))
  WITH CHECK ("organization_id" = current_setting('app.current_org_id', true));
ALTER TABLE "recommendations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "recommendations" FORCE ROW LEVEL SECURITY;
CREATE POLICY "recommendations_tenant_policy" ON "recommendations"
  USING ("organization_id" = current_setting('app.current_org_id', true))
  WITH CHECK ("organization_id" = current_setting('app.current_org_id', true));
