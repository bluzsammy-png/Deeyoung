// DEEYOUNG PRO — MetaApi bridge diagnostics (§broker-bridge).
// GET /api/brokers/metaapi-diag — proves, from the production network, whether
// METAAPI_TOKEN is accepted by the MetaApi provisioning endpoint and how many
// trading accounts are linked. Deliberately returns ONLY aggregate facts:
// HTTP status code, account count, and a verdict word. Never echoes the token,
// account ids, balances or server names — the health-route presence-boolean
// pattern (§60) applies here.

import { NextResponse } from "next/server";
import { bridgeConfigured } from "@/lib/brokers/metaapi";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!bridgeConfigured()) {
    return NextResponse.json({
      configured: false,
      status: "PENDING_BRIDGE",
      verdict: "NO_TOKEN",
      detail: "METAAPI_TOKEN is not set on the server. Bridge dormant by design.",
    });
  }
  const api = process.env.METAAPI_API_URL || "https://api.metaapi.cloud";
  try {
    const res = await fetch(`${api}/accounts-api/v2.0/accounts`, {
      headers: {
        "auth-token": process.env.METAAPI_TOKEN as string,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 401 || res.status === 403) {
      return NextResponse.json({
        configured: true,
        httpStatus: res.status,
        verdict: "TOKEN_REJECTED",
        detail: "The bridge token was rejected by MetaApi. Generate a new token from the MetaApi section (not Manager API) of the dashboard.",
      });
    }
    if (!res.ok) {
      return NextResponse.json({
        configured: true,
        httpStatus: res.status,
        verdict: "BRIDGE_ERROR",
        detail: "Bridge endpoint answered with an unexpected status.",
      });
    }
    const list = (await res.json().catch(() => null)) as unknown[] | null;
    const count = Array.isArray(list) ? list.length : null;
    return NextResponse.json({
      configured: true,
      httpStatus: res.status,
      accountCount: count,
      verdict: count === null ? "BRIDGE_ERROR" : "TOKEN_VALID",
      detail: count === null
        ? "Bridge answered but the payload shape was unexpected."
        : `Token accepted. Trading accounts linked to the bridge: ${count}.`,
    });
  } catch {
    return NextResponse.json({
      configured: true,
      verdict: "BRIDGE_UNREACHABLE",
      detail: "Couldn't reach the MetaApi bridge from this server. Retry shortly.",
    });
  }
}
