import { NextResponse } from "next/server";
import { bootstrapUser, sentinelTick } from "@/lib/sentinel";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST /api/sentinel/tick — run the SENTINEL scan cycle (heartbeat or manual). */
export async function POST() {
  const { user } = await bootstrapUser();
  const result = await sentinelTick(user.id);
  return NextResponse.json(result);
}
