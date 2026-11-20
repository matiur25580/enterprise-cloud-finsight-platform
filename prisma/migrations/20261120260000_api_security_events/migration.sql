CREATE TABLE "api_security_events" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "route_bucket" VARCHAR(100) NOT NULL,
  "request_count" INTEGER NOT NULL,
  "request_limit" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "api_security_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "api_security_events_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "api_security_events_counts_check" CHECK ("request_count" > "request_limit" AND "request_limit" > 0)
);
CREATE INDEX "api_security_events_organization_id_created_at_idx"
  ON "api_security_events" ("organization_id", "created_at" DESC);
CREATE INDEX "api_security_events_organization_id_route_bucket_created_at_idx"
  ON "api_security_events" ("organization_id", "route_bucket", "created_at" DESC);
ALTER TABLE "api_security_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "api_security_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY "api_security_events_tenant_policy" ON "api_security_events"
  USING ("organization_id" = current_setting('app.current_org_id', true))
  WITH CHECK ("organization_id" = current_setting('app.current_org_id', true));
