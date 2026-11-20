import type { Prisma } from "@prisma/client";

export type AllocationRow = { currency: string; allocation: string | null; spend: Prisma.Decimal | number | string; records: bigint | number };

export function normalizeAllocation(value: string | null | undefined): string {
  const normalized = value?.trim();
  return normalized ? normalized : "Unallocated";
}

export function summarizeAllocationRows(rows: AllocationRow[]) {
  const totals = new Map<string, number>();
  let totalSpend = 0;
  let taggedSpend = 0;
  let totalRecords = 0;
  for (const row of rows) {
    const spend = Number(row.spend.toString());
    const key = row.currency + ":" + normalizeAllocation(row.allocation);
    totals.set(key, (totals.get(key) ?? 0) + spend);
    totalSpend += spend;
    totalRecords += Number(row.records);
    if (normalizeAllocation(row.allocation) !== "Unallocated") taggedSpend += spend;
  }
  return {
    groups: [...totals.entries()].map(([key, spend]) => {
      const separator = key.indexOf(":");
      return { currency: key.slice(0, separator), allocation: key.slice(separator + 1), spend };
    }).sort((a, b) => a.currency.localeCompare(b.currency) || b.spend - a.spend),
    totalSpend,
    taggedSpend,
    unallocatedSpend: totalSpend - taggedSpend,
    totalRecords,
    taggedCoveragePercent: totalSpend > 0 ? taggedSpend / totalSpend * 100 : 0
  };
}

