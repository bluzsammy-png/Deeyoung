// DEEYOUNG PRO — CANDLESTICK & CHART-READING MODULE (§NEW)
// The bot's "eyes": classical candlestick patterns computed from REAL bar geometry
// (body/range/wick ratios + prior-trend context) plus multi-timeframe confirmation.
// Deterministic and causal — reads only CLOSED bars, never the forming one.
// Every pattern below is a textbook definition (Nison / standard TA). Nothing invented,
// nothing curve-fitted: each pattern encodes a documented chart-reading concept, and its
// real-world efficacy is left to the A/B harness (scripts/test-candles.ts) and the
// learning memory (which adapts the factor weight from journaled outcomes).

import type { Bar } from "@/lib/engine/indicators";
import { ema, lastDefined } from "@/lib/engine/indicators";

export interface PatternHit {
  name: string;        // textbook pattern name
  dir: 1 | -1 | 0;     // bullish / indecisive / bearish
  strength: number;    // 0..1 conviction WITHIN the pattern (geometry quality)
  detail: string;      // human-readable evidence for the journal + UI
}

const body = (b: Bar) => Math.abs(b.c - b.o);
const range = (b: Bar) => Math.max(1e-12, b.h - b.l);
const upperWick = (b: Bar) => b.h - Math.max(b.c, b.o);
const lowerWick = (b: Bar) => Math.min(b.c, b.o) - b.l;
const isBull = (b: Bar) => b.c > b.o;
const isBear = (b: Bar) => b.c < b.o;

/** Net direction of the prior n bars — trend context required by reversal patterns. */
function priorTrend(bars: Bar[], i: number, n = 6): 1 | 0 | -1 {
  if (i < n) return 0;
  const move = (bars[i].c - bars[i - n].c) / (bars[i - n].c || 1) * 100;
  if (move > 0.15) return 1;
  if (move < -0.15) return -1;
  return 0;
}

/**
 * Reads the LAST CLOSED bar in its prior-bar context and returns the single
 * strongest textbook pattern hit (or null when the bar is indecisive).
 */
export function readCandles(bars: Bar[]): PatternHit | null {
  const n = bars.length;
  if (n < 10) return null;
  const i = n - 1;
  const c = bars[i], p = bars[i - 1], p2 = bars[i - 2];
  const trend = priorTrend(bars, i);
  const hits: PatternHit[] = [];

  // 1. Engulfing — reversal; requires an opposite prior leg (context rule)
  if (trend === -1 && isBull(c) && isBear(p) && c.c > p.o && c.o <= p.c)
    hits.push({ name: "Bullish engulfing", dir: 1, strength: 0.85, detail: "bullish body engulfs prior bearish body after a down-leg" });
  if (trend === 1 && isBear(c) && isBull(p) && c.c < p.o && c.o >= p.c)
    hits.push({ name: "Bearish engulfing", dir: -1, strength: 0.85, detail: "bearish body engulfs prior bullish body after an up-leg" });

  // 2. Hammer / Shooting star — rejection wicks at the end of a leg
  if (trend === -1 && lowerWick(c) >= 2 * body(c) && upperWick(c) <= range(c) * 0.25 && body(c) <= range(c) * 0.4)
    hits.push({ name: "Hammer", dir: 1, strength: 0.8, detail: `long lower wick ${(lowerWick(c) / (body(c) || 1e-9)).toFixed(1)}× body rejects lows` });
  if (trend === 1 && upperWick(c) >= 2 * body(c) && lowerWick(c) <= range(c) * 0.25 && body(c) <= range(c) * 0.4)
    hits.push({ name: "Shooting star", dir: -1, strength: 0.8, detail: "long upper wick rejects highs after an up-leg" });

  // 3. Morning / Evening star — 3-bar reversal
  if (trend === -1 && isBear(p2) && body(p) <= body(p2) * 0.5 && isBull(c) && c.c > p2.o + body(p2) * 0.5)
    hits.push({ name: "Morning star", dir: 1, strength: 0.9, detail: "down-leg, indecision, strong bull close above midpoint" });
  if (trend === 1 && isBull(p2) && body(p) <= body(p2) * 0.5 && isBear(c) && c.c < p2.o - body(p2) * 0.5)
    hits.push({ name: "Evening star", dir: -1, strength: 0.9, detail: "up-leg, indecision, strong bear close below midpoint" });

  // 4. Three white soldiers / Three black crows — persistent 3-bar momentum
  if (isBull(c) && isBull(p) && isBull(p2) && c.c > p.c && p.c > p2.c
    && body(c) >= range(c) * 0.6 && body(p) >= range(p) * 0.6 && body(p2) >= range(p2) * 0.6)
    hits.push({ name: "Three white soldiers", dir: 1, strength: 0.75, detail: "three strong bull bodies, higher closes" });
  if (isBear(c) && isBear(p) && isBear(p2) && c.c < p.c && p.c < p2.c
    && body(c) >= range(c) * 0.6 && body(p) >= range(p) * 0.6 && body(p2) >= range(p2) * 0.6)
    hits.push({ name: "Three black crows", dir: -1, strength: 0.75, detail: "three strong bear bodies, lower closes" });

  // 5. Momentum thrust (marubozu-type) — continuation expansion
  if (body(c) >= range(c) * 0.85 && body(c) >= body(p) * 1.5)
    hits.push({ name: isBull(c) ? "Bullish thrust" : "Bearish thrust", dir: isBull(c) ? 1 : -1, strength: 0.6, detail: "wide-range full-body candle: momentum expansion" });

  if (!hits.length) return null;
  return hits.sort((a, b) => b.strength - a.strength)[0];
}

/**
 * Multi-timeframe chart context: aggregates CLOSED 1m bars into 5m bars and
 * reports whether the higher timeframe agrees with the 1m read.
 * 1 = above rising-vwap-equivalent (price > 5m EMA20), -1 = below, 0 = neutral.
 */
export function mtfConfirm(bars: Bar[]): 1 | 0 | -1 {
  if (bars.length < 130) return 0;
  const win = bars.slice(-240); // 4 hours of 1m → 48 five-minute bars
  const tfMs = 5 * 60_000;
  const buckets = new Map<number, { t: number; o: number; h: number; l: number; c: number }>();
  for (const b of win) {
    const k = Math.floor(b.t / tfMs) * tfMs;
    const acc = buckets.get(k);
    if (!acc) buckets.set(k, { t: k, o: b.o, h: b.h, l: b.l, c: b.c });
    else { acc.h = Math.max(acc.h, b.h); acc.l = Math.min(acc.l, b.l); acc.c = b.c; }
  }
  const agg = [...buckets.values()].sort((a, b) => a.t - b.t);
  if (agg.length < 22) return 0;
  const e20 = lastDefined(ema(agg.map((b) => b.c), 20));
  if (e20 == null) return 0;
  const price = agg[agg.length - 1].c;
  const dist = (price - e20) / (e20 || 1);
  if (dist > 0.0005) return 1;
  if (dist < -0.0005) return -1;
  return 0;
}

/**
 * Factor-ready score in −1..+1: strongest pattern × higher-timeframe agreement.
 * MTF agreement scales conviction (agree ×1.0, neutral ×0.7, oppose ×0.4) — the
 * 1m pattern still fires, but a pro trusts it far less against the higher trend.
 */
export function candleFactorScore(bars: Bar[]): { score: number; detail: string } {
  const hit = readCandles(bars);
  if (!hit) return { score: 0, detail: "No high-conviction candle pattern on the closed bar" };
  const mtf = mtfConfirm(bars);
  const mult = mtf === 0 ? 0.7 : (mtf === hit.dir ? 1 : 0.4);
  const mtfTxt = mtf === 1 ? "5m trend agrees" : mtf === -1 ? "5m trend OPPOSES: conviction cut" : "5m trend neutral";
  return { score: +(hit.dir * hit.strength * mult).toFixed(3), detail: `${hit.name}: ${hit.detail} - ${mtfTxt}` };
}
