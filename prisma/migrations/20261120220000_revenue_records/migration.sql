CREATE TABLE "revenue_records" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "amount" DECIMAL(20,8) NOT NULL,
  "currency" VARCHAR(3) NOT NULL,
  "revenue_date" DATE NOT NULL,
  "source" VARCHAR(40) NOT NULL DEFAULT 'MANUAL',
  "notes" VARCHAR(500),
  "created_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "revenue_records_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "revenue_records_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "revenue_records_amount_nonnegative_check" CHECK ("amount" >= 0),
  CONSTRAINT "revenue_records_currency_format_check" CHECK ("currency" ~ '^[A-Z]{3}$')
);
CREATE INDEX "revenue_records_org_date_idx" ON "revenue_records"("organization_id", "revenue_date");
CREATE INDEX "revenue_records_org_currency_date_idx" ON "revenue_records"("organization_id", "currency", "revenue_date");
ALTER TABLE "revenue_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "revenue_records" FORCE ROW LEVEL SECURITY;
CREATE POLICY "revenue_records_tenant_policy" ON "revenue_records"
  USING ("organization_id" = current_setting('app.current_org_id', true))
  WITH CHECK ("organization_id" = current_setting('app.current_org_id', true));
