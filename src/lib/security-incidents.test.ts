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
