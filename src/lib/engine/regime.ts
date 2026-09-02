// DEEYOUNG PRO — Market Regime Engine (§13)
// Classifies the current regime from index/ETF behavior and explains WHY it is active.

import { atr, ema, lastDefined, realizedVolPct, roc, sma } from "@/lib/engine/indicators";
import type { CandleSeries, RegimeState } from "@/lib/types";

function classify(input: {
  spyTrend: number;     // price vs EMA50 %
  qqqTrend: number;
  iwmTrend: number;
  volPct: number;       // realized vol annualized %
  volPercentile: number;// vs 1-year history
  spyRoc: number;       // momentum
  breadthPct: number;   // % of universe above its EMA20
  bbWidthPctile: number;
}): RegimeState {
  const { spyTrend, qqqTrend, iwmTrend, volPct, volPercentile, spyRoc, breadthPct } = input;

  const drivers: RegimeState["drivers"] = [
    { name: "S&P 500 trend (vs EMA50)", value: `${spyTrend > 0 ? "+" : ""}${spyTrend.toFixed(1)}%`, leaning: spyTrend > 0.5 ? "BULL" : spyTrend < -0.5 ? "BEAR" : "NEUTRAL" },
    { name: "Nasdaq-100 trend", value: `${qqqTrend > 0 ? "+" : ""}${qqqTrend.toFixed(1)}%`, leaning: qqqTrend > 0.5 ? "BULL" : qqqTrend < -0.5 ? "BEAR" : "NEUTRAL" },
    { name: "Small caps (IWM)", value: `${iwmTrend > 0 ? "+" : ""}${iwmTrend.toFixed(1)}%`, leaning: iwmTrend > 0.5 ? "BULL" : iwmTrend < -0.5 ? "BEAR" : "NEUTRAL" },
    { name: "Realized volatility (30d)", value: `${volPct.toFixed(1)}%`, leaning: volPct > 30 ? "BEAR" : volPct < 15 ? "BULL" : "NEUTRAL" },
    { name: "Breadth (% above EMA20)", value: `${breadthPct.toFixed(0)}%`, leaning: breadthPct > 60 ? "BULL" : breadthPct < 40 ? "BEAR" : "NEUTRAL" },
    { name: "Momentum (SPY 10d ROC)", value: `${spyRoc > 0 ? "+" : ""}${spyRoc.toFixed(1)}%`, leaning: spyRoc > 1 ? "BULL" : spyRoc < -1 ? "BEAR" : "NEUTRAL" },
  ];

  let primary: RegimeState["primary"];
  if (volPct > 32 || (volPercentile > 90 && volPct > 20)) primary = "HIGH_VOLATILITY";
  else if (spyTrend > 1 && breadthPct > 55 && qqqTrend > 1) primary = "RISK_ON";
  else if (spyTrend < -1 && breadthPct < 45 && qqqTrend < -0.5) primary = "RISK_OFF";
  else if (Math.abs(spyTrend) <= 1 && volPercentile < 40) primary = "SIDEWAYS";
  else if (Math.abs(spyRoc) > 2.5) primary = spyRoc > 0 ? "MOMENTUM" : "RISK_OFF";
  else primary = "RISK_ON";

  if (primary === "SIDEWAYS" && input.bbWidthPctile < 20) primary = "LOW_VOLATILITY";

  const labelMap: Record<string, string> = {
    RISK_ON: "Risk-On", RISK_OFF: "Risk-Off", HIGH_VOLATILITY: "High Volatility",
    LOW_VOLATILITY: "Low Volatility", SIDEWAYS: "Sideways", MOMENTUM: "Momentum",
    MEAN_REVERSION: "Mean Reversion", EVENT_DRIVEN: "Event-Driven", LIQUIDITY_STRESS: "Liquidity Stress",
  };
  const confidence = Math.round(55 + Math.min(40, Math.abs(spyTrend) * 8 + Math.abs(breadthPct - 50) * 0.8));

  const explanationMap: Record<string, string> = {
    RISK_ON: `Major indices are trading above their 50-day EMA with ${breadthPct.toFixed(0)}% of the tracked universe above its 20-day EMA, and 30-day realized volatility sits at a calm ${volPct.toFixed(1)}%. Conditions historically favor trend-following longs, so signal thresholds are modestly relaxed and position sizing is normal.`,
    RISK_OFF: `Indices are below their 50-day EMA with deteriorating breadth (${breadthPct.toFixed(0)}% above EMA20) and volatility at ${volPct.toFixed(1)}%. DeeYoung raises signal thresholds, reduces position sizing, and widens stops to avoid chop-driven stop-outs.`,
    HIGH_VOLATILITY: `30-day realized volatility has reached ${volPct.toFixed(1)}% (top decile of the past year). Risk per trade is cut, signal thresholds rise, and SENTINEL requires higher conviction before acting. Wide price swings can trigger stops that would survive in calmer regimes.`,
    LOW_VOLATILITY: `Volatility is compressed (${volPct.toFixed(1)}%, low percentile of the past year) and ranges are narrowing. Breakouts from this base can be powerful, but DeeYoung watches for volatility expansions that often precede regime shifts.`,
    SIDEWAYS: `The S&P 500 is within ±1% of its 50-day EMA and breadth is mixed (${breadthPct.toFixed(0)}%). Trend signals are less reliable in this regime, so DeeYoung leans on volume-confirmed setups and reduces trade frequency.`,
    MOMENTUM: `Short-term momentum is strong (SPY 10-day rate of change ${spyRoc.toFixed(1)}%). Momentum-continuation setups get priority; mean-reversion fades are penalized.`,
  };

  return {
    primary,
    label: labelMap[primary] ?? primary,
    confidence,
    drivers,
    explanation: explanationMap[primary] ?? explanationMap["RISK_ON"],
    influences: {
      signalThresholdDelta: primary === "HIGH_VOLATILITY" || primary === "RISK_OFF" ? +8 : primary === "RISK_ON" || primary === "MOMENTUM" ? -3 : 0,
      positionSizingMultiplier: primary === "HIGH_VOLATILITY" ? 0.5 : primary === "RISK_OFF" ? 0.7 : primary === "RISK_ON" ? 1.0 : 0.85,
      tradeFrequency: primary === "SIDEWAYS" ? "REDUCED" : primary === "RISK_ON" ? "NORMAL" : "CAUTIOUS",
      stopDistanceMultiplier: primary === "HIGH_VOLATILITY" ? 2.2 : 1.6,
    },
    asOf: Date.now(),
  };
}

export interface RegimeInput {
  spy: CandleSeries; qqq: CandleSeries; iwm: CandleSeries;
  universeCloses: Record<string, number[]>; // symbol → daily closes
}

export function computeRegime(input: RegimeInput): RegimeState {
  const trendPct = (s: CandleSeries) => {
    const closes = s.candles.map((c) => c.c);
    const e = lastDefined(ema(closes, Math.min(50, Math.floor(closes.length / 2))));
    const price = closes[closes.length - 1];
    return e ? (price - e) / e * 100 : 0;
  };
  const spyCloses = input.spy.candles.map((c) => c.c);
  const spyTrend = trendPct(input.spy);
  const qqqTrend = trendPct(input.qqq);
  const iwmTrend = trendPct(input.iwm);
  const volPct = realizedVolPct(spyCloses, Math.min(30, spyCloses.length - 1)) ?? 18;
  const spyRoc = lastDefined(roc(spyCloses, 10)) ?? 0;

  // breadth: % of universe above EMA20
  let above = 0, total = 0;
  for (const [sym, closes] of Object.entries(input.universeCloses)) {
    if (closes.length < 21) continue;
    total++;
    const e = lastDefined(ema(closes, 20));
    if (e && closes[closes.length - 1] > e) above++;
  }
  const breadthPct = total ? (above / total) * 100 : 50;

  // volatility percentile vs own history
  const vols: number[] = [];
  for (let end = 40; end <= spyCloses.length; end += 5) {
    const v = realizedVolPct(spyCloses.slice(0, end), 30);
    if (v != null) vols.push(v);
  }
  const volPercentile = vols.length ? (vols.filter((v) => v <= volPct).length / vols.length) * 100 : 50;

  // Bollinger width percentile (squeeze detection)
  const s = sma(spyCloses, 20);
  const widths: number[] = [];
  for (let i = 20; i < spyCloses.length; i++) {
    const win = spyCloses.slice(i - 19, i + 1);
    const m = s[i];
    if (m == null) continue;
    const sd = Math.sqrt(win.reduce((a, b) => a + (b - m) ** 2, 0) / 20);
    widths.push((4 * sd / m) * 100);
  }
  const curWidth = widths.length ? widths[widths.length - 1] : 0;
  const bbWidthPctile = widths.length ? (widths.filter((w) => w <= curWidth).length / widths.length) * 100 : 50;

  return classify({ spyTrend, qqqTrend, iwmTrend, volPct, volPercentile, spyRoc, breadthPct, bbWidthPctile });
}

/** In-memory cache for regime so 1,000 users share one computation (§27). */
let regimeCache: { value: RegimeState; expires: number } | null = null;
export async function getRegime(): Promise<RegimeState> {
  if (regimeCache && Date.now() < regimeCache.expires) return regimeCache.value;
  const { marketProvider, universeSymbols } = await import("@/lib/providers/market");
  const syms = universeSymbols();
  const [spy, qqq, iwm] = await Promise.all([
    marketProvider.getCandles("SPY", "6M"),
    marketProvider.getCandles("QQQ", "6M"),
    marketProvider.getCandles("IWM", "6M"),
  ]);
  const universeCloses: Record<string, number[]> = {};
  await Promise.all(syms.map(async (sym) => {
    if (sym === "SPY" || sym === "QQQ" || sym === "IWM") { universeCloses[sym] = (sym === "SPY" ? spy : sym === "QQQ" ? qqq : iwm).candles.map((c) => c.c); return; }
    const s = await marketProvider.getCandles(sym, "6M");
    if (s) universeCloses[sym] = s.candles.map((c) => c.c);
  }));
  const value = computeRegime({ spy, qqq, iwm, universeCloses });
  regimeCache = { value, expires: Date.now() + 5 * 60_000 };
  return value;
}

// ATR import guard (used indirectly); keeps tree-shaking honest
export const __atrRef = atr;
