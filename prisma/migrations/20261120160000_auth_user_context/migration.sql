-- Let an authenticated user discover only organizations where they have membership.
-- Organization creation remains possible only when the transaction sets current_org_id.
DROP POLICY IF EXISTS "organizations_tenant_policy" ON "organizations";
CREATE POLICY "organizations_tenant_policy" ON "organizations"
  USING (
    "id" = current_setting('app.current_org_id', true)
    OR EXISTS (
      SELECT 1 FROM "memberships" m
      WHERE m."organization_id" = "organizations"."id"
        AND m."user_id" = current_setting('app.current_user_id', true)
    )
  )
  WITH CHECK ("id" = current_setting('app.current_org_id', true));

DROP POLICY IF EXISTS "memberships_tenant_policy" ON "memberships";
CREATE POLICY "memberships_tenant_policy" ON "memberships"
  USING (
    "organization_id" = current_setting('app.current_org_id', true)
    OR "user_id" = current_setting('app.current_user_id', true)
  )
  WITH CHECK ("organization_id" = current_setting('app.current_org_id', true));
