import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withOrganization } from "@/lib/tenant-context";

export async function getTagPolicyCompliance(organizationId: string) {
  const since = new Date(); since.setUTCHours(0, 0, 0, 0); since.setUTCDate(since.getUTCDate() - 29);
  return withOrganization(prisma, organizationId, async (tx) => {
    const policies = await tx.tagPolicy.findMany({ where: { organizationId, isActive: true }, orderBy: { tagKey: "asc" } });
    const results = await Promise.all(policies.map(async (policy) => {
      const tagValue = Prisma.sql`NULLIF(BTRIM(tags ->> ${policy.tagKey}), '')`;
      const allowed = policy.allowedValues.length ? Prisma.join(policy.allowedValues.map((value) => value.toLowerCase())) : Prisma.empty;
      const violation = policy.allowedValues.length ? (policy.isRequired
        ? Prisma.sql`(${tagValue} IS NULL OR LOWER(${tagValue}) NOT IN (${allowed}))`
        : Prisma.sql`(${tagValue} IS NOT NULL AND LOWER(${tagValue}) NOT IN (${allowed}))`)
        : Prisma.sql`(${tagValue} IS NULL)`;
      const rows = await tx.$queryRaw<{ currency: string; violatingRecords: bigint; violatingSpend: Prisma.Decimal }[]>(Prisma.sql`
        SELECT currency, COUNT(*)::bigint AS "violatingRecords", COALESCE(SUM(amount), 0) AS "violatingSpend"
        FROM cost_records WHERE organization_id = ${organizationId} AND usage_date >= ${since}
          AND usage_date <= CURRENT_DATE AND ${violation}
        GROUP BY currency ORDER BY currency ASC
      `);
      return { ...policy, results: rows.map((row) => ({ currency: row.currency, violatingRecords: Number(row.violatingRecords), violatingSpend: Number(row.violatingSpend.toString()) })) };
    }));
    return { policies: results, startDate: since.toISOString().slice(0, 10), endDate: new Date().toISOString().slice(0, 10) };
  });
}