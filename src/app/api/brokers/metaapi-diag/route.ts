// DEEYOUNG PRO — broker bridge diagnostics (§broker-bridge).
// GET /api/brokers/metaapi-diag — kept for continuity; now reports BOTH venues:
//   OANDA (primary FX execution venue since 2026-09-04) and MetaApi (dormant).
// Returns ONLY aggregate facts (status codes, counts, verdict words). Never
// echoes tokens, account ids or balances — health-route presence-boolean pattern.

import { NextResponse } from "next/server";
import { oandaConfigured, oandaAccountSummary } from "@/lib/brokers/oanda";

export const dynamic = "force-dynamic";

export async function GET() {
  const out: Record<string, unknown> = {};

  // ── OANDA (primary) ──────────────────────────────────────────────────────────
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
