import type { Prisma } from "@prisma/client";

export type AllocationRow = { currency: string; allocation: string | null; spend: Prisma.Decimal | number | string; records: bigint | number };

export function normalizeAllocation(value: string | null | undefined): string {
  const normalized = value?.trim();
  return normalized ? normalized : "Unallocated";
}

export function summarizeAllocationRows(rows: AllocationRow[]) {
  const totals = new Map<string, number>();
  const recordsByCurrency = new Map<string, number>();
  let totalRecords = 0;
  for (const row of rows) {
    const spend = Number(row.spend.toString());
    const key = JSON.stringify([row.currency, normalizeAllocation(row.allocation)]);
    totals.set(key, (totals.get(key) ?? 0) + spend);
    recordsByCurrency.set(row.currency, (recordsByCurrency.get(row.currency) ?? 0) + Number(row.records));
    totalRecords += Number(row.records);
  }
  const groups = [...totals.entries()].map(([key, spend]) => {
    const [currency, allocation] = JSON.parse(key) as [string, string];
    return { currency, allocation, spend };
  }).sort((a, b) => a.currency.localeCompare(b.currency) || b.spend - a.spend);
  const currencies = [...new Set(groups.map((item) => item.currency))];
  const byCurrency = currencies.map((currency) => {
    const items = groups.filter((item) => item.currency === currency);
    const totalSpend = items.reduce((sum, item) => sum + item.spend, 0);
    const taggedSpend = items.filter((item) => item.allocation !== "Unallocated").reduce((sum, item) => sum + item.spend, 0);
    return { currency, totalSpend, taggedSpend, unallocatedSpend: totalSpend - taggedSpend, coveragePercent: totalSpend > 0 ? taggedSpend / totalSpend * 100 : 0, records: recordsByCurrency.get(currency) ?? 0 };
  });
  return { groups, byCurrency, totalRecords };
}
