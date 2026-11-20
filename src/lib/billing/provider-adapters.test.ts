import test from "node:test";
import assert from "node:assert/strict";
import { normalizeProviderBillingExport } from "./provider-adapters";
import { parseBillingCsv } from "./csv";

const org = "org_provider_test";
const account = "account_provider_test";

test("normalizes AWS Cost and Usage export columns", () => {
  const source = "lineItem/UnblendedCost,pricing/currencyCode,lineItem/UsageStartDate,product/ProductName,product/region,lineItem/UsageType\n12.345,USD,2026-11-01T00:00:00Z,Amazon EC2,ap-south-1,BoxUsage";
  const normalized = normalizeProviderBillingExport("AWS", source);
  const parsed = parseBillingCsv(normalized.csv, org, account);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].service, "Amazon EC2");
  assert.equal(parsed.rows[0].amount, "12.345");
  assert.equal(parsed.rows[0].usageDate.toISOString().slice(0, 10), "2026-11-01");
  assert.equal(parsed.rows[0].region, "ap-south-1");
});

test("normalizes Azure Cost Management export columns", () => {
  const source = "CostInBillingCurrency,BillingCurrency,Date,ServiceName,SubscriptionId,ResourceLocation,ResourceId,Tags\n4.25,INR,2026-11-02,Virtual Machines,sub-123,centralindia,/subscriptions/sub-123/vm1,\"{\\"team\\":\\"platform\\"}\"";
  const normalized = normalizeProviderBillingExport("AZURE", source);
  const parsed = parseBillingCsv(normalized.csv, org, account);
  assert.equal(parsed.rows[0].service, "Virtual Machines");
  assert.equal(parsed.rows[0].currency, "INR");
  assert.equal(parsed.rows[0].region, "centralindia");
  assert.equal(parsed.rows[0].resourceId, "/subscriptions/sub-123/vm1");
});

test("normalizes GCP detailed billing export columns", () => {
  const source = "cost,currency,usage_start_time,service.description,project.id,location.region,sku.description,resource.name\n-1.25,USD,2026-11-03T00:00:00Z,Cloud Storage,fin-prod,asia-south1,Standard Storage,bucket-a";
  const normalized = normalizeProviderBillingExport("GCP", source);
  const parsed = parseBillingCsv(normalized.csv, org, account);
  assert.equal(parsed.rows[0].service, "Cloud Storage");
  assert.equal(parsed.rows[0].amount, "-1.25");
  assert.equal(parsed.rows[0].usageType, "Standard Storage");
  assert.equal(parsed.rows[0].resourceId, "bucket-a");
});

test("rejects unknown provider export formats", () => {
  assert.throws(() => normalizeProviderBillingExport("AWS", "foo,bar\na,b"), /Unsupported AWS export/);
});
