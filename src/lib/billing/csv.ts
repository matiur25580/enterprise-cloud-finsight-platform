import { parse } from "csv-parse/sync";
import { createHash } from "node:crypto";

export const MAX_CSV_BYTES = 5 * 1024 * 1024;
export const MAX_CSV_ROWS = 20_000;

export type NormalizedCostRow = {
  externalId: string | null;
  service: string;
  region: string | null;
  usageType: string | null;
  resourceId: string | null;
  amount: string;
  currency: string;
  usageDate: Date;
  tags: Record<string, string>;
  fingerprint: string;
  sourceRowNumber: number;
};
export type RowIssue = { rowNumber: number; errorCode: string; message: string };
export type CsvParseResult = { rows: NormalizedCostRow[]; issues: RowIssue[]; totalRows: number };

const REQUIRED_HEADERS = ["service", "amount", "currency", "usageDate"] as const;
const HEADER_ALIASES: Record<string, string> = {
  usage_date: "usageDate", usagedate: "usageDate", date: "usageDate",
  cost: "amount", charge: "amount", external_id: "externalId", externalid: "externalId",
  account_id: "externalId", usage_type: "usageType", usagetype: "usageType",
  resource_id: "resourceId", resourceid: "resourceId", availability_zone: "region"
};

function normalizeHeader(header: string): string {
  const key = header.trim().replace(/[\s-]+/g, "_").toLowerCase();
  return HEADER_ALIASES[key] ?? key;
}
function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
function makeFingerprint(
  row: Omit<NormalizedCostRow, "fingerprint">,
  organizationId: string,
  cloudAccountId: string
): string {
  const stable = [
    organizationId, cloudAccountId, row.externalId ?? "", row.service.toLowerCase(),
    row.region ?? "", row.usageType ?? "", row.resourceId ?? "", row.amount,
    row.currency, row.usageDate.toISOString().slice(0, 10),
    JSON.stringify(Object.fromEntries(Object.entries(row.tags).sort(([a], [b]) => a.localeCompare(b))))
  ].join("|");
  return createHash("sha256").update(stable).digest("hex");
}

export function parseBillingCsv(input: string, organizationId: string, cloudAccountId: string): CsvParseResult {
  const byteLength = Buffer.byteLength(input, "utf8");
  if (byteLength === 0) throw new Error("The CSV file is empty.");
  if (byteLength > MAX_CSV_BYTES) throw new Error("CSV file exceeds the 5 MB limit.");

  let records: Record<string, unknown>[];
  try {
    records = parse(input, {
      bom: true,
      columns: (headers: string[]) => {
        const normalized = headers.map(normalizeHeader);
        if (new Set(normalized).size !== normalized.length) throw new Error("CSV contains duplicate column headers.");
        return normalized;
      },
      skip_empty_lines: true,
      trim: true,
      max_record_size: 64 * 1024,
      relax_column_count: false
    }) as Record<string, unknown>[];
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "Unable to parse CSV.");
  }

  if (records.length > MAX_CSV_ROWS) throw new Error("CSV contains more than " + MAX_CSV_ROWS + " data rows.");
  const headers = records.length ? Object.keys(records[0]) : [];
  const missing = REQUIRED_HEADERS.filter((header) => !headers.includes(header));
  if (missing.length) throw new Error("Missing required CSV columns: " + missing.join(", ") + ".");

  const rows: NormalizedCostRow[] = [];
  const issues: RowIssue[] = [];
  records.forEach((record, index) => {
    const rowNumber = index + 2;
    const service = text(record.service);
    const amount = text(record.amount);
    const currency = text(record.currency).toUpperCase();
    const dateText = text(record.usageDate);
    const errors: string[] = [];

    if (!service || service.length > 180) errors.push("Service is required and must be at most 180 characters.");
    if (!/^-?\d+(\.\d{1,8})?$/.test(amount)) errors.push("Amount must be a decimal with up to 8 fractional digits.");
    if (!/^[A-Z]{3}$/.test(currency)) errors.push("Currency must be a 3-letter ISO currency code.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) errors.push("usageDate must use YYYY-MM-DD format.");

    const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(dateText) ? new Date(dateText + "T00:00:00.000Z") : null;
    if (parsedDate && (!Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== dateText)) {
      errors.push("usageDate is not a valid calendar date.");
    }

    const region = text(record.region) || null;
    const usageType = text(record.usageType) || null;
    const resourceId = text(record.resourceId) || null;
    const externalId = text(record.externalId) || null;
    if (externalId && externalId.length > 255) errors.push("externalId must be at most 255 characters.");

    const tags: Record<string, string> = {};
    for (const [key, value] of Object.entries(record)) {
      if (key.startsWith("tag:") && text(value)) tags[key.slice(4)] = text(value);
    }
    if (errors.length || !parsedDate) {
      issues.push({ rowNumber, errorCode: "INVALID_ROW", message: errors.join(" ") || "Invalid row." });
      return;
    }

    const withoutFingerprint = {
      externalId, service, region, usageType, resourceId, amount, currency,
      usageDate: parsedDate, tags, sourceRowNumber: rowNumber
    };
    rows.push({
      ...withoutFingerprint,
      fingerprint: makeFingerprint(withoutFingerprint, organizationId, cloudAccountId)
    });
  });
  return { rows, issues, totalRows: records.length };
}
