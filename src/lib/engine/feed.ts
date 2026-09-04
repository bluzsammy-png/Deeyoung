// DEEYOUNG PRO — engine market feed with graceful venue degradation.
// Priority: TWELVEDATA (user-directed, when key present; credit-budgeted) →
// Binance public REST (keyless, proven from Railway) with two host fallbacks.
// The engine must NEVER stall because one data venue hiccups: every failure
// falls through to the next source and the per-bar source is reported back.
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
  degraded?: string; // set when the primary venue failed and we fell back
}

/**
 * Fetch up to `limit` recent 1m bars for an engine symbol (XXXUSD).
 * Twelve Data primary when keyed; Binance public fallback always attempted.
 * Note: closed-bar filtering (bar.T < now) stays the caller's job, identical
 * to the validated live-run loop.
 */
export async function fetchKlinesAny(sym: string, limit: number): Promise<FeedFetch> {
  if (feedSource() === "twelvedata") {
    try {
      return { bars: await tdKlines(sym, limit), source: "twelvedata" };
    } catch (e) {
      // Fall back — but record WHY so diagnostics show the degradation.
      const bars = await binanceKlines(sym, limit);
      return { bars, source: "binance", degraded: `twelvedata: ${String(e).slice(0, 60)}` };
    }
  }
  return { bars: await binanceKlines(sym, limit), source: "binance" };
}
