import { NextResponse } from "next/server";
import { withGuard } from "@/lib/guard";
import { effectiveState } from "@/lib/sentinel";
import { getRegime } from "@/lib/engine/regime";
import { computeSignal } from "@/lib/engine/signals";
import { marketProvider } from "@/lib/providers/market";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/signals — Analytics brain scan (works with SENTINEL fully disabled §3)
 * Returns top opportunities with full factor breakdown (§14) and plain-language WHY (§6).
 */
export const GET = withGuard(async (_req, { user, config, account }) => {
  const regime = await getRegime();
  const { quotes } = await marketProvider.getQuotes(["NVDA", "AAPL", "MSFT", "TSLA", "AMD", "META", "PLTR", "GOOGL", "AMZN", "COIN", "SMH", "QQQ", "JPM", "MSTR", "UNH", "XLE", "XLF", "XLV", "IWM", "SPY"]);
  const scanList = quotes.slice(0, 12);

  const signals = [];
  for (const q of scanList) {
    const [intraday, daily] = await Promise.all([
      marketProvider.getCandles(q.symbol, "1D"),
      marketProvider.getCandles(q.symbol, "6M"),
    ]);
    const series = intraday && intraday.candles.length >= 60 ? intraday : daily;
    if (!series || series.candles.length < 60) continue;
    const rv = q.avgVolume > 0 ? q.volume / q.avgVolume : 1;
    const catalyst = Math.min(9, rv >= 2.5 ? 4 : rv >= 1.8 ? 3 : rv >= 1.3 ? 1.5 : 0);
    const sig = computeSignal({
      candles: series,
      dayCandles: intraday ?? undefined,
      relVolume: rv,
      regimePrimary: regime.primary,
      catalystScore: catalyst,
      avgVolume: q.avgVolume,
      minLiquidityUsd: config.minLiquidityUsd,
    });
    if (sig) signals.push({ ...sig, name: q.name, sector: q.sector, lastPrice: q.price, changePct: q.changePct });
  }

  signals.sort((a, b) => b.score - a.score);

  const positions = await db.position.findMany({ where: { userId: user.id } });
  const invested = positions.reduce((a, p) => a + p.qty * p.avgPrice, 0);
  const equity = account.cash + invested;

  return NextResponse.json({
    regime,
    signals,
    account: { equity, cash: account.cash, broker: account.broker },
    sentinel: { mode: config.mode, state: effectiveState(config, false), killSwitch: config.killSwitch },
    asOf: Date.now(),
  });
});
