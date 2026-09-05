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
import { requireAdmin } from "@/lib/admin";
import { oandaConfigured, oandaAccountSummary } from "@/lib/brokers/oanda";
import { bybitConfigured, bybitAccountSummary, bybitEnvLabel } from "@/lib/brokers/bybit";
import { alpacaConfigured, alpacaAccountSummary, alpacaEnvLabel } from "@/lib/brokers/alpaca";
import { binanceTestnetAccountSummary } from "@/lib/brokers/binance-testnet";
import { okxConfigured, okxAccountSummary, okxEnvLabel } from "@/lib/brokers/okx";
import { venueMode } from "@/lib/engine/venue";
import { twelvedataConfigured, twelvedataStatus } from "@/lib/market/twelvedata";
import { feedSource } from "@/lib/engine/feed";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  // Admin-only: operational venue diagnostics are not a public surface.
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

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

  // ── OKX (live venue — 2026-09-04 "go" build; demo-first ramp) ────────────
  {
    const s = await okxAccountSummary();
    out.OKX = {
      configured: okxConfigured(),
      env: okxEnvLabel(),
      executionVenue: venueMode(),
      verdict: s.verdict,
      detail:
        s.verdict === "PENDING_KEYS"
          ? "OKX_API_KEY / OKX_API_SECRET / OKX_API_PASSPHRASE not set. Create OKX demo API keys (Demo Trading → API) and set them on Railway to arm the live mirror; paper engine stays primary until then."
          : s.verdict === "KEYS_VALID"
            ? `keys valid in ${s.latencyMs}ms (${s.env}); mirror armed with hard rails: LIVE_MAX_NOTIONAL_USD, LIVE_MAX_OPEN, LIVE_DAILY_R_STOP`
            : s.detail,
      ...(s.usdtCashBal ? { usdtCashBal: s.usdtCashBal } : {}),
    };
  }

  // ── BINANCE_TESTNET (dormant — venue kept for future keys) ────────────────
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

  // ── MetaApi (MT4/MT5 bridge, per-user tokens since 2026-09-05) ────────────────
  // The bridge no longer needs a server-wide METAAPI_TOKEN: each MT4/MT5
  // BrokerLink stores the user's own MetaApi token (encrypted) and connect /
  // execution calls authorize with it. Env token remains an optional fallback.
  {
    const mtLinks = await db.brokerLink.count({ where: { platform: { in: ["MT4", "MT5"] } } }).catch(() => -1);
    // Reachability probe from THIS server with a garbage token: 401/403 means
    // the documented endpoint is reachable and enforcing auth; a network
    // error means this network cannot reach the bridge at all.
    let reach = "UNTESTED";
    try {
      const r = await fetch("https://api-v1.metaapi.cloud/users/current/accounts", {
        headers: { "auth-token": "diag-probe-garbage-token" },
        signal: AbortSignal.timeout(8_000),
      }).catch(() => null);
      reach = !r ? "UNREACHABLE from this server" : r.status === 401 || r.status === 403 ? "REACHABLE, auth enforced" : `HTTP ${r.status}`;
    } catch { reach = "UNREACHABLE from this server"; }
    out.METAAPI = {
      configured: true,
      verdict: reach.startsWith("REACHABLE") ? "OPERATIONAL" : "DEGRADED",
      reachability: reach,
      detail: `MT4/MT5 bridge active with per-user MetaApi tokens. Bridge links stored: ${mtLinks >= 0 ? mtLinks : "count failed"}. Hosts: api-v1.metaapi.cloud then mt-provisioning-api-v1.agiliumtrade.ai (provisioning), mt-client-api-v1.agiliumtrade.ai (trading).`,
    };
  }

  return NextResponse.json(out);
}
