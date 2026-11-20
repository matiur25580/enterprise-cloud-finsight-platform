CREATE TABLE "security_incidents" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "source_event_id" TEXT,
  "title" VARCHAR(180) NOT NULL,
  "description" VARCHAR(2000) NOT NULL,
  "severity" VARCHAR(16) NOT NULL DEFAULT 'MEDIUM',
  "status" VARCHAR(20) NOT NULL DEFAULT 'OPEN',
  "created_by_user_id" TEXT NOT NULL,
  "updated_by_user_id" TEXT NOT NULL,
  "acknowledged_at" TIMESTAMPTZ(6),
  "resolved_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "security_incidents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "security_incidents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "security_incidents_severity_check" CHECK ("severity" IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  CONSTRAINT "security_incidents_status_check" CHECK ("status" IN ('OPEN','ACKNOWLEDGED','RESOLVED','FALSE_POSITIVE')),
  CONSTRAINT "security_incidents_title_check" CHECK (length(trim("title")) > 0),
  CONSTRAINT "security_incidents_source_event_id_check" CHECK ("source_event_id" IS NULL OR length("source_event_id") > 0)
);
CREATE UNIQUE INDEX "security_incidents_organization_id_source_event_id_key" ON "security_incidents"("organization_id","source_event_id");
CREATE INDEX "security_incidents_org_status_severity_created_idx" ON "security_incidents"("organization_id","status","severity","created_at" DESC);
ALTER TABLE "security_incidents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "security_incidents" FORCE ROW LEVEL SECURITY;
CREATE POLICY "security_incidents_tenant_isolation" ON "security_incidents"
  USING ("organization_id" = current_setting('app.current_org_id', true))
  WITH CHECK ("organization_id" = current_setting('app.current_org_id', true));
