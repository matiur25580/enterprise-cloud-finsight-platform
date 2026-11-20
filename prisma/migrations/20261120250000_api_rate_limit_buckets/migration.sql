CREATE TABLE "api_rate_limit_buckets" (
  "key_hash" CHAR(64) NOT NULL,
  "window_started_at" TIMESTAMPTZ(6) NOT NULL,
  "request_count" INTEGER NOT NULL DEFAULT 0,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "api_rate_limit_buckets_pkey" PRIMARY KEY ("key_hash"),
  CONSTRAINT "api_rate_limit_buckets_request_count_check" CHECK ("request_count" >= 0)
);
CREATE INDEX "api_rate_limit_buckets_expires_at_idx"
  ON "api_rate_limit_buckets" ("expires_at");
REVOKE ALL ON TABLE "api_rate_limit_buckets" FROM PUBLIC;
