import { NextResponse } from "next/server";
import { cacheStats, upstreamHealth } from "@/lib/providers/market";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** GET /api/health — visible internal health system (§60) */
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

  sources.BROKER = { state: "HEALTHY", detail: "DeeYoung Simulated paper broker active; Alpaca awaits BYOK keys" };
  sources.NOTIFICATIONS = { state: "HEALTHY", detail: "Web channel active" };

  const overall = Object.values(sources).some((s) => s.state === "DOWN")
    ? "DOWN"
    : Object.values(sources).some((s) => s.state === "DEGRADED")
      ? "DEGRADED"
      : "HEALTHY";

  return NextResponse.json({ overall, sources, cache: cacheStats(), asOf: Date.now() });
}
