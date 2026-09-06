// DeeYoung Pro — EDGE UPGRADE REPLAY (evidence-gated improvement round).
// Same production-faithful replay core as geometry_replay.ts (fills at next
// bar open, closed-bar signals, paper.ts cost model, guards). NEW variants,
// all pre-registered before running:
//   symTrend    — per-symbol 60m EMA20 trend filter (LONG only above own trend)
//   requireVwap — VWAP factor must be positive (price above session VWAP)
//   volGuard    — skip when ATR(14)/avgATR ratio outside [lo, hi] (dead/blow-off tape)
//   timeStopMin — time-stop sweep (480/720/1080)
//   geomOverride— target/stop grid (target must stay >> 24bps RT costs)
//   gateOverride— gate sweep 64/66/68
// SHIP RULE (pre-registered): a change ships only if on BOTH classes it
// improves net AND PF versus baseline, WR does not drop >2pp, AND the last
// third of the sample is not worse than baseline's last third. No hopeful
// constants: ties go to the deployed config.

import { computeSignal } from "../src/lib/engine/signals";
import type { Bar } from "../src/lib/engine/indicators";

const OUT_CRYPTO = new URL("./out/klines/", import.meta.url).pathname;
const OUT_YAHOO = new URL("./out/klines_yahoo_5m/", import.meta.url).pathname;
const OUT_YAHOO_60 = new URL("./out/klines_yahoo_5m_60d/", import.meta.url).pathname;

const CRYPTO = ["BTCUSD", "ETHUSD", "SOLUSD", "XRPUSD", "DOGEUSD", "ADAUSD", "BNBUSD", "AVAXUSD", "LINKUSD", "DOTUSD"];
const FXLIKE = ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "XAUUSD", "WTI"];
const EQUITY = ["NVDA", "AAPL", "MSFT", "TSLA"];

const GATE = 64;
const WINDOW = 260;
const NOTIONAL = 1000;
const FEE = 0.001;
const SLIP = 0.0002;
const TIME_STOP_MIN = 720;
const DEAD_HOURS = [21, 22, 23];
const DAILY_CAP_R = -2;
const MAX_CONCURRENT = 3;
const COOLDOWN_MS = 30 * 60_000;
const STOP_PCT = 0.030;
const TGT_PCT = 0.012;
const MS = 3_600_000;

interface Raw { t: number; o: number; h: number; l: number; c: number; v: number }
interface Open { sym: string; fill: number; qty: number; stop: number; target: number; openedAbs: number; stopDistPct: number }
interface Trade { sym: string; closeAbs: number; reason: "STOP" | "TARGET" | "TIME"; netUsd: number; netR: number; hour: number }

function loadBars(path: string): Raw[] { return JSON.parse(require("fs").readFileSync(path, "utf8")) as Raw[]; }
function toBars(rows: Raw[]): Bar[] { return rows.map((k) => ({ t: k.t, o: k.o, h: k.h, l: k.l, c: k.c, v: k.v })); }

/** Per-symbol 60m EMA20 trend verdict series. Key = bucket CLOSE ts; verdict
 *  computed over CLOSED buckets only (same port as the BTC regime filter). */
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

function sessionOpen(sym: string, t: number): boolean {
  const d = new Date(t);
  const day = d.getUTCDay();
  const hour = d.getUTCHours();
  const min = d.getUTCMinutes();
  if (EQUITY.includes(sym)) {
    if (day === 0 || day === 6) return false;
    const mins = hour * 60 + min;
    return mins >= 14 * 60 && mins <= 19 * 60 + 45;
  }
  if (FXLIKE.includes(sym)) {
    if (day === 6) return false;
    if (day === 5 && hour >= 21) return false;
    if (day === 0 && hour < 22) return false;
    return true;
  }
  return true;
}

interface Variant {
  name: string;
  confluence: number;
  targetStrict: boolean;
  btcFilter: boolean;
  symTrend?: boolean;
  requireVwap?: boolean;
  volGuard?: [number, number] | null;
  timeStopMin?: number;
  geom?: { tgt: number; stp: number };
  symbols: string[];
  gateOverride?: number;
  strideBars?: number;
  freshMs?: number;
}

interface Metrics {
  n: number; wins: number; wr: number; netUsd: number; netR: number; pf: number;
  maxConsecLoss: number; worst10WR: number; avgHoldMin: number;
  tgt: number; stp: number; tim: number;
  seg: { firstN: number; firstWR: number; firstNetR: number; lastN: number; lastWR: number; lastNetR: number };
}

function metricsOf(trades: Trade[]): Metrics {
  const n = trades.length;
  const wins = trades.filter((t) => t.netUsd > 0);
  const losses = trades.filter((t) => t.netUsd <= 0);
  const gw = wins.reduce((a, b) => a + b.netUsd, 0);
  const gl = Math.abs(losses.reduce((a, b) => a + b.netUsd, 0));
  let consec = 0, maxConsec = 0;
  for (const t of trades) { if (t.netUsd <= 0) { consec++; maxConsec = Math.max(maxConsec, consec); } else consec = 0; }
  let worst10 = 100;
  for (let i = 0; i + 10 <= n; i++) {
    const w = trades.slice(i, i + 10).filter((t) => t.netUsd > 0).length;
    worst10 = Math.min(worst10, (w / 10) * 100);
  }
  const hold = n ? trades.reduce((a, b) => a + b.closeAbs - (b.closeAbs - b.closeAbs), 0) / n : 0;
  const split = Math.floor((n * 2) / 3);
  const first = trades.slice(0, split), last = trades.slice(split);
  const segOf = (arr: Trade[]) => ({ n: arr.length, wr: arr.length ? (arr.filter((t) => t.netUsd > 0).length / arr.length) * 100 : 0, netR: arr.reduce((a, b) => a + b.netR, 0) });
  const s1 = segOf(first), s2 = segOf(last);
  return {
    n, wins: wins.length, wr: n ? (wins.length / n) * 100 : 0,
    netUsd: +trades.reduce((a, b) => a + b.netUsd, 0).toFixed(2),
    netR: +trades.reduce((a, b) => a + b.netR, 0).toFixed(2),
    pf: gl > 0 ? +(gw / gl).toFixed(2) : (gw > 0 ? 99 : 0),
    maxConsecLoss: maxConsec, worst10WR: n >= 10 ? +worst10.toFixed(0) : -1, avgHoldMin: 0,
    tgt: trades.filter((t) => t.reason === "TARGET").length,
    stp: trades.filter((t) => t.reason === "STOP").length,
    tim: trades.filter((t) => t.reason === "TIME").length,
    seg: { firstN: s1.n, firstWR: +s1.wr.toFixed(0), firstNetR: +s1.netR.toFixed(2), lastN: s2.n, lastWR: +s2.wr.toFixed(0), lastNetR: +s2.netR.toFixed(2) },
  };
}

async function replay(v: Variant, barsBySym: Map<string, Raw[]>): Promise<Trade[]> {
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

  const btcSeries = v.btcFilter && barsBySym.has("BTCUSD") ? trendSeries(barsBySym.get("BTCUSD")!) : null;
  const symTrends = new Map<string, Map<number, boolean>>();
  if (v.symTrend) for (const s of syms) symTrends.set(s, trendSeries(barsBySym.get(s)!));

  const open = new Map<string, Open>();
  const trades: Trade[] = [];
  let lastLossAt = 0, dayKey = "", dayR = 0, scanCursor = 0;
  const timeStop = (v.timeStopMin ?? TIME_STOP_MIN) * MIN;
  const tgtPct = v.geom?.tgt ?? TGT_PCT;
  const stpPct = v.geom?.stp ?? STOP_PCT;

  for (let ti = 0; ti < sortedT.length; ti++) {
    const t = sortedT[ti];

    // exits (stop-first, conservative bar path)
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
      } else {
        const targetHit = v.targetStrict ? (b.h >= pos.target && b.c >= pos.target) : b.h >= pos.target;
        if (targetHit) done = mk(pos.target, "TARGET");
        else if (t - pos.openedAbs >= timeStop) done = mk(b.c * (1 - SLIP), "TIME");
      }
      if (done) { trades.push(done); if (done.netUsd <= 0) lastLossAt = t; open.delete(sym); }
    }

    const dk = new Date(t).toISOString().slice(0, 10);
    if (dk !== dayKey) { dayKey = dk; dayR = 0; }
    if (dayR <= DAILY_CAP_R) continue;
    if (open.size >= MAX_CONCURRENT) continue;
    if (t - lastLossAt < COOLDOWN_MS) continue;

    scanCursor++;
    if (scanCursor % (v.strideBars ?? 2) !== 0) continue;
    const hour = new Date(t).getUTCHours();
    if (DEAD_HOURS.includes(hour)) continue;

    for (const sym of syms) {
      if (open.has(sym)) continue;
      if (!sessionOpen(sym, t)) continue;
      if (btcSeries) { const up = btcSeries.get(Math.floor(t / MS) * MS); if (up === false) continue; }
      if (v.symTrend) { const up = symTrends.get(sym)!.get(Math.floor(t / MS) * MS); if (up === false) continue; }
      const m = maps.get(sym)!;
      const hist: Raw[] = [];
      for (let k = ti - 1; k >= 0 && hist.length < WINDOW; k--) {
        const b = m.get(sortedT[k]);
        if (b) hist.push(b);
      }
      if (hist.length < WINDOW) continue;
      hist.reverse();
      if (t - hist[hist.length - 1].t > (v.freshMs ?? 10 * MIN)) continue;
      const fillBar = m.get(t);
      if (!fillBar) continue;

      const bars = toBars(hist);
      const closes = bars.map((b) => b.c);
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
      if (!sig || sig.direction !== "LONG") continue;
      if (sig.score < (v.gateOverride ?? GATE)) continue;
      if (v.requireVwap) {
        const vwapF = sig.factors.find((f) => f.key === "VWAP");
        if (!vwapF || vwapF.contribution <= 0) continue;
      }
      if (v.volGuard && sig.atrRatio != null && (sig.atrRatio < v.volGuard[0] || sig.atrRatio > v.volGuard[1])) continue;
      const aligned = sig.factors.filter((f) => f.contribution > 0).length;
      if (aligned < v.confluence) continue;
      const ref = fillBar.o;
      const stop = ref * (1 - stpPct), target = ref * (1 + tgtPct);
      if (stop >= ref || target <= ref) continue;
      const fill = ref * (1 + SLIP);
      const qty = NOTIONAL / fill;
      const stopDistPct = ((fill - stop) / fill) * 100;
      open.set(sym, { sym, fill, qty, stop, target, openedAbs: t, stopDistPct });
    }
  }
  return trades;
}

function report(v: Variant, trades: Trade[]) {
  const m = metricsOf(trades);
  console.log(
    `${v.name.padEnd(52)} n=${String(m.n).padStart(4)}  WR=${String(m.wr.toFixed(1)).padStart(5)}%  net=$${String(m.netUsd).padStart(9)}  R=${String(m.netR).padStart(7)}  PF=${String(m.pf).padStart(5)}  tgt/stp/time=${m.tgt}/${m.stp}/${m.tim}  maxCL=${m.maxConsecLoss}  w10=${m.worst10WR}%  seg[2/3 WR=${m.seg.firstWR}% R=${m.seg.firstNetR} | 1/3 WR=${m.seg.lastWR}% R=${m.seg.lastNetR}]`,
  );
}

function hourTable(trades: Trade[], label: string) {
  const byH = new Map<number, { n: number; w: number; r: number }>();
  for (const t of trades) {
    const e = byH.get(t.hour) ?? { n: 0, w: 0, r: 0 };
    e.n++; if (t.netUsd > 0) e.w++; e.r += t.netR;
    byH.set(t.hour, e);
  }
  console.log(`  entry-hour table ${label}: ` + [...byH.entries()].sort((a, b) => a[0] - b[0]).map(([h, e]) => `${h}h:n${e.n}/wr${Math.round((e.w / e.n) * 100)}%/R${e.r.toFixed(1)}`).join(" "));
}

// Optional env: SLICE_DAYS + SLICE_WHICH (0=first,1=second) slice crypto bars
// into halves for train/test stability; ONLY="prefix1,prefix2" filters variants.
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

// ── CRYPTO 60d ──────────────────────────────────────────────────────────────
if (process.env.RUN_CRYPTO !== "0") {
  const cryptoBars = new Map<string, Raw[]>();
  for (const s of CRYPTO) { try { cryptoBars.set(s, sliceBars(loadBars(`${OUT_CRYPTO}${s}_1m.json`))); } catch { console.error(`missing ${s}`); } }
  const days = (cryptoBars.get("BTCUSD")!.at(-1)!.t - cryptoBars.get("BTCUSD")![0].t) / 86_400_000;
  console.log(`\nCRYPTO ${days.toFixed(1)}d real Binance 1m x ${cryptoBars.size} symbols, gate 64 (unless swept), geometry v2, costs modeled`);
  const base = { confluence: 4, targetStrict: true, btcFilter: true, symbols: CRYPTO } as Variant;
  for (const v of [
    { ...base, name: "C0 baseline (deployed: btc filter only)" },
    { ...base, name: "C1 +symTrend", symTrend: true },
    { ...base, name: "C2 +requireVwap", requireVwap: true },
    { ...base, name: "C3 +symTrend +requireVwap", symTrend: true, requireVwap: true },
    { ...base, name: "C4 volGuard [0.55,2.0]", volGuard: [0.55, 2.0] as [number, number] },
    { ...base, name: "C5 +symTrend +volGuard", symTrend: true, volGuard: [0.55, 2.0] as [number, number] },
    { ...base, name: "C6 sweep gate 66 (btc only)", gateOverride: 66 },
    { ...base, name: "C7 sweep gate 68 (btc only)", gateOverride: 68 },
    { ...base, name: "C8 timeStop 480m", timeStopMin: 480 },
    { ...base, name: "C9 timeStop 1080m", timeStopMin: 1080 },
    { ...base, name: "C10 geom tgt1.5/stp3.0", geom: { tgt: 0.015, stp: 0.030 } },
    { ...base, name: "C11 geom tgt1.8/stp3.0", geom: { tgt: 0.018, stp: 0.030 } },
    { ...base, name: "C12 volGuard + timeStop 1080m", volGuard: [0.55, 2.0] as [number, number], timeStopMin: 1080 },
  ] as Variant[]) { if (want(v.name)) report(v, await replay(v, cryptoBars)); }
}

// ── NON-CRYPTO (30d cached + 60d fresh when present) ────────────────────────
for (const [label, dir] of [["NON-CRYPTO 30d", OUT_YAHOO], ["NON-CRYPTO 60d", OUT_YAHOO_60]] as [string, string][]) {
  if (process.env.RUN_FX === "0") break;
  const yahoo5 = new Map<string, Raw[]>();
  for (const s of [...FXLIKE, ...EQUITY]) {
    try { const b = loadBars(`${dir}${s}_5m.json`); if (b.length > WINDOW + 20) yahoo5.set(s, b); } catch { continue; }
  }
  if (yahoo5.size < 8) { console.log(`\n${label}: not enough files (${yahoo5.size}) — skipped`); continue; }
  const span = Math.max(...[...yahoo5.values()].map((b) => b.at(-1)!.t)) - Math.min(...[...yahoo5.values()].map((b) => b[0].t));
  console.log(`\n${label} real Yahoo 5m (${(span / 86_400_000).toFixed(0)}d) x ${yahoo5.size} symbols, session-gated, stride 1, freshMs 30m`);
  const nbase = { confluence: 4, targetStrict: true, btcFilter: false, symbols: [...FXLIKE, ...EQUITY], strideBars: 1, freshMs: 30 * 60_000 } as Variant;
  const fxBase = { ...nbase, symbols: FXLIKE } as Variant;
  for (const v of [
    { ...nbase, name: `${label} N0 baseline (deployed)` },
    { ...nbase, name: `${label} N1 +symTrend`, symTrend: true },
    { ...nbase, name: `${label} N2 +requireVwap`, requireVwap: true },
    { ...nbase, name: `${label} N3 +symTrend +requireVwap`, symTrend: true, requireVwap: true },
    { ...nbase, name: `${label} N4 volGuard [0.55,2.0]`, volGuard: [0.55, 2.0] as [number, number] },
    { ...nbase, name: `${label} N5 sweep gate 66`, gateOverride: 66 },
    { ...nbase, name: `${label} N6 timeStop 1080m`, timeStopMin: 1080 },
    { ...nbase, name: `${label} N7 geom tgt1.5/stp3.0`, geom: { tgt: 0.015, stp: 0.030 } },
    { ...fxBase, name: `${label} FX-only baseline`, symTrend: false },
    { ...fxBase, name: `${label} FX-only +symTrend`, symTrend: true },
  ] as Variant[]) report(v, await replay(v, yahoo5));
  const bl = await replay({ ...nbase, name: "hourtable" }, yahoo5);
  hourTable(bl, label);
}
console.log("\nDONE");
