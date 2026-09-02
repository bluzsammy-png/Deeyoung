import { NextResponse } from "next/server";
import { bootstrapUser } from "@/lib/sentinel";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** GET /api/audit — immutable audit trail view (§45) */
export async function GET() {
  const { user } = await bootstrapUser();
  const events = await db.auditEvent.findMany({
    where: { OR: [{ userId: user.id }, { userId: null }] },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json({ events });
}
