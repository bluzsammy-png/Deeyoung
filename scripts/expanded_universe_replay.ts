// DeeYoung Pro — EXPANDED UNIVERSE REPLAY (universe-scale upgrade round).
// Production-faithful replay of the DEPLOYED config (post 31937df):
//   gate 64, LONG only, confluence 4-of-7, geometry v2 (stop -3% / target +1.2%
//   strict close-confirm), fills next-bar-open, fee 10bps/side, slip 2bps,
//   volGuard [0.55,2.0], BTC 60m-EMA20 regime filter (CRYPTO only),
//   timeStop 1080m crypto / 720m non-crypto, dead hours 21-23 UTC,
//   daily cap -2R, max 3 concurrent, 30min post-loss cooldown,
//   stride 2 bars crypto (2min) / 1 bar non-crypto (5m), freshness 10m/30m.
// Compares on the SAME 60d real-bars window:
//   BASE universe (deployed 20 books) vs EXPANDED universe (30 books)
//   vs NEW-ONLY subset (the 20 proposed additions).
// PRE-REGISTERED SHIP RULE: expansion ships per class only if
//   (a) new-only subset PF >= 1.05 and net >= 0 (additions at least self-supporting),
//   (b) expanded WR not more than 2pp below baseline WR,
//   (c) expanded PF >= baseline PF - 0.05,
//   (d) expanded net > baseline net (more books must add net dollars).
// No hopeful constants: if any class fails, that class does not expand.

import { computeSignal } from "../src/lib/engine/signals.ts";
import type { Bar } from "../src/lib/engine/indicators.ts";
import { readFileSync } from "fs";

const DIR_BASE_CRYPTO = "/home/z/my-project/scripts/out/klines/";
const DIR_BASE_YAHOO = "/home/z/my-project/scripts/out/klines_yahoo_5m_60d/";
const DIR_EXPANDED = "/home/z/my-project/scripts/out/klines_expanded/";

const BASE_CRYPTO = ["BTCUSD", "ETHUSD", "SOLUSD", "XRPUSD", "DOGEUSD", "ADAUSD", "BNBUSD", "AVAXUSD", "LINKUSD", "DOTUSD"];
const BASE_FX = ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "XAUUSD", "WTI"];
const BASE_EQ = ["NVDA", "AAPL", "MSFT", "TSLA"];
const NEW_CRYPTO = ["LTCUSD", "ATOMUSD", "ETCUSD", "XLMUSD", "NEARUSD", "APTUSD", "ARBUSD", "OPUSD", "SUIUSD", "FILUSD"];
const NEW_FX = ["USDCAD", "USDCHF", "NZDUSD", "EURJPY", "GBPJPY", "AUDJPY"];
const NEW_EQ = ["AMZN", "GOOGL", "META", "AMD"];

const GATE = 64;
const WINDOW = 260;
const NOTIONAL = 1000;
const FEE = 0.001;
const SLIP = 0.0002;
const STOP_PCT = 0.030;
const TGT_PCT = 0.012;
const DEAD_HOURS = [21, 22, 23];
const DAILY_CAP_R = -2;
const MAX_CONCURRENT = 3;
const COOLDOWN_MS = 30 * 60_000;
const MIN = 60_000;
const MS = 3_600_000;
const VOL_GUARD: [number, number] = [0.55, 2.0];

interface Raw { t: number; o: number; h: number; l: number; c: number; v: number }
interface Open { sym: string; fill: number; qty: number; stop: number; target: number; openedAbs: number; stopDistPct: number }
interface Trade { sym: string; closeAbs: number; reason: "STOP" | "TARGET" | "TIME"; netUsd: number; netR: number; hour: number }
interface Vetoes { total: number; session: number; stale: number; btc: number; notLong: number; belowGate: number; gateConfluence: number; volGuard: number; liq: number }

function loadBars(path: string): Raw[] { return JSON.parse(readFileSync(path, "utf8")) as Raw[]; }
function toBars(rows: Raw[]): Bar[] { return rows.map((k) => ({ t: k.t, o: k.o, h: k.h, l: k.l, c: k.c, v: k.v })); }

/** 60m EMA20 trend verdict per hour-bucket close (BTC regime port). */
function trendSeries(bars: Raw[]): Map<number, boolean> {
  const agg: { t: number; c: number }[] = [];
  let cur: { t: number; c: number } | null = null;
  for (const b of bars) {
    const bucket = Math.floor(b.t / MS) * MS;
    if (!cur || cur.t !== bucket) { if (cur) agg.push(cur); cur = { t: bucket, c: b.c }; }
    else cur.c = b.c;
  }
  if (cur) agg.push(cur);
  const k = 2 / 21;
  let ema = agg.length ? agg[0].c : 0;
  const out = new Map<number, boolean>();
  for (let i = 0; i < agg.length; i++) {
    if (i > 0) ema = agg[i].c * k + ema * (1 - k);
    out.set(agg[i].t + MS, agg[i].c > ema);
  }
  return out;
}

const EQ_SYMS = new Set([...BASE_EQ, ...NEW_EQ]);
const FX_SYMS = new Set([...BASE_FX, ...NEW_FX]);

function sessionOpen(sym: string, t: number): boolean {
  const d = new Date(t);
  const day = d.getUTCDay();
  const hour = d.getUTCHours();
  const min = d.getUTCMinutes();
  if (EQ_SYMS.has(sym)) {
    if (day === 0 || day === 6) return false;
    const mins = hour * 60 + min;
    return mins >= 14 * 60 && mins <= 19 * 60 + 45;
  }
  if (FX_SYMS.has(sym)) {
    if (day === 6) return false;
    if (day === 5 && hour >= 21) return false;
    if (day === 0 && hour < 22) return false;
    return true;
  }
  return true;
}

function isCrypto(sym: string): boolean { return !EQ_SYMS.has(sym) && !FX_SYMS.has(sym); }

function metricsOf(trades: Trade[]) {
  const n = trades.length;
  const wins = trades.filter((t) => t.netUsd > 0);
  const losses = trades.filter((t) => t.netUsd <= 0);
  const gw = wins.reduce((a, b) => a + b.netUsd, 0);
  const gl = Math.abs(losses.reduce((a, b) => a + b.netUsd, 0));
  const split = Math.floor((n * 2) / 3);
  const segOf = (arr: Trade[]) => ({ n: arr.length, wr: arr.length ? (arr.filter((t) => t.netUsd > 0).length / arr.length) * 100 : 0, netR: arr.reduce((a, b) => a + b.netR, 0) });
  const s1 = segOf(trades.slice(0, split)), s2 = segOf(trades.slice(split));
  return {
    n, wr: n ? +((wins.length / n) * 100).toFixed(1) : 0,
    net: +trades.reduce((a, b) => a + b.netUsd, 0).toFixed(2),
    netR: +trades.reduce((a, b) => a + b.netR, 0).toFixed(2),
    pf: gl > 0 ? +(gw / gl).toFixed(2) : (gw > 0 ? 99 : 0),
    tgt: trades.filter((t) => t.reason === "TARGET").length,
    stp: trades.filter((t) => t.reason === "STOP").length,
    tim: trades.filter((t) => t.reason === "TIME").length,
    h1: `${s1.n}@${s1.wr.toFixed(0)}%/${s1.netR.toFixed(1)}R`,
    h2: `${s2.n}@${s2.wr.toFixed(0)}%/${s2.netR.toFixed(1)}R`,
  };
}

async function replay(opts: {
  syms: string[]; cryptoBars: Map<string, Raw[]>; nonCryptoBars: Map<string, Raw[]>;
  btcFilter: boolean; label: string; stride: number;
  maxConcurrent?: number; cooldownMin?: number; dailyCapR?: number;
}): Promise<{ trades: Trade[]; vetoes: Vetoes }> {
  const { syms, cryptoBars, nonCryptoBars, btcFilter, stride } = opts;
  const maxConcurrent = opts.maxConcurrent ?? MAX_CONCURRENT;
  const cooldownMs = (opts.cooldownMin ?? 30) * MIN;
  const dailyCapR = opts.dailyCapR ?? DAILY_CAP_R;
  const barsOf = new Map<string, Raw[]>();
  for (const s of syms) {
    const bars = isCrypto(s) ? cryptoBars.get(s) : nonCryptoBars.get(s);
    if (bars && bars.length > WINDOW + 20) barsOf.set(s, bars);
  }
  const maps = new Map<string, Map<number, Raw>>();
  const times = new Set<number>();
  for (const s of barsOf.keys()) {
    const m = new Map<number, Raw>();
    for (const b of barsOf.get(s)!) { m.set(b.t, b); times.add(b.t); }
    maps.set(s, m);
  }
  const sortedT = [...times].sort((a, b) => a - b);
  const btcSeries = btcFilter && cryptoBars.has("BTCUSD") ? trendSeries(cryptoBars.get("BTCUSD")!) : null;

  const open = new Map<string, Open>();
  const trades: Trade[] = [];
  const vetoes: Vetoes = { total: 0, session: 0, stale: 0, btc: 0, notLong: 0, belowGate: 0, gateConfluence: 0, volGuard: 0, liq: 0 };
  let lastLossAt = 0, dayKey = "", dayR = 0, scanCursor = 0;

  for (let ti = 0; ti < sortedT.length; ti++) {
    const t = sortedT[ti];

    for (const [sym, pos] of [...open.entries()]) {
      const b = maps.get(sym)!.get(t);
      if (!b) continue;
      let done: Trade | null = null;
      const mk = (exitPx: number, reason: Trade["reason"]) => {
        const gross = pos.qty * (exitPx - pos.fill);
        const net = gross - pos.qty * pos.fill * FEE - pos.qty * exitPx * FEE;
        return { sym, closeAbs: t, reason, netUsd: net, netR: (net / (pos.qty * pos.fill)) * 100 / pos.stopDistPct, hour: new Date(t).getUTCHours() };
      };
      if (b.l <= pos.stop) {
        const ref = b.c < pos.stop ? b.c : pos.stop;
        done = mk(ref * (1 - SLIP), "STOP");
      } else if (b.h >= pos.target && b.c >= pos.target) {
        done = mk(pos.target, "TARGET");
      } else if (t - pos.openedAbs >= (isCrypto(sym) ? 1080 : 720) * MIN) {
        done = mk(b.c * (1 - SLIP), "TIME");
      }
      if (done) { trades.push(done); dayR += done.netR; if (done.netUsd <= 0) lastLossAt = t; open.delete(sym); }
    }

    const dk = new Date(t).toISOString().slice(0, 10);
    if (dk !== dayKey) { dayKey = dk; dayR = 0; }
    if (dayR <= dailyCapR) continue;
    if (open.size >= maxConcurrent) continue;
    if (t - lastLossAt < cooldownMs) continue;

    scanCursor++;
    if (scanCursor % stride !== 0) continue;

    const hour = new Date(t).getUTCHours();
    if (DEAD_HOURS.includes(hour)) continue;

    for (const sym of barsOf.keys()) {
      if (open.has(sym)) continue;
      if (!sessionOpen(sym, t)) { vetoes.total++; vetoes.session++; continue; }
      if (btcSeries) { const up = btcSeries.get(Math.floor(t / MS) * MS); if (up === false) { vetoes.total++; vetoes.btc++; continue; } }
      const m = maps.get(sym)!;
      const hist: Raw[] = [];
      for (let k = ti - 1; k >= 0 && hist.length < WINDOW; k--) {
        const b = m.get(sortedT[k]);
        if (b) hist.push(b);
      }
      if (hist.length < WINDOW) continue;
      hist.reverse();
      const freshMs = isCrypto(sym) ? 10 * MIN : 30 * MIN;
      if (t - hist[hist.length - 1].t > freshMs) { vetoes.total++; vetoes.stale++; continue; }
      const fillBar = m.get(t);
      if (!fillBar) continue;

      const bars = toBars(hist);
      const prior = bars.slice(0, -1);
      const priorVol = prior.length ? prior.reduce((a, b) => a + b.v, 0) / prior.length : 0;
      const relVolume = priorVol > 0 ? bars[bars.length - 1].v / priorVol : 1;
      const dayStart = bars[bars.length - 1].t - (bars[bars.length - 1].t % 86_400_000);
      const dayBars = bars.filter((b) => b.t >= dayStart);

      const sig = computeSignal({
        candles: { symbol: sym, candles: bars, dataState: "LIVE", source: "replay" } as never,
        dayCandles: { symbol: sym, candles: dayBars, dataState: "LIVE", source: "replay" } as never,
        relVolume, regimePrimary: "NEUTRAL", catalystScore: 0,
        avgVolume: priorVol, minLiquidityUsd: 0,
        horizon: "M30", adaptiveWeights: null, candlePatterns: false,
      });
      if (!sig || sig.direction !== "LONG") { vetoes.total++; vetoes.notLong++; continue; }
      if (sig.score < GATE) { vetoes.total++; vetoes.belowGate++; continue; }
      const aligned = sig.factors.filter((f) => f.contribution > 0).length;
      if (aligned < 4) { vetoes.total++; vetoes.gateConfluence++; continue; }
      if (sig.atrRatio != null && (sig.atrRatio < VOL_GUARD[0] || sig.atrRatio > VOL_GUARD[1])) { vetoes.total++; vetoes.volGuard++; continue; }

      const ref = fillBar.o;
      const stop = ref * (1 - STOP_PCT), target = ref * (1 + TGT_PCT);
      if (stop >= ref || target <= ref) { vetoes.total++; vetoes.liq++; continue; }
      const fill = ref * (1 + SLIP);
      const qty = NOTIONAL / fill;
      const stopDistPct = ((fill - stop) / fill) * 100;
      open.set(sym, { sym, fill, qty, stop, target, openedAbs: t, stopDistPct });
    }
  }
  return { trades, vetoes };
}

/** Live parity: crypto books scan every 2 minutes (stride 2 on the 1m grid),
 *  non-crypto books scan on every closed 5m bar (stride 1). Passed explicitly
 *  per replay call so the union timeline never distorts cadence. */

function report(label: string, r: { trades: Trade[]; vetoes: Vetoes }) {
  const m = metricsOf(r.trades);
  const v = r.vetoes;
  console.log(`${label.padEnd(34)} n=${String(m.n).padStart(3)}  WR=${String(m.wr).padStart(5)}%  net=$${String(m.net).padStart(9)}  R=${String(m.netR).padStart(7)}  PF=${String(m.pf).padStart(5)}  tgt/stp/time=${m.tgt}/${m.stp}/${m.tim}  seg[2/3 ${m.h1} | 1/3 ${m.h2}]`);
  if (v.total > 0) {
    const pct = (x: number) => `${String(Math.round((x / v.total) * 100)).padStart(2)}%`;
    console.log(`    vetoes: scans-with-denials=${v.total}  notLong=${pct(v.notLong)} belowGate=${pct(v.belowGate)} gateOK-confluence<4=${pct(v.gateConfluence)} volGuard=${pct(v.volGuard)} btcRegime=${pct(v.btc)} sessionClosed=${pct(v.session)} stale=${pct(v.stale)} other=${pct(v.liq)}`);
  }
  return m;
}

// Env knobs: SLICE_DAYS + SLICE_WHICH (0=first half,1=second half) slice ALL
// bars into train/test windows; ONLY=name1,name2 filters reported variants.
const SLICE = process.env.SLICE_DAYS ? Number(process.env.SLICE_DAYS) : 0;
const SLICE_WHICH = Number(process.env.SLICE_WHICH ?? 0);
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;
function sliceBars(rows: Raw[]): Raw[] {
  if (!SLICE) return rows;
  const start = rows[0].t + SLICE_WHICH * SLICE * 86_400_000;
  const end = start + SLICE * 86_400_000;
  return rows.filter((b) => b.t >= start && b.t < end);
}
function want(name: string): boolean { return !ONLY || ONLY.some((p) => name.startsWith(p)); }

async function main() {
  const cryptoBars = new Map<string, Raw[]>();
  for (const s of [...BASE_CRYPTO, ...NEW_CRYPTO]) {
    const p = `${NEW_CRYPTO.includes(s) ? DIR_EXPANDED : DIR_BASE_CRYPTO}${s}_1m.json`;
    try { cryptoBars.set(s, sliceBars(loadBars(p))); } catch { console.error(`missing crypto ${s}`); }
  }
  const nonCryptoBars = new Map<string, Raw[]>();
  for (const s of [...BASE_FX, ...BASE_EQ]) {
    try { nonCryptoBars.set(s, sliceBars(loadBars(`${DIR_BASE_YAHOO}${s}_5m.json`))); } catch { console.error(`missing base yahoo ${s}`); }
  }
  for (const s of [...NEW_FX, ...NEW_EQ]) {
    try { nonCryptoBars.set(s, loadBars(`${DIR_EXPANDED}${s}_5m.json`)); } catch { console.error(`missing new yahoo ${s}`); }
  }
  const span0 = cryptoBars.get("BTCUSD")!;
  const days = (span0.at(-1)!.t - span0[0].t) / 86_400_000;
  console.log(`\n=== CRYPTO ${days.toFixed(1)}d real Binance 1m — deployed config (gate64 + volGuard + tStop1080 + BTC filter) ===`);
  if (want("BASE")) report("BASE 10 crypto (deployed)", await replay({ syms: BASE_CRYPTO, cryptoBars, nonCryptoBars, btcFilter: true, label: "base", stride: 2 }));
  if (want("NEW")) report("NEW 10 crypto (proposed)", await replay({ syms: NEW_CRYPTO, cryptoBars, nonCryptoBars, btcFilter: true, label: "new", stride: 2 }));
  if (want("EXPANDED")) report("EXPANDED 20 crypto", await replay({ syms: [...BASE_CRYPTO, ...NEW_CRYPTO], cryptoBars, nonCryptoBars, btcFilter: true, label: "exp", stride: 2 }));

  console.log(`\n=== CRYPTO CADENCE/CAP VARIANTS (BASE 10 only — pre-registered levers for trade count) ===`);
  const cBase = { syms: BASE_CRYPTO, cryptoBars, nonCryptoBars, btcFilter: true, label: "v", stride: 2 } as const;
  if (want("V0")) report("V0 deployed baseline", await replay(cBase));
  if (want("V1")) report("V1 stride 1 (scan every 1m)", await replay({ ...cBase, stride: 1 }));
  if (want("V2")) report("V2 btc filter OFF", await replay({ ...cBase, btcFilter: false }));
  if (want("V3")) report("V3 stride1 + btc OFF", await replay({ ...cBase, stride: 1, btcFilter: false }));
  if (want("V4")) report("V4 maxConcurrent 5", await replay({ ...cBase, maxConcurrent: 5 }));
  if (want("V5")) report("V5 cooldown 15m", await replay({ ...cBase, cooldownMin: 15 }));
  if (want("V6")) report("V6 dailyCap -3R", await replay({ ...cBase, dailyCapR: -3 }));
  if (want("V7")) report("V7 stride1 + concurrent5 + cool15", await replay({ ...cBase, stride: 1, maxConcurrent: 5, cooldownMin: 15 }));

  console.log(`\n=== NON-CRYPTO ${days.toFixed(1)}d real Yahoo 5m — deployed config (gate64 + volGuard + tStop720, session-gated, no BTC filter) ===`);
  const baseNC = [...BASE_FX, ...BASE_EQ];
  const newNC = [...NEW_FX, ...NEW_EQ];
  report("BASE 10 non-crypto (deployed)", await replay({ syms: baseNC, cryptoBars, nonCryptoBars, btcFilter: false, label: "base", stride: 1 }));
  report("NEW 10 non-crypto (proposed)", await replay({ syms: newNC, cryptoBars, nonCryptoBars, btcFilter: false, label: "new", stride: 1 }));
  report("EXPANDED 20 non-crypto", await replay({ syms: [...baseNC, ...newNC], cryptoBars, nonCryptoBars, btcFilter: false, label: "exp", stride: 1 }));

  console.log(`\n=== COMBINED LEDGER (crypto + non-crypto as one book set) ===`);
  const b1 = await replay({ syms: BASE_CRYPTO, cryptoBars, nonCryptoBars, btcFilter: true, label: "c", stride: 2 });
  const b2 = await replay({ syms: baseNC, cryptoBars, nonCryptoBars, btcFilter: false, label: "n", stride: 1 });
  const e1 = await replay({ syms: [...BASE_CRYPTO, ...NEW_CRYPTO], cryptoBars, nonCryptoBars, btcFilter: true, label: "c", stride: 2 });
  const e2 = await replay({ syms: [...baseNC, ...newNC], cryptoBars, nonCryptoBars, btcFilter: false, label: "n", stride: 1 });
  report("BASE ledger (20 books)", { trades: [...b1.trades, ...b2.trades], vetoes: { ...b1.vetoes, total: b1.vetoes.total + b2.vetoes.total } });
  report("EXPANDED ledger (40 books)", { trades: [...e1.trades, ...e2.trades], vetoes: { ...e1.vetoes, total: e1.vetoes.total + e2.vetoes.total } });
  const mb = metricsOf([...b1.trades, ...b2.trades]);
  const me = metricsOf([...e1.trades, ...e2.trades]);
  console.log(`\nSHIP-RULE CHECK (combined): net ${mb.net} -> ${me.net} (need up), WR ${mb.wr} -> ${me.wr} (need >= ${mb.wr - 2}), PF ${mb.pf} -> ${me.pf} (need >= ${mb.pf - 0.05})`);
  console.log(`\nDONE`);
}

void main();
