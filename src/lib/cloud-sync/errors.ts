export class ProviderCredentialConfigurationError extends Error {
  readonly code = "PROVIDER_CREDENTIALS_NOT_CONFIGURED";
  constructor(message: string) { super(message); this.name = "ProviderCredentialConfigurationError"; }
}
export class ProviderApiError extends Error {
  readonly code = "PROVIDER_API_ERROR";
  constructor(message: string) { super(message); this.name = "ProviderApiError"; }
}
