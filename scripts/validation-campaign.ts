// DeeYoung Pro — 50–100+ trade validation campaign runner.
// Runs the REAL production signal engine (src/lib/engine/signals.ts computeSignal)
// against REAL Binance 1-minute klines (cached by fetch-klines.ts). No synthetic
// data, no reimplemented scoring — the exact shipped code decides every entry.
//
// Honest rules (mirroring the live bot run of 2026-09-03):
//  - Scan cadence: every 2 minutes (stride) per symbol; signal computed on the
//    trailing 260×1m window; session VWAP anchored at UTC midnight (24/7 crypto).
//  - Entry at the OPEN of the next 1m bar after the signal bar (no look-ahead).
//  - Long-only (production v2.0 documented default), gate = 70 (Prisma default).
//    Sensitivity books at 65 and 75 are simulated alongside from the same stream.
//  - Stop = 1.6×ATR(14) below entry; target = 2.4×ATR above (engine's own levels).
//  - Worst-case gap rule: if one bar touches both stop and target → STOP first.
//  - Horizon exits: TIME_10M closes 10 minutes after entry, TIME_30M 30 minutes.
//    Each entry is managed in BOTH horizon books (identical entries, different exits).
//  - Costs: Binance taker 0.1% per side + 1bp slippage per side ⇒ 22bps round trip.
//    Results reported gross AND net.
//  - Catalyst = 0 (no verified news feed — engine's own no-fabrication rule);
//    Regime = NEUTRAL (no live regime feed in a historical replay) — documented.
//
// Artifacts: scripts/out/campaign-signals.jsonl, campaign-trades.json, campaign-summary.json

import { computeSignal } from "@/lib/engine/signals";
import type { Bar } from "@/lib/engine/indicators";
import type { CandleSeries } from "@/lib/types";

const OUT_DIR = new URL("./out/", import.meta.url).pathname;
const SYMBOLS = ["BTCUSD", "ETHUSD", "SOLUSD", "XRPUSD", "DOGEUSD", "ADAUSD", "BNBUSD", "AVAXUSD", "LINKUSD", "DOTUSD"];
const WINDOW = 260;          // 1m bars fed to computeSignal (production intraday-style window)
const STRIDE = 2;            // scan every 2 minutes
const WARMUP = 400;          // indicator warmup bars before first scan
const GATES = [65, 70, 75];  // 70 = production default (headline)
const HORIZONS = [10, 30];   // minutes
const NOTIONAL = 10_000;     // fixed $10k per trade (mirrors live bot run)
const ROUND_TRIP_COST = 0.0022; // 22 bps: 0.1% taker ×2 + 1bp slippage ×2
const COOLDOWN_BARS = 30;

interface RawKline { t: number; o: number; h: number; l: number; c: number; v: number }
interface LoggedSignal { symbol: string; t: number; score: number; direction: string; entry: number; atr: number; stop: number; target: number; rr: number; factors: { name: string; contribution: number }[] }
interface Trade {
  gate: number; horizon: number; symbol: string; signalScore: number;
  entryT: number; entry: number; stop: number; target: number;
  exitT: number; exit: number; reason: "STOP_HIT" | "TARGET_HIT" | "TIME_10M" | "TIME_30M";
  grossPct: number; netPct: number; rMultiple: number;
  factors: { name: string; contribution: number }[];
}

async function loadBars(sym: string): Promise<RawKline[]> {
  return JSON.parse(await Bun.file(`${OUT_DIR}klines/${sym}_1m.json`).text()) as RawKline[];
}

function toBar(k: RawKline): Bar { return { t: k.t, o: k.o, h: k.h, l: k.l, c: k.c, v: k.v }; }

function series(cs: CandleSeries): { symbol: string; candles: Bar[]; dataState: string; source: string } {
  return cs as never as { symbol: string; candles: Bar[]; dataState: string; source: string };
}

// One trade-management book per (gate, horizon): independent open/cooldown state.
interface BookState {
  gate: number; horizon: number;
  open: Map<string, Trade>; busyUntil: Map<string, number>;
  trades: Trade[];
}

function newBook(gate: number, horizon: number): BookState {
  return { gate, horizon, open: new Map(), busyUntil: new Map(), trades: [] };
}

function tryEnter(book: BookState, sym: string, sig: LoggedSignal, bars: RawKline[], idx: number) {
  if (book.open.has(sym)) return;
  const cd = book.busyUntil.get(sym) ?? -1;
  if (idx <= cd) return;
  if (sig.score < book.gate) return;
  const entryBar = bars[idx + 1]; // next bar open — no look-ahead
  if (!entryBar) return;
  const trade: Trade = {
    gate: book.gate, horizon: book.horizon, symbol: sym, signalScore: sig.score,
    entryT: entryBar.t, entry: entryBar.o, stop: sig.stop, target: sig.target,
    exitT: 0, exit: 0, reason: "TIME_10M", grossPct: 0, netPct: 0, rMultiple: 0,
    factors: sig.factors,
  };
  book.open.set(sym, trade);
}

function manageOpen(book: BookState, sym: string, bars: RawKline[], idx: number) {
  const tr = book.open.get(sym);
  if (!tr) return;
  const b = bars[idx];
  const risk = tr.entry - tr.stop; // long-only
  const hitStop = b.l <= tr.stop;
  const hitTarget = b.h >= tr.target;
  if (hitStop) {
    tr.exit = tr.stop; tr.reason = "STOP_HIT"; tr.exitT = b.t;      // worst-case rule
  } else if (hitTarget) {
    tr.exit = tr.target; tr.reason = "TARGET_HIT"; tr.exitT = b.t;
  } else {
    const barsHeld = b.t === tr.entryT ? 1 : Math.round((b.t - tr.entryT) / 60_000) + 1;
    if (barsHeld >= book.horizon) {
      tr.exit = b.c; tr.reason = book.horizon === 10 ? "TIME_10M" : "TIME_30M"; tr.exitT = b.t;
    } else return;
  }
  tr.grossPct = (tr.exit - tr.entry) / tr.entry * 100;
  tr.netPct = tr.grossPct - ROUND_TRIP_COST * 100;
  tr.rMultiple = (tr.exit - tr.entry) / (risk || 1e-9);
  book.trades.push(tr);
  book.open.delete(sym);
  book.busyUntil.set(sym, idx + COOLDOWN_BARS);
}

function stats(trades: Trade[]) {
  const n = trades.length;
  if (!n) return { n: 0 };
  const wins = trades.filter((t) => t.netPct > 0);
  const grossWins = trades.filter((t) => t.grossPct > 0);
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  const netSum = sum(trades.map((t) => t.netPct));
  const grossSum = sum(trades.map((t) => t.grossPct));
  // equity curve on $10k fixed notional per trade, sequential close order
  let eq = 0, peak = 0, maxDD = 0;
  for (const t of trades) { eq += t.netPct; peak = Math.max(peak, eq); maxDD = Math.max(maxDD, peak - eq); }
  const grossProfit = sum(grossWins.map((t) => t.grossPct));
  const grossLoss = Math.abs(sum(trades.filter((t) => t.grossPct <= 0).map((t) => t.grossPct)));
  const reasons: Record<string, number> = {};
  for (const t of trades) reasons[t.reason] = (reasons[t.reason] ?? 0) + 1;
  return {
    n,
    winRatePct: +(wins.length / n * 100).toFixed(1),
    avgGrossPct: +(grossSum / n).toFixed(3),
    avgNetPct: +(netSum / n).toFixed(3),
    totalNetPct: +netSum.toFixed(2),
    avgR: +(sum(trades.map((t) => t.rMultiple)) / n).toFixed(3),
    profitFactor: grossLoss > 0 ? +(grossProfit / grossLoss).toFixed(2) : null,
    maxDrawdownPct: +maxDD.toFixed(2),
    reasons,
    avgHoldMin: null as number | null,
  };
}

async function main() {
  const allBars = new Map<string, RawKline[]>();
  for (const s of SYMBOLS) allBars.set(s, await loadBars(s));
  const signals: LoggedSignal[] = [];
  const books = GATES.flatMap((g) => HORIZONS.map((h) => newBook(g, h)));
  let shortSignals = 0, neutralScans = 0, scans = 0;

  const t0 = Date.now();
  for (const sym of SYMBOLS) {
    const bars = allBars.get(sym)!;
    // session anchor helper: index of UTC-midnight bar for bar i (24/7 crypto ⇒ daily session)
    const dayStart: number[] = new Array(bars.length);
    let curDay = -1, curStart = 0;
    for (let i = 0; i < bars.length; i++) {
      const d = Math.floor(bars[i].t / 86_400_000);
      if (d !== curDay) { curDay = d; curStart = i; }
      dayStart[i] = curStart;
    }
    // rolling 24h mean volume via prefix sums (rel-volume & liquidity basis)
    const volPrefix = new Float64Array(bars.length + 1);
    for (let i = 0; i < bars.length; i++) volPrefix[i + 1] = volPrefix[i] + bars[i].v;

    for (let i = WARMUP; i < bars.length - 1; i++) {
      // 1m-granular trade management FIRST (every bar), then strided scanning
      for (const book of books) manageOpen(book, sym, bars, i);
      if ((i - WARMUP) % STRIDE !== 0) continue;
      const winStart = i - WINDOW + 1;
      const win = bars.slice(winStart, i + 1).map(toBar);
      const cs = series({
        symbol: sym, candles: win, dataState: "LIVE", source: "binance-1m-replay",
      } as unknown as CandleSeries);
      const dayBars = bars.slice(dayStart[i], i + 1).map(toBar);
      const priorVol = i >= 1440 ? (volPrefix[i] - volPrefix[i - 1440]) / 1440 : volPrefix[i] / i;
      const relVolume = priorVol > 0 ? bars[i].v / priorVol : 1;
      void cs; void dayBars; void relVolume; void priorVol; // consumed below
      scans++;
      // horizon-aware scoring: each horizon book is scored by its own stream (M10/M30)
      const sigByH: Record<number, LoggedSignal | null> = {};
      for (const h of HORIZONS) {
        const sig = computeSignal({
          candles: cs,
          dayCandles: { symbol: sym, candles: dayBars, dataState: "LIVE", source: "binance-1m-replay" } as unknown as CandleSeries,
          relVolume, regimePrimary: "NEUTRAL", catalystScore: 0,
          avgVolume: priorVol, minLiquidityUsd: 0,
          horizon: h === 10 ? "M10" : "M30",
        });
        if (!sig) continue;
        if (sig.direction === "NEUTRAL") continue;
        if (sig.direction === "SHORT") { shortSignals++; continue; }
        if (sig.score < 60) continue; // below every measured gate — keep artifact size sane
        const logged: LoggedSignal = {
          symbol: sym, t: bars[i].t, score: sig.score, direction: sig.direction,
          entry: sig.entry, atr: sig.atr, stop: sig.stop, target: sig.target, rr: sig.rr,
          factors: sig.factors.map((f) => ({ name: f.name, contribution: f.contribution })),
        };
        signals.push(logged);
        sigByH[h] = logged;
      }
      for (const book of books) { const lg = sigByH[book.horizon]; if (lg) tryEnter(book, sym, lg, bars, i); }
    }
    // close stragglers (entered within last `horizon` bars) at this symbol's last close
    for (const book of books) {
      for (const [symOpen, tr] of [...book.open]) {
        if (symOpen !== sym) continue;
        const lastB = bars[bars.length - 1];
        tr.exit = lastB.c; tr.exitT = lastB.t;
        tr.reason = book.horizon === 10 ? "TIME_10M" : "TIME_30M";
        tr.grossPct = (tr.exit - tr.entry) / tr.entry * 100;
        tr.netPct = tr.grossPct - ROUND_TRIP_COST * 100;
        tr.rMultiple = (tr.exit - tr.entry) / ((tr.entry - tr.stop) || 1e-9);
        book.trades.push(tr); book.open.delete(symOpen);
      }
    }
    process.stdout.write(`${sym}: scans=${scans} longs=${signals.length} shorts=${shortSignals} t=${((Date.now() - t0) / 1000).toFixed(0)}s\n`);
  }

  await Bun.write(`${OUT_DIR}campaign-signals.jsonl`, signals.map((s) => JSON.stringify(s)).join("\n"));
  const tradesFlat = books.flatMap((b) => b.trades);
  await Bun.write(`${OUT_DIR}campaign-trades.json`, JSON.stringify(tradesFlat, null, 1));

  // ── Reporting ──
  const summary: Record<string, unknown> = {
    generatedAt: new Date().toISOString(),
    engine: "src/lib/engine/signals.ts computeSignal (production code, UPGRADED: horizon-aware chase-guard + M30 momentum bonus)",
    data: "Binance public REST 1m klines, 60 days, 10 UNIVERSE crypto pairs, 0 missing minutes",
    rules: { window: WINDOW, strideMin: STRIDE, gates: GATES, horizons: HORIZONS, notionalUsd: NOTIONAL, roundTripCostBps: 22, stopAtrMult: 1.6, targetAtrMult: 2.4, worstCaseGap: "stop-first", cooldownBars: COOLDOWN_BARS, catalyst: 0, regime: "NEUTRAL" },
    scanStats: { scans, neutral: neutralScans, shortSignals, longSignals: signals.length },
  };
  const byBook: Record<string, unknown> = {};
  for (const book of books) {
    const key = `gate${book.gate}_h${book.horizon}`;
    const st = stats(book.trades);
    const acc: Record<string, { n: number; w: number; s: number }> = {};
    for (const t of book.trades) {
      const e = acc[t.symbol] ?? (acc[t.symbol] = { n: 0, w: 0, s: 0 });
      e.n++; if (t.netPct > 0) e.w++; e.s += t.netPct;
    }
    const perSymbol: Record<string, { n: number; winRatePct: number; totalNetPct: number }> = {};
    for (const [k, v] of Object.entries(acc)) {
      perSymbol[k] = { n: v.n, winRatePct: +(v.w / v.n * 100).toFixed(1), totalNetPct: +v.s.toFixed(2) };
    }
    byBook[key] = { ...st, perSymbol };
  }
  summary.books = byBook;

  // factor attribution at the lowest measured gate (most trades): winners vs losers per horizon
  const attribution: Record<string, Record<string, { win: number; lose: number }>> = {};
  for (const h of HORIZONS) {
    const book = books.find((b) => b.gate === Math.min(...GATES) && b.horizon === h);
    if (!book) continue;
    const acc: Record<string, { win: number; lose: number; wn: number; ln: number }> = {};
    for (const t of book.trades) {
      for (const f of t.factors) {
        const a = acc[f.name] ?? (acc[f.name] = { win: 0, lose: 0, wn: 0, ln: 0 });
        if (t.netPct > 0) { a.win += f.contribution; a.wn++; } else { a.lose += f.contribution; a.ln++; }
      }
    }
    attribution[`h${h}`] = Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, { win: +(v.win / Math.max(1, v.wn)).toFixed(2), lose: +(v.lose / Math.max(1, v.ln)).toFixed(2) }]));
  }
  summary.factorAttribution = attribution;

  await Bun.write(`${OUT_DIR}campaign-summary.json`, JSON.stringify(summary, null, 1));
  console.log(JSON.stringify(summary, null, 1));
  console.log(`CAMPAIGN_DONE in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
main();
/*MARKER-TEST-9137*/
