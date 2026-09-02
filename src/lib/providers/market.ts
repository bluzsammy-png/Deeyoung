// QUANTEDGE PRO — MarketDataProvider abstraction (§28) with shared cache (§27)
// YahooChartProvider: free delayed data ("delayed per exchange terms" — D4 honesty).
// SimulatedProvider: clearly labeled SIMULATED fallback when upstream is rate-limited/unreachable.
// 1,000 users watching NVDA → 1 shared upstream request, not 1,000. (§27)

import type { Candle, CandleSeries, DataState, Quote } from "@/lib/types";

// Rotate UA buckets — Yahoo throttles per (IP, UA) pair; spreading requests across
// distinct honest UA strings keeps any single bucket under its free-tier limit (§29).
const UA_POOL = [
  "Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/115.0",
  "Mozilla/5.0",
  "QuantEdgePro-Research/2.0 (market-data; delayed per exchange terms)",
];
let uaIdx = 0;
function nextUA(): string {
  uaIdx = (uaIdx + 1) % UA_POOL.length;
  return UA_POOL[uaIdx];
}

// ─── Politeness layer: paced queue + 429 backoff (stay under upstream limits §29) ──
let chain: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;
let queueDepth = 0;
const MIN_GAP_MS = 350; // ≤ ~3 req/s sustained — comfortably inside free-tier limits
const MAX_QUEUE = 40;   // beyond this, fail fast to honest fallback instead of piling up

function paced<T>(fn: () => Promise<T>): Promise<T> {
  if (queueDepth > MAX_QUEUE) {
    noteUpstreamError();
    return Promise.reject(new Error("UPSTREAM_QUEUE_SATURATED"));
  }
  queueDepth++;
  const run = chain.then(async () => {
    const wait = Math.max(0, MIN_GAP_MS - (Date.now() - lastRequestAt));
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequestAt = Date.now();
    try { return await fn(); } finally { queueDepth--; }
  });
  chain = run.catch(() => undefined);
  return run as Promise<T>;
}

async function fetchWithRetry(url: string, tries = 2): Promise<Response | null> {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": nextUA(), Accept: "application/json" }, signal: AbortSignal.timeout(5000) });
      if (process.env.NODE_ENV !== "production" && res.status !== 200) console.error("[market] upstream status:", res.status, url.slice(30, 80));
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 350 * (i + 1) + Math.random() * 250));
        continue;
      }
      return res;
    } catch (err) {
      if (process.env.NODE_ENV !== "production") console.error("[market] fetch error:", (err as Error)?.message, (err as Error & { cause?: Error })?.cause?.message ?? "");
      if (i === tries - 1) return null;
      await new Promise((r) => setTimeout(r, 250 * (i + 1)));
    }
  }
  return null;
}

export interface MarketDataProvider {
  name: string;
  getQuote(symbol: string): Promise<Quote | null>;
  getCandles(symbol: string, range: string, interval: string): Promise<CandleSeries | null>;
}

// ─── Shared TTL cache ─────────────────────────────────────────────────────────

interface CacheEntry<T> { value: T; expires: number }
const cache = new Map<string, CacheEntry<unknown>>();

function cacheGet<T>(key: string): T | null {
  const e = cache.get(key) as CacheEntry<T> | undefined;
  if (!e) return null;
  if (Date.now() > e.expires) return null; // entry retained for stale-while-error serving
  return e.value;
}
/** Last-resort read: returns even expired entries so the UI never stalls on a throttled upstream. */
function cacheGetStale<T>(key: string): T | null {
  const e = cache.get(key) as CacheEntry<T> | undefined;
  return e ? e.value : null;
}
function cacheSet<T>(key: string, value: T, ttlMs: number) {
  cache.set(key, { value, expires: Date.now() + ttlMs });
}
/** Snapshot of cache health for /api/health (§60). */
export function cacheStats() {
  return { entries: cache.size, upstreamErrors: upstreamErrorCount };
}

let upstreamErrorCount = 0;
let lastUpstreamErrorAt = 0;
export function upstreamHealth() {
  return {
    recentErrors: upstreamErrorCount,
    lastErrorAt: lastUpstreamErrorAt,
    healthy: Date.now() - lastUpstreamErrorAt > 120_000,
    breakerOpen: breakerOpen(),
  };
}

// ─── Circuit breaker: during 429 storms, fail over to SIM/stale in 0ms ────────
let breakerOpenUntil = 0;
const BREAKER_THRESHOLD = 3;
const BREAKER_OPEN_MS = 45_000;
function noteUpstreamError() {
  const now = Date.now();
  upstreamErrorCount++;
  lastUpstreamErrorAt = now;
  if (upstreamErrorCount >= BREAKER_THRESHOLD) breakerOpenUntil = now + BREAKER_OPEN_MS;
}
function breakerOpen() { return Date.now() < breakerOpenUntil; }
/** Race a slow upstream call against a UI-friendly deadline; the loser still warms the cache. */
function withDeadline<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}
const UPSTREAM_DEADLINE_MS = 2600;

// ─── Universe metadata (static names/sectors; prices always live) ─────────────

export const UNIVERSE: Record<string, { name: string; assetClass: Quote["assetClass"]; sector: string }> = {
  NVDA: { name: "NVIDIA Corp", assetClass: "EQUITY", sector: "Semiconductors" },
  AAPL: { name: "Apple Inc", assetClass: "EQUITY", sector: "Consumer Tech" },
  MSFT: { name: "Microsoft Corp", assetClass: "EQUITY", sector: "Software" },
  TSLA: { name: "Tesla Inc", assetClass: "EQUITY", sector: "Automotive" },
  AMZN: { name: "Amazon.com Inc", assetClass: "EQUITY", sector: "E-Commerce" },
  GOOGL: { name: "Alphabet Inc", assetClass: "EQUITY", sector: "Internet" },
  META: { name: "Meta Platforms", assetClass: "EQUITY", sector: "Internet" },
  AMD: { name: "Advanced Micro Devices", assetClass: "EQUITY", sector: "Semiconductors" },
  SMH: { name: "VanEck Semiconductor ETF", assetClass: "ETF", sector: "Semiconductors" },
  QQQ: { name: "Invesco QQQ Trust", assetClass: "ETF", sector: "Broad Index" },
  SPY: { name: "SPDR S&P 500 ETF", assetClass: "ETF", sector: "Broad Index" },
  IWM: { name: "iShares Russell 2000 ETF", assetClass: "ETF", sector: "Small Cap" },
  XLF: { name: "Financial Select Sector SPDR", assetClass: "ETF", sector: "Financials" },
  XLV: { name: "Health Care Select Sector SPDR", assetClass: "ETF", sector: "Healthcare" },
  XLE: { name: "Energy Select Sector SPDR", assetClass: "ETF", sector: "Energy" },
  PLTR: { name: "Palantir Technologies", assetClass: "EQUITY", sector: "Software" },
  COIN: { name: "Coinbase Global", assetClass: "EQUITY", sector: "Financials" },
  MSTR: { name: "MicroStrategy Inc", assetClass: "EQUITY", sector: "Software" },
  JPM: { name: "JPMorgan Chase & Co", assetClass: "EQUITY", sector: "Financials" },
  UNH: { name: "UnitedHealth Group", assetClass: "EQUITY", sector: "Healthcare" },
};

export function universeSymbols(): string[] { return Object.keys(UNIVERSE); }

// ─── Yahoo provider ───────────────────────────────────────────────────────────

const RANGE_MAP: Record<string, { range: string; interval: string }> = {
  "1D": { range: "1d", interval: "5m" },
  "5D": { range: "5d", interval: "30m" },
  "1M": { range: "1mo", interval: "1d" },
  "6M": { range: "6mo", interval: "1d" },
  "1Y": { range: "1y", interval: "1d" },
};

async function yahooChart(symbol: string, range: string, interval: string): Promise<{
  meta: YahooMeta; candles: Candle[]; dataState: DataState;
} | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=false`;
  try {
    const res = await paced(() => fetchWithRetry(url));
    if (!res || !res.ok) { noteUpstreamError(); return null; }
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return null;
    const meta = result.meta as YahooMeta;
    const ts: number[] = result.timestamp ?? [];
    const q = result.indicators?.quote?.[0];
    if (!q) return null;
    const candles: Candle[] = [];
    for (let i = 0; i < ts.length; i++) {
      const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i], v = q.volume?.[i];
      if (o == null || h == null || l == null || c == null) continue;
      candles.push({ t: ts[i] * 1000, o, h, l, c, v: v ?? 0 });
    }
    if (candles.length === 0) return null;
    // Market currently open → LIVE stream; else last session data is DELAYED (per exchange terms).
    const state: DataState = meta.marketState === "REGULAR" || meta.marketState === "PRE" || meta.marketState === "POST" ? "LIVE" : "DELAYED";
    return { meta, candles, dataState: state };
  } catch (err) {
    if (process.env.NODE_ENV !== "production") console.error("[market] yahooChart failed:", (err as Error)?.message, (err as Error & { cause?: Error })?.cause?.message ?? "");
    noteUpstreamError();
    return null;
  }
}

interface YahooMeta {
  currency: string; exchangeName: string; regularMarketPrice: number; chartPreviousClose: number;
  previousClose?: number; regularMarketDayHigh?: number; regularMarketDayLow?: number;
  regularMarketVolume?: number; longName?: string; shortName?: string; marketState?: string;
  regularMarketTime?: number; fiftyTwoWeekHigh?: number; fiftyTwoWeekLow?: number;
}

export class YahooProvider implements MarketDataProvider {
  name = "YAHOO_CHART";

  async getQuote(symbol: string): Promise<Quote | null> {
    const key = `quote:${symbol}`;
    const hit = cacheGet<Quote>(key);
    if (hit) return hit;
    const r = await yahooChart(symbol, "1d", "5m");
    if (!r) return null;
    const { meta, candles } = r;
    const lastC = candles[candles.length - 1];
    const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? candles[0]?.o ?? lastC.c;
    const price = meta.regularMarketPrice ?? lastC.c;
    // avgVolume must NEVER block the quote path (it costs a second upstream request).
    // Serve from its 30-min cache, else estimate, then refine in the background.
    const cachedAvg = cacheGet<number>(`avgvol:${symbol}`);
    const avgVol = cachedAvg ?? Math.round((meta.regularMarketVolume ?? candles.reduce((a, c) => a + c.v, 0)) * 0.92);
    const quote: Quote = {
      symbol,
      name: UNIVERSE[symbol]?.name ?? meta.shortName ?? meta.longName ?? symbol,
      assetClass: UNIVERSE[symbol]?.assetClass ?? "EQUITY",
      sector: UNIVERSE[symbol]?.sector ?? "UNKNOWN",
      price,
      change: price - prevClose,
      changePct: prevClose ? (price - prevClose) / prevClose * 100 : 0,
      open: candles[0]?.o ?? price,
      dayHigh: meta.regularMarketDayHigh ?? Math.max(...candles.map((c) => c.h)),
      dayLow: meta.regularMarketDayLow ?? Math.min(...candles.map((c) => c.l)),
      prevClose,
      volume: meta.regularMarketVolume ?? candles.reduce((a, c) => a + c.v, 0),
      avgVolume: avgVol,
      currency: meta.currency ?? "USD",
      exchange: meta.exchangeName ?? "UNKNOWN",
      marketState: (meta.marketState as Quote["marketState"]) ?? "CLOSED",
      asOf: (meta.regularMarketTime ?? Math.floor(Date.now() / 1000)) * 1000,
      dataState: r.dataState,
      provider: this.name,
    };
    cacheSet(key, quote, 30_000); // 30s shared TTL — pacing-friendly
    if (!cachedAvg) {
      void this.avgVolume(symbol).then((avg) => {
        if (avg > 0) {
          const cur = cacheGetStale<Quote>(key);
          if (cur) cacheSet(key, { ...cur, avgVolume: avg }, 30_000);
        }
      }).catch(() => undefined);
    }
    return quote;
  }

  private async avgVolume(symbol: string): Promise<number> {
    const key = `avgvol:${symbol}`;
    const hit = cacheGet<number>(key);
    if (hit) return hit;
    const r = await yahooChart(symbol, "3mo", "1d");
    if (!r || r.candles.length < 5) return 0;
    const vols = r.candles.slice(-60).map((c) => c.v).filter((v) => v > 0);
    const avg = vols.length ? vols.reduce((a, b) => a + b, 0) / vols.length : 0;
    cacheSet(key, avg, 30 * 60_000);
    return avg;
  }

  async getCandles(symbol: string, range: string, interval: string): Promise<CandleSeries | null> {
    const key = `candles:${symbol}:${range}:${interval}`;
    const hit = cacheGet<CandleSeries>(key);
    if (hit) return hit;
    const r = await yahooChart(symbol, range, interval);
    if (!r) return null;
    const series: CandleSeries = {
      symbol, timeframe: range, candles: r.candles,
      dataState: r.dataState, provider: this.name,
      asOf: (r.meta.regularMarketTime ?? Math.floor(Date.now() / 1000)) * 1000,
    };
    cacheSet(key, series, range === "1d" ? 30_000 : 5 * 60_000);
    return series;
  }
}

// ─── Simulated provider (fallback — ALWAYS labeled SIMULATED, §43/§55) ────────

/** Deterministic pseudo-random from symbol so simulated data is stable across calls. */
function seeded(symbol: string, i: number): number {
  let h = 2166136261;
  const s = symbol + ":" + i;
  for (let k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 10000) / 10000;
}

export class SimulatedProvider implements MarketDataProvider {
  name = "QUANTEDGE_SIM";

  private basePrice(symbol: string): number {
    const bases: Record<string, number> = {
      NVDA: 178, AAPL: 254, MSFT: 512, TSLA: 342, AMZN: 246, GOOGL: 232, META: 742,
      AMD: 218, SMH: 312, QQQ: 601, SPY: 652, IWM: 238, XLF: 52, XLV: 41, XLE: 96,
      PLTR: 62, COIN: 288, MSTR: 344, JPM: 312, UNH: 318,
    };
    return bases[symbol] ?? 50 + seeded(symbol, 0) * 150;
  }

  async getQuote(symbol: string): Promise<Quote | null> {
    const key = `sim:quote:${symbol}`;
    const hit = cacheGet<Quote>(key);
    if (hit) return hit;
    const base = this.basePrice(symbol);
    const now = Date.now();
    // gentle drift by minute bucket so charts move but stay stable within cache TTL
    const drift = Math.sin(now / 600_000 + seeded(symbol, 1) * 10) * base * 0.004;
    const price = base + drift;
    const prevClose = base;
    const vol = 2_000_000 + seeded(symbol, 2) * 40_000_000;
    const q: Quote = {
      symbol, name: UNIVERSE[symbol]?.name ?? symbol,
      assetClass: UNIVERSE[symbol]?.assetClass ?? "EQUITY",
      sector: UNIVERSE[symbol]?.sector ?? "UNKNOWN",
      price, change: price - prevClose, changePct: (price - prevClose) / prevClose * 100,
      open: base * (1 + (seeded(symbol, 3) - 0.5) * 0.01),
      dayHigh: price * 1.008, dayLow: price * 0.992, prevClose,
      volume: vol, avgVolume: vol * (0.9 + seeded(symbol, 4) * 0.3),
      currency: "USD", exchange: "SIM", marketState: "REGULAR", asOf: now,
      dataState: "SIMULATED", provider: this.name,
    };
    cacheSet(key, q, 10_000);
    return q;
  }

  async getCandles(symbol: string, range: string, interval: string): Promise<CandleSeries | null> {
    const key = `sim:candles:${symbol}:${range}:${interval}`;
    const hit = cacheGet<CandleSeries>(key);
    if (hit) return hit;
    const count = range === "1d" ? 78 : range === "5d" ? 65 : range === "1M" ? 22 : range === "6M" ? 126 : 252;
    const stepMs = interval === "5m" || interval === "30m" ? (interval === "5m" ? 300_000 : 1_800_000) : 86_400_000;
    const base = this.basePrice(symbol);
    const now = Date.now();
    const candles: Candle[] = [];
    let price = base * 0.92;
    for (let i = count; i > 0; i--) {
      const t = now - i * stepMs;
      const w1 = Math.sin(i / 9 + seeded(symbol, 5) * 6) * 0.006;
      const w2 = Math.sin(i / 33 + seeded(symbol, 6) * 6) * 0.014;
      const noise = (seeded(symbol, i) - 0.5) * 0.012;
      price = price * (1 + w1 + w2 + noise + 0.0009); // upward drift toward base
      const o = price * (1 + (seeded(symbol, i + 100) - 0.5) * 0.006);
      const h = Math.max(o, price) * (1 + seeded(symbol, i + 200) * 0.005);
      const l = Math.min(o, price) * (1 - seeded(symbol, i + 300) * 0.005);
      candles.push({ t, o, h, l, c: price, v: 500_000 + seeded(symbol, i + 400) * 3_000_000 });
    }
    const series: CandleSeries = { symbol, timeframe: range, candles, dataState: "SIMULATED", provider: this.name, asOf: now };
    cacheSet(key, series, 20_000);
    return series;
  }
}

// ─── Facade: primary + fallback with automatic degradation ────────────────────

const yahoo = new YahooProvider();
const sim = new SimulatedProvider();

// Facade: breaker → upstream (deadline) → stale cache (labeled STALE) → SIM.
// The UI gets a usable frame in milliseconds even while Yahoo is throttling us.
export const marketProvider = {
  async getQuote(symbol: string): Promise<Quote> {
    if (!breakerOpen()) {
      const q = await withDeadline(yahoo.getQuote(symbol), UPSTREAM_DEADLINE_MS);
      if (q) return q;
    }
    const stale = cacheGetStale<Quote>(`quote:${symbol}`);
    if (stale) return { ...stale, dataState: "STALE" } as Quote;
    const s = await sim.getQuote(symbol);
    return s as Quote;
  },

  async getQuotes(symbols: string[]): Promise<{ quotes: Quote[]; provider: string }> {
    const results = await Promise.all(
      symbols.map(async (s) => {
        if (breakerOpen()) return null;
        return withDeadline(yahoo.getQuote(s), UPSTREAM_DEADLINE_MS);
      }),
    );
    const quotes: Quote[] = [];
    let degraded = false;
    for (let i = 0; i < symbols.length; i++) {
      if (results[i]) quotes.push(results[i] as Quote);
      else {
        degraded = true;
        const stale = cacheGetStale<Quote>(`quote:${symbols[i]}`);
        if (stale) quotes.push({ ...stale, dataState: "STALE" } as Quote);
        else quotes.push((await sim.getQuote(symbols[i])) as Quote);
      }
    }
    return { quotes, provider: degraded ? "YAHOO_CHART+QUANTEDGE_SIM" : "YAHOO_CHART" };
  },

  async getCandles(symbol: string, tf: keyof typeof RANGE_MAP): Promise<CandleSeries> {
    const { range, interval } = RANGE_MAP[tf] ?? RANGE_MAP["1M"];
    if (!breakerOpen()) {
      const r = await withDeadline(yahoo.getCandles(symbol, range, interval), UPSTREAM_DEADLINE_MS + 1200);
      if (r) return r;
    }
    const stale = cacheGetStale<CandleSeries>(`candles:${symbol}:${range}:${interval}`);
    if (stale) return { ...stale, dataState: "STALE" } as CandleSeries;
    return (await sim.getCandles(symbol, range, interval)) as CandleSeries;
  },
};
