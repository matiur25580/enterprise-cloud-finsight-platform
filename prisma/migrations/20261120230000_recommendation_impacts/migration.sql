CREATE UNIQUE INDEX "recommendations_organization_id_id_key" ON "recommendations"("organization_id", "id");

CREATE TABLE "recommendation_impacts" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "recommendation_id" TEXT NOT NULL,
  "currency" VARCHAR(3) NOT NULL,
  "scope" VARCHAR(160) NOT NULL,
  "baseline_starts_at" DATE NOT NULL,
  "baseline_ends_at" DATE NOT NULL,
  "observed_starts_at" DATE NOT NULL,
  "observed_ends_at" DATE NOT NULL,
  "period_days" INTEGER NOT NULL,
  "baseline_spend" DECIMAL(20,8) NOT NULL,
  "observed_spend" DECIMAL(20,8) NOT NULL,
  "realized_savings" DECIMAL(20,8) NOT NULL,
  "baseline_records" INTEGER NOT NULL,
  "observed_records" INTEGER NOT NULL,
  "recorded_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "recommendation_impacts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "recommendation_impacts_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "recommendation_impacts_recommendation_fkey"
    FOREIGN KEY ("organization_id", "recommendation_id")
    REFERENCES "recommendations"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "recommendation_impacts_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "recommendation_impacts_period_check" CHECK (
    "period_days" > 0 AND "baseline_ends_at" >= "baseline_starts_at"
    AND "observed_ends_at" >= "observed_starts_at"
    AND "baseline_ends_at" < "observed_starts_at"
  ),
  CONSTRAINT "recommendation_impacts_spend_check" CHECK (
    "baseline_spend" >= 0 AND "observed_spend" >= 0
    AND "baseline_records" >= 0 AND "observed_records" >= 0
  )
);
CREATE UNIQUE INDEX "recommendation_impacts_period_key" ON "recommendation_impacts"(
  "recommendation_id", "baseline_starts_at", "baseline_ends_at", "observed_starts_at", "observed_ends_at"
);
CREATE INDEX "recommendation_impacts_org_recommendation_created_idx" ON "recommendation_impacts"(
  "organization_id", "recommendation_id", "created_at" DESC
);
ALTER TABLE "recommendation_impacts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "recommendation_impacts" FORCE ROW LEVEL SECURITY;
CREATE POLICY "recommendation_impacts_tenant_policy" ON "recommendation_impacts"
  USING ("organization_id" = current_setting('app.current_org_id', true))
  WITH CHECK ("organization_id" = current_setting('app.current_org_id', true));
