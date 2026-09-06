// DEEYOUNG PRO — LEDGER MARKET CLASSES (audit 2026-09-06).
// One deterministic engine, three data/session classes. Each class runs the
// SAME validated pipeline (gate 64, M30 scoring, geometry v2, 4-of-7
// confluence, $1k notional) with the session rules and series class that its
// validation actually used:
//   CRYPTO — Binance 1m bars, 24/7. BTC regime gate RETIRED 2026-09-06 (see
//            runner.ts header: post-volGuard replay, both 30d halves better
//            without it — WR 79.6→81.4%, PF 1.49→1.66).
//   FX     — Yahoo 5m bars, 24/5 (closed Fri 21:00 → Sun 22:00 UTC), BTC
//            filter OFF (validated without it; 30d replay: WR 85.7% at gate 64).
//   EQUITY — Yahoo 5m bars, US RTH entries only (14:00-19:45 UTC), BTC filter
//            OFF, weekend closed (30d replay: 2/2 wins at gate 64, tiny n —
//            reported honestly, monitored live).
// Gates do NOT drop below 64 for any class: the 5d/30d sweeps measured
// WR 52.9% and a net LOSS at gate 58 on non-crypto — a lowered gate is not a
// validated edge, it is a hope.

export type MarketClass = "CRYPTO" | "FX" | "EQUITY";

export const CRYPTO_SYMBOLS = [
  "BTCUSD", "ETHUSD", "SOLUSD", "XRPUSD", "DOGEUSD", "ADAUSD", "BNBUSD", "AVAXUSD", "LINKUSD", "DOTUSD",
] as const;

export const FX_SYMBOLS = [
  "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", // FX majors
  "XAUUSD", "WTI",                        // metals & energy proxies
] as const;

export const EQUITY_SYMBOLS = [
  "NVDA", "AAPL", "MSFT", "TSLA",         // mega-cap stocks
] as const;

export const LEDGER_UNIVERSE: string[] = [...CRYPTO_SYMBOLS, ...FX_SYMBOLS, ...EQUITY_SYMBOLS];

export function marketClassOf(symbol: string): MarketClass {
  if ((FX_SYMBOLS as readonly string[]).includes(symbol)) return "FX";
  if ((EQUITY_SYMBOLS as readonly string[]).includes(symbol)) return "EQUITY";
  return "CRYPTO";
}

export function isCryptoSymbol(symbol: string): boolean {
  return marketClassOf(symbol) === "CRYPTO";
}

/** True when entries for this class may OPEN at time t (exits are always managed). */
export function entriesOpenFor(symbol: string, t: number): boolean {
  const d = new Date(t);
  const day = d.getUTCDay(); // 0 Sun … 6 Sat
  const hour = d.getUTCHours();
  const min = d.getUTCMinutes();
  const cls = marketClassOf(symbol);
  if (cls === "EQUITY") {
    if (day === 0 || day === 6) return false;
    const mins = hour * 60 + min;
    return mins >= 14 * 60 && mins <= 19 * 60 + 45; // inside US RTH, open/close volatility excluded
  }
  if (cls === "FX") {
    if (day === 6) return false;
    if (day === 5 && hour >= 21) return false;      // weekend close ~Fri 21:00 UTC
    if (day === 0 && hour < 22) return false;       // reopen ~Sun 22:00 UTC
    return true;
  }
  return true; // crypto 24/7
}

/** Max age (ms) a symbol's last closed bar may have at ENTRY time. */
export function freshWindowMs(symbol: string): number {
  return marketClassOf(symbol) === "CRYPTO" ? 10 * 60_000 : 30 * 60_000;
}

/** Honest dataState for the playbook guard: STALE bars never enter. */
export function dataStateFor(symbol: string, lastClosedBarAgeMs: number): "LIVE" | "STALE" {
  return lastClosedBarAgeMs > (marketClassOf(symbol) === "CRYPTO" ? 15 : 45) * 60_000 ? "STALE" : "LIVE";
}
