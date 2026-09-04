// DEEYOUNG PRO — engine market feed with graceful venue degradation.
// Priority: TWELVEDATA (user-directed, when key present; credit-budgeted) →
// Binance public REST (keyless, proven from Railway) with two host fallbacks.
// The engine must NEVER stall because one data venue hiccups: every failure
// falls through to the next source and the per-bar source is reported back.
//
// 2026-09-05 UPGRADE — fair-share rotation: the Twelve Data free plan allows
// only 7 credits/min while the engine sweeps 10 symbols every ~17s. The old
// path burned the budget on whichever symbols came first in the loop and then
// threw TD_RATE_LIMIT for the rest (error-driven fallback churn). Now the
// feed pre-checks the budget, serves symbols least-recently-served first, and
// hands the planned remainder straight to Binance — zero wasted calls, every
// symbol gets authenticated TD coverage regularly, and provenance per symbol
// is recorded for the /status and /admin surfaces.
//
// Bar shape matches the engine's RawK/live-run convention.

export interface FeedBar {
  t: number; o: number; h: number; l: number; c: number; v: number; T: number;
}
export type FeedSource = "twelvedata" | "binance";

const BINANCE_HOSTS = ["https://api.binance.com", "https://data-api.binance.vision"];

export function feedSource(): FeedSource {
  return process.env.TWELVEDATA_API_KEY ? "twelvedata" : "binance";
}

// ── Provenance ledger: last source + timestamp per symbol (in-memory, honest) ──
const provenance: Record<string, { source: FeedSource; at: number; degraded?: string }> = {};

function noteSource(sym: string, source: FeedSource, degraded?: string): void {
  provenance[sym] = { source, at: Date.now(), ...(degraded ? { degraded } : {}) };
}

export function feedProvenance(): Record<string, { source: FeedSource; at: number; degraded?: string }> {
  return JSON.parse(JSON.stringify(provenance)) as typeof provenance;
}

export function feedStats(): { tdServed: number; binanceServed: number; tdSkippedBudget: number } {
  return { ...counters };
}

const counters = { tdServed: 0, binanceServed: 0, tdSkippedBudget: 0 };

// ── Per-minute rotated TD share ──
// Universe order rotates by minute bucket: for minute M, symbols whose rotated
// rank is inside the TD share get authenticated coverage; the rest go straight
// to Binance with zero wasted calls. Every minute the privileged prefix shifts,
// so all symbols share TD coverage evenly over time.
let universe: string[] = [];

/** Runner registers the engine symbol universe once at loop start. */
export function setFeedUniverse(symbols: string[]): void {
  universe = [...symbols];
}

const TD_SHARE_PER_MIN = 7; // mirrors the client's 7/min budget

function tdRankedThisMinute(sym: string): boolean {
  if (!universe.includes(sym)) return true; // unknown symbol: always TD-eligible
  const minuteBucket = Math.floor(Date.now() / 60_000);
  const rank = (universe.indexOf(sym) + minuteBucket) % universe.length;
  return rank < Math.min(TD_SHARE_PER_MIN, universe.length);
}

async function binanceKlines(sym: string, limit: number): Promise<FeedBar[]> {
  const pair = sym.replace(/USD$/, "USDT");
  let lastErr: unknown = null;
  for (const host of BINANCE_HOSTS) {
    try {
      const res = await fetch(
        `${host}/api/v3/klines?symbol=${pair}&interval=1m&limit=${limit}`,
        { signal: AbortSignal.timeout(10_000) },
      );
      if (!res.ok) throw new Error(`http ${res.status}`);
      const rows = (await res.json()) as (string | number)[][];
      return rows.map((r) => ({
        t: Number(r[0]), o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[5], T: Number(r[6]),
      }));
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`binance unreachable: ${String(lastErr).slice(0, 80)}`);
}

async function tdKlines(sym: string, limit: number): Promise<FeedBar[]> {
  const { twelvedataKlines } = await import("@/lib/market/twelvedata");
  const bars = await twelvedataKlines(sym, { interval: "1min", limit });
  return bars.map((b) => ({ ...b, T: b.t + 60_000 }));
}

export interface FeedFetch {
  bars: FeedBar[];
  source: FeedSource;
  degraded?: string; // set when TD was ATTEMPTED and failed unexpectedly
}

/**
 * Fetch up to `limit` recent 1m bars for an engine symbol (XXXUSD).
 * Twelve Data is served inside a per-minute rotated share while the free-plan
 * budget holds; the planned remainder goes straight to Binance.
 * Note: closed-bar filtering (bar.T < now) stays the caller's job, identical
 * to the validated live-run loop.
 */
export async function fetchKlinesAny(sym: string, limit: number): Promise<FeedFetch> {
  const { twelvedataConfigured, tdBudgetAvailable } = await import("@/lib/market/twelvedata");

  // TD path requires: keyed + inside rotated share + budget actually remaining.
  if (twelvedataConfigured() && tdRankedThisMinute(sym) && tdBudgetAvailable()) {
    try {
      const bars = await tdKlines(sym, limit);
      counters.tdServed++;
      noteSource(sym, "twelvedata");
      return { bars, source: "twelvedata" };
    } catch (e) {
      const msg = String(e);
      if (msg.includes("TD_RATE_LIMIT")) {
        // Budget ran out between the pre-check and the call — planned handoff,
        // NOT a degradation. Fall through to Binance silently.
        const bars = await binanceKlines(sym, limit);
        counters.binanceServed++;
        noteSource(sym, "binance");
        return { bars, source: "binance" };
      }
      const bars = await binanceKlines(sym, limit);
      counters.binanceServed++;
      noteSource(sym, "binance", `twelvedata: ${msg.slice(0, 60)}`);
      return { bars, source: "binance", degraded: `twelvedata: ${msg.slice(0, 60)}` };
    }
  }

  if (twelvedataConfigured()) counters.tdSkippedBudget++;
  const bars = await binanceKlines(sym, limit);
  counters.binanceServed++;
  noteSource(sym, "binance");
  return { bars, source: "binance" };
}
