import test from "node:test";
import assert from "node:assert/strict";
import { parseBillingCsv } from "./csv";

const orgId = "org_test";
const accountId = "account_test";

test("normalizes valid billing rows and derives a stable fingerprint", () => {
  const input = "service,amount,currency,usageDate,region,external_id,tag:team\nCompute,12.3400,usd,2026-11-01,ap-south-1,line-1,platform";
  const first = parseBillingCsv(input, orgId, accountId);
  const second = parseBillingCsv(input, orgId, accountId);
  assert.equal(first.rows.length, 1);
  assert.equal(first.issues.length, 0);
  assert.equal(first.rows[0].currency, "USD");
  assert.equal(first.rows[0].region, "ap-south-1");
  assert.equal(first.rows[0].tags.team, "platform");
  assert.equal(first.rows[0].fingerprint, second.rows[0].fingerprint);
});

test("keeps valid rows and reports invalid rows with source line numbers", () => {
  const input = [
    "service,amount,currency,usageDate",
    "Compute,12.50,USD,2026-11-01",
    "Storage,not-a-number,US,2026-02-30"
  ].join("\n");
  const result = parseBillingCsv(input, orgId, accountId);
  assert.equal(result.rows.length, 1);
  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0].rowNumber, 3);
});

test("rejects missing required columns", () => {
  assert.throws(() => parseBillingCsv("service,amount\nCompute,10", orgId, accountId), /Missing required CSV columns/);
});

test("rejects duplicate normalized headers", () => {
  assert.throws(
    () => parseBillingCsv("service,amount,cost,currency,usageDate\nCompute,10,10,USD,2026-11-01", orgId, accountId),
    /duplicate column headers/
  );
});
