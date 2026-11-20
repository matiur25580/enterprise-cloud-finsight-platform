import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withUserContext } from "@/lib/user-context";
import { withOrganization } from "@/lib/tenant-context";
import { hasPermission } from "@/lib/permissions";
import { normalizeProviderBillingExport } from "@/lib/billing/provider-adapters";
import { importBillingCsv } from "@/lib/billing/import-service";
import type { CloudProvider } from "@prisma/client";
import { consumeApiRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const { organizationId } = await params;
    const membership = await withUserContext(prisma, session.user.id, (tx) => tx.membership.findFirst({ where: { organizationId, userId: session.user.id }, select: { role: true } }));
    if (!membership || !hasPermission(membership.role, "billing:import")) return NextResponse.json({ error: "Billing import permission required." }, { status: 403 });
  const rateLimit = await consumeApiRateLimit({
    organizationId,
    userId: session.user.id,
    bucket: "billing:provider-import",
    limit: 5,
    windowSeconds: 900
  });
  const limitedResponse = rateLimitResponse(rateLimit);
  if (limitedResponse) return limitedResponse;
    const form = await request.formData();
    const upload = form.get("file");
    const cloudAccountId = form.get("cloudAccountId");
    if (!(upload instanceof File) || typeof cloudAccountId !== "string" || !cloudAccountId.trim()) return NextResponse.json({ error: "A provider export CSV and cloud account are required." }, { status: 400 });
    if (upload.size === 0 || upload.size > 5 * 1024 * 1024) return NextResponse.json({ error: "CSV must be between 1 byte and 5 MB." }, { status: 413 });
    if (!upload.name.toLowerCase().endsWith(".csv")) return NextResponse.json({ error: "Only CSV exports are accepted." }, { status: 415 });
    const account = await withOrganization(prisma, organizationId, (tx) => tx.cloudAccount.findFirst({ where: { id: cloudAccountId, organizationId }, select: { id: true, provider: true, currency: true } }));
    if (!account) return NextResponse.json({ error: "Cloud account not found in this organization." }, { status: 404 });
    const source = await upload.text();
    const normalized = normalizeProviderBillingExport(account.provider as CloudProvider, source, account.currency);
    const result = await importBillingCsv({ organizationId, cloudAccountId, actorUserId: session.user.id, fileName: upload.name, csvText: normalized.csv });
    return NextResponse.json({ ...result, provider: account.provider, sourceRows: normalized.totalRows }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to import provider export.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
