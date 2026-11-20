import { parse } from "csv-parse/sync";
import { MAX_CSV_BYTES, MAX_CSV_ROWS } from "./csv";
import type { CloudProvider } from "@prisma/client";

type ExportRow = Record<string, unknown>;
const headerKey = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
const text = (value: unknown) => typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
const aliases = {
  service: ["product_productname", "servicename", "service_description", "service"],
  amount: ["lineitem_netunblendedcost", "lineitem_unblendedcost", "costinbillingcurrency", "cost"],
  currency: ["pricing_currencycode", "bill_billingcurrency", "billingcurrency", "currency"],
  usageDate: ["lineitem_usagestartdate", "date", "usage_start_time", "usagestarttime"],
  region: ["product_region", "resourcelocation", "location_region", "region"],
  externalId: ["identity_lineitemid", "lineitem_lineitemid", "lineitemid", "externalid"],
  usageType: ["lineitem_usagetype", "metercategory", "sku_description", "usagetype"],
  resourceId: ["lineitem_resourceid", "resourceid", "resource_name", "resourcename"]
} as const;

function pick(row: ExportRow, keys: readonly string[]): string {
  for (const key of keys) {
    const value = text(row[key]);
    if (value) return value;
  }
  return "";
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

/**
 * Converts provider-native billing exports to FinSight's canonical CSV.
 * Supports AWS CUR/Cost & Usage export, Azure Cost Management export, and
 * GCP detailed billing export. This is an export-file adapter, not a live API client.
 */
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
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "Unable to parse provider export.");
  }
  if (records.length > MAX_CSV_ROWS) throw new Error("Provider export contains more than " + MAX_CSV_ROWS + " data rows.");
  if (!records.length) throw new Error("Provider export has no billing rows.");
  const required = provider === "AWS" ? ["service", "amount", "usageDate"] : provider === "AZURE" ? ["service", "amount", "usageDate"] : ["service", "amount", "usageDate"];
  const first = records[0];
  for (const field of required) {
    const candidates = aliases[field as keyof typeof aliases];
    if (!candidates.some((key) => key in first)) throw new Error("Unsupported " + provider + " export: missing " + field + " source column.");
  }
  const output = ["service,amount,currency,usageDate,region,externalId,usageType,resourceId"];
  for (const [index, row] of records.entries()) {
    const service = pick(row, aliases.service);
    const amount = pick(row, provider === "AWS" ? ["lineitem_netunblendedcost", "lineitem_unblendedcost", "cost"] : provider === "AZURE" ? ["costinbillingcurrency", "cost"] : ["cost"]);
    const currency = (pick(row, aliases.currency) || defaultCurrency).toUpperCase();
    const usageDate = dateOnly(pick(row, aliases.usageDate));
    if (!service || !amount || !usageDate) {
      // Keep malformed rows so the canonical parser can report them with a source line number.
      output.push([service, amount, currency, usageDate, pick(row, aliases.region), pick(row, aliases.externalId), pick(row, aliases.usageType), pick(row, aliases.resourceId)].map(escapeCsv).join(","));
      continue;
    }
    const tags = parseTags(row);
    const tagColumns = Object.entries(tags).map(([key, value]) => [escapeCsv("tag:" + key), escapeCsv(value)].join(","));
    output.push([service, amount, currency, usageDate, pick(row, aliases.region), pick(row, aliases.externalId), pick(row, aliases.usageType), pick(row, aliases.resourceId), ...tagColumns].map(escapeCsv).join(","));
    // Provider exports may have a different tag set per row; the canonical parser needs a stable header.
    if (tagColumns.length) {
      const headerTags = Object.keys(tags).map((key) => "tag:" + key);
      if (headerTags.some((key) => !output[0].includes("," + key))) {
        // Tag values are optional metadata; omit row-specific tags here rather than emit malformed columns.
        output[output.length - 1] = [service, amount, currency, usageDate, pick(row, aliases.region), pick(row, aliases.externalId), pick(row, aliases.usageType), pick(row, aliases.resourceId)].map(escapeCsv).join(",");
      }
    }
    if (index === records.length - 1) continue;
  }
  return { csv: output.join("\n"), totalRows: records.length };
}
