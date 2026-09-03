// DeeYoung Pro — Validation campaign data fetcher.
// Downloads REAL 1-minute klines from Binance public REST for the 10 crypto pairs
// in the production UNIVERSE. Caches to scripts/out/klines/<SYM>_1m.json so
// before/after upgrade runs use identical data (no re-download, no re-sampling).
// Real market data only — no synthetic bars anywhere.

interface RawKline { t: number; o: number; h: number; l: number; c: number; v: number }

const PAIRS: Record<string, string> = {
  BTCUSD: "BTCUSDT", ETHUSD: "ETHUSDT", SOLUSD: "SOLUSDT", XRPUSD: "XRPUSDT",
  DOGEUSD: "DOGEUSDT", ADAUSD: "ADAUSDT", BNBUSD: "BNBUSDT", AVAXUSD: "AVAXUSDT",
  LINKUSD: "LINKUSDT", DOTUSD: "DOTUSDT",
};

const DAYS = Number(process.env.CAMPAIGN_DAYS ?? 60);
const INTERVAL_MS = 60_000;
const BARS_PER_DAY = 1440;
const LIMIT = 1000;
const GAP_MS = 130; // pacing: ~7.5 req/s, well inside Binance limits (6000 weight/min)

const OUT_DIR = new URL("./out/klines/", import.meta.url).pathname;
const need = DAYS * BARS_PER_DAY;

async function fetchWindow(symbol: string, startTime: number): Promise<RawKline[]> {
  const out: RawKline[] = [];
  let cursor = startTime;
  let failures = 0;
  while (cursor < startTime + need * INTERVAL_MS) {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1m&startTime=${cursor}&limit=${LIMIT}`;
    let rows: unknown[][] | null = null;
    for (let attempt = 0; attempt < 5 && !rows; attempt++) {
      try {
        const res = await fetch(url);
        if (res.status === 429 || res.status === 418) {
          const wait = 30_000 * (attempt + 1);
          console.error(`  ${symbol}: ${res.status} — backing off ${wait / 1000}s`);
          await new Promise((r) => setTimeout(r, wait));
          continue;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        rows = (await res.json()) as unknown[][];
      } catch (e) {
        failures++;
        if (failures > 40) throw new Error(`${symbol}: too many failures (${e})`);
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      }
    }
    if (!rows || rows.length === 0) { cursor += LIMIT * INTERVAL_MS; continue; }
    for (const k of rows) {
      out.push({ t: Number(k[0]), o: Number(k[1]), h: Number(k[2]), l: Number(k[3]), c: Number(k[4]), v: Number(k[5]) });
    }
    const lastT = Number(rows[rows.length - 1][0]);
    cursor = lastT + INTERVAL_MS;
    process.stdout.write(`  ${symbol}: ${out.length}/${need} bars\r`);
    await new Promise((r) => setTimeout(r, GAP_MS));
  }
  console.log();
  return out;
}

async function main() {
  const now = Date.now();
  const start = now - need * INTERVAL_MS;
  for (const [universeSym, binanceSym] of Object.entries(PAIRS)) {
    const file = `${OUT_DIR}${universeSym}_1m.json`;
    try {
      const existing = JSON.parse(await Bun.file(file).text()) as RawKline[];
      const first = existing[0]?.t ?? Infinity;
      const lastB = existing[existing.length - 1];
      if (existing.length >= need && first <= start + 5 * INTERVAL_MS && lastB && lastB.t >= now - 10 * INTERVAL_MS) {
        console.log(`${universeSym}: cached (${existing.length} bars, ${new Date(first).toISOString()} → ${new Date(lastB.t).toISOString()}) — skip`);
        continue;
      }
    } catch { /* no cache — fetch */ }
    console.log(`${universeSym} (${binanceSym}): fetching ${DAYS} days of 1m bars...`);
    const bars = await fetchWindow(binanceSym, start);
    // sanity: continuity report (Binance occasionally has maintenance gaps)
    let gaps = 0;
    for (let i = 1; i < bars.length; i++) if (bars[i].t - bars[i - 1].t !== INTERVAL_MS) gaps++;
    await Bun.write(file, JSON.stringify(bars));
    const spanDays = ((bars[bars.length - 1].t - bars[0].t) / 86400_000).toFixed(2);
    console.log(`${universeSym}: saved ${bars.length} bars (${spanDays}d span, ${gaps} missing minutes) → ${file}`);
  }
  console.log("FETCH_DONE");
}
main();
