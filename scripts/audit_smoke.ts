// DeeYoung Pro — smoke test for the audit changes (markets + feed routing).
// Run: bun scripts/audit_smoke.ts   (no DB, no network writes)

import { marketClassOf, entriesOpenFor, freshWindowMs, dataStateFor, LEDGER_UNIVERSE } from "../src/lib/engine/markets";
import { tdSymbol } from "../src/lib/market/twelvedata";

const t = (iso: string) => new Date(iso).getTime();

// 2026-09-04 = Friday, 2026-09-05 = Saturday, 2026-09-06 = Sunday
const checks: Array<[string, boolean, boolean]> = [
  ["FX closed Fri 22:00 UTC", entriesOpenFor("EURUSD", t("2026-09-04T22:00:00Z")), false],
  ["FX open Fri 20:59 UTC", entriesOpenFor("EURUSD", t("2026-09-04T20:59:00Z")), true],
  ["FX closed Sat", entriesOpenFor("XAUUSD", t("2026-09-05T12:00:00Z")), false],
  ["FX closed Sun 10:00", entriesOpenFor("WTI", t("2026-09-06T10:00:00Z")), false],
  ["FX open Sun 22:30", entriesOpenFor("EURUSD", t("2026-09-06T22:30:00Z")), true],
  ["FX open Wed 03:00", entriesOpenFor("GBPUSD", t("2026-09-02T03:00:00Z")), true],
  ["EQUITY open Wed 15:00", entriesOpenFor("NVDA", t("2026-09-02T15:00:00Z")), true],
  ["EQUITY closed Wed 13:00 (pre-RTH)", entriesOpenFor("AAPL", t("2026-09-02T13:00:00Z")), false],
  ["EQUITY closed Wed 19:46", entriesOpenFor("MSFT", t("2026-09-02T19:46:00Z")), false],
  ["EQUITY closed Sat", entriesOpenFor("TSLA", t("2026-09-05T15:00:00Z")), false],
  ["CRYPTO 24/7 Sat", entriesOpenFor("BTCUSD", t("2026-09-05T15:00:00Z")), true],
];

let fail = 0;
for (const [name, got, want] of checks) {
  const ok = got === want;
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} (got ${got}, want ${want})`);
}

console.log(`classes: BTCUSD=${marketClassOf("BTCUSD")} EURUSD=${marketClassOf("EURUSD")} NVDA=${marketClassOf("NVDA")} WTI=${marketClassOf("WTI")}`);
console.log(`fresh windows: BTC=${freshWindowMs("BTCUSD") / 60000}m EURUSD=${freshWindowMs("EURUSD") / 60000}m NVDA=${freshWindowMs("NVDA") / 60000}m`);
console.log(`dataState: fresh crypto=${dataStateFor("BTCUSD", 60_000)} stale crypto=${dataStateFor("BTCUSD", 16 * 60_000)} fresh fx=${dataStateFor("EURUSD", 10 * 60_000)} stale fx=${dataStateFor("EURUSD", 46 * 60_000)}`);
console.log(`universe (${LEDGER_UNIVERSE.length}): ${LEDGER_UNIVERSE.join(" ")}`);
console.log(`td symbols: BTCUSD→${tdSymbol("BTCUSD")} EURUSD→${tdSymbol("EURUSD")} NVDA→${tdSymbol("NVDA")}`);
process.exit(fail ? 1 : 0);
