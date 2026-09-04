// DEEYOUNG PRO — LIVE PAPER RUN of the production engine on REAL-TIME Binance data.
// Rebuilt 2026-09-04 (sandbox reset lost the original). Same validated rules as the
// 2026-09-03 run, now wired to the LEARNING BRAIN (directive 11): per-minute memory
// refresh, adaptive factor weights (bounded ±50%, n≥20), playbook open-guards, and
// outcome journaling on every close. The offline campaign (raw engine) is the A/B
// baseline — this run is the adaptive arm.
//
// Chunked-resume design (sandbox reaps background processes between tool calls):
//   bun scripts/live-run.ts --max-minutes 9            # fresh run
//   bun scripts/live-run.ts resume --max-minutes 9     # continue: open positions kept
// Chunk exit FLUSHES state without closing positions.
//
// Artifacts: scripts/out/liverun-{log,trades.jsonl,signals.jsonl,state.json,summary.json,brain.json}

import { computeSignal } from "@/lib/engine/signals";
import type { Bar } from "@/lib/engine/indicators";
import type { CandleSeries } from "@/lib/types";
import { createMemory } from "@/lib/brain/memory";
import { evaluateOpenGuards, type OpenGuardInput } from "@/lib/brain/playbook";

const OUT_DIR = new URL("./out/", import.meta.url).pathname;
const SYMBOLS = ["BTCUSD", "ETHUSD", "SOLUSD", "XRPUSD", "DOGEUSD", "ADAUSD", "BNBUSD", "AVAXUSD", "LINKUSD", "DOTUSD"];
const BINANCE = (s: string) => s.replace("USD", "USDT");
const POLL_MS = 15_000;
const SCAN_STRIDE_MS = 120_000;
const WINDOW = 260;
const SEED_BARS = 2000;
const MAX_BARS = 3000;
const GATES = [65, 70];
const HORIZONS = [10, 30];
const NOTIONAL = 10_000;
const ROUND_TRIP_COST = 0.0022;
const COOLDOWN_MS = 30 * 60_000;
const MAX_TRADES_G65 = 100;
const MAX_HOURS = 12;

const RESUME = process.argv.includes("resume");
const maxMinIdx = process.argv.indexOf("--max-minutes");
const MAX_MINUTES = maxMinIdx >= 0 ? Number(process.argv[maxMinIdx + 1]) : 9;

interface RawK { t: number; o: number; h: number; l: number; c: number; v: number; T: number }
interface OpenTrade {
  key: string; sym: string; gate: number; hz: 10 | 30; hzName: "M10" | "M30";
  entry: number; stop: number; target: number; atrPct: number; score: number; rr: number;
  entryT: number; notional: number;
  factors: { key?: string; name?: string; contribution: number }[];
}
interface ClosedTrade extends Omit<OpenTrade, "key"> {
  exit: number; exitT: number; reason: string; grossPct: number; netPct: number; rMultiple: number;
}
interface State {
  startedAt: number; lastT: Record<string, number>; busyUntil: Record<string, number>;
  open: Record<string, OpenTrade>; trades: ClosedTrade[]; lastLossAtMs: number | null;
  lastScan: Record<string, number>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const utcHour = (t: number) => new Date(t).getUTCHours();

function log(msg: string) {
  const line = `${new Date().toISOString()} ${msg}`;
  console.log(line);
  void appendLog(line);
}
async function appendLog(line: string) {
  try {
    const f = `${OUT_DIR}liverun.log`;
    const old = await Bun.file(f).exists() ? await Bun.file(f).text() : "";
    await Bun.write(f, `${old}${line}\n`);
  } catch { /* logging never fatal */ }
}

async function loadState(): Promise<State> {
  if (RESUME) {
    try {
      const f = Bun.file(`${OUT_DIR}liverun-state.json`);
      if (await f.exists()) {
        const s = JSON.parse(await f.text()) as State;
        log(`resume: ${Object.keys(s.open ?? {}).length} open, ${s.trades?.length ?? 0} closed, startedAt=${new Date(s.startedAt).toISOString()}`);
        return s;
      }
    } catch (e) {
      log(`state load failed (${String(e).slice(0, 80)}) — starting fresh`);
    }
  }
  return {
    startedAt: Date.now(), lastT: {}, busyUntil: {}, open: {}, trades: [],
    lastLossAtMs: null, lastScan: {},
  };
}

async function saveState(s: State, brain: ReturnType<typeof createMemory>) {
  await Bun.write(`${OUT_DIR}liverun-state.json`, JSON.stringify(s));
  await Bun.write(`${OUT_DIR}liverun-trades.jsonl`, s.trades.map((t) => JSON.stringify(t)).join("\n"));
  await brain.persist();
}

async function fetchKlines(sym: string, limit: number): Promise<RawK[]> {
  const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${BINANCE(sym)}&interval=1m&limit=${limit}`, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`binance ${res.status} ${sym}`);
  const rows = (await res.json()) as (string | number)[][];
  return rows.map((r) => ({ t: Number(r[0]), o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[5], T: Number(r[6]) }));
}

function seriesOf(sym: string, bars: Bar[]): CandleSeries {
  return { symbol: sym, candles: bars, dataState: "LIVE", source: "binance-1m-live" } as unknown as CandleSeries;
}

function closeTrade(o: OpenTrade, price: number, now: number, reason: string, s: State, brain: ReturnType<typeof createMemory>): ClosedTrade {
  const grossPct = ((price - o.entry) / o.entry) * 100;
  const netPct = grossPct - ROUND_TRIP_COST * 100;
  const stopDistPct = ((o.entry - o.stop) / o.entry) * 100 || 1e-9;
  const t: ClosedTrade = { ...o, exit: price, exitT: now, reason, grossPct, netPct, rMultiple: netPct / stopDistPct };
  s.trades.push(t);
  s.busyUntil[o.key] = now + COOLDOWN_MS;
  if (netPct < 0) s.lastLossAtMs = now;
  brain.recordOutcome({
    horizon: o.hzName, symbol: o.sym, netPct, hourUtc: utcHour(now), atrPct: o.atrPct,
    factors: o.factors.map((f) => ({ key: f.key, name: f.name, contribution: f.contribution ?? 0 })),
  });
  return t;
}

function manageOpen(s: State, sym: string, bar: RawK, price: number, now: number, brain: ReturnType<typeof createMemory>): void {
  for (const [key, o] of Object.entries(s.open)) {
    if (o.sym !== sym) continue;
    // 1) stop (conservative: observed price or bar low — whichever is worse for the long)
    const stopHit = Math.min(price, bar.l) <= o.stop;
    const targetHit = bar.h >= o.target && price >= o.target;
    if (stopHit) {
      const fill = price <= o.stop ? price : o.stop;
      const t = closeTrade(o, fill, now, "STOP", s, brain);
      delete s.open[key];
      log(`CLOSE ${key} STOP @${fill} net=${t.netPct.toFixed(2)}% R=${t.rMultiple.toFixed(2)}`);
      continue;
    }
    if (targetHit) {
      const t = closeTrade(o, o.target, now, "TARGET", s, brain);
      delete s.open[key];
      log(`CLOSE ${key} TARGET @${o.target} net=${t.netPct.toFixed(2)}% R=${t.rMultiple.toFixed(2)}`);
      continue;
    }
    // 2) horizon time exit
    if (now - o.entryT >= o.hz * 60_000) {
      const t = closeTrade(o, price, now, o.hz === 10 ? "TIME_10M" : "TIME_30M", s, brain);
      delete s.open[key];
      log(`CLOSE ${key} ${t.reason} @${price} net=${t.netPct.toFixed(2)}% R=${t.rMultiple.toFixed(2)}`);
    }
  }
}

function summaryOf(s: State) {
  const books: Record<string, { n: number; wins: number; netSum: number; pfGross: number; maxDD: number }> = {};
  for (const g of GATES) for (const h of HORIZONS) books[`${g}_${h}`] = { n: 0, wins: 0, netSum: 0, pfGross: 0, maxDD: 0 };
  const peak: Record<string, number> = {}; const cum: Record<string, number> = {};
  let wins = 0, grossWin = 0, grossLoss = 0;
  for (const t of s.trades) {
    const b = books[`${t.gate}_${t.hz}`]; if (!b) continue;
    b.n++; b.netSum += t.netPct; if (t.netPct > 0) { wins++; b.wins++; }
    const gp = t.grossPct;
    if (gp > 0) grossWin += gp; else grossLoss += Math.abs(gp);
    cum[`${t.gate}_${t.hz}`] = (cum[`${t.gate}_${t.hz}`] ?? 0) + t.netPct;
    peak[`${t.gate}_${t.hz}`] = Math.max(peak[`${t.gate}_${t.hz}`] ?? 0, cum[`${t.gate}_${t.hz}`]);
    b.maxDD = Math.min(b.maxDD, cum[`${t.gate}_${t.hz}`] - (peak[`${t.gate}_${t.hz}`] ?? 0));
  }
  return {
    updatedAt: new Date().toISOString(), totalTrades: s.trades.length, openPositions: Object.keys(s.open).length,
    elapsedHours: +((Date.now() - s.startedAt) / 3_600_000).toFixed(2),
    books: Object.fromEntries(Object.entries(books).map(([k, b]) => [k, {
      trades: b.n, winRatePct: b.n ? +(b.wins / b.n * 100).toFixed(1) : null,
      avgNetPct: b.n ? +(b.netSum / b.n).toFixed(3) : null, totalNetPct: +b.netSum.toFixed(2),
      profitFactorGross: grossLoss > 0 ? +(grossWin / grossLoss).toFixed(2) : null, maxDrawdownPct: +b.maxDD.toFixed(2),
    }])),
    brain: { weights: brainWeights, tradesSeen: brainTradesSeen, refreshes: brainRefreshes },
  };
}
let brainWeights: unknown = null; let brainTradesSeen = 0; let brainRefreshes = 0;

async function main() {
  const brain = createMemory(`${OUT_DIR}liverun-brain.json`);
  await brain.load(); brain.refresh();
  const s = await loadState();
  log(`LIVE RUN start=${RESUME ? "resume" : "fresh"} maxMinutes=${MAX_MINUTES} symbols=${SYMBOLS.length} books=${GATES.length * HORIZONS.length}`);

  // seed buffers
  const buf: Record<string, RawK[]> = {};
  for (const sym of SYMBOLS) {
    try {
      buf[sym] = await fetchKlines(sym, SEED_BARS);
      s.lastT[sym] = buf[sym][buf[sym].length - 1].t;
      log(`seed ${sym}: ${buf[sym].length} bars last=${new Date(s.lastT[sym]).toISOString()}`);
    } catch (e) { log(`SEED FAIL ${sym}: ${String(e).slice(0, 100)}`); buf[sym] = []; }
    await sleep(250); // rate-limit courtesy
  }

  let lastMinuteRefresh = 0; let lastFlush = 0;
  const g65Total = () => s.trades.filter((t) => t.gate === 65).length;

  while (true) {
    const now = Date.now();
    if ((now - s.startedAt) / 60_000 >= MAX_MINUTES) {
      await saveState(s, brain);
      await Bun.write(`${OUT_DIR}liverun-summary.json`, JSON.stringify(summaryOf(s), null, 1));
      log(`chunk complete: ${s.trades.length} closed, ${Object.keys(s.open).length} open — state flushed, exiting cleanly`);
      process.exit(0);
    }
    if (g65Total() >= MAX_TRADES_G65) { log(`gate-65 book reached ${MAX_TRADES_G65} trades — campaign target met`); await saveState(s, brain); process.exit(0); }
    if ((now - s.startedAt) / 3_600_000 >= MAX_HOURS) { log("12h run cap reached"); await saveState(s, brain); process.exit(0); }

    // per-minute brain refresh + periodic flush
    if (now - lastMinuteRefresh >= 60_000) {
      lastMinuteRefresh = now;
      brain.refresh(); brainWeights = brain.adaptiveWeights("M10"); brainTradesSeen = brain.state.tradesSeen; brainRefreshes = brain.state.refreshes;
    }
    if (now - lastFlush >= 60_000) { lastFlush = now; await saveState(s, brain); }

    let feedErrors = 0;
    for (const sym of SYMBOLS) {
      try {
        const fresh = await fetchKlines(sym, 3);
        if (!fresh.length) continue;
        const cur = fresh[fresh.length - 1];
        const price = cur.c;
        // append newly CLOSED bars
        for (const k of fresh) {
          if (k.T < now && k.t > (s.lastT[sym] ?? 0)) {
            buf[sym].push(k);
            s.lastT[sym] = k.t;
            manageOpen(s, sym, k, k.c, k.t + 60_000, brain); // bar-level management (conservative gaps)
          }
        }
        if (buf[sym].length > MAX_BARS) buf[sym] = buf[sym].slice(-MAX_BARS);
        const bars = buf[sym];
        if (bars.length < WINDOW + 10) continue;
        // live tick-level management against current price
        manageOpenLive(s, sym, price, now, brain);

        // scan stride per symbol
        if (now - (s.lastScan[sym] ?? 0) < SCAN_STRIDE_MS) continue;
        s.lastScan[sym] = now;

        const win = bars.slice(-WINDOW).map((k) => ({ t: k.t, o: k.o, h: k.h, l: k.l, c: k.c, v: k.v } as Bar));
        const cs = seriesOf(sym, win);
        const dayStart = win[win.length - 1].t - (win[win.length - 1].t % 86_400_000);
        const dayBars = win.filter((b) => b.t >= dayStart);
        const prior = bars.slice(-1441, -1);
        const priorVol = prior.length ? prior.reduce((a, b) => a + b.v, 0) / prior.length : 0;
        const relVolume = priorVol > 0 ? win[win.length - 1].v / priorVol : 1;
        const hourUtc = utcHour(now);

        for (const h of HORIZONS) {
          const hzName = h === 10 ? "M10" : "M30";
          const sig = computeSignal({
            candles: cs,
            dayCandles: seriesOf(sym, dayBars),
            relVolume, regimePrimary: "NEUTRAL", catalystScore: 0,
            avgVolume: priorVol, minLiquidityUsd: 0,
            horizon: hzName,
            adaptiveWeights: brain.adaptiveWeights(hzName),
            candlePatterns: false, // A/B round 1 rejected the candle bonus — control stays honest
          });
          if (!sig || sig.direction !== "LONG") continue;
          await appendJsonl("liverun-signals.jsonl", JSON.stringify({ t: now, sym, hz: h, gate: null, score: sig.score, entry: sig.entry, atr: sig.atr, rr: sig.rr, factors: sig.factors.map((f) => ({ key: f.key, name: f.name, contribution: f.contribution })) }));
          for (const g of GATES) {
            if (sig.score < g) continue;
            const key = `${g}_${h}_${sym}`;
            if (s.open[key] || now <= (s.busyUntil[key] ?? 0)) continue;
            // playbook guards (brain-measured dead hours override defaults)
            const todayStart = now - (now % 86_400_000);
            const todayNetR = s.trades.filter((t) => t.exitT >= todayStart && t.gate === g && t.hz === h).reduce((a, b) => a + b.rMultiple, 0);
            const guardIn: OpenGuardInput = {
              hourUtc, score: sig.score, rr: sig.rr,
              openPositions: Object.keys(s.open).length,
              todayNetR, lastLossAtMs: s.lastLossAtMs, dataState: "LIVE", liquidityOk: true,
            };
            const verdict = evaluateOpenGuards(guardIn, brain.deadHours(hzName));
            if (!verdict.allowed) {
              await appendJsonl("liverun-signals.jsonl", JSON.stringify({ t: now, sym, hz: h, gate: g, score: sig.score, denied: verdict.deniedBy }));
              continue;
            }
            const o: OpenTrade = {
              key, sym, gate: g, hz: h as 10 | 30, hzName,
              entry: price, stop: sig.stop, target: sig.target,
              atrPct: sig.atr / price * 100, score: sig.score, rr: sig.rr, entryT: now,
              notional: NOTIONAL,
              factors: sig.factors.map((f) => ({ key: f.key, name: f.name, contribution: f.contribution })),
            };
            s.open[key] = o;
            log(`OPEN ${key} score=${sig.score} @${price} stop=${sig.stop} tgt=${sig.target} rr=${sig.rr.toFixed(2)}`);
          }
        }
      } catch (e) {
        feedErrors++;
        if (feedErrors <= 2) log(`feed error ${sym}: ${String(e).slice(0, 100)}`);
      }
      await sleep(60); // pace the 10-symbol loop
    }
    await sleep(POLL_MS);
  }
}

// live tick management (between closed bars): stop at observed price, target as limit
function manageOpenLive(s: State, sym: string, price: number, now: number, brain: ReturnType<typeof createMemory>) {
  for (const [key, o] of Object.entries(s.open)) {
    if (o.sym !== sym) continue;
    if (price <= o.stop) {
      const t = closeTrade(o, price, now, "STOP", s, brain);
      delete s.open[key];
      log(`CLOSE ${key} STOP @${price} net=${t.netPct.toFixed(2)}% R=${t.rMultiple.toFixed(2)}`);
    } else if (price >= o.target) {
      const t = closeTrade(o, o.target, now, "TARGET", s, brain);
      delete s.open[key];
      log(`CLOSE ${key} TARGET @${o.target} net=${t.netPct.toFixed(2)}% R=${t.rMultiple.toFixed(2)}`);
    } else if (now - o.entryT >= o.hz * 60_000) {
      const t = closeTrade(o, price, now, o.hz === 10 ? "TIME_10M" : "TIME_30M", s, brain);
      delete s.open[key];
      log(`CLOSE ${key} ${t.reason} @${price} net=${t.netPct.toFixed(2)}% R=${t.rMultiple.toFixed(2)}`);
    }
  }
}

async function appendJsonl(name: string, line: string) {
  try {
    const f = `${OUT_DIR}${name}`;
    const old = await Bun.file(f).exists() ? await Bun.file(f).text() : "";
    await Bun.write(f, old ? `${old}\n${line}` : line);
  } catch { /* logging never fatal */ }
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
