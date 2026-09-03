import { NextResponse } from "next/server";
import { cacheStats, upstreamHealth } from "@/lib/providers/market";
import { db } from "@/lib/db";
import { mailTransport } from "@/lib/email";

export const dynamic = "force-dynamic";

/** GET /api/health — visible internal health system (§60) + boot diagnostics.
 *  The `env` block exposes PRESENCE booleans only (never values) so a failed
 *  Railway deploy can be diagnosed from the outside without shell access. */
export async function GET() {
  const sources: Record<string, { state: string; detail: string }> = {};

  // Market data
  const mh = upstreamHealth();
  sources.MARKET_DATA = {
    state: mh.healthy ? "HEALTHY" : "DEGRADED",
    detail: mh.healthy ? "Upstream quotes responding; shared cache warm" : `${mh.recentErrors} recent upstream errors — simulated fallback may engage`,
  };

  // News
  const finnhub = Boolean(process.env.FINNHUB_API_KEY);
  sources.NEWS = finnhub
    ? { state: "HEALTHY", detail: "Finnhub key configured (BYOK)" }
    : { state: "DEGRADED", detail: "No news provider key — feed shows NEWS DATA UNAVAILABLE by design" };

  // AI
  sources.AI = { state: "HEALTHY", detail: "Z.ai SDK available server-side" };

  // Database
  try {
    await db.systemEvent.count();
    sources.DATABASE = { state: "HEALTHY", detail: "Read/write OK" };
  } catch {
    sources.DATABASE = { state: "DOWN", detail: "Database unreachable" };
  }

  // Outbound mail
  const transport = mailTransport();
  sources.MAIL =
    transport === "dry"
      ? { state: "DEGRADED", detail: "No mail transport configured — auth links print to server console (dry mode)" }
      : { state: "HEALTHY", detail: `Outbound mail via ${transport}` };

  sources.BROKER = { state: "HEALTHY", detail: "DeeYoung Simulated paper broker active; Alpaca awaits BYOK keys" };
  sources.NOTIFICATIONS = { state: "HEALTHY", detail: "Web channel active" };

  const overall = Object.values(sources).some((s) => s.state === "DOWN")
    ? "DOWN"
    : Object.values(sources).some((s) => s.state === "DEGRADED")
      ? "DEGRADED"
      : "HEALTHY";

  const env = {
    DATABASE_URL: Boolean(process.env.DATABASE_URL),
    BETTER_AUTH_SECRET: Boolean(process.env.BETTER_AUTH_SECRET),
    BETTER_AUTH_URL: Boolean(process.env.BETTER_AUTH_URL),
    APP_SECRET: Boolean(process.env.APP_SECRET),
    ADMIN_EMAILS: Boolean(process.env.ADMIN_EMAILS),
    MAIL_TRANSPORT: transport,
    MEDIA_KIT: process.env.NEXT_PUBLIC_MEDIA_KIT === "on",
  };

  return NextResponse.json({ overall, sources, env, cache: cacheStats(), asOf: Date.now() });
}
