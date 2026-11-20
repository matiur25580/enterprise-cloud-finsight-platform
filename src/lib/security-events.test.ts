import test from "node:test";
import assert from "node:assert/strict";
import { summarizeSecurityEvents } from "./security-events";

test("summarizes threshold events by route and UTC day", () => {
  const now = new Date("2026-11-20T12:00:00.000Z");
  const summary = summarizeSecurityEvents([
    { id: "1", routeBucket: "billing:import", requestCount: 6, requestLimit: 5, createdAt: new Date("2026-11-20T10:00:00.000Z") },
    { id: "2", routeBucket: "billing:import", requestCount: 6, requestLimit: 5, createdAt: new Date("2026-11-20T11:00:00.000Z") },
    { id: "3", routeBucket: "audit:export", requestCount: 11, requestLimit: 10, createdAt: new Date("2026-11-19T10:00:00.000Z") }
  ], now);
  assert.equal(summary.total, 3);
  assert.deepEqual(summary.routes, [
    { routeBucket: "billing:import", count: 2 },
    { routeBucket: "audit:export", count: 1 }
  ]);
  assert.equal(summary.days.at(-1)?.count, 2);
  assert.equal(summary.days.at(-2)?.count, 1);
});

test("returns a zero-filled trend for an empty event set", () => {
  const summary = summarizeSecurityEvents([], new Date("2026-11-20T12:00:00.000Z"));
  assert.equal(summary.total, 0);
  assert.equal(summary.routes.length, 0);
  assert.equal(summary.days.length, 14);
  assert.ok(summary.days.every((day) => day.count === 0));
  assert.equal(summary.latestAt, null);
});
