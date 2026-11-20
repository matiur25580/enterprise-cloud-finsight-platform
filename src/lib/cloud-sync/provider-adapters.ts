import type { CloudProvider } from "@prisma/client";

/**
 * Explicit integration boundary. Live provider API adapters must be registered
 * only after their read-only auth flow and secret-manager resolver are deployed.
 */
export class ProviderConnectorUnavailableError extends Error {
  readonly code = "PROVIDER_CONNECTOR_NOT_CONFIGURED";
  constructor(provider: CloudProvider) {
    super("Live " + provider + " billing sync is not configured. Import a provider billing export CSV until its read-only connector is deployed.");
    this.name = "ProviderConnectorUnavailableError";
  }
}
export async function executeProviderBillingSync(provider: CloudProvider, _externalAccountId: string): Promise<never> {
  throw new ProviderConnectorUnavailableError(provider);
}
