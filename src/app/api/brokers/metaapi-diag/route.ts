// DEEYOUNG PRO — broker bridge diagnostics (§broker-bridge).
// GET /api/brokers/metaapi-diag — kept for continuity; reports ALL venues:
//   Alpaca (PRIMARY since 2026-09-04: paper trading, Nigeria-compatible),
//   Bybit (dormant — website geo-blocked from user's location), 
//   OANDA (dormant — no Nigerian onboarding), MetaApi (retired).
// Returns ONLY aggregate facts (status codes, counts, verdict words). Never
// echoes keys, secrets, account ids or balances — health-route presence-boolean pattern.

import { NextResponse } from "next/server";
import { oandaConfigured, oandaAccountSummary } from "@/lib/brokers/oanda";
import { bybitConfigured, bybitAccountSummary, bybitEnvLabel } from "@/lib/brokers/bybit";
import { alpacaConfigured, alpacaAccountSummary, alpacaEnvLabel } from "@/lib/brokers/alpaca";

export const dynamic = "force-dynamic";

export async function GET() {
  const out: Record<string, unknown> = {};

  // ── Alpaca (PRIMARY — paper trading venue) ───────────────────────────────────
  if (!alpacaConfigured()) {
    out.ALPACA = {
      configured: false, verdict: "NO_KEYS",
      detail: "ALPACA_KEY_ID / ALPACA_SECRET_KEY not set. Paper bridge dormant by design.",
    };
  } else {
    const s = await alpacaAccountSummary();
    out.ALPACA = {
      configured: true, venue: alpacaEnvLabel(),
      verdict: s.status === "CONNECTED" ? "KEYS_VALID" : s.status,
      detail: s.detail,
      ...(s.status === "CONNECTED" ? { accountStatus: s.accountStatus } : {}),
    };
  }

  // ── Bybit (dormant 2026-09-04 — website unreachable from user's location) ───
  if (!bybitConfigured()) {
    out.BYBIT = {
      configured: false, verdict: "NO_KEYS",
      detail: "BYBIT_API_KEY / BYBIT_API_SECRET not set. Demo bridge dormant by design.",
    };
  } else {
    const s = await bybitAccountSummary();
    out.BYBIT = {
      configured: true, venue: bybitEnvLabel(),
      verdict: s.status === "CONNECTED" ? "KEYS_VALID" : s.status,
      detail: s.detail,
      ...(s.status === "CONNECTED" ? { accountType: s.accountType } : {}),
    };
  }

  // ── OANDA (dormant 2026-09-04 — unavailable to Nigerian residents) ──────────
  if (!oandaConfigured()) {
    out.OANDA = {
      configured: false, verdict: "NO_TOKEN",
      detail: "OANDA_TOKEN / OANDA_ACCOUNT_ID not set. FX bridge dormant by design.",
    };
  } else {
    const s = await oandaAccountSummary();
    out.OANDA = {
      configured: true,
      verdict: s.status === "CONNECTED" ? "TOKEN_VALID" : s.status,
      detail: s.detail,
      ...(s.status === "CONNECTED" ? { currency: s.currency } : {}),
    };
  }

  // ── MetaApi (abandoned 2026-09-04 — kept dormant for the MT4/MT5 UI flow) ────
  out.METAAPI = {
    configured: Boolean(process.env.METAAPI_TOKEN),
    verdict: process.env.METAAPI_TOKEN ? "UNKNOWN" : "RETIRED",
    detail: "MetaApi path retired after token rejection + unreachable api.metaapi.cloud from production networks.",
  };

  return NextResponse.json(out);
}
