import test from "node:test";
import assert from "node:assert/strict";
import { resolveVaultKv2Secret } from "./secret-resolver";
import { ProviderCredentialConfigurationError, ProviderApiError } from "./provider-adapters";

const original = {
  address: process.env.VAULT_ADDR,
  token: process.env.VAULT_TOKEN,
  namespace: process.env.VAULT_NAMESPACE,
  nodeEnv: process.env.NODE_ENV
};

test("reads a KV v2 secret using a worker-only token and namespace", async () => {
  process.env.VAULT_ADDR = "https://vault.example.test";
  process.env.VAULT_TOKEN = "worker-token";
  process.env.VAULT_NAMESPACE = "platform";
  let requestedUrl = "";
  let requestedHeaders: HeadersInit | undefined;
  const secret = await resolveVaultKv2Secret("vault://kv/finops/org-1/aws", async (input, init) => {
    requestedUrl = String(input);
    requestedHeaders = init?.headers;
    return Response.json({ data: { data: { roleArn: "arn:aws:iam::123456789012:role/FinSight", externalId: "tenant-id" } } });
  });
  assert.match(requestedUrl, /\/v1\/kv\/data\/finops\/org-1\/aws$/);
  assert.equal(new Headers(requestedHeaders).get("x-vault-token"), "worker-token");
  assert.equal(new Headers(requestedHeaders).get("x-vault-namespace"), "platform");
  assert.equal(secret.externalId, "tenant-id");
});

test("rejects non-Vault references and unsafe path traversal", async () => {
  process.env.VAULT_ADDR = "https://vault.example.test";
  process.env.VAULT_TOKEN = "worker-token";
  await assert.rejects(() => resolveVaultKv2Secret("https://example.test/secret"), ProviderCredentialConfigurationError);
  await assert.rejects(() => resolveVaultKv2Secret("vault://kv/../other"), ProviderCredentialConfigurationError);
});

test("classifies missing Vault secrets as configuration errors", async () => {
  process.env.VAULT_ADDR = "https://vault.example.test";
  process.env.VAULT_TOKEN = "worker-token";
  await assert.rejects(() => resolveVaultKv2Secret("vault://kv/finops/missing", async () => new Response(null, { status: 404 })), ProviderCredentialConfigurationError);
});

test("classifies Vault service failures as retryable API errors", async () => {
  process.env.VAULT_ADDR = "https://vault.example.test";
  process.env.VAULT_TOKEN = "worker-token";
  await assert.rejects(() => resolveVaultKv2Secret("vault://kv/finops/aws", async () => new Response(null, { status: 503 })), ProviderApiError);
});

test.after(() => {
  if (original.address === undefined) delete process.env.VAULT_ADDR; else process.env.VAULT_ADDR = original.address;
  if (original.token === undefined) delete process.env.VAULT_TOKEN; else process.env.VAULT_TOKEN = original.token;
  if (original.namespace === undefined) delete process.env.VAULT_NAMESPACE; else process.env.VAULT_NAMESPACE = original.namespace;
  if (original.nodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = original.nodeEnv;
});
