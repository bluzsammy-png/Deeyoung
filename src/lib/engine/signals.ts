// DEEYOUNG PRO — Multi-Factor Signal Engine (§14) + Catalyst Intelligence (§12)
// Deterministic. AI may explain/rank/summarize but NEVER overrides scoring. (§5)

import { atr, bollinger, ema, lastDefined, macd, relativeVolume, roc, rsi, vwap } from "@/lib/engine/indicators";
import type { Bar } from "@/lib/engine/indicators";
import { candleFactorScore } from "@/lib/engine/candlestick";
import type { CandleSeries, DataState, FactorContribution, SignalResult } from "@/lib/types";

// Factor weights — technical factors sum to 100 with catalyst/regime as modifiers (§14 example)
const W = {
  EMA_STRUCTURE: 18,
  VWAP: 15,
  RSI: 12,
  MACD: 14,
  BOLLINGER: 8,
  ROC: 8,
  VOLUME: 11,
  CATALYST: 9,
  REGIME: 5,
};

// Horizon-aware weight table: the campaign-validated weights stay UNTOUCHED and the
// CANDLESTICKS factor is added as a CONFLUENCE BONUS (max +9 on strong patterns with
// 5m agreement). Rationale (measured in the A/B probe): re-funding/trimming the
// existing weights shifted every score ~9 points down and pushed gate-65 setups out
// of reach (treatment n=0 on BTC) — gate calibration depends on the original scale.
// Nominal budget 95 technical + 9 catalyst + 5 regime = 109, clamped at 100.
// Legacy scoring above is untouched (byte-identical when input.horizon is undefined).
const W_HORIZON: Record<string, number> = { ...W, CANDLESTICKS: 9 };

export interface EngineInput {
  candles: CandleSeries;
  dayCandles?: CandleSeries;   // for VWAP anchoring on intraday
  relVolume: number;           // relative volume
  regimePrimary: string;
  catalystScore: number;       // 0–9 from catalyst engine (0 when no verified catalysts)
  avgVolume: number;
  minLiquidityUsd: number;
  /** Intraday evaluation horizon. Undefined = legacy scoring (unchanged).
   *  Horizon-aware scoring is campaign-validated (60d Binance 1m replay, 2026-09):
   *  chase-guard (relVol ≥1.5× and stretched bands underperform 5×) + M30 momentum bonus. */
  horizon?: "M10" | "M30" | null;
  /** Per-factor weight MULTIPLIERS from the learning memory (learning-memory §NEW).
   *  Clamped to [0.5, 1.5]. Absent/undefined ⇒ 1.0 everywhere ⇒ byte-identical legacy
 *  scoring. The engine itself stays deterministic — callers decide whether to adapt. */
  adaptiveWeights?: Record<string, number> | null;
  /** OPT-IN (true only) — adds the CANDLESTICKS factor + W_HORIZON weights to horizon
   *  scoring. DEFAULT (undefined/false) = the exact shipped 73554e3 behavior. Rationale:
   *  A/B round 1 REJECTED the bonus design (n=269→413 with win 46.5→36.6%, maxDD
   *  31→58%) — candle confluence must never silently change production scoring. */
  candlePatterns?: boolean | null;
}

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

export function computeSignal(input: EngineInput): SignalResult | null {
  // Effective weights: new horizon table (candle pack ON) or the original tables,
  // scaled by bounded adaptive multipliers (learning memory). Legacy path (no
  // horizon) and the A/B control (candlePatterns:false) are byte-identical to 73554e3.
  const useCandles = !!input.horizon && input.candlePatterns === true;
  const baseW: Record<string, number> = useCandles ? W_HORIZON : W;
  const Weff: Record<string, number> = { ...baseW };
  if (input.adaptiveWeights) {
    for (const k of Object.keys(baseW)) Weff[k] = baseW[k] * clamp(input.adaptiveWeights[k] ?? 1, 0.5, 1.5);
  }
  const { candles } = input;
  const bars: Bar[] = candles.candles;
  if (bars.length < 60) return null;
  const closes = bars.map((b) => b.c);
  const i = bars.length - 1;
  const price = closes[i];

  const ema20 = lastDefined(ema(closes, 20));
  const ema50 = lastDefined(ema(closes, 50));
  const emaSeries20 = ema(closes, 20);
  const r = rsi(closes, 14);
  const rsiVal = lastDefined(r) ?? 50;
  const m = macd(closes);
  const macdHist = lastDefined(m.histogram) ?? 0;
  const macdHistPrev = i >= 1 ? (m.histogram[i - 1] ?? 0) : 0;
  const bb = bollinger(closes);
  const bbUpper = lastDefined(bb.upper);
  const bbLower = lastDefined(bb.lower);
  const bbWidth = lastDefined(bb.widthPct) ?? 0;
  const bbWidthSeries = bb.widthPct.map((v) => v ?? 0);
  const bbWidthAvg = bbWidthSeries.slice(-60).reduce((a, b) => a + b, 0) / Math.min(60, bbWidthSeries.length);
  const rocVal = lastDefined(roc(closes, 10)) ?? 0;
  const atr14 = lastDefined(atr(bars, 14));
  const vwapSession = lastDefined(input.dayCandles ? vwap(input.dayCandles.candles.map((c) => c)) : vwap(bars.slice(-78)));

  const factors: FactorContribution[] = [];
  let bullScore = 0, bearScore = 0;

  const add = (key: string, name: string, contribution: number, detail: string) => {
    const c = { name, key, contribution: Math.round(contribution * 10) / 10, max: Weff[key] ?? 0, detail };
    factors.push(c);
    if (contribution >= 0) bullScore += contribution; else bearScore += -contribution;
  };

  // 1. EMA structure — trend alignment (max 18)
  if (ema20 != null && ema50 != null) {
    const above = price > ema20 && ema20 > ema50;
    const below = price < ema20 && ema20 < ema50;
    const spread = Math.abs(price - ema20) / (atr14 || price) ;
    const strength = clamp(spread / 1.2, 0.3, 1);
    if (above) add("EMA_STRUCTURE", "EMA Structure", Weff.EMA_STRUCTURE * strength, `Price above rising 20/50 EMA stack (+${(strength * 100).toFixed(0)}% alignment)`);
    else if (below) add("EMA_STRUCTURE", "EMA Structure", -Weff.EMA_STRUCTURE * strength, "Price below falling 20/50 EMA stack");
    else add("EMA_STRUCTURE", "EMA Structure", (price > ema50 ? 2 : -2), "EMA stack compressed — mixed trend");
  }

  // 2. VWAP position (max 15)
  if (vwapSession != null) {
    const dist = (price - vwapSession) / price;
    const s = clamp(Math.abs(dist) / 0.02, 0.25, 1);
    if (dist > 0.002) add("VWAP", "VWAP", Weff.VWAP * s, `Trading ${ (dist * 100).toFixed(2) }% above session VWAP — buyers in control`);
    else if (dist < -0.002) add("VWAP", "VWAP", -Weff.VWAP * s, `Trading ${ (Math.abs(dist) * 100).toFixed(2) }% below session VWAP — sellers in control`);
    else add("VWAP", "VWAP", 0, "Pinned at VWAP — balanced");
  }

  // 3. RSI momentum (max 12)
  {
    if (rsiVal >= 55 && rsiVal <= 72) add("RSI", "RSI Momentum", Weff.RSI * clamp((rsiVal - 55) / 15, 0.4, 1), `RSI ${rsiVal.toFixed(0)} — healthy bullish momentum band`);
    else if (rsiVal > 72) add("RSI", "RSI Momentum", Weff.RSI * 0.25, `RSI ${rsiVal.toFixed(0)} — overbought, follow-through risk`);
    else if (rsiVal <= 45 && rsiVal >= 28) add("RSI", "RSI Momentum", -Weff.RSI * clamp((45 - rsiVal) / 15, 0.4, 1), `RSI ${rsiVal.toFixed(0)} — bearish momentum`);
    else if (rsiVal < 28) add("RSI", "RSI Momentum", -Weff.RSI * 0.2, `RSI ${rsiVal.toFixed(0)} — oversold bounce watch`);
    else add("RSI", "RSI Momentum", 0, `RSI ${rsiVal.toFixed(0)} — neutral`);
  }

  // 4. MACD expansion (max 14)
  {
    const expanding = Math.abs(macdHist) > Math.abs(macdHistPrev);
    if (macdHist > 0) add("MACD", "MACD", Weff.MACD * (expanding ? 1 : 0.55), `Histogram +${macdHist.toFixed(3)} — ${expanding ? "bullish momentum expanding" : "bullish but decelerating"}`);
    else add("MACD", "MACD", -Weff.MACD * (expanding ? 1 : 0.55), `Histogram ${macdHist.toFixed(3)} — ${expanding ? "bearish momentum expanding" : "bearish but decelerating"}`);
  }

  // 5. Bollinger stretch (max 8)
  if (bbUpper != null && bbLower != null) {
    const pos = (price - bbLower) / ((bbUpper - bbLower) || 1);
    if (pos > 0.9) add("BOLLINGER", "Bollinger Stretch", -(input.horizon ? Weff.BOLLINGER : Weff.BOLLINGER * 0.5), input.horizon ? "Pressing upper band — stretched; chase-guard doubles the penalty (campaign: stretched entries PF 1.09 vs 1.29)" : "Pressing upper band — stretched");
    else if (pos > 0.55) add("BOLLINGER", "Bollinger Stretch", Weff.BOLLINGER * clamp((pos - 0.55) / 0.35, 0.3, 1), `Band position ${(pos * 100).toFixed(0)}% — upper-half strength`);
    else if (pos < 0.1) add("BOLLINGER", "Bollinger Stretch", Weff.BOLLINGER * 0.4, "Pressing lower band — mean-reversion watch");
    else add("BOLLINGER", "Bollinger Stretch", 0, "Mid-band — no edge");
  }

  // 6. Rate of change (max 8) — M30 momentum bonus (campaign: ROC ≥2% at 30m horizon
  //    earned PF 1.47–1.80 while the same condition was neutral at 10m)
  {
    const rocBonus = input.horizon === "M30" && rocVal >= 2 && rocVal <= 6 ? Weff.ROC * 0.5 : 0;
    add("ROC", "Rate of Change", clamp(rocVal / 4, -1, 1) * Weff.ROC + rocBonus, `10-period ROC ${rocVal.toFixed(2)}%${rocBonus ? " — real momentum bonus applied for 30-minute horizon" : ""}`);
  }

  // 7. Relative volume (max 11) — horizon-aware chase-guard.
  //    Campaign finding (60d, 1m, 705 trades): relVol ≥1.5× entries PF 1.10 vs 1.71 for
  //    mild 1.05–1.5× — by the time volume spikes on 1m bars the burst is exhausted.
  //    Legacy (no horizon) scoring is unchanged.
  {
    const rv = input.relVolume;
    if (input.horizon && rv >= 3) add("VOLUME", "Volume", -Weff.VOLUME * 0.3, `Relative volume ${rv.toFixed(2)}× — blow-off chase-guard: extreme 1m participation marks exhaustion, not strength`);
    else if (input.horizon && rv >= 1.5) add("VOLUME", "Volume", Weff.VOLUME * 0.2, `Relative volume ${rv.toFixed(2)}× — elevated; chase-guard caps the reward (campaign: rv≥1.5× underperforms 5×)`);
    else if (rv >= 1.5) add("VOLUME", "Volume", Weff.VOLUME * clamp(rv / 3, 0.5, 1), `Relative volume ${rv.toFixed(2)}× — participation confirms move`);
    else if (rv >= 1.05) add("VOLUME", "Volume", Weff.VOLUME * 0.4, `Relative volume ${rv.toFixed(2)}× — slightly elevated`);
    else if (rv < 0.6) add("VOLUME", "Volume", -Weff.VOLUME * 0.4, `Relative volume ${rv.toFixed(2)}× — thin participation, breakouts suspect`);
    else add("VOLUME", "Volume", 0, `Relative volume ${rv.toFixed(2)}× — average`);
  }

  // 8. Catalyst confirmation (max 9) — 0 when no verified catalysts (never fabricated §11)
  if (input.catalystScore > 0) add("CATALYST", "Catalyst", Weff.CATALYST * (input.catalystScore / 9), `Verified catalyst strength ${input.catalystScore}/9`);
  else factors.push({ name: "Catalyst", key: "CATALYST", contribution: 0, max: Weff.CATALYST, detail: "No verified catalyst — technical-only signal" });

  // 9. Regime modifier (max 5)
  const regimeBull = ["RISK_ON", "MOMENTUM"].includes(input.regimePrimary);
  const regimeBear = ["RISK_OFF", "LIQUIDITY_STRESS", "HIGH_VOLATILITY"].includes(input.regimePrimary);
  if (regimeBull) add("REGIME", "Regime", Weff.REGIME, `Risk-favorable regime (${input.regimePrimary}) supports long setups`);
  else if (regimeBear) add("REGIME", "Regime", -Weff.REGIME, `Risk-unfavorable regime (${input.regimePrimary}) penalizes long setups`);
  else factors.push({ name: "Regime", key: "REGIME", contribution: 0, max: Weff.REGIME, detail: "Neutral regime — no modifier" });

  // 10. Candlestick chart reading (max 9, horizon-aware scoring only) — §NEW.
  //     Classical pattern geometry + 5m higher-timeframe agreement; efficacy is
  //     learned (ADAPTABLE_KEYS includes CANDLESTICKS) and A/B-measured.
  if (useCandles) {
    const cf = candleFactorScore(bars.slice(-30));
    if (Math.abs(cf.score) >= 0.05) add("CANDLESTICKS", "Candlesticks", cf.score * Weff.CANDLESTICKS, cf.detail);
    else factors.push({ name: "Candlesticks", key: "CANDLESTICKS", contribution: 0, max: Weff.CANDLESTICKS, detail: cf.detail });
  }

  const direction = bullScore >= bearScore ? (bullScore - bearScore > 12 ? "LONG" : "NEUTRAL") : (bearScore - bullScore > 12 ? "SHORT" : "NEUTRAL");
  const score = Math.round(clamp(Math.max(bullScore, bearScore), 0, 100));

  // Stops/targets — GEOMETRY v2 (2026-09-05, walk-forward validated on 30 days
  // of real Binance 1m bars × 10 symbols, 144k bars, scripts/geometry_*):
  //   stop = entry × (1 − 3.0%)   deep invalidation — full stops are RARE
  //   target = entry × (1 + 1.2%) modest — reached BEFORE the stop ~84% of time
  //   time stop = 12h (runner)    recycles capital, bounds bleed
  // Measured (gate 64, M30 book, BTC 60m-EMA20 filter, 24bps RT costs):
  //   ALL 30d: n=74 winRate 83.8% net +32.5% PF 2.13
  //   worst rolling-10 stretch: 6 wins; median 9; ≥7 wins in 92% of windows
  //   recent-regime segment: 69.6% WR, ≈breakeven — honest, no fabricated edge
  // The prior 1.6×/2.4× ATR(1m) geometry put targets ~8bps away while costs
  // are 24bps RT — mathematically un-winnable (prod incident 2026-09-05:
  // TARGET exits netting −1.9R). ANY geometry must keep target distance
  // several× the 22-24bps round-trip cost.
  const entry = price;
  const STOP_PCT = 0.030;
  const TGT_PCT = 0.012;
  const stop = direction === "SHORT" ? entry * (1 + STOP_PCT) : entry * (1 - STOP_PCT);
  const target = direction === "SHORT" ? entry * (1 - TGT_PCT) : entry * (1 + TGT_PCT);
  const rr = Math.round(Math.abs((target - entry) / (entry - stop || 1)) * 100) / 100;

  const atrVal = atr14 ?? price * 0.02; // kept for atrPct/spread context (no longer drives stops)
  const liquidityOk = input.avgVolume * entry >= input.minLiquidityUsd;

  // Spread proxy calibrated from daily ATR% — liquid mega-caps typically 1-5bps.
  // (atrPct of ~2% ⇒ ~2.4bps; capped honestly at 40bps for thin names.)
  const spreadBps = Math.max(1, Math.min(40, Math.round((atrVal / price) * 120)));

  const topFactors = [...factors]
    .filter((f) => f.contribution !== 0)
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, 3)
    .map((f) => `${f.name} (${f.contribution > 0 ? "+" : ""}${f.contribution})`)
    .join(", ");

  const explanation = direction === "NEUTRAL"
    ? `No trade-worthy alignment on ${candles.symbol}: factor signals conflict (bull ${bullScore.toFixed(0)} vs bear ${bearScore.toFixed(0)}). DeeYoung stays flat and rescans.`
    : `${direction === "LONG" ? "Bullish" : "Bearish"} setup on ${candles.symbol} scoring ${score}/100, driven mainly by ${topFactors}. ${input.catalystScore > 0 ? "A verified catalyst adds confluence. " : ""}${input.horizon ? `Horizon-aware scoring active (${input.horizon}): chase-guard filters exhaustion entries. ` : ""}Setup respects the 3.0% invalidation stop at ${stop.toFixed(2)} with the 1.2% target at ${target.toFixed(2)} (R:R ${rr.toFixed(2)} — high-hit-rate profile). This is analysis, not a guarantee — a ${score}% signal score is NOT a ${score}% win probability.`;

  return {
    symbol: candles.symbol,
    direction,
    score,
    factors,
    entry, stop, target, rr,
    atr: atrVal,
    regime: input.regimePrimary,
    catalystScore: input.catalystScore,
    liquidityOk,
    spreadBps,
    generatedAt: Date.now(),
    dataState: candles.dataState as DataState,
    explanation,
  };
}

/** Catalyst score derived ONLY from verified data (unusual volume is real, news requires provider). */
export function catalystScoreFromData(relVolume: number, hasVerifiedNews: boolean, newsSentiment: number): number {
  let s = 0;
  if (relVolume >= 2.5) s += 4; else if (relVolume >= 1.8) s += 3; else if (relVolume >= 1.3) s += 1.5;
  if (hasVerifiedNews) s += Math.max(0, newsSentiment) * 5;
  return Math.min(9, Math.round(s * 10) / 10);
}

export function bbWidthPercentile(current: number, series: number[]): number {
  const window = series.filter((v) => v > 0).slice(-120);
  if (!window.length) return 50;
  const below = window.filter((v) => v <= current).length;
  return Math.round((below / window.length) * 100);
}
