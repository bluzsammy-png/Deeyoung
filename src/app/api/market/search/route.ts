import { NextRequest, NextResponse } from "next/server";
import { withGuard } from "@/lib/guard";
import { searchSymbols } from "@/lib/providers/market";

export const dynamic = "force-dynamic";

/** GET /api/market/search?q=toyota — discover ANY tradable symbol worldwide
 *  (equities, ETFs, FX, crypto, indices, futures). Shared cache dedupes hot
 *  queries; upstream is paced by the same politeness layer as quotes (§29).
 *  Paid surface (hard paywall): requires a signed-in, paid account. */
export const GET = withGuard(async (req: NextRequest) => {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  if (!q.trim()) return NextResponse.json({ results: [] });
  const results = await searchSymbols(q);
  return NextResponse.json({ results, asOf: Date.now() });
});
