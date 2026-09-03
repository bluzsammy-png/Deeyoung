import { NextResponse } from "next/server";
import { withGuard } from "@/lib/guard";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** GET /api/audit — immutable audit trail view (§45) */
export const GET = withGuard(async (_req, { user }) => {
  const events = await db.auditEvent.findMany({
    where: { OR: [{ userId: user.id }, { userId: null }] },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json({ events });
});
