import { parse } from "csv-parse/sync";
import { MAX_CSV_BYTES, MAX_CSV_ROWS } from "./csv";
import type { CloudProvider } from "@prisma/client";

type ExportRow = Record<string, unknown>;
const headerKey = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
const text = (value: unknown) => typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
const aliases = {
  service: ["product_productname", "servicename", "service_description", "service"],
  currency: ["pricing_currencycode", "bill_billingcurrency", "billingcurrency", "currency"],
  usageDate: ["lineitem_usagestartdate", "date", "usage_start_time", "usagestarttime"],
  region: ["product_region", "resourcelocation", "location_region", "region"],
  externalId: ["identity_lineitemid", "lineitem_lineitemid", "lineitemid", "externalid"],
  usageType: ["lineitem_usagetype", "metercategory", "sku_description", "usagetype"],
  resourceId: ["lineitem_resourceid", "resourceid", "resource_name", "resourcename"]
} as const;

function pick(row: ExportRow, keys: readonly string[]): string {
  for (const key of keys) { const value = text(row[key]); if (value) return value; }
  return "";
}
function amountFor(provider: CloudProvider, row: ExportRow): string {
  const keys = provider === "AWS"
    ? ["lineitem_netunblendedcost", "lineitem_unblendedcost", "cost"]
    : provider === "AZURE" ? ["costinbillingcurrency", "cost"] : ["cost"];
  return pick(row, keys);
}
function dateOnly(value: string): string {
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? value;
}
function parseTags(row: ExportRow): Record<string, string> {
  const raw = pick(row, ["tags", "labels", "resource_tags"]);
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).flatMap(([key, value]) => {
      if (typeof value === "string" || typeof value === "number") return [[key, String(value)]];
      if (value && typeof value === "object" && "value" in value && typeof value.value === "string") return [[key, value.value]];
      return [];
    }));
  } catch { return {}; }
}
function escapeCsv(value: string): string {
  return /[",\r\n]/.test(value) ? '"' + value.replace(/"/g, '""') + '"' : value;
}

/** Converts AWS CUR, Azure Cost Management, and GCP detailed billing CSV exports to FinSight's canonical CSV. */
export function normalizeProviderBillingExport(provider: CloudProvider, input: string, defaultCurrency = "USD"): { csv: string; totalRows: number } {
  if (!input.trim()) throw new Error("The provider export is empty.");
  if (Buffer.byteLength(input, "utf8") > MAX_CSV_BYTES) throw new Error("Provider export exceeds the 5 MB limit.");
  let records: ExportRow[];
  try {
    records = parse(input, { bom: true, columns: (headers: string[]) => {
      const normalized = headers.map(headerKey);
      if (new Set(normalized).size !== normalized.length) throw new Error("Provider export contains duplicate normalized headers.");
      return normalized;
    }, skip_empty_lines: true, trim: true, max_record_size: 64 * 1024, relax_column_count: false }) as ExportRow[];
  } catch (error) { throw new Error(error instanceof Error ? error.message : "Unable to parse provider export."); }
  if (records.length > MAX_CSV_ROWS) throw new Error("Provider export contains more than " + MAX_CSV_ROWS + " data rows.");
  if (!records.length) throw new Error("Provider export has no billing rows.");
  const sourceFields = {
    service: aliases.service,
    amount: provider === "AWS" ? ["lineitem_netunblendedcost", "lineitem_unblendedcost", "cost"] : provider === "AZURE" ? ["costinbillingcurrency", "cost"] : ["cost"],
    usageDate: aliases.usageDate
  };
  for (const [field, candidates] of Object.entries(sourceFields)) {
    if (!candidates.some((key) => key in records[0])) throw new Error("Unsupported " + provider + " export: missing " + field + " source column.");
  }
  const normalizedRows = records.map((row) => ({
    service: pick(row, aliases.service),
    amount: amountFor(provider, row),
    currency: (pick(row, aliases.currency) || defaultCurrency).toUpperCase(),
    usageDate: dateOnly(pick(row, aliases.usageDate)),
    region: pick(row, aliases.region),
    externalId: pick(row, aliases.externalId),
    usageType: pick(row, aliases.usageType),
    resourceId: pick(row, aliases.resourceId),
    tags: parseTags(row)
  }));
  const tagKeys = [...new Set(normalizedRows.flatMap((row) => Object.keys(row.tags)))].sort();
  const headers = ["service", "amount", "currency", "usageDate", "region", "externalId", "usageType", "resourceId", ...tagKeys.map((key) => "tag:" + key)];
  const output = [headers.map(escapeCsv).join(",")];
  for (const row of normalizedRows) {
    const values = [row.service, row.amount, row.currency, row.usageDate, row.region, row.externalId, row.usageType, row.resourceId, ...tagKeys.map((key) => row.tags[key] ?? "")];
    output.push(values.map(escapeCsv).join(","));
  }
  return { csv: output.join("\n"), totalRows: records.length };
}
