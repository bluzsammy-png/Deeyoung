import { NextRequest, NextResponse } from "next/server";
import { withGuard } from "@/lib/guard";
import { getNewsFeed } from "@/lib/providers/news";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** GET /api/news?symbols=NVDA,AAPL — honest envelope; NEVER fabricated news (§11, §43).
 *  Paid surface (hard paywall): requires a signed-in, paid account. */
export const GET = withGuard(async (req: NextRequest) => {
  const symbolsParam = req.nextUrl.searchParams.get("symbols");
  const symbols = symbolsParam ? symbolsParam.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, 12) : ["NVDA", "AAPL", "MSFT", "TSLA", "AMD"];
  const envelope = await getNewsFeed(symbols);

  // Usage metering (§31) — cost honesty
  if (envelope.state === "OK") {
    await db.usageEvent.create({ data: { provider: envelope.provider, service: "NEWS", units: symbols.length, estCostUsd: 0 } });
  }
  return NextResponse.json(envelope);
});
