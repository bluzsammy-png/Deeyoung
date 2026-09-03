import { NextRequest, NextResponse } from "next/server";
import { marketProvider, universeSymbols } from "@/lib/providers/market";

export const dynamic = "force-dynamic";

/** GET /api/market/quotes?symbols=NVDA,AAPL (shared cache dedupes upstream §27) */
export async function GET(req: NextRequest) {
  const symbolsParam = req.nextUrl.searchParams.get("symbols");
  const symbols = symbolsParam ? symbolsParam.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean) : universeSymbols();
  const capped = symbols.slice(0, 30);
  const { quotes, provider } = await marketProvider.getQuotes(capped);
  return NextResponse.json({ quotes, provider, asOf: Date.now() });
}
