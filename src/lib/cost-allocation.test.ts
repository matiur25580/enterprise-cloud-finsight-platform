import test from "node:test";
import assert from "node:assert/strict";
import { normalizeAllocation, summarizeAllocationRows } from "./cost-allocation-math";

test("normalizes missing and whitespace-only tags as unallocated", () => {
  assert.equal(normalizeAllocation(null), "Unallocated");
  assert.equal(normalizeAllocation("   "), "Unallocated");
  assert.equal(normalizeAllocation(" Platform "), "Platform");
});

test("summarizes allocation by currency without combining currencies", () => {
  const result = summarizeAllocationRows([
    { currency: "USD", allocation: "Platform", spend: "100.00", records: 2 },
    { currency: "USD", allocation: null, spend: "25.00", records: 1 },
    { currency: "INR", allocation: "Platform", spend: "500.00", records: 3 }
  ]);
  assert.equal(result.totalRecords, 6);
  assert.deepEqual(result.byCurrency.map((item) => [item.currency, item.totalSpend, item.taggedSpend, item.unallocatedSpend, item.coveragePercent]), [
    ["INR", 500, 500, 0, 100],
    ["USD", 125, 100, 25, 80]
  ]);
  assert.deepEqual(result.groups.map((item) => item.currency), ["INR", "USD", "USD"]);
});

test("returns zero coverage for an empty result", () => {
  const result = summarizeAllocationRows([]);
  assert.equal(result.totalRecords, 0);
  assert.deepEqual(result.byCurrency, []);
});
