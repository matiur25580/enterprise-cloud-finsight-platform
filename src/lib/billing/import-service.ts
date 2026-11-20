import { ImportStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withOrganization } from "@/lib/tenant-context";
import { parseBillingCsv, type RowIssue } from "@/lib/billing/csv";

export type BillingImportResult = {
  importBatchId: string;
  totalRows: number;
  importedRows: number;
  rejectedRows: number;
  duplicateRows: number;
  status: ImportStatus;
};

/**
 * Import normalized billing rows for an organization. Interactive callers must
 * derive actorUserId from a verified session; trusted background workers omit it
 * and create a system-originated audit event rather than impersonating a user.
 */
export async function importBillingCsv(input: {
  organizationId: string;
  cloudAccountId: string;
  actorUserId?: string;
  fileName: string;
  csvText: string;
}): Promise<BillingImportResult> {
  const { organizationId, cloudAccountId, actorUserId, fileName, csvText } = input;
  if (!organizationId.trim() || !cloudAccountId.trim() || (actorUserId !== undefined && !actorUserId.trim())) {
    throw new Error("Verified organization, cloud account, and actor IDs are required.");
  }
  if (!fileName.toLowerCase().endsWith(".csv")) throw new Error("Only .csv files are accepted.");

  const parsed = parseBillingCsv(csvText, organizationId, cloudAccountId);
  return withOrganization(prisma, organizationId, async (tx) => {
    const account = await tx.cloudAccount.findFirst({
      where: { id: cloudAccountId, organizationId }, select: { id: true }
    });
    if (!account) throw new Error("Cloud account was not found in this organization.");

    if (actorUserId) {
      const membership = await tx.membership.findFirst({
        where: { organizationId, userId: actorUserId }, select: { id: true }
      });
      if (!membership) throw new Error("The actor is not a member of this organization.");
    }

    const batch = await tx.importBatch.create({
      data: {
        organizationId, cloudAccountId, uploadedByUserId: actorUserId ?? null,
        fileName: fileName.slice(0, 255), status: ImportStatus.PROCESSING,
        totalRows: parsed.totalRows
      }
    });

    const issues: RowIssue[] = [...parsed.issues];
    let importedRows = 0;
    let duplicateRows = 0;
    const fingerprints = parsed.rows.map((row) => row.fingerprint);
    const existingFingerprints = new Set<string>();
    if (fingerprints.length) {
      const existing = await tx.costRecord.findMany({
        where: { organizationId, cloudAccountId, fingerprint: { in: fingerprints } },
        select: { fingerprint: true }
      });
      existing.forEach((item) => existingFingerprints.add(item.fingerprint));
    }

    const candidates = parsed.rows.filter((row) => {
      if (existingFingerprints.has(row.fingerprint)) {
        duplicateRows += 1;
        return false;
      }
      return true;
    });

    if (candidates.length) {
      const inserted = await tx.costRecord.createMany({
        data: candidates.map((row) => ({
          organizationId, cloudAccountId, importBatchId: batch.id,
          sourceRowNumber: row.sourceRowNumber, externalId: row.externalId,
          service: row.service, region: row.region, usageType: row.usageType,
          resourceId: row.resourceId, amount: new Prisma.Decimal(row.amount),
          currency: row.currency, usageDate: row.usageDate,
          tags: row.tags as Prisma.InputJsonValue, fingerprint: row.fingerprint
        })),
        skipDuplicates: true
      });
      importedRows = inserted.count;
      duplicateRows += candidates.length - inserted.count;
    }

    if (issues.length) {
      await tx.importIssue.createMany({
        data: issues.map((issue) => ({
          importBatchId: batch.id, rowNumber: issue.rowNumber,
          errorCode: issue.errorCode, message: issue.message.slice(0, 1000)
        }))
      });
    }

    const rejectedRows = issues.length;
    const status = rejectedRows === 0
      ? ImportStatus.COMPLETED
      : importedRows > 0 || duplicateRows > 0
        ? ImportStatus.COMPLETED_WITH_ERRORS
        : ImportStatus.FAILED;

    await tx.importBatch.update({
      where: { id: batch.id },
      data: { status, importedRows, rejectedRows, duplicateRows, completedAt: new Date() }
    });
    await tx.auditLog.create({
      data: {
        organizationId, actorUserId: actorUserId ?? null, action: actorUserId ? "BILLING_CSV_IMPORTED" : "BILLING_PROVIDER_SYNC_IMPORTED",
        entityType: "ImportBatch", entityId: batch.id,
        metadata: {
          fileName: batch.fileName, totalRows: parsed.totalRows,
          importedRows, rejectedRows, duplicateRows
        }
      }
    });
    return { importBatchId: batch.id, totalRows: parsed.totalRows, importedRows, rejectedRows, duplicateRows, status };
  });
}
