import { NextResponse } from "next/server";
import { withGuard } from "@/lib/guard";
import { effectiveState } from "@/lib/sentinel";
import { getRegime } from "@/lib/engine/regime";
import { computeSignal } from "@/lib/engine/signals";
import { isVolumeBlind, marketProvider } from "@/lib/providers/market";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/signals — Analytics brain scan (works with SENTINEL fully disabled §3)
 * Returns top opportunities with full factor breakdown (§14) and plain-language WHY (§6).
 */
export const GET = withGuard(async (_req, { user, config, account }) => {
  const regime = await getRegime();
  // Scan priority: metals + FX majors first (the most-asked markets), then the
  // equity bench. Volume-blind assets (FX spot, gold proxy) use neutral volume
  // and a notional liquidity floor — Yahoo reports no meaningful volume for them.
  const SCAN = ["XAUUSD", "EURUSD", "GBPUSD", "USDJPY", "NVDA", "AAPL", "MSFT", "TSLA", "AMD", "META", "QQQ", "SPY", "COIN", "PLTR"];
  const { quotes } = await marketProvider.getQuotes(SCAN);
  const bySymbol = new Map(quotes.map((q) => [q.symbol, q]));
  const scanList = SCAN.map((s) => bySymbol.get(s)).filter((q): q is NonNullable<typeof q> => !!q);

  const signals = [];
  for (const q of scanList) {
    const [intraday, daily] = await Promise.all([
      marketProvider.getCandles(q.symbol, "1D"),
      marketProvider.getCandles(q.symbol, "6M"),
    ]);
    const series = intraday && intraday.candles.length >= 60 ? intraday : daily;
    if (!series || series.candles.length < 60) continue;
    const volumeBlind = isVolumeBlind(q.symbol);
    const rv = volumeBlind ? 1 : q.avgVolume > 0 ? q.volume / q.avgVolume : 1;
    const catalyst = Math.min(9, rv >= 2.5 ? 4 : rv >= 1.8 ? 3 : rv >= 1.3 ? 1.5 : 0);
    const sig = computeSignal({
      candles: series,
      dayCandles: intraday ?? undefined,
      relVolume: rv,
      regimePrimary: regime.primary,
      catalystScore: catalyst,
      // FX/gold: assert the notional floor so the liquidity gate reflects the
      // market's real depth instead of Yahoo's absent volume field.
      avgVolume: volumeBlind ? Math.ceil(config.minLiquidityUsd / Math.max(0.0001, q.price)) : q.avgVolume,
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
}, { minPlan: "TRIAL" });
