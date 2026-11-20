import test from "node:test";
import assert from "node:assert/strict";
import { calculateRealizedSavings, validateImpactPeriods } from "./recommendation-impact";

test("accepts equal seven-day windows with a gap", () => {
  const result = validateImpactPeriods({
    baselineStartsAt: "2026-01-01", baselineEndsAt: "2026-01-07",
    observedStartsAt: "2026-01-10", observedEndsAt: "2026-01-16"
  });
  assert.equal(result.valid, true);
  if (result.valid) assert.equal(result.periodDays, 7);
});

test("rejects unequal, overlapping and too-short periods", () => {
  assert.equal(validateImpactPeriods({
    baselineStartsAt: "2026-01-01", baselineEndsAt: "2026-01-07",
    observedStartsAt: "2026-01-08", observedEndsAt: "2026-01-16"
  }).valid, false);
  assert.equal(validateImpactPeriods({
    baselineStartsAt: "2026-01-01", baselineEndsAt: "2026-01-07",
    observedStartsAt: "2026-01-07", observedEndsAt: "2026-01-13"
  }).valid, false);
  assert.equal(validateImpactPeriods({
    baselineStartsAt: "2026-02-30", baselineEndsAt: "2026-03-08",
    observedStartsAt: "2026-03-10", observedEndsAt: "2026-03-16"
  }).valid, false);
});

test("calculates savings as baseline spend less observed spend, including regressions", () => {
  assert.equal(calculateRealizedSavings(120, 90), 30);
  assert.equal(calculateRealizedSavings(90, 120), -30);
  assert.throws(() => calculateRealizedSavings(-1, 2));
});
