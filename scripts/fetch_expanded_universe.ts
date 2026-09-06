// DeeYoung Pro — EXPANDED UNIVERSE data fetcher (universe-scale upgrade round).
// Fetches REAL bars for the proposed book expansion, into a SEPARATE dir so
// every previously-committed validation set stays byte-identical:
//   CRYPTO (+10) — Binance public REST 1m, 60d: LTC, ATOM, ETC, XLM, NEAR, APT, ARB, OP, SUI, FIL
//   NON-CRYPTO (+10) — Yahoo public chart 5m, 60d: USDCAD, USDCHF, NZDUSD, EURJPY, GBPJPY, AUDJPY, AMZN, GOOGL, META, AMD
// Real market data only — no synthetic bars anywhere. Zero cost: public endpoints.

interface RawKline { t: number; o: number; h: number; l: number; c: number; v: number }

const BINANCE: Record<string, string> = {
  LTCUSD: "LTCUSDT", ATOMUSD: "ATOMUSDT", ETCUSD: "ETCUSDT", XLMUSD: "XLMUSDT", NEARUSD: "NEARUSDT",
  APTUSD: "APTUSDT", ARBUSD: "ARBUSDT", OPUSD: "OPUSDT", SUIUSD: "SUIUSDT", FILUSD: "FILUSDT",
};

const YAHOO: Record<string, string> = {
  USDCAD: "USDCAD=X", USDCHF: "USDCHF=X", NZDUSD: "NZDUSD=X",
  EURJPY: "EURJPY=X", GBPJPY: "GBPJPY=X", AUDJPY: "AUDJPY=X",
  AMZN: "AMZN", GOOGL: "GOOGL", META: "META", AMD: "AMD",
};

const DAYS = 60;
const INTERVAL_MS = 60_000;
const BARS_PER_DAY = 1440;
const LIMIT = 1000;
const GAP_MS = 130; // ~7.5 req/s, inside Binance free limits (6000 weight/min)
const UA = "Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/115.0";

const OUT_DIR = "/home/z/my-project/scripts/out/klines_expanded/";
const need = DAYS * BARS_PER_DAY;

import { mkdirSync, writeFileSync, existsSync, readFileSync, statSync } from "fs";

/** Skip symbols already fetched with a good file (idempotent resume).
 *  A file counts as good ONLY if it holds a real series (empty 429 artifacts
 *  must be refetched regardless of mtime). */
function haveGood(sym: string, suffix: string): boolean {
  const p = `${OUT_DIR}${sym}_${suffix}.json`;
  if (!existsSync(p)) return false;
  try {
    const bars = JSON.parse(readFileSync(p, "utf8")) as RawKline[];
    return bars.length > 5000 && Date.now() - bars.at(-1)!.t < 6 * 3_600_000; // real series, ends within 6h
  } catch {
    return false;
  }
}

async function fetchBinance(sym: string): Promise<RawKline[]> {
  const out: RawKline[] = [];
  let cursor = Date.now() - need * INTERVAL_MS;
  const end = Date.now();
  while (cursor < end) {
    const url = `https://api.binance.com/api/v3/klines?symbol=${sym}&interval=1m&startTime=${cursor}&limit=${LIMIT}`;
    let rows: unknown[][] | null = null;
    for (let attempt = 0; attempt < 5 && !rows; attempt++) {
      try {
        const res = await fetch(url);
        if (res.status === 429 || res.status === 418) {
          const wait = 30_000 * (attempt + 1);
          console.error(`  ${sym}: ${res.status} — backing off ${wait / 1000}s`);
          await new Promise((r) => setTimeout(r, wait));
          continue;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        rows = (await res.json()) as unknown[][];
      } catch (e) {
        console.error(`  ${sym}: ${String(e)} retry ${attempt + 1}`);
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      }
    }
    if (!rows || rows.length === 0) break;
    for (const r of rows) {
      out.push({ t: Number(r[0]), o: Number(r[1]), h: Number(r[2]), l: Number(r[3]), c: Number(r[4]), v: Number(r[5]) });
    }
    cursor = Number(rows[rows.length - 1][0]) + INTERVAL_MS;
    await new Promise((r) => setTimeout(r, GAP_MS));
  }
  return out;
}

async function fetchYahoo(yahooSym: string): Promise<RawKline[]> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const host = attempt % 2 === 0 ? "query1" : "query2";
    const url = `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSym)}?range=60d&interval=5m&includePrePost=false`;
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
      if (res.status === 429 || res.status === 418 || res.status === 503) {
        const wait = 45_000 * (attempt + 1); // outlast shared-IP throttle windows
        console.error(`  ${yahooSym}: ${res.status} — backing off ${wait / 1000}s`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = JSON.parse(await res.text()) as {
        chart?: { result?: Array<{ timestamp?: number[]; indicators?: { quote?: Array<Record<string, (number | null)[] | undefined>> } }> };
      };
      const r = body.chart?.result?.[0];
      const ts = r?.timestamp ?? [];
      const q = r?.indicators?.quote?.[0];
      if (!q || !ts.length) return [];
      const out: RawKline[] = [];
      for (let i = 0; i < ts.length; i++) {
        const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i], v = q.volume?.[i];
        if (o == null || h == null || l == null || c == null) continue;
        out.push({ t: ts[i] * 1000, o, h, l, c, v: v ?? 0 });
      }
      return out;
    } catch (e) {
      console.error(`  ${yahooSym}: ${String(e)} retry ${attempt + 1}`);
      await new Promise((r) => setTimeout(r, 30_000 * (attempt + 1)));
    }
  }
  return [];
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  console.log(`Fetching expanded universe into ${OUT_DIR}`);
  for (const [ledgerSym, binanceSym] of Object.entries(BINANCE)) {
    if (haveGood(ledgerSym, "1m")) { console.log(`BINANCE ${binanceSym} ... cached, skip`); continue; }
    process.stdout.write(`BINANCE ${binanceSym} ... `);
    const bars = await fetchBinance(binanceSym);
    writeFileSync(`${OUT_DIR}${ledgerSym}_1m.json`, JSON.stringify(bars));
    const days = bars.length ? (bars.at(-1)!.t - bars[0].t) / 86_400_000 : 0;
    console.log(`${bars.length} bars, ${days.toFixed(1)}d span`);
  }
  for (const [ledgerSym, yahooSym] of Object.entries(YAHOO)) {
    if (haveGood(ledgerSym, "5m")) { console.log(`YAHOO ${yahooSym} ... cached, skip`); continue; }
    process.stdout.write(`YAHOO ${yahooSym} ... `);
    const bars = await fetchYahoo(yahooSym);
    writeFileSync(`${OUT_DIR}${ledgerSym}_5m.json`, JSON.stringify(bars));
    const days = bars.length ? (bars.at(-1)!.t - bars[0].t) / 86_400_000 : 0;
    console.log(`${bars.length} bars, ${days.toFixed(1)}d span`);
  }
  console.log("DONE");
}

void main();
