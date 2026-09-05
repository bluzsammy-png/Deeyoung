// DEEYOUNG PRO — user broker connections.
//
// Two families, one endpoint:
//   1. DIRECT API platforms (ALPACA | BINANCE | BYBIT | OANDA): the user's own
//      API keys. POST verifies the keys IMMEDIATELY by reading the account
//      with them ("automatically reads the api"); nothing is stored on
//      failure. On success the link is status CONNECTED with a balance
//      snapshot, encrypted credentials at rest (AES-256-GCM, APP_SECRET).
//      A CONNECTED link in FULL mode routes that user's execution LIVE
//      through their broker (src/lib/brokers/user-venue.ts).
//   2. MT4/MT5 (MetaApi bridge, legacy): honest PENDING_BRIDGE while the
//      bridge is not configured. Never pretends.
// Secrets are never returned by any endpoint. INVESTOR (read-only) is the
// recommended default and never routes live orders.

import { NextRequest, NextResponse } from "next/server";
import { withGuard } from "@/lib/guard";
import { db } from "@/lib/db";
import { encryptSecret } from "@/lib/crypto";
import { bridgeConfigured, provisionAccount, accountInformation } from "@/lib/brokers/metaapi";
import {
  LIVE_PLATFORMS,
  PLATFORM_ENV_OPTIONS,
  PLATFORM_ENV_DEFAULTS,
  verifyPlatformAccount,
  type LivePlatform,
} from "@/lib/brokers/user-venue";

export const dynamic = "force-dynamic";

const MT_PLATFORMS = ["MT4", "MT5"];
const MODES = ["INVESTOR", "FULL"];

function maskId(id: string): string {
  if (id.length <= 6) return `${id.slice(0, 2)}****`;
  return `${id.slice(0, 4)}****${id.slice(-4)}`;
}

/** GET /api/brokers — the user's links (never returns secrets). */
export const GET = withGuard(async (_req, { user }) => {
  const links = await db.brokerLink.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  if (bridgeConfigured()) {
    const refreshable = links.filter((l) => l.bridgeAccountId).slice(0, 3);
    await Promise.all(refreshable.map(async (l) => {
      const info = await accountInformation(l.bridgeAccountId as string);
      if (!info) return;
      await db.brokerLink.update({
        where: { id: l.id },
        data: {
          balance: info.balance, equity: info.equity, currency: info.currency,
          status: "CONNECTED", statusDetail: "Live via bridge sync.", lastCheckedAt: new Date(),
        },
      });
      l.balance = info.balance; l.equity = info.equity; l.status = "CONNECTED";
    }));
  }

  return NextResponse.json({
    links: links.map((l) => ({
      id: l.id, platform: l.platform, label: l.label, server: l.server, login: l.login,
      mode: l.mode, status: l.status, statusDetail: l.statusDetail, env: l.env,
      currency: l.currency, balance: l.balance, equity: l.equity,
      verifiedAt: l.verifiedAt, lastCheckedAt: l.lastCheckedAt, createdAt: l.createdAt,
    })),
    bridgeConfigured: bridgeConfigured(),
  });
}, { minPlan: "TRIAL" });

/** POST /api/brokers — connect a broker. Direct platforms are verified on the
 *  spot by reading the account with the submitted keys. */
export const POST = withGuard(async (req: Request, { user }) => {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });

  const platform = String(body.platform ?? "").toUpperCase();
  const mode = String(body.mode ?? "INVESTOR").toUpperCase();
  const label = String(body.label ?? "").trim().slice(0, 60);

  if (![...MT_PLATFORMS, ...LIVE_PLATFORMS].includes(platform)) {
    return NextResponse.json({ error: "INVALID_PLATFORM", message: `Platform must be one of: ${[...MT_PLATFORMS, ...LIVE_PLATFORMS].join(", ")}.` }, { status: 422 });
  }
  if (!MODES.includes(mode)) {
    return NextResponse.json({ error: "INVALID_MODE" }, { status: 422 });
  }

  // ── Legacy MetaApi family (MT4/MT5) ──
  if (MT_PLATFORMS.includes(platform)) {
    const server = String(body.server ?? "").trim().slice(0, 120);
    const login = String(body.login ?? "").trim().slice(0, 40);
    const password = String(body.password ?? "").slice(0, 200);
    if (!server || !login || !password) {
      return NextResponse.json({ error: "MISSING_FIELDS", message: "Server, login and password are all required." }, { status: 422 });
    }
    const creds = { platform: platform as "MT4" | "MT5", server, login, password, mode: mode as "INVESTOR" | "FULL" };
    const bridge = await provisionAccount(creds);
    const { cipher, iv, tag } = encryptSecret(password);

    const link = await db.brokerLink.create({
      data: {
        userId: user.id,
        platform, label: label || `${platform} ${login}`, server, login,
        credCipher: cipher, credIV: iv, credTag: tag,
        mode,
        env: "PAPER",
        status: bridge.status,
        statusDetail: bridge.detail.slice(0, 300),
        bridgeAccountId: bridge.bridgeAccountId ?? null,
        currency: bridge.currency ?? "USD",
        balance: bridge.balance ?? null,
        equity: bridge.equity ?? null,
        lastCheckedAt: new Date(),
      },
      select: { id: true, platform: true, label: true, status: true, statusDetail: true },
    });

    return NextResponse.json({ ok: true, link, bridgeConfigured: bridgeConfigured() });
  }

  // ── Direct API family (ALPACA | BINANCE | BYBIT | OANDA) ──
  const p = platform as LivePlatform;
  const envRaw = String(body.env ?? PLATFORM_ENV_DEFAULTS[p]).toUpperCase();
  if (!PLATFORM_ENV_OPTIONS[p].includes(envRaw)) {
    return NextResponse.json({ error: "INVALID_ENV", message: `Environment must be one of: ${PLATFORM_ENV_OPTIONS[p].join(", ")}.` }, { status: 422 });
  }
  const apiKey = String(body.apiKey ?? "").trim();
  const apiSecret = String(body.apiSecret ?? "").trim();
  const accountId = String(body.accountId ?? "").trim();

  if (p === "OANDA" && (!apiKey || !accountId)) {
    return NextResponse.json({ error: "MISSING_FIELDS", message: "OANDA needs the API token and the account id (practice ids look like 101-001-1234567-001)." }, { status: 422 });
  }
  if (p !== "OANDA" && (!apiKey || !apiSecret)) {
    return NextResponse.json({ error: "MISSING_FIELDS", message: "API key and API secret are both required." }, { status: 422 });
  }

  // Read the account with the user's keys. This is the proof: no keys are
  // stored unless the broker itself answers with a real account snapshot.
  const verdict = await verifyPlatformAccount(p, envRaw, { apiKey, apiSecret, accountId });
  if (!verdict.ok) {
    return NextResponse.json({
      error: "VERIFICATION_FAILED",
      message: `The broker did not accept those credentials. ${verdict.detail}`,
    }, { status: 422 });
  }

  const { cipher, iv, tag } = encryptSecret(JSON.stringify({ apiKey, apiSecret, accountId }));
  const login =
    p === "OANDA" ? accountId
      : p === "ALPACA" ? maskId(apiKey)
        : maskId(apiKey);

  const link = await db.brokerLink.create({
    data: {
      userId: user.id,
      platform: p,
      label: label || `${p} ${envRaw}`,
      server: "",
      login,
      credCipher: cipher, credIV: iv, credTag: tag,
      mode,
      env: envRaw,
      status: "CONNECTED",
      statusDetail: verdict.detail.slice(0, 300),
      currency: verdict.currency ?? "USD",
      balance: verdict.balance ?? null,
      equity: verdict.equity ?? null,
      verifiedAt: new Date(),
      lastCheckedAt: new Date(),
    },
    select: { id: true, platform: true, label: true, status: true, statusDetail: true, env: true, mode: true },
  });

  return NextResponse.json({
    ok: true,
    link,
    liveRouting: mode === "FULL",
    message:
      mode === "FULL"
        ? `Verified by reading your ${p} ${envRaw} account. Your trades now execute LIVE through your broker.`
        : `Verified by reading your ${p} ${envRaw} account. Read-only (INVESTOR) mode: execution stays on paper.`,
  });
}, { minPlan: "TRIAL" });

/** DELETE /api/brokers?id=... — remove a link. The ciphertext dies with the row. */
export const DELETE = withGuard(async (req: Request, { user }) => {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "ID_REQUIRED" }, { status: 400 });
  const res = await db.brokerLink.deleteMany({ where: { id, userId: user.id } });
  if (res.count === 0) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ ok: true });
}, { minPlan: "TRIAL" });
