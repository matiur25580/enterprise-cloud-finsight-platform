import { CostExplorerClient, GetCostAndUsageCommand } from "@aws-sdk/client-cost-explorer";
import { fromTemporaryCredentials } from "@aws-sdk/credential-providers";
import { GoogleAuth } from "google-auth-library";
import type { CloudProvider } from "@prisma/client";

type BillingRow = { service: string; amount: string; currency: string; usageDate: string; region?: string };
type Secret = Record<string, unknown>;
export class ProviderCredentialConfigurationError extends Error {
  readonly code = "PROVIDER_CREDENTIALS_NOT_CONFIGURED";
  constructor(message: string) { super(message); this.name = "ProviderCredentialConfigurationError"; }
}
export class ProviderApiError extends Error {
  readonly code = "PROVIDER_API_ERROR";
  constructor(message: string) { super(message); this.name = "ProviderApiError"; }
}
const isoDate = (date: Date) => date.toISOString().slice(0, 10);
function dateWindow() {
  const end = new Date(); end.setUTCHours(0, 0, 0, 0);
  const start = new Date(end); start.setUTCDate(start.getUTCDate() - 30);
  const azureEnd = new Date(end); azureEnd.setUTCDate(azureEnd.getUTCDate() - 1);
  return { start: isoDate(start), end: isoDate(end), azureEnd: isoDate(azureEnd) };
}
function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) throw new ProviderCredentialConfigurationError("The provider secret is missing " + name + ".");
  return value.trim();
}
function csvCell(value: string): string { return /[",\r\n]/.test(value) ? '"' + value.replace(/"/g, '""') + '"' : value; }
function decimalAmount(value: string): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) throw new ProviderApiError("A provider returned a non-numeric billing amount.");
  if (Math.abs(numeric) < 0.000000005) return "0";
  return numeric.toFixed(8).replace(/\.?0+$/, "");
}
function rowsToCsv(rows: BillingRow[]) {
  const headers = ["service", "amount", "currency", "usageDate", "region"];
  return { csv: [headers.join(","), ...rows.map((row) => [row.service, decimalAmount(row.amount), row.currency, row.usageDate, row.region ?? ""].map(csvCell).join(","))].join("\n"), totalRows: rows.length };
}

async function resolveProviderSecret(input: { credentialRef: string | null; provider: CloudProvider; organizationId: string; cloudAccountId: string }): Promise<Secret> {
  const endpoint = process.env.SECRET_RESOLVER_URL;
  const token = process.env.SECRET_RESOLVER_TOKEN;
  if (!input.credentialRef || !endpoint || !token) throw new ProviderCredentialConfigurationError("Configure a per-account secret reference and the worker secret-resolver endpoint before enabling live sync.");
  let url: URL;
  try { url = new URL(endpoint); } catch { throw new ProviderCredentialConfigurationError("SECRET_RESOLVER_URL must be a valid HTTPS URL."); }
  if ((url.protocol !== "https:" && process.env.NODE_ENV !== "development") || url.username || url.password || url.hash || url.search) throw new ProviderCredentialConfigurationError("SECRET_RESOLVER_URL must be an HTTPS endpoint without embedded credentials or query parameters.");
  const response = await fetch(url, {
    method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + token },
    body: JSON.stringify({ reference: input.credentialRef, provider: input.provider, organizationId: input.organizationId, cloudAccountId: input.cloudAccountId }),
    signal: AbortSignal.timeout(15_000), cache: "no-store"
  }).catch(() => { throw new ProviderApiError("The secret resolver could not be reached."); });
  if (!response.ok) {
    if (response.status >= 500) throw new ProviderApiError("The secret resolver is temporarily unavailable.");
    throw new ProviderCredentialConfigurationError(response.status === 404 ? "The configured provider secret reference was not found." : "The secret resolver rejected this provider secret request.");
  }
  let payload: unknown;
  try { payload = await response.json(); } catch { throw new ProviderCredentialConfigurationError("The secret resolver returned an invalid response."); }
  if (!payload || typeof payload !== "object" || !("secret" in payload) || !payload.secret || typeof payload.secret !== "object") throw new ProviderCredentialConfigurationError("The secret resolver response must contain a secret object.");
  return payload.secret as Secret;
}

export function validateProviderSecret(provider: CloudProvider, externalAccountId: string, secret: Secret): void {
  if (provider === "AWS") {
    const roleArn = requiredString(secret.roleArn, "roleArn");
    if (!/^arn:aws:iam::\d{12}:role\/[A-Za-z0-9_+=,.@/-]+$/.test(roleArn) || roleArn.split(":")[4] !== externalAccountId) {
      throw new ProviderCredentialConfigurationError("The AWS role ARN must belong to the registered 12-digit account ID.");
    }
    requiredString(secret.externalId, "externalId");
    return;
  }
  if (provider === "AZURE") {
    if (!/^[0-9a-f-]{36}$/i.test(externalAccountId)) throw new ProviderCredentialConfigurationError("The Azure cloud account ID must be a subscription GUID.");
    requiredString(secret.tenantId, "tenantId"); requiredString(secret.clientId, "clientId"); requiredString(secret.clientSecret, "clientSecret");
    return;
  }
  let credentials: Record<string, unknown>;
  try { credentials = typeof secret.serviceAccountJson === "string" ? JSON.parse(secret.serviceAccountJson) as Record<string, unknown> : secret.serviceAccountJson as Record<string, unknown>; }
  catch { throw new ProviderCredentialConfigurationError("The GCP serviceAccountJson secret is not valid JSON."); }
  if (!credentials || typeof credentials !== "object" || !["service_account", "external_account"].includes(String(credentials.type))) {
    throw new ProviderCredentialConfigurationError("GCP credentials must be a service-account or external-account credential configuration.");
  }
  if (!/^[a-z][a-z0-9-]{4,28}$/.test(externalAccountId)) throw new ProviderCredentialConfigurationError("The GCP cloud account ID must be a Google Cloud project ID.");
  const table = requiredString(secret.billingExportTable, "billingExportTable");
  const match = table.match(/^([a-z][a-z0-9-]{4,28})\.([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z0-9_]+)$/);
  if (!match || match[1] !== externalAccountId) throw new ProviderCredentialConfigurationError("GCP billingExportTable must be a fully qualified table in the registered project.");
}

async function syncAws(externalAccountId: string, secret: Secret): Promise<BillingRow[]> {
  const roleArn = requiredString(secret.roleArn, "roleArn");
  if (!/^arn:aws:iam::\d{12}:role\/[A-Za-z0-9_+=,.@/-]+$/.test(roleArn) || roleArn.split(":")[4] !== externalAccountId) {
    throw new ProviderCredentialConfigurationError("The AWS role ARN must belong to the registered 12-digit account ID.");
  }
  const externalId = requiredString(secret.externalId, "externalId");
  const credentials = fromTemporaryCredentials({ params: { RoleArn: roleArn, RoleSessionName: "FinSightBillingReadOnly", ExternalId: externalId }, clientConfig: { region: "us-east-1" } });
  const client = new CostExplorerClient({ region: "us-east-1", credentials });
  const window = dateWindow();
  const rows: BillingRow[] = [];
  let nextPageToken: string | undefined;
  try {
    do {
      const response = await client.send(new GetCostAndUsageCommand({
        TimePeriod: { Start: window.start, End: window.end }, Granularity: "DAILY",
        Metrics: ["UnblendedCost"], GroupBy: [{ Type: "DIMENSION", Key: "SERVICE" }],
        ...(nextPageToken ? { NextPageToken: nextPageToken } : {})
      }));
      for (const day of response.ResultsByTime ?? []) for (const group of day.Groups ?? []) {
        const amount = group.Metrics?.UnblendedCost?.Amount;
        const currency = group.Metrics?.UnblendedCost?.Unit;
        if (amount && currency && day.TimePeriod?.Start && group.Keys?.[0]) rows.push({ service: group.Keys[0], amount, currency, usageDate: day.TimePeriod.Start });
      }
      nextPageToken = response.NextPageToken;
    } while (nextPageToken);
  } catch { throw new ProviderApiError("AWS Cost Explorer request failed. Check the assumed role and Cost Explorer read permissions."); }
  return rows;
}

async function syncAzure(externalAccountId: string, secret: Secret, defaultCurrency: string): Promise<BillingRow[]> {
  const tenantId = requiredString(secret.tenantId, "tenantId");
  const clientId = requiredString(secret.clientId, "clientId");
  const clientSecret = requiredString(secret.clientSecret, "clientSecret");
  const tokenResponse = await fetch("https://login.microsoftonline.com/" + encodeURIComponent(tenantId) + "/oauth2/v2.0/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: "client_credentials", scope: "https://management.azure.com/.default" }),
    signal: AbortSignal.timeout(20_000), cache: "no-store"
  }).catch(() => { throw new ProviderApiError("Azure identity endpoint could not be reached."); });
  if (!tokenResponse.ok) throw new ProviderApiError("Azure rejected the configured service-principal credentials.");
  const tokenData = await tokenResponse.json() as { access_token?: string };
  if (!tokenData.access_token) throw new ProviderApiError("Azure identity response did not contain an access token.");
  const window = dateWindow();
  const endpoint = "https://management.azure.com/subscriptions/" + encodeURIComponent(externalAccountId) + "/providers/Microsoft.CostManagement/query?api-version=2023-11-01";
  const query = {
    type: "ActualCost", timeframe: "Custom", timePeriod: { from: window.start, to: window.azureEnd },
    dataset: { granularity: "Daily", aggregation: { totalCost: { name: "PreTaxCost", function: "Sum" } }, grouping: [{ type: "Dimension", name: "ServiceName" }] }
  };
  const rows: BillingRow[] = [];
  let nextUrl: string | undefined = endpoint;
  try {
    while (nextUrl) {
      const response = await fetch(nextUrl, {
        method: "POST", headers: { authorization: "Bearer " + tokenData.access_token, "content-type": "application/json" },
        body: JSON.stringify(query), signal: AbortSignal.timeout(30_000), cache: "no-store"
      });
      if (!response.ok) throw new Error("Azure Cost Management API returned " + response.status);
      const payload = await response.json() as { properties?: { columns?: Array<{ name: string }>; rows?: unknown[][]; nextLink?: string } };
      const columns = payload.properties?.columns ?? [];
      const indexes = { amount: columns.findIndex((column) => /pretaxcost|cost/i.test(column.name)), date: columns.findIndex((column) => /usagedate|date/i.test(column.name)), service: columns.findIndex((column) => /servicename|service/i.test(column.name)), currency: columns.findIndex((column) => /currency/i.test(column.name)) };
      for (const row of payload.properties?.rows ?? []) {
        const amount = row[indexes.amount]; const date = row[indexes.date]; const service = row[indexes.service]; const currency = row[indexes.currency];
        if (indexes.amount >= 0 && indexes.date >= 0 && indexes.service >= 0 && typeof amount === "number" && typeof date === "number" && typeof service === "string") {
          const dateText = String(date);
          const usageDate = dateText.length === 8 ? dateText.slice(0, 4) + "-" + dateText.slice(4, 6) + "-" + dateText.slice(6, 8) : dateText;
          rows.push({ service, amount: String(amount), currency: typeof currency === "string" ? currency : defaultCurrency, usageDate });
        }
      }
      nextUrl = payload.properties?.nextLink;
    }
  } catch { throw new ProviderApiError("Azure Cost Management query failed. Check subscription scope and Cost Management Reader permissions."); }
  return rows;
}

async function syncGcp(externalAccountId: string, secret: Secret): Promise<BillingRow[]> {
  const rawCredentials = secret.serviceAccountJson;
  let credentials: Record<string, unknown>;
  try { credentials = typeof rawCredentials === "string" ? JSON.parse(rawCredentials) as Record<string, unknown> : rawCredentials as Record<string, unknown>; }
  catch { throw new ProviderCredentialConfigurationError("The GCP serviceAccountJson secret is not valid JSON."); }
  if (!credentials || typeof credentials !== "object" || !["service_account", "external_account"].includes(String(credentials.type))) {
    throw new ProviderCredentialConfigurationError("GCP credentials must be a service-account or external-account credential configuration.");
  }
  const table = requiredString(secret.billingExportTable, "billingExportTable");
  const match = table.match(/^([a-z][a-z0-9-]{4,28})\.([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z0-9_]+)$/);
  if (!match || match[1] !== externalAccountId) throw new ProviderCredentialConfigurationError("GCP billingExportTable must be a fully qualified table in the registered project.");
  let accessToken: { token?: string | null };
  try {
    const auth = new GoogleAuth({ credentials: credentials as never, scopes: ["https://www.googleapis.com/auth/bigquery"] });
    const client = await auth.getClient();
    accessToken = await client.getAccessToken();
  } catch { throw new ProviderApiError("Google Cloud authentication failed. Check the configured Workload Identity or service-account permissions."); }
  if (!accessToken.token) throw new ProviderApiError("Google authentication did not return an access token.");
  const window = dateWindow();
  const sql = "SELECT DATE(usage_start_time) AS usage_date, service.description AS service, currency, location.region AS region, SUM(cost) AS amount FROM \`" + table + "\` WHERE DATE(usage_start_time) >= @startDate AND DATE(usage_start_time) < @endDate GROUP BY usage_date, service, currency, region ORDER BY usage_date";
  const projectEndpoint = "https://bigquery.googleapis.com/bigquery/v2/projects/" + encodeURIComponent(externalAccountId);
  const queryEndpoint = projectEndpoint + "/queries";
  const rows: BillingRow[] = [];
  let pageToken: string | undefined;
  let jobId: string | undefined;
  let firstRequest = true;
  let pendingPolls = 0;
  try {
    while (true) {
      const url = firstRequest
        ? queryEndpoint
        : projectEndpoint + "/queries/" + encodeURIComponent(jobId!) + "?maxResults=10000&timeoutMs=10000" + (pageToken ? "&pageToken=" + encodeURIComponent(pageToken) : "");
      const response = await fetch(url, {
        method: firstRequest ? "POST" : "GET",
        headers: { authorization: "Bearer " + accessToken.token, "content-type": "application/json" },
        ...(firstRequest ? { body: JSON.stringify({ query: sql, useLegacySql: false, parameterMode: "NAMED", queryParameters: [
          { name: "startDate", parameterType: { type: "DATE" }, parameterValue: { value: window.start } },
          { name: "endDate", parameterType: { type: "DATE" }, parameterValue: { value: window.end } }
        ], maxResults: 10000, timeoutMs: 10000 }) } : {}),
        signal: AbortSignal.timeout(60_000), cache: "no-store"
      });
      if (!response.ok) throw new Error("BigQuery API returned " + response.status);
      const payload = await response.json() as { jobReference?: { jobId?: string }; schema?: { fields?: Array<{ name: string }> }; rows?: Array<{ f: Array<{ v: string | null }> }>; pageToken?: string; jobComplete?: boolean };
      firstRequest = false;
      jobId = jobId ?? payload.jobReference?.jobId;
      const fields = payload.schema?.fields?.map((field) => field.name) ?? [];
      const index = (name: string) => fields.indexOf(name);
      for (const item of payload.rows ?? []) {
        const values = item.f.map((field) => field.v ?? "");
        const date = values[index("usage_date")]; const service = values[index("service")]; const currency = values[index("currency")]; const amount = values[index("amount")]; const region = values[index("region")];
        if (date && service && currency && amount) rows.push({ usageDate: date.slice(0, 10), service, currency, amount, region });
      }
      pageToken = payload.pageToken;
      if (payload.jobComplete === false && !pageToken) {
        if (!jobId || pendingPolls >= 6) throw new Error("BigQuery query did not complete within the polling window.");
        pendingPolls += 1;
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }
      if (!pageToken) break;
    }
  } catch { throw new ProviderApiError("GCP BigQuery billing export query failed. Check BigQuery Job User and dataset read permissions."); }
  return rows;
}

/** Fetches daily read-only costs for the previous 30 complete UTC days. */
export async function executeProviderBillingSync(input: {
  provider: CloudProvider; externalAccountId: string; organizationId: string; cloudAccountId: string; credentialRef: string | null; defaultCurrency?: string;
}): Promise<{ csv: string; totalRows: number }> {
  const secret = await resolveProviderSecret(input);
  validateProviderSecret(input.provider, input.externalAccountId, secret);
  let rows: BillingRow[];
  if (input.provider === "AWS") rows = await syncAws(input.externalAccountId, secret);
  else if (input.provider === "AZURE") rows = await syncAzure(input.externalAccountId, secret, input.defaultCurrency ?? "USD");
  else rows = await syncGcp(input.externalAccountId, secret);
  if (!rows.length) throw new ProviderApiError("The provider returned no daily billing rows for the previous 30 complete UTC days.");
  return rowsToCsv(rows);
}
