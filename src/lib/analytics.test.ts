import test from "node:test";
import assert from "node:assert/strict";
import { getAnalyticsWindow, projectMonthEnd } from "./analytics-math";

test("7 day window includes today and six preceding UTC dates", () => {
  const result = getAnalyticsWindow(new Date("2026-11-20T13:00:00.000Z"), "7d");
  assert.equal(result.start.toISOString().slice(0, 10), "2026-11-14");
  assert.equal(result.end.toISOString().slice(0, 10), "2026-11-20");
  assert.equal(result.durationDays, 7);
  assert.equal(result.previousStart.toISOString().slice(0, 10), "2026-11-07");
  assert.equal(result.previousEnd.toISOString().slice(0, 10), "2026-11-13");
});

test("month range starts on the first day of the current UTC month", () => {
  const result = getAnalyticsWindow(new Date("2026-11-20T13:00:00.000Z"), "month");
  assert.equal(result.start.toISOString().slice(0, 10), "2026-11-01");
  assert.equal(result.end.toISOString().slice(0, 10), "2026-11-20");
});

test("month-end forecast scales month-to-date spend by elapsed days", () => {
  assert.equal(projectMonthEnd(100, 10, 30), 300);
  assert.equal(projectMonthEnd(0, 10, 30), 0);
  assert.equal(projectMonthEnd(100, 0, 30), 0);
});

test("spend projection is a numeric estimate, not an actual bill", () => {
  assert.equal(projectMonthEnd(125.5, 5, 30), 753);
});
