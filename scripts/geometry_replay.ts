// DeeYoung Pro — PRODUCTION-FAITHFUL REPLAY VALIDATOR (audit 2026-09-06).
// Replays the EXACT deployed pipeline on REAL bars:
//   signals.ts computeSignal (horizon M30, candlePatterns off, neutral weights)
//   runner.ts  gate 64, stride 2 min, LONG-only, dead hours 21-23 UTC,
//              MAX_CONCURRENT 3, daily cap -2R, global 30-min loss cooldown,
//              BTC 60m-EMA20 regime filter (crypto only; variant-toggleable)
//   paper.ts   fill = ref x (1+2bps), fees 10bps/side, TARGET fills at exact
//              target, STOP/TIME fill at observed price x (1-2bps)
//   signals.ts GEOMETRY v2: stop -3.0%, target +1.2% off last closed close
// Entry fills at the NEXT bar's open (no look-ahead). Signals use CLOSED bars.
// Variants: confluence 0/4/5, target-exit strictness (bar-close vs bar-high),
// BTC filter on/off, and symbol classes (crypto 24/7 vs FX/metals/energy 24/5
// vs equities RTH-only). Output: honest per-variant metrics, no cherry-picks.

import { computeSignal } from "../src/lib/engine/signals";
import type { Bar } from "../src/lib/engine/indicators";

const OUT_CRYPTO = new URL("./out/klines/", import.meta.url).pathname;
const OUT_YAHOO = new URL("./out/klines_yahoo/", import.meta.url).pathname;

const CRYPTO = ["BTCUSD", "ETHUSD", "SOLUSD", "XRPUSD", "DOGEUSD", "ADAUSD", "BNBUSD", "AVAXUSD", "LINKUSD", "DOTUSD"];
const FXLIKE = ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "XAUUSD", "WTI"];
const EQUITY = ["NVDA", "AAPL", "MSFT", "TSLA"];

const GATE = 64;
const WINDOW = 260;
const STRIDE_MIN = 2;
const NOTIONAL = 1000;
const FEE = 0.001;            // 10bps per side
const SLIP = 0.0002;          // 2bps per side
const TIME_STOP_MIN = 720;
const DEAD_HOURS = [21, 22, 23];
const DAILY_CAP_R = -2;
const MAX_CONCURRENT = 3;
const COOLDOWN_MS = 30 * 60_000;
const STOP_PCT = 0.030;
const TGT_PCT = 0.012;

interface Raw { t: number; o: number; h: number; l: number; c: number; v: number }
interface Open {
  sym: string; fill: number; qty: number; stop: number; target: number;
  openedTi: number; openedAbs: number; stopDistPct: number;
}
interface Trade {
  sym: string; openTi: number; closeTi: number; openAbs: number; closeAbs: number;
  fill: number; exit: number;
  reason: "STOP" | "TARGET" | "TIME"; netUsd: number; netR: number; score: number;
}

function loadBars(path: string): Raw[] {
  return JSON.parse(require("fs").readFileSync(path, "utf8")) as Raw[];
}

function toBars(rows: Raw[]): Bar[] {
  return rows.map((k) => ({ t: k.t, o: k.o, h: k.h, l: k.l, c: k.c, v: k.v }));
}

// BTC 60m-EMA20 regime — port of runner.btcRegimeUp over closed buckets only.
function btcRegimeSeries(btc: Raw[]): Map<number, boolean> {
  const MS = 3_600_000;
  const agg: { t: number; c: number }[] = [];
  let cur: { t: number; c: number } | null = null;
  for (const b of btc) {
    const bucket = Math.floor(b.t / MS) * MS;
    if (!cur || cur.t !== bucket) { if (cur) agg.push(cur); cur = { t: bucket, c: b.c }; }
    else cur.c = b.c;
  }
  if (cur) agg.push(cur);
  const k = 2 / 21;
  let ema = agg[0].c;
  const out = new Map<number, boolean>();
  for (let i = 0; i < agg.length; i++) {
    if (i > 0) ema = agg[i].c * k + ema * (1 - k);
    // verdict valid from the CLOSE of bucket i until close of bucket i+1
    out.set(agg[i].t + MS, agg[i].c > ema);
  }
  return out;
}

function sessionOpen(sym: string, t: number): boolean {
  const d = new Date(t);
  const day = d.getUTCDay(); // 0 Sun, 6 Sat
  const hour = d.getUTCHours();
  const min = d.getUTCMinutes();
  if (EQUITY.includes(sym)) {
    if (day === 0 || day === 6) return false;
    const mins = hour * 60 + min;
    return mins >= 14 * 60 && mins <= 19 * 60 + 45;
  }
  if (FXLIKE.includes(sym)) {
    if (day === 6) return false;
    if (day === 5 && hour >= 21) return false;   // Fri close ~21:00 UTC
    if (day === 0 && hour < 22) return false;    // Sun reopen ~22:00 UTC
    return true;
  }
  return true; // crypto 24/7
}

interface Variant {
  name: string;
  confluence: number;      // minimum positive-contribution factors (0 = off)
  targetStrict: boolean;   // true: also require bar close >= target (production bar path)
  btcFilter: boolean;
  symbols: string[];
  dir: string;
  gateOverride?: number;   // diagnostic sweeps only (production stays 64)
  stepMs?: number;         // bar spacing of the series (1m default, 5m for non-crypto validation)
  strideBars?: number;     // scan every Nth bar (default STRIDE_MIN)
  freshMs?: number;        // max age of last closed bar at entry (default 10 min)
  diag?: { best: Record<string, number>; longSignals: Record<string, number>; gateCross: Record<string, number> };
}
const diag = { best: {} as Record<string, number>, longSignals: {} as Record<string, number>, gateCross: {} as Record<string, number> };

interface Metrics {
  n: number; wins: number; netUsd: number; netR: number; pf: number;
  maxConsecLoss: number; worstRoll10WR: number; avgHoldMin: number;
  targets: number; stops: number; times: number;
}

function metricsOf(trades: Trade[]): Metrics {
  const n = trades.length;
  const wins = trades.filter((t) => t.netUsd > 0);
  const losses = trades.filter((t) => t.netUsd <= 0);
  const gw = wins.reduce((a, b) => a + b.netUsd, 0);
  const gl = Math.abs(losses.reduce((a, b) => a + b.netUsd, 0));
  let consec = 0, maxConsec = 0;
  for (const t of trades) {
    if (t.netUsd <= 0) { consec++; maxConsec = Math.max(maxConsec, consec); } else consec = 0;
  }
  let worst10 = 100;
  for (let i = 0; i + 10 <= n; i++) {
    const w = trades.slice(i, i + 10).filter((t) => t.netUsd > 0).length;
    worst10 = Math.min(worst10, (w / 10) * 100);
  }
  const hold = n ? trades.reduce((a, b) => a + (b.closeAbs - b.openAbs), 0) / n / 60_000 : 0;
  return {
    n, wins: wins.length, netUsd: +trades.reduce((a, b) => a + b.netUsd, 0).toFixed(2),
    netR: +trades.reduce((a, b) => a + b.netR, 0).toFixed(2),
    pf: gl > 0 ? +(gw / gl).toFixed(2) : (gw > 0 ? 99 : 0),
    maxConsecLoss: maxConsec, worstRoll10WR: n >= 10 ? +worst10.toFixed(0) : -1,
    avgHoldMin: +hold.toFixed(0),
    targets: trades.filter((t) => t.reason === "TARGET").length,
    stops: trades.filter((t) => t.reason === "STOP").length,
    times: trades.filter((t) => t.reason === "TIME").length,
  };
}

async function replay(v: Variant, barsBySym: Map<string, Raw[]>): Promise<Trade[]> {
  // merged timeline
  const syms = v.symbols.filter((s) => (barsBySym.get(s)?.length ?? 0) > WINDOW + 20);
  const maps = new Map<string, Map<number, Raw>>();
  const times = new Set<number>();
  for (const s of syms) {
    const m = new Map<number, Raw>();
    for (const b of barsBySym.get(s)!) { m.set(b.t, b); times.add(b.t); }
    maps.set(s, m);
  }
  const sortedT = [...times].sort((a, b) => a - b);
  const MIN = 60_000;

  const btcSeries = v.btcFilter && barsBySym.has("BTCUSD")
    ? btcRegimeSeries(barsBySym.get("BTCUSD")!) : null;
  diag.best = {}; diag.longSignals = {}; diag.gateCross = {}; v.diag = diag;

  // indicator caches per symbol: recompute per scan on the trailing window (computeSignal is pure)
  const open = new Map<string, Open>();
  const trades: Trade[] = [];
  let lastLossAt = 0;
  let dayKey = "";
  let dayR = 0;
  let scanCursor = 0; // stride gate aligned to timeline index

  for (let ti = 0; ti < sortedT.length; ti++) {
    const t = sortedT[ti];

    // ── exits on this minute's bar for every symbol with an open position ──
    for (const [sym, pos] of [...open.entries()]) {
      const b = maps.get(sym)!.get(t);
      if (!b) continue;
      const exitFill = (px: number) => px * (1 - SLIP);
      let done: Trade | null = null;
      if (b.l <= pos.stop) {
        const ref = b.c < pos.stop ? b.c : pos.stop;
        const exitPx = exitFill(ref);
        const gross = pos.qty * (exitPx - pos.fill);
        const net = gross - pos.qty * pos.fill * FEE - pos.qty * exitPx * FEE;
        done = { sym, openTi: pos.openedTi, closeTi: ti, openAbs: pos.openedAbs, closeAbs: t, fill: pos.fill, exit: exitPx, reason: "STOP", netUsd: net, netR: (net / (pos.qty * pos.fill)) * 100 / pos.stopDistPct, score: 0 };
      } else {
        const targetHit = v.targetStrict ? (b.h >= pos.target && b.c >= pos.target) : b.h >= pos.target;
        if (targetHit) {
          const exitPx = pos.target; // resting-limit semantics, no slip (paper.ts)
          const gross = pos.qty * (exitPx - pos.fill);
          const net = gross - pos.qty * pos.fill * FEE - pos.qty * exitPx * FEE;
          done = { sym, openTi: pos.openedTi, closeTi: ti, openAbs: pos.openedAbs, closeAbs: t, fill: pos.fill, exit: exitPx, reason: "TARGET", netUsd: net, netR: (net / (pos.qty * pos.fill)) * 100 / pos.stopDistPct, score: 0 };
        } else if (t - pos.openedAbs >= TIME_STOP_MIN * MIN) {
          const exitPx = exitFill(b.c);
          const gross = pos.qty * (exitPx - pos.fill);
          const net = gross - pos.qty * pos.fill * FEE - pos.qty * exitPx * FEE;
          done = { sym, openTi: pos.openedTi, closeTi: ti, openAbs: pos.openedAbs, closeAbs: t, fill: pos.fill, exit: exitPx, reason: "TIME", netUsd: net, netR: (net / (pos.qty * pos.fill)) * 100 / pos.stopDistPct, score: 0 };
        }
      }
      if (done) {
        trades.push(done);
        if (done.netUsd <= 0) lastLossAt = t;
        open.delete(sym);
      }
    }

    // day rollover (UTC) for the daily-R cap
    const dk = new Date(t).toISOString().slice(0, 10);
    if (dk !== dayKey) { dayKey = dk; dayR = 0; }
    if (dayR <= DAILY_CAP_R) continue;
    if (open.size >= MAX_CONCURRENT) continue;
    if (t - lastLossAt < COOLDOWN_MS) continue;

    // ── entries at stride: signal from bars CLOSED before t, fill at t's open ──
    scanCursor++;
    if (scanCursor % (v.strideBars ?? STRIDE_MIN) !== 0) continue;
    const hour = new Date(t).getUTCHours();
    if (DEAD_HOURS.includes(hour)) continue;

    for (const sym of syms) {
      if (open.has(sym)) continue;
      if (!sessionOpen(sym, t)) continue;
      if (btcSeries) {
        const up = btcSeries.get(Math.floor(t / MS_ALGN) * MS_ALGN);
        if (up === false) continue;
      }
      const m = maps.get(sym)!;
      // trailing closed window: bars strictly before t (bar t is the fill bar)
      const hist: Raw[] = [];
      for (let k = ti - 1; k >= 0 && hist.length < WINDOW; k--) {
        const b = maps.get(sym)!.get(sortedT[k]);
        if (b) hist.push(b);
      }
      if (hist.length < WINDOW) continue;
      hist.reverse();
      // freshness: last closed bar must be recent (stale feed never enters)
      if (t - hist[hist.length - 1].t > (v.freshMs ?? 10 * MIN)) continue;
      const fillBar = m.get(t);
      if (!fillBar) continue;

      const bars = toBars(hist);
      const closes = bars.map((b) => b.c);
      const lastClose = closes[closes.length - 1];
      const prior = bars.slice(0, -1);
      const priorVol = prior.length ? prior.reduce((a, b) => a + b.v, 0) / prior.length : 0;
      const relVolume = priorVol > 0 ? bars[bars.length - 1].v / priorVol : 1;
      const dayStart = lastClose !== undefined ? bars[bars.length - 1].t - (bars[bars.length - 1].t % 86_400_000) : 0;
      const dayBars = bars.filter((b) => b.t >= dayStart);

      const sig = computeSignal({
        candles: { symbol: sym, candles: bars, dataState: "LIVE", source: "replay" } as never,
        dayCandles: { symbol: sym, candles: dayBars, dataState: "LIVE", source: "replay" } as never,
        relVolume, regimePrimary: "NEUTRAL", catalystScore: 0,
        avgVolume: priorVol, minLiquidityUsd: 0,
        horizon: "M30", adaptiveWeights: null, candlePatterns: false,
      });
      if (!sig || sig.direction !== "LONG") continue;
      diag.best[sym] = Math.max(diag.best[sym] ?? 0, sig.score);
      diag.longSignals[sym] = (diag.longSignals[sym] ?? 0) + 1;
      if (sig.score < (v.gateOverride ?? GATE)) continue;
      if (sig.rr < 0.4) continue;
      if (v.confluence > 0) {
        const aligned = sig.factors.filter((f) => f.contribution > 0).length;
        if (aligned < v.confluence) continue;
      }
      const ref = fillBar.o; // production fills at the live price at scan instant ≈ next bar open
      if (sig.stop >= ref || sig.target <= ref) continue; // paper.ts BAD_LEVELS
      const fill = ref * (1 + SLIP);
      const qty = NOTIONAL / fill;
      const stopDistPct = ((fill - sig.stop) / fill) * 100;
      diag.gateCross[sym] = (diag.gateCross[sym] ?? 0) + 1;
      open.set(sym, { sym, fill, qty, stop: sig.stop, target: sig.target, openedTi: ti, openedAbs: t, stopDistPct });
    }
  }
  return trades;
}

const MS_ALGN = 3_600_000;

function report(v: Variant, trades: Trade[]) {
  const m = metricsOf(trades);
  const wr = m.n ? +((m.wins / m.n) * 100).toFixed(1) : 0;
  console.log(
    `${v.name.padEnd(44)} n=${String(m.n).padStart(4)}  WR=${String(wr).padStart(5)}%  net=$${String(m.netUsd).padStart(9)}  R=${String(m.netR).padStart(7)}  PF=${String(m.pf).padStart(5)}  tgt/stp/time=${m.targets}/${m.stops}/${m.times}  maxConsecL=${m.maxConsecLoss}  worst10WR=${m.worstRoll10WR}%  hold=${m.avgHoldMin}m`,
  );
  if (v.diag && (m.n === 0 || v.name.includes("sweep"))) {
    const syms2 = Object.keys(v.diag.best);
    for (const s of syms2) {
      console.log(`    diag ${s.padEnd(8)} bestLONG=${String(v.diag.best[s]).padStart(5)}  longSignals=${String(v.diag.longSignals[s] ?? 0).padStart(5)}  entries=${v.diag.gateCross[s] ?? 0}`);
    }
  }
}

if (process.env.RUN_CRYPTO !== "0") {
// ── crypto: 60d Binance ──
const cryptoBars = new Map<string, Raw[]>();
for (const s of CRYPTO) {
  try { cryptoBars.set(s, loadBars(`${OUT_CRYPTO}${s}_1m.json`)); }
  catch { console.error(`missing ${s}`); }
}
const days = (cryptoBars.get("BTCUSD")!.at(-1)!.t - cryptoBars.get("BTCUSD")![0].t) / 86_400_000;
console.log(`\nCRYPTO ${days.toFixed(1)}d real Binance 1m, 10 symbols, $${NOTIONAL}/trade, gate ${GATE}, geometry v2 (stop 3% / target 1.2%), costs 22bps+fees modeled`);
for (const v of [
  { name: "crypto gate64 confluence OFF + BTC filter", confluence: 0, targetStrict: true, btcFilter: true, symbols: CRYPTO, dir: "LONG" },
  { name: "crypto gate64 CONFLUENCE 4 (production)", confluence: 4, targetStrict: true, btcFilter: true, symbols: CRYPTO, dir: "LONG" },
  { name: "crypto gate64 confluence 4, tick-target", confluence: 4, targetStrict: false, btcFilter: true, symbols: CRYPTO, dir: "LONG" },
  { name: "crypto gate64 confluence 5", confluence: 5, targetStrict: true, btcFilter: true, symbols: CRYPTO, dir: "LONG" },
  { name: "crypto gate64 confluence 4, NO BTC filter", confluence: 4, targetStrict: true, btcFilter: false, symbols: CRYPTO, dir: "LONG" },
] as Variant[]) {
  report(v, await replay(v, cryptoBars));
}

// ── non-crypto: 5d Yahoo ──
const yahooBars = new Map<string, Raw[]>();
for (const s of [...FXLIKE, ...EQUITY]) {
  try { yahooBars.set(s, loadBars(`${OUT_YAHOO}${s}_1m.json`)); }
  catch { console.error(`missing ${s}`); }
}
}
console.log(`\nNON-CRYPTO 30d real Yahoo 5m (session-gated), same engine, window 260x5m`);
const yahoo5 = new Map<string, Raw[]>();
for (const s of [...FXLIKE, ...EQUITY]) {
  try { yahoo5.set(s, loadBars(new URL(`./out/klines_yahoo_5m/${s}_5m.json`, import.meta.url).pathname)); }
  catch { console.error(`missing 5m ${s}`); }
}
for (const v of [
  { name: "5m ALL10 gate64 confluence 4", confluence: 4, targetStrict: true, btcFilter: false, symbols: [...FXLIKE, ...EQUITY], dir: "LONG", strideBars: 1, freshMs: 30 * 60_000 },
  { name: "5m ALL10 gate64 tick-target", confluence: 4, targetStrict: false, btcFilter: false, symbols: [...FXLIKE, ...EQUITY], dir: "LONG", strideBars: 1, freshMs: 30 * 60_000 },
  { name: "5m FXlike gate64 confluence 4", confluence: 4, targetStrict: true, btcFilter: false, symbols: FXLIKE, dir: "LONG", strideBars: 1, freshMs: 30 * 60_000 },
  { name: "5m EQUITY gate64 confluence 4", confluence: 4, targetStrict: true, btcFilter: false, symbols: EQUITY, dir: "LONG", strideBars: 1, freshMs: 30 * 60_000 },
  { name: "5m ALL10 SWEEP gate 58", confluence: 4, targetStrict: true, btcFilter: false, symbols: [...FXLIKE, ...EQUITY], dir: "LONG", strideBars: 1, freshMs: 30 * 60_000, gateOverride: 58 },
  { name: "5m ALL10 SWEEP gate 61", confluence: 4, targetStrict: true, btcFilter: false, symbols: [...FXLIKE, ...EQUITY], dir: "LONG", strideBars: 1, freshMs: 30 * 60_000, gateOverride: 61 },
] as Variant[]) {
  report(v, await replay(v, yahoo5));
}
