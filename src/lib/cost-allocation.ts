import "server-only";

import { Prisma } from "@prisma/client";
import { summarizeAllocationRows, type AllocationRow } from "@/lib/cost-allocation-math";
import { prisma } from "@/lib/prisma";
import { withOrganization } from "@/lib/tenant-context";

export const ALLOCATION_DIMENSIONS = {
  team: { label: "Team", keys: ["team", "Team", "TEAM"] },
  department: { label: "Department", keys: ["department", "Department", "DEPARTMENT"] },
  project: { label: "Project", keys: ["project", "Project", "PROJECT"] },
  environment: { label: "Environment", keys: ["environment", "Environment", "ENVIRONMENT"] },
  costCenter: { label: "Cost center", keys: ["costCenter", "cost_center", "CostCenter", "COST_CENTER"] },
  cluster: { label: "Kubernetes cluster", keys: ["cluster", "Cluster", "CLUSTER", "k8s_cluster", "kubernetes.io/cluster"] },
  namespace: { label: "Kubernetes namespace", keys: ["namespace", "Namespace", "NAMESPACE", "kubernetes.io/metadata.name"] },
  workload: { label: "Kubernetes workload", keys: ["workload", "Workload", "WORKLOAD", "app.kubernetes.io/name", "deployment", "statefulset"] }
} as const;

export type AllocationDimension = keyof typeof ALLOCATION_DIMENSIONS;
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
    return { dimension, dimensionLabel: definition.label, startDate: since.toISOString().slice(0, 10), endDate: new Date().toISOString().slice(0, 10), ...summary };
  });
}
