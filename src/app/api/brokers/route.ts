// DEEYOUNG PRO — user broker connections.
//
// Three families, one endpoint:
//   1. DIRECT API platforms (ALPACA | BINANCE | BYBIT | OANDA): the user's own
//      API keys. POST verifies the keys IMMEDIATELY by reading the account
//      with them ("automatically reads the api"); nothing is stored on
//      failure. On success the link is status CONNECTED with a balance
//      snapshot, encrypted credentials at rest (AES-256-GCM, APP_SECRET).
//   2. DERIV (native): the user's own Deriv API token, verified on the spot
//      through Deriv's official websocket API. No third-party bridge, no
//      MetaTrader password, no external account.
//   3. MT4 | MT5 (any broker, including Deriv MT5): MetaTrader has no official
//      web API, so we ship OUR OWN bridge: the user installs the QuantEdge EA
//      on their terminal, the EA authenticates with a per-link bridge token
//      (shown once, stored hashed) and polls this server for commands. The
//      first handshake flips the link CONNECTED. No third-party service, no
//      account password ever leaves the terminal.
//
// A CONNECTED link in FULL mode with autoMirror=true follows the engine live
// (src/lib/engine/fanout.ts). Secrets are never returned by any endpoint.

import { NextResponse } from "next/server";
import { withGuard } from "@/lib/guard";
import { db } from "@/lib/db";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import {
  bridgeConfigured,
  bridgeToken,
  accountInformation,
} from "@/lib/brokers/metaapi";
import { derivAuthorize } from "@/lib/brokers/deriv";
import {
  newBridgeToken,
  hashBridgeToken,
  bridgeLive,
  EA_VERSION,
} from "@/lib/brokers/bridge";
import {
  LIVE_PLATFORMS,
  MT_PLATFORMS,
  PLATFORM_ENV_OPTIONS,
  PLATFORM_ENV_DEFAULTS,
  verifyPlatformAccount,
  type LivePlatform,
} from "@/lib/brokers/user-venue";

export const dynamic = "force-dynamic";

const MT_PLATFORM_LIST: string[] = [...MT_PLATFORMS];

function maskId(id: string): string {
  if (id.length <= 6) return `${id.slice(0, 2)}****`;
  return `${id.slice(0, 4)}****${id.slice(-4)}`;
}

function clamp(v: unknown, min: number, max: number, fallback: number | null): number | null {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(max, Math.max(min, Math.round(n * 100) / 100));
}

/** GET /api/brokers — the user's links (never returns secrets). */
export const GET = withGuard(async (_req, { user }) => {
  const links = await db.brokerLink.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  // Refresh up to 3 LEGACY MT bridge links from MetaApi itself (balance
  // snapshot). Own-bridge links need no outbound call: their terminal reports
  // in on every poll.
  const refreshable = links
    .filter((l) => l.bridgeAccountId && !l.bridgeTokenHash && MT_PLATFORM_LIST.includes(l.platform))
    .slice(0, 3);
  await Promise.all(refreshable.map(async (l) => {
    const credsRaw = decryptSecret({ cipher: l.credCipher, iv: l.credIV, tag: l.credTag });
    let userToken = "";
    try { userToken = credsRaw ? (JSON.parse(credsRaw) as { metaapiToken?: string }).metaapiToken ?? "" : ""; } catch { userToken = ""; }
    const token = bridgeToken(userToken);
    if (!token) return;
    const info = await accountInformation(l.bridgeAccountId as string, token);
    if (info.ok && info.info) {
      await db.brokerLink.update({
        where: { id: l.id },
        data: {
          balance: info.info.balance, equity: info.info.equity, currency: info.info.currency,
          status: "CONNECTED", statusDetail: "Live via bridge sync.", lastCheckedAt: new Date(),
        },
      });
      l.balance = info.info.balance; l.equity = info.info.equity; l.status = "CONNECTED";
    } else if (info.code === 401) {
      await db.brokerLink.update({
        where: { id: l.id },
        data: { status: "ERROR", statusDetail: "MetaApi rejected the stored token. Reconnect the account.", lastCheckedAt: new Date() },
      });
      l.status = "ERROR";
    }
  }));

  return NextResponse.json({
    links: links.map((l) => ({
      id: l.id, platform: l.platform, label: l.label, server: l.server, login: l.login,
      mode: l.mode, status: l.status, statusDetail: l.statusDetail, env: l.env,
      currency: l.currency, balance: l.balance, equity: l.equity,
      autoMirror: l.autoMirror, autoLots: l.autoLots, autoStakeUsd: l.autoStakeUsd,
      autoNotionalUsd: l.autoNotionalUsd,
      eaVersion: l.eaVersion,
      bridgeLive: l.bridgeTokenHash ? bridgeLive(l.lastHandshakeAt) : undefined,
      lastHandshakeAt: l.lastHandshakeAt,
      verifiedAt: l.verifiedAt, lastCheckedAt: l.lastCheckedAt, createdAt: l.createdAt,
    })),
    bridgeConfigured: bridgeConfigured(),
    ea: { version: EA_VERSION, mq5: "/broker/QuantEdgeBridge.mq5", mq4: "/broker/QuantEdgeBridge.mq4" },
  });
}, { minPlan: "TRIAL" });

/** POST /api/brokers — connect a broker. Every family is verified on the spot
 *  by reading the account with the submitted credentials before storage. */
export const POST = withGuard(async (req: Request, { user }) => {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });

  const platform = String(body.platform ?? "").toUpperCase();
  const label = String(body.label ?? "").trim().slice(0, 60);

  // ── DERIV (native API, user's own token) ──
  if (platform === "DERIV") {
    const apiToken = String(body.apiToken ?? "").trim().slice(0, 200);
    if (!apiToken) {
      return NextResponse.json({ error: "MISSING_FIELDS", message: "Paste the API token from your Deriv account (Settings > API token, with read and trade scopes)." }, { status: 422 });
    }
    const auth = await derivAuthorize(apiToken);
    if (!auth.ok || !auth.data) {
      return NextResponse.json({ error: "VERIFICATION_FAILED", message: auth.detail }, { status: 422 });
    }
    const acc = auth.data;
    const { cipher, iv, tag } = encryptSecret(JSON.stringify({ apiToken }));
    const link = await db.brokerLink.create({
      data: {
        userId: user.id,
        platform: "DERIV",
        label: label || `Deriv ${acc.isVirtual ? "demo" : "real"} ${acc.loginid}`,
        server: "deriv-api",
        login: acc.loginid,
        credCipher: cipher, credIV: iv, credTag: tag,
        mode: "FULL",
        env: acc.isVirtual ? "DEMO" : "LIVE",
        status: "CONNECTED",
        statusDetail: `Verified by reading your Deriv ${acc.isVirtual ? "DEMO" : "REAL"} account (${acc.loginid}, ${acc.balance} ${acc.currency}). Engine signals now mirror onto this account automatically.`,
        currency: acc.currency,
        balance: acc.balance,
        equity: acc.balance,
        verifiedAt: new Date(),
        lastCheckedAt: new Date(),
      },
      select: { id: true, platform: true, label: true, status: true, statusDetail: true, env: true, mode: true },
    });
    return NextResponse.json({
      ok: true,
      link,
      liveRouting: true,
      message: acc.isVirtual
        ? `Verified against your Deriv DEMO account ${acc.loginid}. Engine signals will execute on this demo account automatically.`
        : `Verified against your Deriv REAL account ${acc.loginid}. Engine signals now execute LIVE on this account automatically.`,
    });
  }

  // ── MT4/MT5 (own EA bridge — no third party, no account password) ──
  if (MT_PLATFORM_LIST.includes(platform)) {
    const server = String(body.server ?? "").trim().slice(0, 120);
    const login = String(body.login ?? "").trim().slice(0, 40);
    const token = newBridgeToken();
    // No broker password exists on this server: the EA runs on the user's
    // own logged-in terminal. Store an empty-cred payload so legacy code
    // that decrypts creds keeps working.
    const emptyCreds = encryptSecret(JSON.stringify({}));
    const link = await db.brokerLink.create({
      data: {
        userId: user.id,
        platform,
        label: label || `${platform} account`,
        server,
        login,
        credCipher: emptyCreds.cipher,
        credIV: emptyCreds.iv,
        credTag: emptyCreds.tag,
        mode: "FULL",
        env: "BROKER",
        status: "PENDING_BRIDGE",
        statusDetail: "Bridge key issued. Install the EA on your terminal; it connects automatically.",
        bridgeTokenHash: hashBridgeToken(token),
        eaVersion: null,
        verifiedAt: null,
        lastCheckedAt: new Date(),
      },
      select: { id: true, platform: true, label: true, status: true, statusDetail: true, env: true, mode: true },
    });
    return NextResponse.json({
      ok: true,
      link,
      bridgeToken: token, // shown once; only its SHA-256 is stored
      liveRouting: true,
      ea: { version: EA_VERSION, mq5: "/broker/QuantEdgeBridge.mq5", mq4: "/broker/QuantEdgeBridge.mq4" },
      message:
        `Bridge key issued for this ${platform} link. Download the EA, compile it in MetaEditor, attach it to any chart, ` +
        `paste the key and this site's URL, and it connects automatically. The key is shown once; generate a new link if you lose it.`,
    });
  }

  // ── Direct API family (ALPACA | BINANCE | BYBIT | OANDA) ──
  const allowedPlatforms: string[] = [...LIVE_PLATFORMS];
  if (!allowedPlatforms.includes(platform)) {
    return NextResponse.json({ error: "INVALID_PLATFORM", message: `Platform must be one of: DERIV, ${MT_PLATFORM_LIST.join(", ")}, ${allowedPlatforms.join(", ")}.` }, { status: 422 });
  }
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
  const loginId = p === "OANDA" ? accountId : maskId(apiKey);

  const link = await db.brokerLink.create({
    data: {
      userId: user.id,
      platform: p,
      label: label || `${p} ${envRaw}`,
      server: "",
      login: loginId,
      credCipher: cipher, credIV: iv, credTag: tag,
      mode: "FULL",
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
    liveRouting: true,
    message: `Verified by reading your ${p} ${envRaw} account. Engine signals now execute LIVE through your broker automatically.`,
  });
}, { minPlan: "TRIAL" });

/** PATCH /api/brokers — auto-mirror toggle and per-link sizing. */
export const PATCH = withGuard(async (req: Request, { user }) => {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body?.id) return NextResponse.json({ error: "ID_REQUIRED" }, { status: 400 });
  const link = await db.brokerLink.findFirst({ where: { id: String(body.id), userId: user.id } });
  if (!link) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (typeof body.autoMirror === "boolean") data.autoMirror = body.autoMirror;
  if (body.autoLots !== undefined) data.autoLots = clamp(body.autoLots, 0.01, 10, link.autoLots);
  if (body.autoStakeUsd !== undefined) data.autoStakeUsd = clamp(body.autoStakeUsd, 1, 100, link.autoStakeUsd);
  if (body.autoNotionalUsd !== undefined) data.autoNotionalUsd = clamp(body.autoNotionalUsd, 10, 1000, link.autoNotionalUsd);
  if (Object.keys(data).length === 0) return NextResponse.json({ error: "NOTHING_TO_UPDATE" }, { status: 422 });

  const updated = await db.brokerLink.update({ where: { id: link.id }, data });
  return NextResponse.json({
    ok: true,
    link: {
      id: updated.id, autoMirror: updated.autoMirror, autoLots: updated.autoLots,
      autoStakeUsd: updated.autoStakeUsd, autoNotionalUsd: updated.autoNotionalUsd,
    },
  });
}, { minPlan: "TRIAL" });

/** DELETE /api/brokers?id=... — remove a link. The ciphertext and the bridge
 *  token hash die with the row; the EA starts getting 401 immediately. */
export const DELETE = withGuard(async (req: Request, { user }) => {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "ID_REQUIRED" }, { status: 400 });
  const res = await db.brokerLink.deleteMany({ where: { id, userId: user.id } });
  if (res.count === 0) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ ok: true });
}, { minPlan: "TRIAL" });
