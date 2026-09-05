import { NextResponse } from "next/server";
import { withGuard } from "@/lib/guard";
import { getRegime } from "@/lib/engine/regime";

export const dynamic = "force-dynamic";

/** GET /api/regime — shared regime computation (cached 5 min, §27).
 *  Paid surface (hard paywall): requires a signed-in, paid account. */
export const GET = withGuard(async () => {
  const regime = await getRegime();
  return NextResponse.json(regime);
});
