import test from "node:test";
import assert from "node:assert/strict";
import { ProviderCredentialConfigurationError, validateProviderSecret } from "./provider-adapters";

test("accepts an AWS role scoped to the registered account", () => {
  assert.doesNotThrow(() => validateProviderSecret("AWS", "123456789012", { roleArn: "arn:aws:iam::123456789012:role/FinSightCostReader", externalId: "finsight-tenant-unique" }));
});
test("rejects an AWS role from a different account", () => {
  assert.throws(() => validateProviderSecret("AWS", "123456789012", { roleArn: "arn:aws:iam::999999999999:role/FinSightCostReader", externalId: "finsight-external-id" }), ProviderCredentialConfigurationError);\n  assert.throws(() => validateProviderSecret("AWS", "123456789012", { roleArn: "arn:aws:iam::123456789012:role/FinSightCostReader" }), ProviderCredentialConfigurationError);
});
test("requires Azure service-principal fields", () => {
  assert.throws(() => validateProviderSecret("AZURE", "12345678-1234-1234-1234-123456789012", { tenantId: "tenant", clientId: "client" }), ProviderCredentialConfigurationError);
  assert.doesNotThrow(() => validateProviderSecret("AZURE", "12345678-1234-1234-1234-123456789012", { tenantId: "tenant", clientId: "client", clientSecret: "resolved-secret" }));\n  assert.throws(() => validateProviderSecret("AZURE", "subscription-id", { tenantId: "tenant", clientId: "client", clientSecret: "secret" }), ProviderCredentialConfigurationError);
});
test("accepts only GCP billing tables inside the registered project", () => {
  const secret = { serviceAccountJson: { type: "external_account" }, billingExportTable: "sample-project.billing.gcp_billing_export_v1_123" };
  assert.doesNotThrow(() => validateProviderSecret("GCP", "sample-project", secret));
  assert.throws(() => validateProviderSecret("GCP", "other-project", secret), ProviderCredentialConfigurationError);
  assert.throws(() => validateProviderSecret("GCP", "sample-project", { ...secret, billingExportTable: "sample-project.billing; DROP TABLE users" }), ProviderCredentialConfigurationError);
});
