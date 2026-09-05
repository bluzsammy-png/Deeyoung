// DEEYOUNG PRO — Cross-Market Playbook Desk.
// The SAME deterministic 7-factor signal engine that drives the paper ledger,
// run as research reads across FX majors, metals, energy, global indices and
// mega-cap stocks. HONESTY CONTRACT: these are computed reads from real
// candles, never invented; the paper EXECUTION ledger remains crypto majors
// (that is where real 1-minute bars are reliably free). FX/gold/index reads
// are published so every plan holder can audit cross-market coverage.

import { computeSignal } from "@/lib/engine/signals";
import { isVolumeBlind, marketProvider, UNIVERSE } from "@/lib/providers/market";

export const DESK_SYMBOLS = [
  // FX majors
  "EURUSD", "GBPUSD", "USDJPY", "AUDUSD",
  // metals & energy
  "XAUUSD", "XAGUSD", "WTI",
  // global indices
  "SPX", "NDX100", "DAX",
  // mega-cap stocks
  "NVDA", "AAPL", "MSFT", "TSLA",
  // crypto majors (the ledger's execution universe)
  "BTCUSD", "ETHUSD", "SOLUSD", "XRPUSD",
] as const;

export interface DeskRead {
  symbol: string;
  name: string;
  assetClass: string;
  direction: "LONG" | "SHORT" | "NEUTRAL";
  score: number;
  rr: number;
  entry: number;
  stop: number;
  target: number;
  dataState: string;
  computedAt: number;
}

const REFRESH_PER_PASS = 6;     // symbols recomputed per triggered pass
const MIN_PASS_GAP_MS = 90_000; // at most one pass per 90s (budget-friendly)
const STALE_MS = 30 * 60_000;   // a read older than 30min is retried on sight

const cache = new Map<string, DeskRead>();
let cursor = 0;
let lastPassAt = 0;

async function readSymbol(symbol: string): Promise<DeskRead | null> {
  const meta = UNIVERSE[symbol];
  // Same series logic as the Trade Desk analyst: fresh intraday if deep
  // enough, otherwise the 6-month daily series.
  const [intraday, daily] = await Promise.all([
    marketProvider.getCandles(symbol, "1D").catch(() => null),
    marketProvider.getCandles(symbol, "6M").catch(() => null),
  ]);
  const series = intraday && intraday.candles.length >= 60 ? intraday : daily;
  if (!series || series.candles.length < 60) return null;

  const last = series.candles[series.candles.length - 1];
  const price = last.c;
  const volumeBlind = isVolumeBlind(symbol);
  const sig = computeSignal({
    candles: series,
    dayCandles: intraday ?? undefined,
    relVolume: 1,
    regimePrimary: "NEUTRAL",
    catalystScore: 0,
    avgVolume: volumeBlind ? Math.ceil(1 / Math.max(0.0001, price)) : 1,
    minLiquidityUsd: 0,
  });
  if (!sig) return null;
  return {
    symbol,
    name: meta?.name ?? symbol,
    assetClass: meta?.assetClass ?? "EQUITY",
    direction: sig.direction as DeskRead["direction"],
    score: sig.score,
    rr: sig.rr,
    entry: +sig.entry.toPrecision(6),
    stop: +sig.stop.toPrecision(6),
    target: +sig.target.toPrecision(6),
    dataState: series.dataState,
    computedAt: Date.now(),
  };
}

/**
 * Refresh a rotating slice of the desk, then serve the cached board.
 * Rotation keeps provider budget flat: 6 symbols per pass, ~3 min for a full
 * board refresh, and the last good read is always served while fresh ones
 * compute (stale reads are visibly labeled with their age upstream).
 */
export async function deskSnapshot(): Promise<{ desk: DeskRead[]; updatedAt: number | null }> {
  const now = Date.now();
  if (now - lastPassAt >= MIN_PASS_GAP_MS) {
    lastPassAt = now;
    // prioritize stale/missing symbols first, then round-robin the rest
    const order = [...DESK_SYMBOLS].sort((a, b) => {
      const ta = cache.get(a)?.computedAt ?? 0;
      const tb = cache.get(b)?.computedAt ?? 0;
      const sa = now - ta > STALE_MS ? 0 : 1;
      const sb = now - tb > STALE_MS ? 0 : 1;
      return sa - sb || ta - tb;
    });
    const slice = order.slice(cursor % order.length, (cursor % order.length) + REFRESH_PER_PASS);
    cursor += REFRESH_PER_PASS;
    const results = await Promise.all(slice.map((s) => readSymbol(s).catch(() => null)));
    results.forEach((r) => { if (r) cache.set(r.symbol, r); });
  }
  const desk = DESK_SYMBOLS
    .map((s) => cache.get(s))
    .filter((r): r is DeskRead => !!r);
  const updatedAt = desk.length ? Math.max(...desk.map((r) => r.computedAt)) : null;
  return { desk, updatedAt };
}
