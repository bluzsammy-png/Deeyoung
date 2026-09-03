// DEEYOUNG PRO — LEARNING MEMORY (§NEW)
// The bot's trainable memory: journals every closed trade, refreshes every minute,
// and adapts engine factor weights INSIDE BOUNDED LIMITS so it can improve from
// experience without destabilizing the validated core.
//
// Honest design constraints:
//  - The engine stays deterministic: computeSignal never reads global state; it only
//    receives an optional adaptiveWeights map (multipliers 0.5–1.5) from its caller.
//  - Adaptation requires evidence: a factor's weight only moves after n ≥ 20 journaled
//    outcomes; below that it decays toward neutral 1.0. No weight moves on noise.
//  - CATALYST and REGIME are NOT adapted (catalyst is always 0 without a verified news
//    feed; regime has no live feed in paper mode — adapting on constant inputs is noise).
//  - Persistence: Prisma (BrainMemory table) in the app; JSON file in scripts; both
//    wrapped in try/catch — memory NEVER crashes trading, worst case it runs in-RAM.
//  - Production cadence: the sentinel heartbeat calls sentinelTick every 60s; the brain
//    refreshes on every tick (ensureBrainLoop also self-schedules every 60s).

import { evaluateOpenGuards, type OpenGuardVerdict, type OpenGuardInput } from "@/lib/brain/playbook";

export type Horizon = "M10" | "M30";

// Engine factor keys eligible for adaptation (CATALYST/REGIME deliberately excluded;
// CANDLESTICKS included — its weight is learned from journaled outcomes like any other).
export const ADAPTABLE_KEYS = ["EMA_STRUCTURE", "VWAP", "RSI", "MACD", "BOLLINGER", "ROC", "VOLUME", "CANDLESTICKS"] as const;
export type AdaptableKey = (typeof ADAPTABLE_KEYS)[number];

const MIN_SAMPLE = 20;        // outcomes before a factor's weight may move
const LEARN_RATE = 0.6;       // multiplier = 1 + LEARN_RATE * edgeZ, clamped
const MULT_MIN = 0.5, MULT_MAX = 1.5;
const DECAY_PER_REFRESH = 0.02; // idle factors relax toward 1.0
const MIN_HOUR_SAMPLE = 8;    // before an hour can be flagged dead
const DEAD_WINRATE = 0.35;    // hours below this win rate are guarded

interface FactorStat { winC: number; loseC: number; winN: number; loseN: number }
interface BucketStat { n: number; wins: number; netSum: number }

export interface BrainState {
  version: 1;
  updatedAt: string;
  refreshes: number;
  tradesSeen: number;
  factors: Record<Horizon, Partial<Record<AdaptableKey, FactorStat>>>;
  hours: Record<Horizon, Record<number, BucketStat>>;
  atr: Record<Horizon, Record<string, BucketStat>>; // LOW(<0.4%) MID(0.4-1%) HIGH(>1%) ATR%
  symbols: Record<string, BucketStat>;
  weights: Record<Horizon, Record<string, number>>;
  recent: { t: number; symbol: string; horizon: Horizon; netPct: number; win: boolean; hourUtc: number }[];
}

export interface OutcomeInput {
  horizon: Horizon;
  symbol: string;
  netPct: number;                       // NET of costs
  hourUtc: number;
  atrPct: number;                       // ATR as % of entry
  factors: { key?: string; name?: string; contribution: number }[];
}

function emptyState(): BrainState {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    refreshes: 0,
    tradesSeen: 0,
    factors: { M10: {}, M30: {} },
    hours: { M10: {}, M30: {} },
    atr: { M10: {}, M30: {} },
    symbols: {},
    weights: { M10: {}, M30: {} },
    recent: [],
  };
}

const atrBucket = (pct: number) => (pct < 0.4 ? "LOW" : pct <= 1 ? "MID" : "HIGH");

export class LearningMemory {
  state: BrainState = emptyState();
  private loaded = false;
  constructor(private opts?: { persistPath?: string }) {}

  // ── journaling (L7 — the pro's review habit) ────────────────────────────────
  recordOutcome(o: OutcomeInput) {
    const win = o.netPct > 0;
    this.state.tradesSeen++;
    for (const f of o.factors) {
      const key = (f.key ?? "").toUpperCase() as AdaptableKey;
      if (!ADAPTABLE_KEYS.includes(key)) continue;
      if (!f.contribution) continue;
      const s = this.state.factors[o.horizon][key] ?? (this.state.factors[o.horizon][key] = { winC: 0, loseC: 0, winN: 0, loseN: 0 });
      if (win) { s.winC += f.contribution; s.winN++; } else { s.loseC += f.contribution; s.loseN++; }
    }
    const h = this.state.hours[o.horizon][o.hourUtc] ?? (this.state.hours[o.horizon][o.hourUtc] = { n: 0, wins: 0, netSum: 0 });
    h.n++; if (win) h.wins++; h.netSum += o.netPct;
    const b = this.state.atr[o.horizon][atrBucket(o.atrPct)] ?? (this.state.atr[o.horizon][atrBucket(o.atrPct)] = { n: 0, wins: 0, netSum: 0 });
    b.n++; if (win) b.wins++; b.netSum += o.netPct;
    const sy = this.state.symbols[o.symbol] ?? (this.state.symbols[o.symbol] = { n: 0, wins: 0, netSum: 0 });
    sy.n++; if (win) sy.wins++; sy.netSum += o.netPct;
    this.state.recent.push({ t: Date.now(), symbol: o.symbol, horizon: o.horizon, netPct: +o.netPct.toFixed(4), win, hourUtc: o.hourUtc });
    if (this.state.recent.length > 500) this.state.recent.splice(0, this.state.recent.length - 500);
  }

  // ── the per-minute refresh: recompute adaptive weights + derived knowledge ──
  refresh() {
    this.state.refreshes++;
    for (const hz of ["M10", "M30"] as Horizon[]) {
      for (const key of ADAPTABLE_KEYS) {
        const s = this.state.factors[hz][key];
        const cur = this.state.weights[hz][key] ?? 1;
        if (s && s.winN + s.loseN >= MIN_SAMPLE) {
          const avgWin = s.winC / Math.max(1, s.winN);
          const avgLose = s.loseC / Math.max(1, s.loseN);
          const denom = Math.abs(avgWin) + Math.abs(avgLose) + 1e-9;
          const edgeZ = (avgWin - avgLose) / denom; // −1..+1 normalized edge signal
          this.state.weights[hz][key] = +(Math.min(MULT_MAX, Math.max(MULT_MIN, 1 + LEARN_RATE * edgeZ))).toFixed(4);
        } else {
          // not enough evidence — relax toward neutral
          const next = cur + (1 - cur) * DECAY_PER_REFRESH;
          this.state.weights[hz][key] = +next.toFixed(4);
        }
      }
    }
    this.state.updatedAt = new Date().toISOString();
  }

  adaptiveWeights(hz: Horizon): Record<string, number> {
    return { ...this.state.weights[hz] };
  }

  deadHours(hz: Horizon): number[] {
    return Object.entries(this.state.hours[hz])
      .filter(([, s]) => s.n >= MIN_HOUR_SAMPLE && s.wins / s.n < DEAD_WINRATE)
      .map(([hr]) => Number(hr));
  }

  guard(i: OpenGuardInput, hz: Horizon): OpenGuardVerdict {
    return evaluateOpenGuards(i, this.deadHours(hz));
  }

  snapshot() {
    const hoursOut: Record<string, unknown> = {};
    for (const hz of ["M10", "M30"] as Horizon[]) {
      hoursOut[hz] = Object.fromEntries(Object.entries(this.state.hours[hz]).map(([hr, s]) => [hr, { n: s.n, winRatePct: +(s.wins / s.n * 100).toFixed(1), avgNetPct: +(s.netSum / s.n).toFixed(3) }]));
    }
    return {
      updatedAt: this.state.updatedAt,
      refreshes: this.state.refreshes,
      tradesSeen: this.state.tradesSeen,
      weights: this.state.weights,
      hours: hoursOut,
      atrBuckets: this.state.atr,
      symbolForm: Object.fromEntries(Object.entries(this.state.symbols).map(([k, s]) => [k, { n: s.n, winRatePct: +(s.wins / s.n * 100).toFixed(1), totalNetPct: +s.netSum.toFixed(2) }])),
      deadHours: { M10: this.deadHours("M10"), M30: this.deadHours("M30") },
      recent: this.state.recent.slice(-25),
    };
  }

  // ── persistence (never fatal) ────────────────────────────────────────────────
  async load() {
    if (this.loaded) return;
    this.loaded = true;
    try {
      if (this.opts?.persistPath) {
        const f = Bun.file(this.opts.persistPath);
        if (await f.exists()) this.state = { ...emptyState(), ...(JSON.parse(await f.text()) as BrainState) };
      } else {
        const { db } = await import("@/lib/db");
        const row = await db.brainMemory.findUnique({ where: { scope: "global" } });
        if (row) this.state = { ...emptyState(), ...(JSON.parse(row.stateJson) as BrainState) };
      }
    } catch { /* memory-only mode — trading continues */ }
  }

  async persist() {
    try {
      if (this.opts?.persistPath) {
        await Bun.write(this.opts.persistPath, JSON.stringify(this.state));
      } else {
        const { db } = await import("@/lib/db");
        const data = { stateJson: JSON.stringify(this.state), updatedAt: new Date() };
        await db.brainMemory.upsert({ where: { scope: "global" }, update: data, create: { scope: "global", ...data } });
      }
    } catch { /* memory-only mode — trading continues */ }
  }
}

// ── global singleton (app) + lazy per-minute loop ─────────────────────────────
let brain: LearningMemory | null = null;
let loopStarted = false;

export function getBrain(): LearningMemory {
  if (!brain) {
    brain = new LearningMemory();
    void brain.load().then(() => brain?.refresh());
  }
  return brain;
}

/** Starts the per-minute refresh loop once per process (idempotent). */
export function ensureBrainLoop() {
  if (loopStarted) return;
  loopStarted = true;
  const b = getBrain();
  setInterval(() => {
    try {
      b.refresh();
      void b.persist();
    } catch { /* never crash the server from memory */ }
  }, 60_000);
}

/** Script-isolated instance (walk-forward training, live runner). */
export function createMemory(persistPath?: string): LearningMemory {
  return new LearningMemory({ persistPath });
}
