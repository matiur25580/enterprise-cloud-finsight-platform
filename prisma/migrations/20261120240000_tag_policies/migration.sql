CREATE TABLE "tag_policies" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "tag_key" VARCHAR(120) NOT NULL,
  "display_name" VARCHAR(100) NOT NULL,
  "is_required" BOOLEAN NOT NULL DEFAULT true,
  "allowed_values" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "tag_policies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tag_policies_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "tag_policies_key_check" CHECK ("tag_key" ~ '^[A-Za-z][A-Za-z0-9_.:/-]{0,119}$')
);
CREATE UNIQUE INDEX "tag_policies_organization_id_tag_key_key" ON "tag_policies"("organization_id", "tag_key");
CREATE INDEX "tag_policies_organization_id_is_active_created_at_idx" ON "tag_policies"("organization_id", "is_active", "created_at");
ALTER TABLE "tag_policies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tag_policies" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tag_policies_tenant_policy" ON "tag_policies"
  USING ("organization_id" = current_setting('app.current_org_id', true))
  WITH CHECK ("organization_id" = current_setting('app.current_org_id', true));
