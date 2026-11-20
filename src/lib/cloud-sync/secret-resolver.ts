import { ProviderApiError, ProviderCredentialConfigurationError } from "./errors";

type Secret = Record<string, unknown>;
type FetchLike = typeof fetch;

/**
 * Reads a HashiCorp Vault KV v2 secret. The URI form is vault://<mount>/<path>.
 * The KV v2 secret data must contain the provider fields expected by the
 * corresponding billing adapter. The token is read only from worker env.
 */
export async function resolveVaultKv2Secret(reference: string, fetcher: FetchLike = fetch): Promise<Secret> {
  const address = process.env.VAULT_ADDR;
  const token = process.env.VAULT_TOKEN;
  if (!address || !token) {
    throw new ProviderCredentialConfigurationError("VAULT_ADDR and VAULT_TOKEN must be configured on the isolated sync worker.");
  }

  const referenceMatch = reference.match(/^vault:\/\/([A-Za-z0-9._-]+)\/([^?#]+)$/i);
  let base: URL;
  try { base = new URL(address); } catch {
    throw new ProviderCredentialConfigurationError("The Vault address is invalid.");
  }
  if (!referenceMatch) {
    throw new ProviderCredentialConfigurationError("Vault references must use vault://<mount>/<path> without query strings or fragments.");
  }
  if ((base.protocol !== "https:" && !(process.env.NODE_ENV === "development" && base.protocol === "http:")) ||
      base.username || base.password || base.search || base.hash) {
    throw new ProviderCredentialConfigurationError("VAULT_ADDR must be an HTTPS URL (HTTP is allowed only in development).");
  }

  const mount = referenceMatch[1];
  const segments = referenceMatch[2].split("/");
  if (segments.length < 1 || segments.some((part) => part === "." || part === ".." || !/^[A-Za-z0-9._-]+$/.test(part))) {
    throw new ProviderCredentialConfigurationError("Vault reference path contains an invalid mount or path segment.");
  }
  const secretPath = segments.map(encodeURIComponent).join("/");
  const endpoint = new URL("/v1/" + encodeURIComponent(mount) + "/data/" + secretPath, base);
  const headers: Record<string, string> = { "x-vault-token": token, accept: "application/json" };
  const namespace = process.env.VAULT_NAMESPACE;
  if (namespace) headers["x-vault-namespace"] = namespace;

  let response: Response;
  try {
    response = await fetcher(endpoint, {
      method: "GET", headers, redirect: "error", cache: "no-store",
      signal: AbortSignal.timeout(15_000)
    });
  } catch {
    throw new ProviderApiError("HashiCorp Vault could not be reached from the sync worker.");
  }
  if (!response.ok) {
    if (response.status === 404 || response.status === 400) {
      throw new ProviderCredentialConfigurationError("The configured Vault KV v2 secret was not found or is not readable by the worker identity.");
    }
    if (response.status >= 500 || response.status === 429) {
      throw new ProviderApiError("HashiCorp Vault is temporarily unavailable.");
    }
    throw new ProviderCredentialConfigurationError("HashiCorp Vault rejected the worker's secret-read request.");
  }
  const length = Number(response.headers.get("content-length") ?? "0");
  if (length > 1_048_576) throw new ProviderCredentialConfigurationError("Vault secret response exceeds the 1 MB safety limit.");

  let payload: unknown;
  try { payload = await response.json(); } catch {
    throw new ProviderCredentialConfigurationError("Vault returned an invalid JSON response.");
  }
  if (!payload || typeof payload !== "object" || !("data" in payload) || !payload.data ||
      typeof payload.data !== "object" || !("data" in payload.data) || !payload.data.data ||
      typeof payload.data.data !== "object" || Array.isArray(payload.data.data)) {
    throw new ProviderCredentialConfigurationError("Vault response must use the KV v2 data.data object shape.");
  }
  return payload.data.data as Secret;
}
