// DEEYOUNG PRO — Twelve Data market-data client (user-directed data venue).
// Free plan: 8 credits/min, 800 credits/day, 1 credit per time_series call.
// This client is rate-limit AWARE: it refuses (throws TD_RATE_LIMIT) before
// spending a credit it does not have, so callers can fall back to the keyless
// public feed instead of stalling the engine. Never fails silently —
// status() exposes the exact state for diagnostics.
//
// Symbols: engine uses XXXUSD ("BTCUSD") → Twelve Data wants "BTC/USD".

export interface TwelveDataBar {
  t: number; // open time, ms UTC
  o: number; h: number; l: number; c: number; v: number;
}

const BASE = "https://api.twelvedata.com";

const budget = {
  minuteStart: 0,
  minuteUsed: 0,
  dayKey: "",
  dayUsed: 0,
  lastError: null as string | null,
  lastOkAt: 0,
};

const TD_PER_MIN = 7; // 1 credit headroom under the 8/min free cap
const TD_PER_DAY = 780; // headroom under 800/day

export function twelvedataConfigured(): boolean {
  return Boolean(process.env.TWELVEDATA_API_KEY);
}

/**
 * True when at least one Twelve Data credit remains in BOTH the minute and day
 * budgets. Feed callers check this BEFORE attempting a TD call so a planned
 * Binance share never burns a failed call or pollutes the error counters.
 */
export function tdBudgetAvailable(): boolean {
  const now = Date.now();
  if (budget.dayKey !== dayKeyOf(now)) return true; // day window rolls over
  if (now - budget.minuteStart >= 60_000) return true; // minute window rolls over
  return budget.minuteUsed < TD_PER_MIN && budget.dayUsed < TD_PER_DAY;
}

function dayKeyOf(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

function budgetCheck(now: number): void {
  if (budget.dayKey !== dayKeyOf(now)) {
    budget.dayKey = dayKeyOf(now);
    budget.dayUsed = 0;
  }
  if (now - budget.minuteStart >= 60_000) {
    budget.minuteStart = now;
    budget.minuteUsed = 0;
  }
  if (budget.minuteUsed >= TD_PER_MIN || budget.dayUsed >= TD_PER_DAY) {
    throw new Error("TD_RATE_LIMIT");
  }
}

function spend(now: number): void {
  budget.minuteUsed += 1;
  budget.dayUsed += 1;
}

/** "BTCUSD" → "BTC/USD" */
export function tdSymbol(sym: string): string {
  if (sym.includes("/")) return sym;
  return `${sym.replace(/USDT?$/, "")}/USD`;
}

/** Twelve Data "2026-09-04 10:23:00" (UTC when timezone=UTC) → epoch ms */
function parseTdDatetime(s: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(s.trim());
  if (m) {
    return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.getTime();
  throw new Error(`TD_BAD_DATETIME ${s}`);
}

export interface TdKlineOpts {
  interval?: string; // "1min" | "5min" | ...
  limit?: number;
  timeoutMs?: number;
}

export async function twelvedataKlines(
  sym: string,
  opts: TdKlineOpts = {},
): Promise<TwelveDataBar[]> {
  const key = process.env.TWELVEDATA_API_KEY;
  if (!key) throw new Error("TD_NO_KEY");
  const now = Date.now();
  budgetCheck(now);

  const interval = opts.interval ?? "1min";
  const limit = Math.min(Math.max(opts.limit ?? 3, 1), 5000);
  const url =
    `${BASE}/time_series?symbol=${encodeURIComponent(tdSymbol(sym))}` +
    `&interval=${interval}&outputsize=${limit}&order=ASC&timezone=UTC&apikey=${key}`;

  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000) });
  } catch (e) {
    budget.lastError = `fetch: ${String(e).slice(0, 80)}`;
    throw new Error("TD_UNREACHABLE");
  }
  spend(now);

  const body = (await res.json().catch(() => null)) as
    | { status?: string; message?: string; values?: Array<Record<string, string>> }
    | null;

  if (!res.ok || !body) {
    budget.lastError = `http ${res.status}`;
    throw new Error(`TD_HTTP_${res.status}`);
  }
  if (body.status === "error" || !body.values) {
    budget.lastError = (body.message ?? "no values").slice(0, 120);
    throw new Error("TD_ERROR");
  }

  budget.lastError = null;
  budget.lastOkAt = Date.now();

  const bars = body.values.map((row) => ({
    t: parseTdDatetime(row.datetime),
    o: Number(row.open),
    h: Number(row.high),
    l: Number(row.low),
    c: Number(row.close),
    v: row.volume !== undefined ? Number(row.volume) : 0,
  }));
  // ASC requested, but be defensive: sort. Half-open current bar dropped by caller.
  bars.sort((a, b) => a.t - b.t);
  if (bars.some((b) => !Number.isFinite(b.c))) throw new Error("TD_BAD_BAR");
  return bars;
}

export function twelvedataStatus(): {
  configured: boolean;
  minuteUsed: number;
  dayUsed: number;
  lastError: string | null;
  lastOkAt: number;
} {
  return {
    configured: twelvedataConfigured(),
    minuteUsed: budget.minuteUsed,
    dayUsed: budget.dayUsed,
    lastError: budget.lastError,
    lastOkAt: budget.lastOkAt,
  };
}
