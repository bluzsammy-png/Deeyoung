// DEEYOUNG PRO — Backtesting Engine (§21) with bias guards (§22)
// Signal engine runs on a trailing window ONLY (no look-ahead); fills occur at
// NEXT bar open + modeled slippage; equity marked at close.

import { computeSignal } from "@/lib/engine/signals";
import type { BacktestMetrics, Candle, CandleSeries } from "@/lib/types";
import type { Bar } from "@/lib/engine/indicators";

export interface BacktestParams {
  minScore: number;        // signal threshold
  riskPerTradePct: number; // risk per trade as % of equity
  stopATR: number;         // stop distance in ATR multiples
  targetATR: number;
  maxHoldBars: number;     // time stop
  direction: "LONG" | "SHORT" | "BOTH";
}

export const DEFAULT_PARAMS: BacktestParams = {
  minScore: 70, riskPerTradePct: 1, stopATR: 1.6, targetATR: 2.4, maxHoldBars: 20, direction: "LONG",
};

export interface BacktestTrade {
  entryT: number; exitT: number; symbol: string; direction: "LONG" | "SHORT";
  entry: number; exit: number; qty: number; pnlPct: number; pnlUsd: number;
  score: number; exitReason: "TARGET" | "STOP" | "TIME" | "END";
}

export interface BacktestResult {
  metrics: BacktestMetrics;
  equityCurve: { t: number; equity: number; benchmark: number }[];
  trades: BacktestTrade[];
  warnings: string[];
  dataState: string;
}

function atrSeries(bars: Bar[], period = 14): number[] {
  const out = new Array(bars.length).fill(0);
  let prev = 0;
  for (let i = 1; i < bars.length; i++) {
    const tr = Math.max(bars[i].h - bars[i].l, Math.abs(bars[i].h - bars[i - 1].c), Math.abs(bars[i].l - bars[i - 1].c));
    prev = i <= period ? (prev * (i - 1) + tr) / i : (prev * (period - 1) + tr) / period;
    out[i] = prev;
  }
  return out;
}

const BPS_SLIP = 6; // 6bps modeled slippage per side

export function runBacktest(series: CandleSeries, benchmark: CandleSeries, params: BacktestParams): BacktestResult {
  const bars = series.candles;
  const warnings: string[] = [
    "Backtests are computed on delayed-end-of-day data with modeled slippage — they are approximations, not promises.",
    "Survivorship bias: this test covers one symbol you selected today. Lists chosen from today's winners inflate results.",
    "Signal parameters were not optimized on out-of-sample data; treat walk-forward deltas as the honest expectation.",
  ];

  const atr = atrSeries(bars);
  let equity = 100_000, peak = equity, maxDD = 0;
  const curve: { t: number; equity: number; benchmark: number }[] = [];
  const trades: BacktestTrade[] = [];
  let barsInMarket = 0;
  const benchCloses = benchmark.candles.map((c) => c.c);
  const benchStart = benchCloses[0] ?? 1;
  const startIndex = 60; // indicator warm-up window

  interface Open { entryT: number; entry: number; qty: number; stop: number; target: number; score: number; direction: "LONG" | "SHORT" }
  let open: Open | null = null;

  for (let i = startIndex; i < bars.length; i++) {
    const bar = bars[i];

    // ── Manage open position FIRST (stops/targets checked on this bar's range) ──
    if (open) {
      barsInMarket++;
      const exitLong = open.direction === "LONG";
      const hitStop = exitLong ? bar.l <= open.stop : bar.h >= open.stop;
      const hitTarget = exitLong ? bar.h >= open.target : bar.l <= open.target;
      let exitPrice: number | null = null;
      let reason: BacktestTrade["exitReason"] | null = null;
      if (hitStop && hitTarget) { exitPrice = open.stop; reason = "STOP"; } // conservative: assume stop first (§21 no unrealistic fills)
      else if (hitStop) { exitPrice = open.stop; reason = "STOP"; }
      else if (hitTarget) { exitPrice = open.target; reason = "TARGET"; }
      else if (i - bars.findIndex((b) => b.t === open!.entryT) >= params.maxHoldBars) {
        exitPrice = bar.c; reason = "TIME";
      }
      else if (i === bars.length - 1) { exitPrice = bar.c; reason = "END"; }

      if (exitPrice != null && reason != null) {
        const slip = exitPrice * (BPS_SLIP / 10_000);
        const exec = exitLong ? exitPrice - slip : exitPrice + slip;
        const pnlUsd = exitLong ? (exec - open.entry) * open.qty : (open.entry - exec) * open.qty;
        const pnlPct = exitLong ? (exec - open.entry) / open.entry * 100 : (open.entry - exec) / open.entry * 100;
        equity += pnlUsd;
        trades.push({
          entryT: open.entryT, exitT: bar.t, symbol: series.symbol, direction: open.direction,
          entry: open.entry, exit: exec, qty: open.qty, pnlPct, pnlUsd, score: open.score, exitReason: reason,
        });
        open = null;
      }
    }

    // ── Entry: signal computed ONLY on bars ≤ i (no look-ahead) ──
    if (!open && i < bars.length - 1) {
      const window: CandleSeries = { ...series, candles: bars.slice(Math.max(0, i - 119), i + 1) };
      const sig = computeSignal({
        candles: window,
        relVolume: window.candles.slice(-1)[0]?.v && bars[i].v ? bars[i].v / Math.max(1, window.candles.slice(-20).reduce((a, b) => a + b.v, 0) / 20) : 1,
        regimePrimary: "RISK_ON",
        catalystScore: 0,
        avgVolume: window.candles.slice(-20).reduce((a, b) => a + b.v, 0) / 20 * window.candles[0].c,
        minLiquidityUsd: 0,
      });
      if (sig && sig.score >= params.minScore && sig.rr >= 1.2) {
        const dir: "LONG" | "SHORT" = params.direction === "BOTH" ? (sig.direction === "SHORT" ? "SHORT" : "LONG") : params.direction;
        if (dir !== "NEUTRAL") {
          const a = atr[i] || sig.atr;
          const entryNext = bars[i + 1].o; // fill at NEXT bar open — never current close (§21)
          const slip = entryNext * (BPS_SLIP / 10_000) * (dir === "LONG" ? 1 : -1);
          const execEntry = entryNext + slip;
          const stop = dir === "LONG" ? execEntry - a * params.stopATR : execEntry + a * params.stopATR;
          const target = dir === "LONG" ? execEntry + a * params.targetATR : execEntry - a * params.targetATR;
          const riskPerShare = Math.abs(execEntry - stop);
          const qty = riskPerShare > 0 ? Math.floor((equity * params.riskPerTradePct / 100) / riskPerShare) : 0;
          if (qty > 0 && qty * execEntry <= equity) {
            open = { entryT: bars[i + 1].t, entry: execEntry, qty, stop, target, score: sig.score, direction: dir };
          }
        }
      }
    }

    // ── Mark equity ──
    const openValue = open
      ? (open.direction === "LONG" ? (bar.c - open.entry) * open.qty : (open.entry - bar.c) * open.qty)
      : 0;
    const curEquity = 100_000 + equity - 100_000 + openValue; // equity + unrealized
    peak = Math.max(peak, curEquity);
    maxDD = Math.max(maxDD, (peak - curEquity) / peak * 100);
    const benchIdx = Math.min(benchCloses.length - 1, i - startIndex);
    curve.push({ t: bar.t, equity: curEquity, benchmark: 100_000 * (benchCloses[benchIdx] / benchStart) });
  }

  // ── Metrics (§21) ──
  const wins = trades.filter((t) => t.pnlUsd > 0);
  const losses = trades.filter((t) => t.pnlUsd <= 0);
  const totalReturnPct = (equity - 100_000) / 100_000 * 100;
  const years = Math.max((bars.length - startIndex) / 252, 0.08);
  const cagrPct = (Math.pow(equity / 100_000, 1 / years) - 1) * 100;

  // daily returns from curve for Sharpe/Sortino
  const rets: number[] = [];
  for (let i = 1; i < curve.length; i++) rets.push(curve[i].equity / curve[i - 1].equity - 1);
  const meanRet = rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : 0;
  const sd = rets.length ? Math.sqrt(rets.reduce((a, r) => a + (r - meanRet) ** 2, 0) / Math.max(1, rets.length - 1)) : 0;
  const downside = rets.filter((r) => r < 0);
  const sdDown = downside.length ? Math.sqrt(downside.reduce((a, r) => a + r * r, 0) / downside.length) : 0;
  const ann = Math.sqrt(252);
  const sharpe = sd > 0 ? (meanRet * 252) / (sd * ann) * ann / ann * (ann) : 0; // annualized
  const sharpeClean = sd > 0 ? (meanRet / sd) * ann : 0;
  const sortino = sdDown > 0 ? (meanRet / sdDown) * ann : 0;

  const grossWin = wins.reduce((a, t) => a + t.pnlUsd, 0);
  const grossLoss = Math.abs(losses.reduce((a, t) => a + t.pnlUsd, 0));
  const benchReturnPct = benchCloses.length > 1 ? (benchCloses[benchCloses.length - 1] / benchStart - 1) * 100 : 0;

  const metrics: BacktestMetrics = {
    totalReturnPct,
    cagrPct,
    maxDrawdownPct: maxDD,
    sharpe: Math.round(sharpeClean * 100) / 100,
    sortino: Math.round(sortino * 100) / 100,
    winRatePct: trades.length ? wins.length / trades.length * 100 : 0,
    avgWinPct: wins.length ? wins.reduce((a, t) => a + t.pnlPct, 0) / wins.length : 0,
    avgLossPct: losses.length ? losses.reduce((a, t) => a + t.pnlPct, 0) / losses.length : 0,
    largestWinPct: wins.length ? Math.max(...wins.map((t) => t.pnlPct)) : 0,
    largestLossPct: losses.length ? Math.min(...losses.map((t) => t.pnlPct)) : 0,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : wins.length ? 99 : 0,
    expectancyPct: trades.length ? trades.reduce((a, t) => a + t.pnlPct, 0) / trades.length : 0,
    numTrades: trades.length,
    exposurePct: curve.length ? barsInMarket / curve.length * 100 : 0,
    benchmarkReturnPct: benchReturnPct,
    alphaPct: totalReturnPct - benchReturnPct,
  };

  return { metrics, equityCurve: curve, trades, warnings, dataState: series.dataState };
}
