import { NextRequest, NextResponse } from "next/server";
import { withGuard } from "@/lib/guard";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * POST /api/billing/waitlist — waitlist intent for Pro upgrades.
 * Payments land with Paystack (in progress); until then we collect demand,
 * audited and deduped per account.
 */
export const POST = withGuard(async (_req, { user }) => {
  const existing = await db.auditEvent.findFirst({
    where: { userId: user.id, category: "SUBSCRIPTION", action: "BILLING_WAITLIST" },
  });
  if (!existing) {
    await db.auditEvent.create({
      data: {
        userId: user.id,
        category: "SUBSCRIPTION",
        action: "BILLING_WAITLIST",
        detail: JSON.stringify({ email: user.email, at: new Date().toISOString() }),
      },
    });
  }
  return NextResponse.json({ ok: true });
});
