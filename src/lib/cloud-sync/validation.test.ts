import test from "node:test";
import assert from "node:assert/strict";
import { updateCloudAccountSchema } from "../cloud-accounts/validation";

test("accepts enabled sync schedules from 15 minutes to 7 days", () => {
  assert.equal(updateCloudAccountSchema.safeParse({ syncEnabled: true, syncIntervalMinutes: 15 }).success, true);
  assert.equal(updateCloudAccountSchema.safeParse({ syncEnabled: true, syncIntervalMinutes: 10080 }).success, true);
});
test("rejects too frequent or excessively long sync schedules", () => {
  assert.equal(updateCloudAccountSchema.safeParse({ syncEnabled: true, syncIntervalMinutes: 14 }).success, false);
  assert.equal(updateCloudAccountSchema.safeParse({ syncEnabled: true, syncIntervalMinutes: 10081 }).success, false);
});
test("allows disabling scheduled sync without a provider credential", () => {
  assert.equal(updateCloudAccountSchema.safeParse({ syncEnabled: false }).success, true);
});
