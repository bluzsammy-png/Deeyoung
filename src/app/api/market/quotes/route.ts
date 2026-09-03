import { NextRequest, NextResponse } from "next/server";
import { marketProvider, universeSymbols, UNIVERSE } from "@/lib/providers/market";

export const dynamic = "force-dynamic";

/** GET /api/market/quotes?symbols=NVDA,AAPL (shared cache dedupes upstream §27)
 *  GET /api/market/quotes?class=FX — serve a whole asset class from the catalog. */
export async function GET(req: NextRequest) {
  const classParam = req.nextUrl.searchParams.get("class")?.toUpperCase();
  const symbolsParam = req.nextUrl.searchParams.get("symbols");
  const symbols = symbolsParam
    ? symbolsParam.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
    : classParam
      ? universeSymbols().filter((s) => UNIVERSE[s]?.assetClass === classParam)
      : universeSymbols();
  const capped = symbols.slice(0, 40);
  const { quotes, provider } = await marketProvider.getQuotes(capped);
  return NextResponse.json({ quotes, provider, asOf: Date.now() });
}
