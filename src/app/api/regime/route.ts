import { NextResponse } from "next/server";
import { getRegime } from "@/lib/engine/regime";

export const dynamic = "force-dynamic";

/** GET /api/regime — shared regime computation (cached 5 min, §27) */
export async function GET() {
  const regime = await getRegime();
  return NextResponse.json(regime);
}
