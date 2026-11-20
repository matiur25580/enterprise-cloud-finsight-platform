import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withOrganization } from "@/lib/tenant-context";

export const ALLOCATION_DIMENSIONS = {
  team: { label: "Team", keys: ["team", "Team", "TEAM"] },
  department: { label: "Department", keys: ["department", "Department", "DEPARTMENT"] },
  project: { label: "Project", keys: ["project", "Project", "PROJECT"] },
  environment: { label: "Environment", keys: ["environment", "Environment", "ENVIRONMENT"] },
  costCenter: { label: "Cost center", keys: ["costCenter", "cost_center", "CostCenter", "COST_CENTER"] }
} as const;

export type AllocationDimension = keyof typeof ALLOCATION_DIMENSIONS;
type AllocationRow = { currency: string; allocation: string | null; spend: Prisma.Decimal | number | string; records: bigint | number };

import { summarizeAllocationRows } from "@/lib/cost-allocation-math";

export async function getCostAllocation(organizationId: string, dimension: AllocationDimension) {
  const definition = ALLOCATION_DIMENSIONS[dimension];
  const expression = Prisma.sql`COALESCE(${Prisma.join(definition.keys.map((key) => Prisma.sql`NULLIF(BTRIM(tags ->> ${key}), '')`))})`;
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - 29);
  return withOrganization(prisma, organizationId, async (tx) => {
    const rows = await tx.$queryRaw<AllocationRow[]>(Prisma.sql`
      SELECT currency, ${expression} AS allocation,
        SUM(amount) AS spend, COUNT(*)::bigint AS records
      FROM cost_records
      WHERE organization_id = ${organizationId}
        AND usage_date >= ${since}
        AND usage_date <= CURRENT_DATE
      GROUP BY currency, allocation
      ORDER BY currency ASC, spend DESC
    `);
    const summary = summarizeAllocationRows(rows);
    const currencies = [...new Set(summary.groups.map((item) => item.currency))];
    const byCurrency = currencies.map((currency) => {
      const items = summary.groups.filter((item) => item.currency === currency);
      const total = items.reduce((sum, item) => sum + item.spend, 0);
      const tagged = items.filter((item) => item.allocation !== "Unallocated").reduce((sum, item) => sum + item.spend, 0);
      return { currency, totalSpend: total, taggedSpend: tagged, unallocatedSpend: total - tagged, coveragePercent: total > 0 ? tagged / total * 100 : 0 };
    });
    return { dimension, dimensionLabel: definition.label, startDate: since.toISOString().slice(0, 10), endDate: new Date().toISOString().slice(0, 10), ...summary, byCurrency };
  });
}
