import { NextResponse } from "next/server";
import { withGuard } from "@/lib/guard";
import { db } from "@/lib/db";
import { marketProvider } from "@/lib/providers/market";
import { DEFAULT_PARAMS, runBacktest } from "@/lib/engine/backtest";
import type { BacktestParams } from "@/lib/engine/backtest";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const UNIVERSE_LIST = ["NVDA", "AAPL", "MSFT", "TSLA", "AMD", "META", "PLTR", "COIN", "QQQ", "SMH", "SPY", "JPM"];

/** POST /api/backtest — run a bias-guarded backtest (§21/§22). Metered (§31). Pro feature. */
export const POST = withGuard(async (req: Request, { user }) => {
  const body = await req.json().catch(() => ({}));

  const symbol = typeof body.symbol === "string" && UNIVERSE_LIST.includes(body.symbol.toUpperCase()) ? body.symbol.toUpperCase() : "NVDA";
  const rangeMonths = [3, 6, 12, 24].includes(body.rangeMonths) ? body.rangeMonths : 12;
  const params: BacktestParams = {
    minScore: clampNum(body.minScore, 40, 95, DEFAULT_PARAMS.minScore),
    riskPerTradePct: clampNum(body.riskPerTradePct, 0.25, 3, DEFAULT_PARAMS.riskPerTradePct),
    stopATR: clampNum(body.stopATR, 0.8, 4, DEFAULT_PARAMS.stopATR),
    targetATR: clampNum(body.targetATR, 1, 6, DEFAULT_PARAMS.targetATR),
    maxHoldBars: Math.round(clampNum(body.maxHoldBars, 5, 60, DEFAULT_PARAMS.maxHoldBars)),
    direction: ["LONG", "SHORT", "BOTH"].includes(body.direction) ? body.direction : "LONG",
  };

  const tf = rangeMonths <= 3 ? "1M" : rangeMonths === 6 ? "6M" : "1Y";
  const [series, benchmark] = await Promise.all([
    marketProvider.getCandles(symbol, tf === "1M" ? "1M" : tf),
    marketProvider.getCandles("SPY", tf === "1M" ? "1M" : tf),
  ]);
  if (!series || series.candles.length < 80) {
    return NextResponse.json({ error: "Not enough data for this range. Try a longer period." }, { status: 422 });
  }
  // Honesty gate (§55): never present backtest results computed from simulated marks
  if (series.dataState === "SIMULATED" || benchmark.dataState === "SIMULATED") {
    return NextResponse.json({ error: "Backtesting is paused: market data is degraded to simulated marks. DeeYoung will not generate performance statistics from numbers it cannot verify. Try again when live data returns." }, { status: 503 });
  }

  const result = runBacktest(series, benchmark, params);

  await db.usageEvent.create({ data: { userId: user.id, provider: "DEEYOUNG", service: "BACKTEST", units: 1, estCostUsd: 0 } });
  await db.auditEvent.create({
    data: { userId: user.id, category: "ADMIN", action: "BACKTEST_RUN", detail: JSON.stringify({ symbol, rangeMonths, params }) },
  });

  return NextResponse.json({ symbol, rangeMonths, params, ...result });
}, { minPlan: "PRO" });

function clampNum(v: unknown, min: number, max: number, dflt: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(min, Math.min(max, n));
}
