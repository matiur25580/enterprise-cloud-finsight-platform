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
  assert.equal(result.totalSpend, 625);
  assert.equal(result.taggedSpend, 600);
  assert.equal(result.unallocatedSpend, 25);
  assert.equal(result.totalRecords, 6);
  assert.equal(result.taggedCoveragePercent, 96);
  assert.deepEqual(result.groups.map((item) => item.currency), ["INR", "USD", "USD"]);
});

test("returns zero coverage for an empty result", () => {
  const result = summarizeAllocationRows([]);
  assert.equal(result.totalSpend, 0);
  assert.equal(result.taggedCoveragePercent, 0);
});
