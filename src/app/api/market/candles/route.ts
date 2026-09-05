import { NextResponse } from "next/server";
import { withGuard } from "@/lib/guard";
import { marketProvider } from "@/lib/providers/market";

export const dynamic = "force-dynamic";

const VALID_TF = ["1D", "5D", "1M", "6M", "1Y"];

/** GET /api/market/candles?symbol=NVDA&tf=1D — paid surface (hard paywall). */
export const GET = withGuard(async (req: Request) => {
  const symbol = (new URL(req.url).searchParams.get("symbol") ?? "NVDA").toUpperCase();
  const tf = (new URL(req.url).searchParams.get("tf") ?? "1M").toUpperCase();
  if (!/^[A-Z0-9.\-]{1,10}$/.test(symbol)) {
    return NextResponse.json({ error: "Invalid symbol" }, { status: 400 });
  }
  const series = await marketProvider.getCandles(symbol, VALID_TF.includes(tf) ? tf : "1M");
  return NextResponse.json(series);
});
