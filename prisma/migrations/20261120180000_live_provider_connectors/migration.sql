-- Permit system-originated provider sync batches without impersonating a human uploader.
ALTER TABLE "import_batches" ALTER COLUMN "uploaded_by_user_id" DROP NOT NULL;
ALTER TABLE "import_batches" DROP CONSTRAINT "import_batches_uploaded_by_user_id_fkey";
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_uploaded_by_user_id_fkey"
  FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "cloud_sync_jobs"
  ADD COLUMN "total_rows" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "imported_rows" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "rejected_rows" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "duplicate_rows" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "cloud_sync_jobs" ADD CONSTRAINT "cloud_sync_jobs_counts_check"
  CHECK ("total_rows" >= 0 AND "imported_rows" >= 0 AND "rejected_rows" >= 0 AND "duplicate_rows" >= 0);
