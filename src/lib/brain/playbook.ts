// DEEYOUNG PRO — TRADING PLAYBOOK (§NEW)
// The bot's "training from beginner to pro": a curriculum of rules ENCODED AS CODE,
// so discipline is enforced mechanically instead of remembered vaguely.
//
// Every rule cites its source:
//   [C1] our own 60-day / 705-trade campaign on real Binance 1m data (scripts/out/campaign-*)
//   [C2] our live bot run 2026-09-03 (10m win / 30m loss — horizon edge is real and uneven)
//   [P1] standard professional risk practice (fixed fractional risk, daily loss caps, cooldowns)
// No fabricated wisdom: if a rule has no data or standard-practice basis, it is not here.

export interface OpenGuardInput {
  hourUtc: number;             // 0-23, UTC hour of the entry attempt
  score: number;               // engine signal score 0-100
  rr: number;                  // engine's own reward:risk
  openPositions: number;       // concurrent open positions
  todayNetR: number;           // cumulative net R locked in today (negative = losing day)
  lastLossAtMs: number | null; // timestamp of most recent losing close
  dataState: string;           // LIVE | DELAYED | SIMULATED | STALE
  liquidityOk: boolean;
}

export interface OpenGuardVerdict {
  allowed: boolean;
  deniedBy: string[];          // machine-readable rule ids, for audit + UI
  notes: string[];
}

// ── L1 — COSTS ARE THE FIRST OPPONENT (beginner lesson #1) ────────────────────
// [C1] 22 bps round-trip (taker×2 + 1bp slippage×2) turned a gross-positive
//      baseline net-negative. The bot never "hopes" a trade out-earns costs;
//      the engine's own 22bps model is subtracted from every reported result.
export const TAKER_ROUND_TRIP_BPS = 22;

// ── L3 — TIMING: dead hours are a silent account killer ───────────────────────
// [C1] campaign pockets + [P1] session discipline. Defaults here; the learning
// memory OVERRIDES this list with measured hours (see memory.deadHours()).
export const DEFAULT_DEAD_HOURS_UTC = [21, 22, 23]; // thinnest crypto liquidity
export const FX_WEEKEND_CLOSED = true;              // [P1] FX/indices trade Mon-Fri only

// ── L5 — RISK: the pro's real edge is survival ────────────────────────────────
export const RISK = {
  MIN_RR: 0.4,                 // [INVARIANT] must equal the deployed geometry's target/stop
                               // ratio — geometry v2 = +1.2% target vs −3.0% stop ⇒ rr 0.40.
                               // The old 1.5 floor belonged to the 2.4/1.6 ATR geometry and
                               // would veto every setup after the re-base (two-gate drift
                               // class — re-base MIN_RR, MIN_SCORE and runner GATES TOGETHER).
  MAX_CONCURRENT: 3,           // [P1] correlated-exposure + attention limits
  DAILY_LOSS_CAP_R: -2,        // [P1] stop for the day at -2R (protects the learning curve)
  COOLDOWN_AFTER_LOSS_MIN: 30, // [P1] + [C1] campaign used 30-bar cooldowns
  MIN_SCORE: 64,               // [C1] mirrors runner GATES[0] — geometry-v2 operating point,
                               // walk-forward validated (scripts/geometry_*). MUST stay ≤
                               // GATES[0] or this guard silently vetoes every setup the gate
                               // books allow (prod incident 2026-09-05: 10 gate-55 crossings
                               // in 4h, all denied here with SCORE_BELOW_GATE).
} as const;

export function evaluateOpenGuards(i: OpenGuardInput, deadHours?: number[]): OpenGuardVerdict {
  const deniedBy: string[] = [];
  const notes: string[] = [];
  const dead = deadHours ?? DEFAULT_DEAD_HOURS_UTC;
  if (i.dataState === "SIMULATED" || i.dataState === "STALE") deniedBy.push("DATA_HEALTH");
  if (i.score < RISK.MIN_SCORE) deniedBy.push("SCORE_BELOW_GATE");
  if (i.rr < RISK.MIN_RR) deniedBy.push("RR_TOO_LOW");
  if (i.openPositions >= RISK.MAX_CONCURRENT) deniedBy.push("MAX_CONCURRENT");
  if (i.todayNetR <= RISK.DAILY_LOSS_CAP_R) deniedBy.push("DAILY_LOSS_CAP");
  if (dead.includes(i.hourUtc)) deniedBy.push("DEAD_HOUR");
  if (i.lastLossAtMs && Date.now() - i.lastLossAtMs < RISK.COOLDOWN_AFTER_LOSS_MIN * 60_000) deniedBy.push("LOSS_COOLDOWN");
  if (!i.liquidityOk) deniedBy.push("LIQUIDITY");
  if (deniedBy.length === 0) notes.push("All playbook guards passed — setup allowed");
  return { allowed: deniedBy.length === 0, deniedBy, notes };
}

// ── L7 — REVIEW: the habit that separates pros from gamblers ──────────────────
// Every closed trade is journaled into the learning memory (factor attribution,
// hour-of-day, volatility bucket). The memory refreshes EVERY MINUTE in production
// (sentinel heartbeat) and adapts factor weights inside bounded, audited limits.
export const CURRICULUM = [
  { level: 1, name: "Costs & Spread", rule: `Round trip ${TAKER_ROUND_TRIP_BPS}bps modeled on every result — gross and net both reported`, source: "C1" },
  { level: 2, name: "Structure", rule: "EMA stack for trend, 3.0% invalidation stop, 1.2% target (geometry v2 — targets several× the 22-24bps RT cost), 12h time stop, worst-case-gap (stop first)", source: "C1/P1" },
  { level: 3, name: "Timing", rule: "No entries in measured dead hours; FX/indices weekend-closed; no chasing opening spikes", source: "C1/P1" },
  { level: 4, name: "Momentum Quality", rule: "relVol 1.05–1.5× sweet spot (PF 1.71 vs 1.10 at ≥1.5×); chase-guard on blow-offs; M30 ROC 2–6% bonus", source: "C1" },
  { level: 5, name: "Risk", rule: `Score ≥${RISK.MIN_SCORE}, RR ≥${RISK.MIN_RR}, ≤${RISK.MAX_CONCURRENT} concurrent, day cap ${RISK.DAILY_LOSS_CAP_R}R, ${RISK.COOLDOWN_AFTER_LOSS_MIN}min cooldown after a loss`, source: "C1/P1/C2" },
  { level: 6, name: "Execution", rule: "No entries on simulated/stale data; liquidity gate before every order", source: "P1" },
  { level: 7, name: "Review Loop", rule: "Every close journals factor contributions → per-minute memory refresh adapts weights (bounded ±50%, n≥20)", source: "C1" },
] as const;
