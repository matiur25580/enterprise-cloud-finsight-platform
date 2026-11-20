import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calculateFinancialPerformance } from "./financial-performance";

describe("calculateFinancialPerformance", () => {
  it("calculates cloud contribution and cost ratio", () => {
    assert.deepEqual(calculateFinancialPerformance(1000, 250), {
      revenue: 1000, cloudSpend: 250, cloudContribution: 750, cloudCostToRevenuePercent: 25
    });
  });
  it("keeps a negative contribution when cloud cost exceeds revenue", () => {
    assert.equal(calculateFinancialPerformance(100, 150).cloudContribution, -50);
  });
  it("does not divide by zero when revenue is missing", () => {
    assert.equal(calculateFinancialPerformance(0, 12).cloudCostToRevenuePercent, null);
  });
  it("rejects negative or non-finite inputs", () => {
    assert.throws(() => calculateFinancialPerformance(-1, 2));
    assert.throws(() => calculateFinancialPerformance(1, Number.NaN));
  });
});
