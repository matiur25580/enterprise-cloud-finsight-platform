import test from "node:test";
import assert from "node:assert/strict";
import { evaluateTagPolicies } from "./tag-policy-math";

const policies = [
  { tagKey: "team", displayName: "Team", isRequired: true, allowedValues: ["platform", "data"] },
  { tagKey: "environment", displayName: "Environment", isRequired: true, allowedValues: ["production", "staging"] },
  { tagKey: "costCenter", displayName: "Cost center", isRequired: false, allowedValues: ["CC-100"] }
];

test("detects missing mandatory tags and invalid allowed values case-insensitively", () => {
  assert.deepEqual(evaluateTagPolicies({ team: "platform", environment: "sandbox", costCenter: "cc-200" }, policies), [
    { policyKey: "environment", displayName: "Environment", missing: false, invalid: true },
    { policyKey: "costCenter", displayName: "Cost center", missing: false, invalid: true }
  ]);
});

test("accepts case-insensitive tag keys and allowed values", () => {
  assert.deepEqual(evaluateTagPolicies({ TEAM: "Platform", ENVIRONMENT: "PRODUCTION", costcenter: "CC-100" }, policies), []);
});

test("flags absent required tags but permits absent optional tags", () => {
  assert.deepEqual(evaluateTagPolicies({}, policies), [
    { policyKey: "team", displayName: "Team", missing: true, invalid: false },
    { policyKey: "environment", displayName: "Environment", missing: true, invalid: false }
  ]);
});

test("does not treat non-string tag values as compliant", () => {
  assert.equal(evaluateTagPolicies({ team: 123 }, policies)[0]?.missing, true);
});
