import test from "node:test";
import assert from "node:assert/strict";
import { buildIncidentFromEvent, classifySecurityIncident, transitionIncidentStatus } from "./security-incidents";

const event = { id: "evt-1", routeBucket: "billing:import", requestCount: 6, requestLimit: 5, createdAt: new Date("2026-11-20T12:00:00Z") };

test("classifies isolated low-volume threshold crossing as low", () => {
  assert.equal(classifySecurityIncident(event, 1), "LOW");
});

test("elevates repeated correlated threshold crossings", () => {
  assert.equal(classifySecurityIncident(event, 3), "HIGH");
  assert.equal(classifySecurityIncident(event, 5), "CRITICAL");
});

test("builds a bounded evidence-based incident summary", () => {
  const incident = buildIncidentFromEvent(event, 3);
  assert.equal(incident.severity, "HIGH");
  assert.match(incident.title, /billing/);
  assert.match(incident.description, /not proof of malicious activity/);
});

test("enforces explicit incident status transitions", () => {
  assert.deepEqual(transitionIncidentStatus("OPEN", "ACKNOWLEDGED"), {
    status: "ACKNOWLEDGED", acknowledged: true, resolved: false
  });
  assert.equal(transitionIncidentStatus("OPEN", "RESOLVED"), null);
  assert.equal(transitionIncidentStatus("RESOLVED", "OPEN")?.status, "OPEN");
});

test("classifies severity at every request-ratio boundary", () => {
  const atRatio = (ratio: number) => classifySecurityIncident(
    { ...event, requestCount: ratio * 10, requestLimit: 10 },
    1
  );

  assert.equal(atRatio(1.49), "LOW");
  assert.equal(atRatio(1.5), "MEDIUM");
  assert.equal(atRatio(1.99), "MEDIUM");
  assert.equal(atRatio(2), "HIGH");
  assert.equal(atRatio(2.99), "HIGH");
  assert.equal(atRatio(3), "CRITICAL");
});

test("uses correlation-count boundaries to elevate severity", () => {
  assert.equal(classifySecurityIncident({ ...event, requestCount: 1, requestLimit: 10 }, 2), "MEDIUM");
  assert.equal(classifySecurityIncident({ ...event, requestCount: 1, requestLimit: 10 }, 3), "HIGH");
  assert.equal(classifySecurityIncident({ ...event, requestCount: 1, requestLimit: 10 }, 5), "CRITICAL");
});

test("does not divide by zero or negative request limits", () => {
  assert.equal(classifySecurityIncident({ ...event, requestCount: 100, requestLimit: 0 }, 1), "LOW");
  assert.equal(classifySecurityIncident({ ...event, requestCount: 100, requestLimit: -5 }, 1), "LOW");
});

test("keeps generated incident fields within persistence limits", () => {
  const incident = buildIncidentFromEvent(
    { ...event, routeBucket: "x".repeat(3000) },
    999
  );
  assert.ok(incident.title.length <= 180);
  assert.ok(incident.description.length <= 2000);
  assert.equal(incident.severity, "CRITICAL");
});

test("supports every documented incident lifecycle transition", () => {
  const allowed = [
    ["OPEN", "ACKNOWLEDGED", true, false],
    ["OPEN", "FALSE_POSITIVE", false, true],
    ["ACKNOWLEDGED", "OPEN", false, false],
    ["ACKNOWLEDGED", "RESOLVED", false, true],
    ["ACKNOWLEDGED", "FALSE_POSITIVE", false, true],
    ["RESOLVED", "OPEN", false, false],
    ["FALSE_POSITIVE", "OPEN", false, false]
  ] as const;

  for (const [current, next, acknowledged, resolved] of allowed) {
    assert.deepEqual(transitionIncidentStatus(current, next), {
      status: next, acknowledged, resolved
    });
  }
});

test("rejects self-transitions and reopening to a terminal state", () => {
  for (const status of ["OPEN", "ACKNOWLEDGED", "RESOLVED", "FALSE_POSITIVE"] as const) {
    assert.equal(transitionIncidentStatus(status, status), null);
  }
  assert.equal(transitionIncidentStatus("RESOLVED", "FALSE_POSITIVE"), null);
  assert.equal(transitionIncidentStatus("FALSE_POSITIVE", "RESOLVED"), null);
});
