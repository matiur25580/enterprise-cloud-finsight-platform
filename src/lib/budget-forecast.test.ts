import assert from "node:assert/strict";
import test from "node:test";
import { calculateBudgetForecast } from "./budget-forecast";

test("projects period-end spend from actual daily run rate", () => {
  const result = calculateBudgetForecast({ budgetAmount: 3000, actualSpend: 1200, elapsedDays: 12, totalDays: 30, currency: "USD" });
  assert.equal(result.plannedSpendToDate, 1200);
  assert.equal(result.forecastAtPeriodEnd, 3000);
  assert.equal(result.forecastVariance, 0);
  assert.equal(result.pace, "ON_PLAN");
});

test("identifies overspend pace and forecast variance", () => {
  const result = calculateBudgetForecast({ budgetAmount: 1000, actualSpend: 600, elapsedDays: 10, totalDays: 20, currency: "USD" });
  assert.equal(result.forecastAtPeriodEnd, 1200);
  assert.equal(result.forecastVariance, 200);
  assert.equal(result.pace, "OVER_PLAN");
});

test("handles future budget windows without dividing by zero", () => {
  const result = calculateBudgetForecast({ budgetAmount: 1000, actualSpend: 0, elapsedDays: 0, totalDays: 30, currency: "EUR" });
  assert.equal(result.forecastAtPeriodEnd, 0);
  assert.equal(result.daysRemaining, 30);
});

test("handles elapsed days beyond the budget window", () => {
  const result = calculateBudgetForecast({ budgetAmount: 100, actualSpend: 150, elapsedDays: 40, totalDays: 30, currency: "INR" });
  assert.equal(result.daysElapsed, 30);
  assert.equal(result.forecastAtPeriodEnd, 150);
  assert.equal(result.forecastUtilizationPercent, 150);
  assert.equal(result.pace, "OVER_PLAN");
});
