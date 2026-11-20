CREATE TYPE "import_status" AS ENUM ('PROCESSING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED');

CREATE TABLE "import_batches" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "cloud_account_id" TEXT NOT NULL,
  "uploaded_by_user_id" TEXT NOT NULL,
  "file_name" VARCHAR(255) NOT NULL,
  "status" "import_status" NOT NULL DEFAULT 'PROCESSING',
  "total_rows" INTEGER NOT NULL DEFAULT 0,
  "imported_rows" INTEGER NOT NULL DEFAULT 0,
  "rejected_rows" INTEGER NOT NULL DEFAULT 0,
  "duplicate_rows" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMPTZ(6),
  CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "import_batches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "import_batches_org_cloud_account_fkey" FOREIGN KEY ("organization_id", "cloud_account_id") REFERENCES "cloud_accounts"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "import_batches_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "import_batches_counts_check" CHECK ("total_rows" >= 0 AND "imported_rows" >= 0 AND "rejected_rows" >= 0 AND "duplicate_rows" >= 0)
);
CREATE INDEX "import_batches_org_created_at_idx" ON "import_batches"("organization_id", "created_at" DESC);
CREATE INDEX "import_batches_org_status_idx" ON "import_batches"("organization_id", "status");

CREATE TABLE "import_issues" (
  "id" TEXT NOT NULL,
  "import_batch_id" TEXT NOT NULL,
  "row_number" INTEGER NOT NULL,
  "error_code" VARCHAR(80) NOT NULL,
  "message" VARCHAR(1000) NOT NULL,
  CONSTRAINT "import_issues_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "import_issues_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "import_issues_batch_row_key" ON "import_issues"("import_batch_id", "row_number");

ALTER TABLE "cost_records" ADD COLUMN "fingerprint" TEXT;
ALTER TABLE "cost_records" ADD COLUMN "import_batch_id" TEXT;
ALTER TABLE "cost_records" ADD COLUMN "source_row_number" INTEGER;
UPDATE "cost_records" SET "fingerprint" = md5("id") WHERE "fingerprint" IS NULL;
ALTER TABLE "cost_records" ALTER COLUMN "fingerprint" SET NOT NULL;
CREATE UNIQUE INDEX "cost_records_cloud_account_id_fingerprint_key" ON "cost_records"("cloud_account_id", "fingerprint");
CREATE INDEX "cost_records_import_batch_id_idx" ON "cost_records"("import_batch_id");
ALTER TABLE "cost_records" ADD CONSTRAINT "cost_records_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "import_batches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "import_batches" FORCE ROW LEVEL SECURITY;
CREATE POLICY "import_batches_tenant_policy" ON "import_batches"
  USING ("organization_id" = current_setting('app.current_org_id', true))
  WITH CHECK ("organization_id" = current_setting('app.current_org_id', true));

ALTER TABLE "import_issues" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "import_issues" FORCE ROW LEVEL SECURITY;
CREATE POLICY "import_issues_tenant_policy" ON "import_issues"
  USING (EXISTS (
    SELECT 1 FROM "import_batches" b
    WHERE b."id" = "import_issues"."import_batch_id"
      AND b."organization_id" = current_setting('app.current_org_id', true)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "import_batches" b
    WHERE b."id" = "import_issues"."import_batch_id"
      AND b."organization_id" = current_setting('app.current_org_id', true)
  ));
