import { NextRequest, NextResponse } from "next/server";
import { withGuard } from "@/lib/guard";
import { db } from "@/lib/db";
import { encryptSecret } from "@/lib/crypto";
import { bridgeConfigured, testAccount } from "@/lib/brokers/metaapi";

export const dynamic = "force-dynamic";

const PLATFORMS = ["MT4", "MT5"];
const MODES = ["INVESTOR", "FULL"];

/** GET /api/brokers — list the user's linked MetaTrader accounts (never returns secrets). */
export const GET = withGuard(async (_req, { user }) => {
  const links = await db.brokerLink.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, platform: true, label: true, server: true, login: true, mode: true,
      status: true, statusDetail: true, currency: true, balance: true, equity: true,
      lastCheckedAt: true, createdAt: true,
    },
  });
  return NextResponse.json({ links, bridgeConfigured: bridgeConfigured() });
}, { minPlan: "TRIAL" });

/** POST /api/brokers — link an MT4/MT5 account. Password is AES-256-GCM encrypted
 *  at rest with APP_SECRET; INVESTOR (read-only) mode is recommended and defaults. */
export const POST = withGuard(async (req: NextRequest, { user }) => {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });

  const platform = String(body.platform ?? "").toUpperCase();
  const server = String(body.server ?? "").trim().slice(0, 120);
  const login = String(body.login ?? "").trim().slice(0, 40);
  const password = String(body.password ?? "").slice(0, 200);
  const mode = String(body.mode ?? "INVESTOR").toUpperCase();
  const label = String(body.label ?? "").trim().slice(0, 60) || `${platform} ${login}`;

  if (!PLATFORMS.includes(platform)) {
    return NextResponse.json({ error: "INVALID_PLATFORM", message: "Platform must be MT4 or MT5." }, { status: 422 });
  }
  if (!server || !login || !password) {
    return NextResponse.json({ error: "MISSING_FIELDS", message: "Server, login and password are all required." }, { status: 422 });
  }
  if (!MODES.includes(mode)) {
    return NextResponse.json({ error: "INVALID_MODE" }, { status: 422 });
  }

  const creds = { platform: platform as "MT4" | "MT5", server, login, password, mode: mode as "INVESTOR" | "FULL" };
  const bridge = await testAccount(creds);
  const { cipher, iv, tag } = encryptSecret(password);

  const link = await db.brokerLink.create({
    data: {
      userId: user.id,
      platform, label, server, login,
      credCipher: cipher, credIV: iv, credTag: tag,
      mode,
      status: bridge.status,
      statusDetail: bridge.detail.slice(0, 300),
      currency: bridge.currency ?? "USD",
      balance: bridge.balance ?? null,
      equity: bridge.equity ?? null,
      lastCheckedAt: new Date(),
    },
    select: { id: true, platform: true, label: true, status: true, statusDetail: true },
  });

  return NextResponse.json({ ok: true, link, bridgeConfigured: bridgeConfigured() });
}, { minPlan: "TRIAL" });

/** DELETE /api/brokers?id=... — remove a link. The ciphertext dies with the row. */
export const DELETE = withGuard(async (req: NextRequest, { user }) => {
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "ID_REQUIRED" }, { status: 400 });
  const res = await db.brokerLink.deleteMany({ where: { id, userId: user.id } });
  if (res.count === 0) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ ok: true });
}, { minPlan: "TRIAL" });
