// DEEYOUNG PRO — broker bridge diagnostics (§broker-bridge).
// GET /api/brokers/metaapi-diag — kept for continuity; reports ALL venues:
//   PAPER (PRIMARY execution path since 2026-09-04: OWN Postgres paper engine),
//   TWELVEDATA (user-directed data venue; keyless public feed is the fallback),
//   BINANCE_TESTNET (dormant — signup unreachable from datacenter IP),
//   Alpaca (dormant — user shelved venue 2026-09-04),
//   Bybit (dormant — website geo-blocked from user's location),
//   OANDA (dormant — no Nigerian onboarding), MetaApi (retired).
// Returns ONLY aggregate facts (status codes, counts, verdict words). Never
// echoes keys, secrets, account ids or balances — health-route presence-boolean pattern.

import { NextResponse } from "next/server";
import { oandaConfigured, oandaAccountSummary } from "@/lib/brokers/oanda";
import { bybitConfigured, bybitAccountSummary, bybitEnvLabel } from "@/lib/brokers/bybit";
import { alpacaConfigured, alpacaAccountSummary, alpacaEnvLabel } from "@/lib/brokers/alpaca";
import { binanceTestnetAccountSummary } from "@/lib/brokers/binance-testnet";
import { twelvedataConfigured, twelvedataStatus } from "@/lib/market/twelvedata";
import { feedSource } from "@/lib/engine/feed";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const out: Record<string, unknown> = {};

  // ── PAPER (PRIMARY — own engine, Postgres execution-of-record) ───────────────
  {
    const t0 = Date.now();
    try {
      const [openN, closedN, orderN] = await Promise.all([
        db.paperEnginePosition.count({ where: { status: "OPEN" } }),
        db.paperEnginePosition.count({ where: { status: "CLOSED" } }),
        db.paperEngineOrder.count(),
      ]);
      out.PAPER = {
        configured: true,
        primary: true,
        verdict: "OPERATIONAL",
        detail: `own paper engine live: ${openN} open, ${closedN} closed, ${orderN} orders persisted — fills at observed market prices, 2bps slip + 10bps fee per side`,
        counts: { open: openN, closed: closedN, orders: orderN },
        dbLatencyMs: Date.now() - t0,
        audit: "/api/engine/status",
      };
    } catch (e) {
      out.PAPER = {
        configured: true,
        primary: true,
        verdict: "ERROR",
        detail: `paper engine tables unreachable: ${String(e).slice(0, 120)}`,
      };
    }
  }

  // ── TWELVEDATA (data venue — user-directed; signup Cloudflare-gated from DC IPs) ─
  {
    const s = twelvedataStatus();
    out.TWELVEDATA = {
      configured: s.configured,
      verdict: s.configured ? (s.lastError ? "DEGRADED_FALLBACK" : "ACTIVE") : "PENDING_KEY",
      detail: s.configured
        ? `key present; used ${s.dayUsed}/780 daily, ${s.minuteUsed}/7 per-min credits${s.lastError ? `; lastError=${s.lastError}` : ""}`
        : "no TWELVEDATA_API_KEY — signup form is Cloudflare-Turnstile-gated from datacenter IPs (verified 2026-09-04); keyless Binance public feed is the active data source, adapter lights up the moment a key is set",
      activeFeed: feedSource(),
      ...(s.lastOkAt ? { lastOkAt: new Date(s.lastOkAt).toISOString() } : {}),
    };
  }

  // ── BINANCE_TESTNET (dormant — venue kept for future keys) ────────────────────
  {
    const s = await binanceTestnetAccountSummary();
    out.BINANCE_TESTNET = {
      configured: s.verdict !== "PENDING_BRIDGE",
      base: "testnet.binance.vision",
      verdict: s.verdict,
      detail:
        s.verdict === "PENDING_BRIDGE"
          ? "BINANCE_TESTNET_KEY / BINANCE_TESTNET_SECRET not set. Dormant: own paper engine is the primary execution path since 2026-09-04."
          : `accountType=${s.accountType ?? "?"} canTrade=${String(s.canTrade)} balancesOverZero=${s.balancesOverZero ?? "?"} in ${s.latencyMs ?? "?"}ms`,
      ...(s.errorDetail ? { errorDetail: s.errorDetail } : {}),
    };
  }

  // ── Alpaca (dormant 2026-09-04 — venue shelved per user decision) ───────────
  if (!alpacaConfigured()) {
    out.ALPACA = {
      configured: false, verdict: "NO_KEYS",
      detail: "ALPACA_KEY_ID / ALPACA_SECRET_KEY not set. Venue shelved; bridge dormant by design.",
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
