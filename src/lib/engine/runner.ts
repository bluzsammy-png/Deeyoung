// DEEYOUNG PRO — AUTONOMOUS ENGINE RUNNER (24/7-capable, Postgres-backed).
// 2026-09-04: user directive — stop depending on third-party broker signups;
// own the execution stack.
// 2026-09-05 GEOMETRY v2 (walk-forward validated, scripts/geometry_* over 30
// days of real Binance 1m bars × 10 symbols): single high-conviction book
//   GATES=[64], horizon M30 only, stop −3.0%, target +1.2%, time stop 12h,
//   $1,000 notional (10% of the $10k paper account), BTC 60m-EMA20 regime
//   filter, 24bps-class RT costs. Measured: 83.8% WR, PF 2.13, worst
//   rolling-10 stretch 6 wins (median 9). Replaces the 4-book gate-55/60
//   config whose ATR(1m) targets (~8bps) were smaller than RT costs (24bps)
//   — every "TARGET win" netted −1.9R (prod incident 2026-09-05).

import { computeSignal } from "@/lib/engine/signals";
import type { Bar } from "@/lib/engine/indicators";
import { fetchKlinesAny, setFeedUniverse, type FeedBar } from "@/lib/engine/feed";
import { getEngineControl } from "@/lib/engine/control";
import {
  paperEntry, paperExit, paperMarkToMarket, paperLastClose, paperTodayNetR,
  paperLastLossAtMs, paperClosedCount, paperOpenCount, getOrCreateRun,
} from "@/lib/engine/paper";
import { LearningMemory } from "@/lib/brain/memory";
import { evaluateOpenGuards, type OpenGuardInput } from "@/lib/brain/playbook";
import { db } from "@/lib/db";
import { mirrorOnEntry, mirrorOnExit, mirrorCycle, openMirrorCount, venueMode } from "@/lib/engine/venue";
import { fanoutOnEntry, fanoutOnExit } from "@/lib/engine/fanout";

export const SYMBOLS = ["BTCUSD", "ETHUSD", "SOLUSD", "XRPUSD", "DOGEUSD", "ADAUSD", "BNBUSD", "AVAXUSD", "LINKUSD", "DOTUSD"];
// Gate re-based to the geometry-v2 operating point (measured optimum band
// 62-65; 64 = the deployed walk-forward winner). One book per signal: M30.
const GATES = [64];
const HORIZONS = [30];
const WINDOW = 260;
const SEED_BARS = 2000;
const MAX_BARS = 3000;
const NOTIONAL = 1_000;      // 10% of the paper account per trade — risk-bounded
const TIME_STOP_MIN = 720;   // 12h — signal half-life is hours, not minutes
const BTC_FILTER = true;     // longs only while BTC > its 60m EMA20 (regime gate)
const COOLDOWN_MS = 30 * 60_000;
const POLL_MS = 15_000;
const SCAN_STRIDE_MS = 120_000;
const SEED_PACE_MS = 1_000;

// Live scan observability — the "why no trades yet" answer, always measured.
// Accumulates between telemetry digests (telemetry.ts snapshots + resets).
// best = top LONG score seen since window start; cross = scan instants
// reaching each configured gate; denied = guard veto counts by rule id
// (SCORE_BELOW_GATE, RR_TOO_LOW, DEAD_HOUR, BTC_REGIME, ...). Honest only.
export const scanStats = {
  since: Date.now(),
  best: 0,
  bestSym: "",
  longSignals: 0,
  cross: {} as Record<number, number>,
  denied: {} as Record<string, number>,
};

function noteDenied(rules: string[]) {
  for (const r of rules) scanStats.denied[r] = (scanStats.denied[r] ?? 0) + 1;
}

// Persistent (never-reset) live state for the UI transparency panel — reflects
// the LAST completed cycle: regime verdict, strongest signal since boot, and
// boot-to-date crossing counts. Distinct from scanStats, which telemetry
// snapshots + resets every 15 min. Honest observability, no invention.
export const liveScan = {
  regimeUp: null as boolean | null,   // BTC > 60m EMA20 verdict (null = not checked yet)
  regimeAt: 0 as number,              // when the verdict was computed
  lastScanAt: 0 as number,            // last completed full-scan instant
  bestSinceBoot: 0 as number,
  bestSymSinceBoot: "" as string,
  crossSinceBoot: {} as Record<number, number>,
  cycles: 0 as number,
};

export interface RunnerOpts {
  maxMinutes?: number;   // chunk limit (sandbox); undefined = run forever
  maxHours?: number;     // total run cap; undefined = unlimited
  maxTradesG65?: number; // campaign stop target; undefined = unlimited
  pollMs?: number;
  log?: (line: string) => void;
}

export interface RunnerHandle {
  stop(): Promise<void>;
  isRunning(): boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const utcHour = (t: number) => new Date(t).getUTCHours();

interface PositionRow {
  id: string; bookKey: string; symbol: string; gate: number; horizonMin: number;
  qty: number; entryPrice: number; stopPrice: number; targetPrice: number;
  atrPct: number; score: number; rr: number; factors: string; openedAt: Date;
}

function rowToPos(r: PositionRow) {
  return { ...r, factorList: JSON.parse(r.factors || "[]") as Array<{ key?: string; name?: string; contribution: number }> };
}

export function startEngineLoop(opts: RunnerOpts = {}): RunnerHandle {
  const log = opts.log ?? ((l: string) => console.log(`${new Date().toISOString()} ${l}`));
  const pollMs = opts.pollMs ?? POLL_MS;
  const g = globalThis as unknown as { __deeengine?: { running: boolean; stop: boolean } };
  if (g.__deeengine?.running) {
    log("[engine] loop already running in this process: refusing to double-start");
    return { stop: async () => {}, isRunning: () => true };
  }
  const ctl = { running: true, stop: false };
  g.__deeengine = { running: true, stop: false };

  const handle: RunnerHandle = {
    stop: async () => { ctl.stop = true; },
    isRunning: () => ctl.running,
  };

  void runLoop(ctl, opts, log).finally(() => { ctl.running = false; g.__deeengine!.running = false; });
  return handle;
}

async function runLoop(
  ctl: { stop: boolean },
  opts: RunnerOpts,
  log: (l: string) => void,
): Promise<void> {
  const chunkStart = Date.now();

  // self-heal: any fatal error logs, waits, restarts the loop (Railway 24/7)
  try {
    await loopBody(ctl, opts, log, chunkStart);
  } catch (e) {
    log(`[engine] FATAL in loop body: ${String(e).slice(0, 200)} — self-heal restart in 60s`);
    await sleep(60_000);
    if (!ctl.stop) {
      const g = globalThis as unknown as { __deeengine?: { running: boolean } };
      if (g.__deeengine) g.__deeengine.running = false;
      startEngineLoop(opts);
    }
    return;
  }
}

/** BTC 60m-EMA20 regime gate — exact port of the validated backtest filter:
 *  aggregate the 1m buffer to 60m buckets, EMA(20) over CLOSED buckets only,
 *  longs allowed only while BTC's last closed 60m close > its EMA20. */
function btcRegimeUp(bars: FeedBar[]): boolean {
  if (!bars.length) return true; // no BTC data → don't block (feed outage ≠ regime signal)
  const MS = 3_600_000;
  const agg: { t: number; c: number }[] = [];
  let cur: { t: number; c: number } | null = null;
  for (const b of bars) {
    const bucket = Math.floor(b.t / MS) * MS;
    if (!cur || cur.t !== bucket) { if (cur) agg.push(cur); cur = { t: bucket, c: b.c }; }
    else cur.c = b.c;
  }
  if (cur) agg.push(cur);
  // drop the still-forming bucket (only buckets fully closed by the last 1m bar count)
  const lastBarT = bars[bars.length - 1].t;
  while (agg.length && agg[agg.length - 1].t + MS > lastBarT + 60_000) agg.pop();
  if (agg.length < 25) return true; // insufficient history → don't block
  const k = 2 / 21;
  let ema = agg[0].c;
  for (let i = 1; i < agg.length; i++) ema = agg[i].c * k + ema * (1 - k);
  return agg[agg.length - 1].c > ema;
}

async function loopBody(
  ctl: { stop: boolean },
  opts: RunnerOpts,
  log: (l: string) => void,
  chunkStart: number,
): Promise<void> {
  const brain = new LearningMemory(); // DB-backed (BrainMemory.scope="global")
  await brain.load();
  brain.refresh();
  log("[engine] brain loaded (DB-backed), weights refreshed");

  const { run } = await getOrCreateRun();
  log(`[engine] run=${run.label} id=${run.id} — paper engine of record`);
  const pollMs = opts.pollMs ?? POLL_MS;
  let lastFlush = 0;
  setFeedUniverse(SYMBOLS); // feed fair-share rotation knows the universe
  let wasPaused = await (async () => { const c = await getEngineControl(); if (c.paused) log(`[engine] CONTROL starting PAUSED (${c.reason ?? "no reason given"}) — new entries blocked, exits still managed`); return c.paused; })();

  // seed buffers
  const buf: Record<string, FeedBar[]> = {};
  const lastT: Record<string, number> = {};
  const lastScan: Record<string, number> = {};
  const marks: Record<string, number> = {};
  for (const sym of SYMBOLS) {
    try {
      const { bars, source, degraded } = await fetchKlinesAny(sym, SEED_BARS);
      buf[sym] = bars;
      if (bars.length) lastT[sym] = bars[bars.length - 1].t;
      marks[sym] = bars.length ? bars[bars.length - 1].c : 0;
      log(`[engine] seed ${sym}: ${bars.length} bars via ${source}${degraded ? ` (degraded: ${degraded})` : ""} last=${bars.length ? new Date(lastT[sym]).toISOString() : "n/a"}`);
    } catch (e) {
      log(`[engine] SEED FAIL ${sym}: ${String(e).slice(0, 100)}`);
      buf[sym] = [];
    }
    await sleep(SEED_PACE_MS);
  }

  log(`[engine] LOOP START maxMinutes=${opts.maxMinutes ?? "∞"} maxHours=${opts.maxHours ?? "∞"} maxTradesG65=${opts.maxTradesG65 ?? "∞"} poll=${pollMs}ms`);

  let cycle = 0;
  while (!ctl.stop) {
    const now = Date.now();
    cycle++;

    if (opts.maxMinutes !== undefined && (now - chunkStart) / 60_000 >= opts.maxMinutes) {
      await brain.persist();
      log(`[engine] chunk complete (${opts.maxMinutes}m): closed=${await paperClosedCount()} open=${await paperOpenCount()} — exiting cleanly`);
      return;
    }
    if (opts.maxHours !== undefined && (now - (await getOrCreateRun()).run.startedAt.getTime()) / 3_600_000 >= opts.maxHours) {
      await brain.persist();
      log("[engine] run-hour cap reached: exiting cleanly");
      return;
    }
    if (opts.maxTradesG65 !== undefined && (await paperClosedCount(GATES[0])) >= opts.maxTradesG65) {
      await brain.persist();
      log(`[engine] gate-${GATES[0]} book reached ${opts.maxTradesG65} closed trades — campaign target met`);
      return;
    }

    brain.refresh();

    // admin console lever: pause blocks NEW entries only — open positions are
    // still managed to their exits below (stop/target/time), cycle keeps marking.
    const control = await getEngineControl();
    if (control.paused !== wasPaused) {
      wasPaused = control.paused;
      log(`[engine] CONTROL ${control.paused ? "PAUSED" : "RESUMED"}${control.reason ? ` (${control.reason})` : ""} by ${control.updatedBy ?? "admin"}`);
    }

    // one OPEN-positions read per cycle (single query; entries update locally)
    const openRows = (await db.paperEnginePosition.findMany({ where: { runId: run.id, status: "OPEN" } })) as unknown as PositionRow[];
    const open = new Map(openRows.map((r) => [r.bookKey, rowToPos(r)]));

    // per-cycle guard caches (2 queries/cycle instead of per-signal)
    const todayNetRCache = new Map<string, number>();
    const lastLossAtMs = await paperLastLossAtMs();
    const btcUp = BTC_FILTER ? btcRegimeUp(buf["BTCUSD"] ?? []) : true;
    liveScan.regimeUp = btcUp;
    liveScan.regimeAt = now;
    liveScan.cycles += 1;

    let feedErrors = 0;
    for (const sym of SYMBOLS) {
      try {
        const { bars: fresh, source, degraded } = await fetchKlinesAny(sym, 3);
        if (degraded && cycle % 20 === 1) log(`[engine] feed degraded for ${sym}: ${degraded}`);
        if (!fresh.length) continue;
        const cur = fresh[fresh.length - 1];
        const price = cur.c;
        marks[sym] = price;

        // append newly CLOSED bars + bar-level management (conservative gaps)
        for (const k of fresh) {
          if (k.T < now && k.t > (lastT[sym] ?? 0)) {
            buf[sym].push(k);
            lastT[sym] = k.t;
            await manageBars(open, sym, k, k.c, k.t + 60_000, brain, log);
          }
        }
        if (buf[sym].length > MAX_BARS) buf[sym] = buf[sym].slice(-MAX_BARS);
        const bars = buf[sym];
        if (bars.length < WINDOW + 10) continue;

        // live tick-level management against current price
        await manageTick(open, sym, price, now, brain, log);

        // paused: no signal scans, no new entries — exits keep being managed above
        if (control.paused) continue;
        if (now - (lastScan[sym] ?? 0) < SCAN_STRIDE_MS) continue;
        lastScan[sym] = now;

        const win = bars.slice(-WINDOW).map((k) => ({ t: k.t, o: k.o, h: k.h, l: k.l, c: k.c, v: k.v } as Bar));
        const cs = { symbol: sym, candles: win, dataState: "LIVE", source: `feed-${source}` } as unknown as Parameters<typeof computeSignal>[0]["candles"];
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
            dayCandles: { symbol: sym, candles: dayBars, dataState: "LIVE", source: `feed-${source}` } as unknown as Parameters<typeof computeSignal>[0]["dayCandles"],
            relVolume, regimePrimary: "NEUTRAL", catalystScore: 0,
            avgVolume: priorVol, minLiquidityUsd: 0,
            horizon: hzName,
            adaptiveWeights: brain.adaptiveWeights(hzName),
            candlePatterns: false, // A/B round 1 rejected the candle bonus — control stays honest
          });
          if (!sig || sig.direction !== "LONG") continue;
          scanStats.longSignals += 1;
          if (sig.score > scanStats.best) {
            scanStats.best = sig.score;
            scanStats.bestSym = `${sym}/${hzName}`;
          }
          if (sig.score > liveScan.bestSinceBoot) {
            liveScan.bestSinceBoot = sig.score;
            liveScan.bestSymSinceBoot = `${sym}/${hzName}`;
          }

          for (const gate of GATES) {
            if (sig.score < gate) continue;
            scanStats.cross[gate] = (scanStats.cross[gate] ?? 0) + 1;
            liveScan.crossSinceBoot[gate] = (liveScan.crossSinceBoot[gate] ?? 0) + 1;
            if (BTC_FILTER && !btcUp) { noteDenied(["BTC_REGIME"]); continue; }
            const bookKey = `${gate}_${h}_${sym}`;
            if (open.has(bookKey)) continue;

            // cooldown from last close of this book (30min, loss or win)
            const lc = await paperLastClose(bookKey);
            if (lc && now - lc.closedAtMs < COOLDOWN_MS) continue;

            const cacheKey = `${gate}_${h}`;
            if (!todayNetRCache.has(cacheKey)) todayNetRCache.set(cacheKey, await paperTodayNetR(gate, h));
            const guardIn: OpenGuardInput = {
              hourUtc, score: sig.score, rr: sig.rr,
              openPositions: open.size,
              todayNetR: todayNetRCache.get(cacheKey) ?? 0,
              lastLossAtMs, dataState: "LIVE", liquidityOk: true,
            };
            const verdict = evaluateOpenGuards(guardIn, brain.deadHours(hzName));
            if (!verdict.allowed) {
              noteDenied(verdict.deniedBy);
              continue;
            }

            const entryOid = `E_${bookKey}_${Math.floor(now / 60_000)}`;
            const res = await paperEntry({
              bookKey, symbol: sym, gate, horizonMin: h,
              refPrice: price, stop: sig.stop, target: sig.target,
              atrPct: (sig.atr / price) * 100, score: sig.score, rr: sig.rr,
              notionalUsd: NOTIONAL,
              factors: sig.factors.map((f) => ({ key: f.key, name: f.name, contribution: f.contribution })),
              clientOid: entryOid,
            });
            if (res.status === "FILLED") {
              // real-venue mirror (OKX demo/live): fire-and-forget — never blocks
              // the loop, never touches the paper ledger; hard risk rails inside.
              void mirrorOnEntry({
                engineOid: entryOid, symbol: sym, refPrice: price,
                notionalUsd: NOTIONAL,
                openMirrorCount: await openMirrorCount(),
                todayNetR: todayNetRCache.size ? Math.min(...todayNetRCache.values()) : 0,
              });
              // per-user broker mirror: connected users' accounts follow the
              // engine live (paper stays the execution-of-record). Never throws.
              void fanoutOnEntry({
                engineOid: entryOid, positionId: res.positionId ?? null, symbol: sym,
                refPrice: price, stop: sig.stop, target: sig.target,
              });
              const factorsJson = JSON.stringify(sig.factors.map((f) => ({ key: f.key, name: f.name, contribution: f.contribution })));
              open.set(bookKey, {
                id: res.positionId!, bookKey, symbol: sym, gate, horizonMin: h,
                qty: res.qty!, entryPrice: res.fillPrice!, stopPrice: sig.stop,
                targetPrice: sig.target, atrPct: (sig.atr / price) * 100,
                score: sig.score, rr: sig.rr,
                factors: factorsJson, factorList: sig.factors.map((f) => ({ key: f.key, name: f.name, contribution: f.contribution })),
                openedAt: new Date(now),
              });
              log(`[engine] OPEN ${bookKey} score=${sig.score} ref=${price} fill=${res.fillPrice?.toFixed(2)} stop=${sig.stop} tgt=${sig.target} rr=${sig.rr.toFixed(2)}`);
            } else if (res.status === "REJECTED") {
              log(`[engine] ENTRY REJECTED ${bookKey}: ${res.reason}`);
            }
          }
        }
      } catch (e) {
        feedErrors++;
        if (feedErrors <= 2) log(`[engine] feed error ${sym}: ${String(e).slice(0, 100)}`);
      }
      await sleep(60); // pace the 10-symbol loop
    }
    if (!control.paused) liveScan.lastScanAt = now;

    // equity mark-to-market once per cycle
    try {
      const { equity, openCount } = await paperMarkToMarket(marks);
      if (cycle % 4 === 1) {
        log(`[engine] cycle=${cycle} equity=$${equity.toFixed(2)} open=${openCount} closed=${await paperClosedCount()} feed=${feedErrors === 0 ? "clean" : `${feedErrors} err`}`);
      }
    } catch (e) {
      log(`[engine] mark error: ${String(e).slice(0, 100)}`);
    }

    if (now - lastFlush >= 60_000) { lastFlush = now; await brain.persist(); }
    if (venueMode() !== "paper") void mirrorCycle(); // reconcile + queued exits; never throws
    await sleep(pollMs);
  }
  await brain.persist();
  log("[engine] stop requested: loop exited cleanly");
}

/** Bar-level management on newly CLOSED bars (conservative: use bar low/high). */
async function manageBars(
  open: Map<string, ReturnType<typeof rowToPos>>,
  sym: string, bar: FeedBar, price: number, now: number,
  brain: LearningMemory, log: (l: string) => void,
): Promise<void> {
  for (const [key, p] of [...open.entries()]) {
    if (p.symbol !== sym) continue;
    const stopHit = Math.min(price, bar.l) <= p.stopPrice;
    const targetHit = bar.h >= p.targetPrice && price >= p.targetPrice;
    if (stopHit) {
      const fill = price <= p.stopPrice ? price : p.stopPrice;
      const exitOid = `X_${p.id}_STOP_${Math.floor(now / 60_000)}`;
      const r = await paperExit({ positionId: p.id, exitRefPrice: fill, reason: "STOP", clientOid: exitOid });
      if (r.status === "FILLED") { open.delete(key); void mirrorOnExit({ engineOid: exitOid, symbol: sym, refPrice: fill, reason: "STOP" }); void fanoutOnExit({ positionId: p.id, symbol: sym, refPrice: fill, reason: "STOP" }); await journalClose(p, r, brain); log(`[engine] CLOSE ${key} STOP fill=${r.exitPrice?.toFixed(2)} net=$${r.netPnlUsd?.toFixed(2)} R=${r.netR?.toFixed(2)}`); }
      continue;
    }
    if (targetHit) {
      const exitOid = `X_${p.id}_TARGET_${Math.floor(now / 60_000)}`;
      const r = await paperExit({ positionId: p.id, exitRefPrice: price, reason: "TARGET", clientOid: exitOid });
      if (r.status === "FILLED") { open.delete(key); void mirrorOnExit({ engineOid: exitOid, symbol: sym, refPrice: price, reason: "TARGET" }); void fanoutOnExit({ positionId: p.id, symbol: sym, refPrice: price, reason: "TARGET" }); await journalClose(p, r, brain); log(`[engine] CLOSE ${key} TARGET fill=${r.exitPrice?.toFixed(2)} net=$${r.netPnlUsd?.toFixed(2)} R=${r.netR?.toFixed(2)}`); }
      continue;
    }
    if (now - p.openedAt.getTime() >= TIME_STOP_MIN * 60_000) {
      const timeReason = "TIME_720M";
      const exitOid = `X_${p.id}_${timeReason}_${Math.floor(now / 60_000)}`;
      const r = await paperExit({ positionId: p.id, exitRefPrice: price, reason: timeReason, clientOid: exitOid });
      if (r.status === "FILLED") { open.delete(key); void mirrorOnExit({ engineOid: exitOid, symbol: sym, refPrice: price, reason: timeReason }); void fanoutOnExit({ positionId: p.id, symbol: sym, refPrice: price, reason: timeReason }); await journalClose(p, r, brain); log(`[engine] CLOSE ${key} TIME fill=${r.exitPrice?.toFixed(2)} net=$${r.netPnlUsd?.toFixed(2)} R=${r.netR?.toFixed(2)}`); }
    }
  }
}
/** Tick-level management against the current observed price. */
async function manageTick(
  open: Map<string, ReturnType<typeof rowToPos>>,
  sym: string, price: number, now: number,
  brain: LearningMemory, log: (l: string) => void,
): Promise<void> {
  for (const [key, p] of [...open.entries()]) {
    if (p.symbol !== sym) continue;
    if (price <= p.stopPrice) {
      const exitOid = `X_${p.id}_STOP_${Math.floor(now / 60_000)}`;
      const r = await paperExit({ positionId: p.id, exitRefPrice: price, reason: "STOP", clientOid: exitOid });
      if (r.status === "FILLED") { open.delete(key); void mirrorOnExit({ engineOid: exitOid, symbol: sym, refPrice: price, reason: "STOP" }); void fanoutOnExit({ positionId: p.id, symbol: sym, refPrice: price, reason: "STOP" }); await journalClose(p, r, brain); log(`[engine] CLOSE ${key} STOP(tick) fill=${r.exitPrice?.toFixed(2)} net=$${r.netPnlUsd?.toFixed(2)} R=${r.netR?.toFixed(2)}`); }
    } else if (price >= p.targetPrice) {
      const exitOid = `X_${p.id}_TARGET_${Math.floor(now / 60_000)}`;
      const r = await paperExit({ positionId: p.id, exitRefPrice: price, reason: "TARGET", clientOid: exitOid });
      if (r.status === "FILLED") { open.delete(key); void mirrorOnExit({ engineOid: exitOid, symbol: sym, refPrice: price, reason: "TARGET" }); void fanoutOnExit({ positionId: p.id, symbol: sym, refPrice: price, reason: "TARGET" }); await journalClose(p, r, brain); log(`[engine] CLOSE ${key} TARGET(tick) fill=${r.exitPrice?.toFixed(2)} net=$${r.netPnlUsd?.toFixed(2)} R=${r.netR?.toFixed(2)}`); }
    } else if (now - p.openedAt.getTime() >= TIME_STOP_MIN * 60_000) {
      const timeReason = "TIME_720M";
      const exitOid = `X_${p.id}_${timeReason}_${Math.floor(now / 60_000)}`;
      const r = await paperExit({ positionId: p.id, exitRefPrice: price, reason: timeReason, clientOid: exitOid });
      if (r.status === "FILLED") { open.delete(key); void mirrorOnExit({ engineOid: exitOid, symbol: sym, refPrice: price, reason: timeReason }); void fanoutOnExit({ positionId: p.id, symbol: sym, refPrice: price, reason: timeReason }); await journalClose(p, r, brain); log(`[engine] CLOSE ${key} TIME(tick) fill=${r.exitPrice?.toFixed(2)} net=$${r.netPnlUsd?.toFixed(2)} R=${r.netR?.toFixed(2)}`); }
    }
  }
}

/** Journal a closed trade into the learning brain (same contract as live-run). */
async function journalClose(
  p: ReturnType<typeof rowToPos>,
  r: { netPnlUsd?: number; netR?: number },
  brain: LearningMemory,
): Promise<void> {
  try {
    const entryNotional = p.qty * p.entryPrice;
    const netPct = ((r.netPnlUsd ?? 0) / entryNotional) * 100;
    brain.recordOutcome({
      horizon: p.horizonMin === 10 ? "M10" : "M30",
      symbol: p.symbol,
      netPct,
      hourUtc: utcHour(Date.now()),
      atrPct: p.atrPct,
      factors: p.factorList,
    });
  } catch { /* brain never blocks trading */ }
}
