CREATE TABLE "business_metrics" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "metric_name" VARCHAR(100) NOT NULL,
  "unit" VARCHAR(40) NOT NULL,
  "value" DECIMAL(20,4) NOT NULL,
  "metric_date" DATE NOT NULL,
  "source" VARCHAR(40) NOT NULL DEFAULT 'MANUAL',
  "notes" VARCHAR(500),
  "created_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "business_metrics_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "business_metrics_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "business_metrics_nonnegative_value_check" CHECK ("value" >= 0)
);
CREATE INDEX "business_metrics_org_date_idx" ON "business_metrics"("organization_id", "metric_date");
CREATE INDEX "business_metrics_org_name_date_idx" ON "business_metrics"("organization_id", "metric_name", "metric_date");
ALTER TABLE "business_metrics" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "business_metrics" FORCE ROW LEVEL SECURITY;
CREATE POLICY "business_metrics_tenant_policy" ON "business_metrics"
  USING ("organization_id" = current_setting('app.current_org_id', true))
  WITH CHECK ("organization_id" = current_setting('app.current_org_id', true));
