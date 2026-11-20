CREATE TABLE "organization_invitations" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "email" VARCHAR(254) NOT NULL,
  "role" "membership_role" NOT NULL DEFAULT 'VIEWER',
  "token_hash" VARCHAR(64) NOT NULL,
  "invited_by_user_id" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "accepted_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "organization_invitations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "organization_invitations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "organization_invitations_invited_by_user_id_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "organization_invitations_token_hash_key" ON "organization_invitations"("token_hash");
CREATE INDEX "organization_invitations_org_created_at_idx" ON "organization_invitations"("organization_id", "created_at" DESC);
CREATE INDEX "organization_invitations_email_expires_at_idx" ON "organization_invitations"("email", "expires_at");
ALTER TABLE "organization_invitations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organization_invitations" FORCE ROW LEVEL SECURITY;
CREATE POLICY "organization_invitations_tenant_policy" ON "organization_invitations"
  USING (
    "organization_id" = current_setting('app.current_org_id', true)
    OR EXISTS (
      SELECT 1 FROM "users" u
      WHERE u."id" = current_setting('app.current_user_id', true)
        AND lower(u."email") = lower("organization_invitations"."email")
    )
  )
  WITH CHECK ("organization_id" = current_setting('app.current_org_id', true));
