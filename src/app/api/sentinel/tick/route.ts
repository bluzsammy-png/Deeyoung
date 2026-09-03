import { NextResponse } from "next/server";
import { sentinelTick } from "@/lib/sentinel";
import { withGuard } from "@/lib/guard";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST /api/sentinel/tick — run the SENTINEL scan cycle (heartbeat or manual). */
export const POST = withGuard(async (_req, { user }) => {
  const result = await sentinelTick(user.id);
  return NextResponse.json(result);
}, { minPlan: "PRO" });
