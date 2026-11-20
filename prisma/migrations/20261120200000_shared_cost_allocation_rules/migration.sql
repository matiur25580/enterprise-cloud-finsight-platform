CREATE TYPE "shared_cost_allocation_method" AS ENUM ('EQUAL', 'WEIGHTED');

CREATE TABLE "shared_cost_allocation_rules" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "service_pattern" VARCHAR(160) NOT NULL,
  "source_tag_key" VARCHAR(120) NOT NULL,
  "source_tag_value" VARCHAR(160) NOT NULL,
  "target_dimension" VARCHAR(32) NOT NULL,
  "method" "shared_cost_allocation_method" NOT NULL DEFAULT 'EQUAL',
  "recipients" JSONB NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "shared_cost_allocation_rules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "shared_cost_allocation_rules_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "shared_cost_allocation_rules_org_active_created_idx"
  ON "shared_cost_allocation_rules"("organization_id", "is_active", "created_at" DESC);
ALTER TABLE "shared_cost_allocation_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "shared_cost_allocation_rules" FORCE ROW LEVEL SECURITY;
CREATE POLICY "shared_cost_allocation_rules_tenant_policy"
  ON "shared_cost_allocation_rules"
  USING ("organization_id" = current_setting('app.current_org_id', true))
  WITH CHECK ("organization_id" = current_setting('app.current_org_id', true));

CREATE TABLE "shared_cost_allocation_runs" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "rule_id" TEXT NOT NULL,
  "starts_at" DATE NOT NULL,
  "ends_at" DATE NOT NULL,
  "matched_records" INTEGER NOT NULL DEFAULT 0,
  "source_totals" JSONB NOT NULL,
  "allocations" JSONB NOT NULL,
  "created_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "shared_cost_allocation_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "shared_cost_allocation_runs_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "shared_cost_allocation_runs_rule_id_fkey"
    FOREIGN KEY ("rule_id") REFERENCES "shared_cost_allocation_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "shared_cost_allocation_runs_org_created_idx"
  ON "shared_cost_allocation_runs"("organization_id", "created_at" DESC);
CREATE INDEX "shared_cost_allocation_runs_org_rule_created_idx"
  ON "shared_cost_allocation_runs"("organization_id", "rule_id", "created_at" DESC);
ALTER TABLE "shared_cost_allocation_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "shared_cost_allocation_runs" FORCE ROW LEVEL SECURITY;
CREATE POLICY "shared_cost_allocation_runs_tenant_policy"
  ON "shared_cost_allocation_runs"
  USING ("organization_id" = current_setting('app.current_org_id', true))
  WITH CHECK ("organization_id" = current_setting('app.current_org_id', true));

CREATE UNIQUE INDEX "shared_cost_allocation_rules_active_match_key"
  ON "shared_cost_allocation_rules"("organization_id", LOWER("service_pattern"), "source_tag_key", "source_tag_value")
  WHERE "is_active" = true;
