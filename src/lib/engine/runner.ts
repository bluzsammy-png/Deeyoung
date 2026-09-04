// DEEYOUNG PRO — AUTONOMOUS ENGINE RUNNER (24/7-capable, Postgres-backed).
// 2026-09-04: user directive — the bot must run itself, hands-off, forever.
// This is the production port of the validated live-run loop:
//   identical symbols, gates [65,70], horizons [10,30], $10k notional,
//   22bps-class RT costs (2bps slippage/side + 10bps taker fee/side),
//   playbook guards, learning brain — but ALL execution state now lives in
//   Postgres via the paper engine (auditable, restart-proof, no JSON files).
//
// Two hosts, one engine:
//   Railway (RAILWAY_ENVIRONMENT set, ENGINE_DISABLED!=1): starts at boot,
//   runs until the process dies, self-heals after fatal errors.
//   Sandbox/CLI: bun scripts/engine-run.ts --max-minutes 9 [--resume].
//
// NEVER invents data: every entry/exit fills at a real observed market price
// from the feed (Twelve Data when keyed, Binance public fallback).

import { computeSignal } from "@/lib/engine/signals";
import type { Bar } from "@/lib/engine/indicators";
import { fetchKlinesAny, type FeedBar } from "@/lib/engine/feed";
import {
  paperEntry, paperExit, paperMarkToMarket, paperLastClose, paperTodayNetR,
  paperLastLossAtMs, paperClosedCount, paperOpenCount, getOrCreateRun,
} from "@/lib/engine/paper";
import { LearningMemory } from "@/lib/brain/memory";
import { evaluateOpenGuards, type OpenGuardInput } from "@/lib/brain/playbook";
import { db } from "@/lib/db";

export const SYMBOLS = ["BTCUSD", "ETHUSD", "SOLUSD", "XRPUSD", "DOGEUSD", "ADAUSD", "BNBUSD", "AVAXUSD", "LINKUSD", "DOTUSD"];
const GATES = [65, 70];
const HORIZONS = [10, 30];
const WINDOW = 260;
const SEED_BARS = 2000;
const MAX_BARS = 3000;
const NOTIONAL = 10_000;
const COOLDOWN_MS = 30 * 60_000;
const POLL_MS = 15_000;
const SCAN_STRIDE_MS = 120_000;
const SEED_PACE_MS = 1_000;

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
    log("[engine] loop already running in this process — refusing to double-start");
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
      log("[engine] run-hour cap reached — exiting cleanly");
      return;
    }
    if (opts.maxTradesG65 !== undefined && (await paperClosedCount(65)) >= opts.maxTradesG65) {
      await brain.persist();
      log(`[engine] gate-65 book reached ${opts.maxTradesG65} closed trades — campaign target met`);
      return;
    }

    brain.refresh();

    // one OPEN-positions read per cycle (single query; entries update locally)
    const openRows = (await db.paperEnginePosition.findMany({ where: { runId: run.id, status: "OPEN" } })) as unknown as PositionRow[];
    const open = new Map(openRows.map((r) => [r.bookKey, rowToPos(r)]));

    // per-cycle guard caches (2 queries/cycle instead of per-signal)
    const todayNetRCache = new Map<string, number>();
    const lastLossAtMs = await paperLastLossAtMs();

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

          for (const gate of GATES) {
            if (sig.score < gate) continue;
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
            if (!verdict.allowed) continue;

            const res = await paperEntry({
              bookKey, symbol: sym, gate, horizonMin: h,
              refPrice: price, stop: sig.stop, target: sig.target,
              atrPct: (sig.atr / price) * 100, score: sig.score, rr: sig.rr,
              notionalUsd: NOTIONAL,
              factors: sig.factors.map((f) => ({ key: f.key, name: f.name, contribution: f.contribution })),
            });
            if (res.status === "FILLED") {
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
    await sleep(pollMs);
  }
  await brain.persist();
  log("[engine] stop requested — loop exited cleanly");
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
      const r = await paperExit({ positionId: p.id, exitRefPrice: fill, reason: "STOP" });
      if (r.status === "FILLED") { open.delete(key); await journalClose(p, r, brain); log(`[engine] CLOSE ${key} STOP fill=${r.exitPrice?.toFixed(2)} net=$${r.netPnlUsd?.toFixed(2)} R=${r.netR?.toFixed(2)}`); }
      continue;
    }
    if (targetHit) {
      const r = await paperExit({ positionId: p.id, exitRefPrice: price, reason: "TARGET" });
      if (r.status === "FILLED") { open.delete(key); await journalClose(p, r, brain); log(`[engine] CLOSE ${key} TARGET fill=${r.exitPrice?.toFixed(2)} net=$${r.netPnlUsd?.toFixed(2)} R=${r.netR?.toFixed(2)}`); }
      continue;
    }
    if (now - p.openedAt.getTime() >= p.horizonMin * 60_000) {
      const r = await paperExit({ positionId: p.id, exitRefPrice: price, reason: p.horizonMin === 10 ? "TIME_10M" : "TIME_30M" });
      if (r.status === "FILLED") { open.delete(key); await journalClose(p, r, brain); log(`[engine] CLOSE ${key} TIME fill=${r.exitPrice?.toFixed(2)} net=$${r.netPnlUsd?.toFixed(2)} R=${r.netR?.toFixed(2)}`); }
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
      const r = await paperExit({ positionId: p.id, exitRefPrice: price, reason: "STOP" });
      if (r.status === "FILLED") { open.delete(key); await journalClose(p, r, brain); log(`[engine] CLOSE ${key} STOP(tick) fill=${r.exitPrice?.toFixed(2)} net=$${r.netPnlUsd?.toFixed(2)} R=${r.netR?.toFixed(2)}`); }
    } else if (price >= p.targetPrice) {
      const r = await paperExit({ positionId: p.id, exitRefPrice: price, reason: "TARGET" });
      if (r.status === "FILLED") { open.delete(key); await journalClose(p, r, brain); log(`[engine] CLOSE ${key} TARGET(tick) fill=${r.exitPrice?.toFixed(2)} net=$${r.netPnlUsd?.toFixed(2)} R=${r.netR?.toFixed(2)}`); }
    } else if (now - p.openedAt.getTime() >= p.horizonMin * 60_000) {
      const r = await paperExit({ positionId: p.id, exitRefPrice: price, reason: p.horizonMin === 10 ? "TIME_10M" : "TIME_30M" });
      if (r.status === "FILLED") { open.delete(key); await journalClose(p, r, brain); log(`[engine] CLOSE ${key} TIME(tick) fill=${r.exitPrice?.toFixed(2)} net=$${r.netPnlUsd?.toFixed(2)} R=${r.netR?.toFixed(2)}`); }
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
