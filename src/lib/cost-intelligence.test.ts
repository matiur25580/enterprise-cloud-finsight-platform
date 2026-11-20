import test from "node:test";
import assert from "node:assert/strict";
import { detectCostAnomalies, estimateOptimizationScenario, getBudgetThresholdAlerts } from "./cost-intelligence-math";

test("detects a daily spike against at least seven prior observations", () => {
  const rows = Array.from({ length: 14 }, (_, index) => ({
    date: new Date(Date.UTC(2026, 9, 1 + index)).toISOString().slice(0, 10),
    service: "Compute", currency: "USD", spend: 10
  }));
  rows.push({ date: "2026-10-15", service: "Compute", currency: "USD", spend: 35 });
  const result = detectCostAnomalies(rows);
  assert.equal(result.length, 1);
  assert.equal(result[0].severity, "HIGH");
  assert.equal(result[0].increasePercent, 250);
});

test("does not flag low sample counts or normal variation", () => {
  const few = Array.from({ length: 6 }, (_, index) => ({
    date: new Date(Date.UTC(2026, 9, 1 + index)).toISOString().slice(0, 10),
    service: "Storage", currency: "USD", spend: 10
  }));
  assert.equal(detectCostAnomalies([...few, { date: "2026-10-07", service: "Storage", currency: "USD", spend: 100 }]).length, 0);
  const stable = Array.from({ length: 14 }, (_, index) => ({
    date: new Date(Date.UTC(2026, 9, 1 + index)).toISOString().slice(0, 10),
    service: "Network", currency: "USD", spend: index === 13 ? 12 : 10
  }));
  assert.equal(detectCostAnomalies(stable).length, 0);
});

test("budget alerts report highest crossed threshold and overrun", () => {
  const result = getBudgetThresholdAlerts([{ name: "Production", currency: "USD", budget: 1000, spent: 1050, thresholds: [50, 80, 100] }]);
  assert.equal(result[0].highestThreshold, 100);
  assert.equal(result[0].exceeded, true);
  assert.equal(result[0].utilization, 105);
});

test("optimization estimate is explicitly a scenario and rejects invalid spend", () => {
  assert.equal(estimateOptimizationScenario(1000), 50);
  assert.equal(estimateOptimizationScenario(-10), 0);
});
