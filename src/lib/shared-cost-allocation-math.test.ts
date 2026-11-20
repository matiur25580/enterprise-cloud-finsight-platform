import test from "node:test";
import assert from "node:assert/strict";
import { distributeSharedCost, validateAllocationRecipients } from "./shared-cost-allocation-math";

test("splits shared costs equally and assigns rounding remainder deterministically", () => {
  const result = distributeSharedCost(100, "EQUAL", [{ value: "Platform" }, { value: "Data" }, { value: "Security" }]);
  assert.deepEqual(result.map((item) => item.amount), [33.33333333, 33.33333333, 33.33333334]);
  assert.equal(Number(result.reduce((sum, item) => sum + item.amount, 0).toFixed(8)), 100);
});

test("distributes weighted costs using configured percentages", () => {
  const result = distributeSharedCost(240, "WEIGHTED", [
    { value: "Platform", weight: 50 }, { value: "Data", weight: 30 }, { value: "Security", weight: 20 }
  ]);
  assert.deepEqual(result.map((item) => item.amount), [120, 72, 48]);
});

test("supports negative credits while preserving reconciliation", () => {
  const result = distributeSharedCost(-10, "WEIGHTED", [{ value: "A", weight: 60 }, { value: "B", weight: 40 }]);
  assert.equal(Number(result.reduce((sum, item) => sum + item.amount, 0).toFixed(8)), -10);
});

test("rejects invalid weights and duplicate recipients", () => {
  assert.match(validateAllocationRecipients("WEIGHTED", [{ value: "A", weight: 20 }, { value: "B", weight: 20 }]) ?? "", /total exactly 100/);
  assert.match(validateAllocationRecipients("EQUAL", [{ value: "A" }, { value: "a" }]) ?? "", /unique/);
});
