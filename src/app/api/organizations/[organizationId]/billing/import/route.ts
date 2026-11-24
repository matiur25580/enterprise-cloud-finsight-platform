import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withUserContext } from "@/lib/user-context";
import { importBillingCsv } from "@/lib/billing/import-service";
import { hasPermission } from "@/lib/permissions";
import { consumeApiRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

// Authorize the organization member and validate upload limits before parsing billing data.
export async function POST(request: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const { organizationId } = await params;
    const membership = await withUserContext(prisma, session.user.id, (tx) => tx.membership.findFirst({
      where: { organizationId, userId: session.user.id }, select: { role: true }
    }));
    if (!membership || !hasPermission(membership.role, "billing:import")) {
      return NextResponse.json({ error: "You do not have permission to import billing data." }, { status: 403 });
    }
  const rateLimit = await consumeApiRateLimit({
    organizationId,
    userId: session.user.id,
    bucket: "billing:csv-import",
    limit: 5,
    windowSeconds: 900
  });
  const limitedResponse = rateLimitResponse(rateLimit);
  if (limitedResponse) return limitedResponse;
    const form = await request.formData();
    const upload = form.get("file");
    const cloudAccountId = form.get("cloudAccountId");
    if (!(upload instanceof File) || typeof cloudAccountId !== "string" || !cloudAccountId.trim()) {
      return NextResponse.json({ error: "A CSV file and cloud account are required." }, { status: 400 });
    }
    if (upload.size === 0 || upload.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "CSV must be between 1 byte and 5 MB." }, { status: 413 });
    }
    if (!upload.name.toLowerCase().endsWith(".csv")) {
      return NextResponse.json({ error: "Only .csv files are accepted." }, { status: 415 });
    }
    const csvText = await upload.text();
    const result = await importBillingCsv({
      organizationId, cloudAccountId, actorUserId: session.user.id,
      fileName: upload.name, csvText
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to import billing CSV.";
    const status = /not found in this organization|not a member/i.test(message) ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
