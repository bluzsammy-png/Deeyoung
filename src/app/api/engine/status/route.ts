// DEEYOUNG PRO — OWN PAPER ENGINE STATUS (public audit surface).
// GET /api/engine/status — the visible, auditable state of the autonomous
// paper trading engine. "No lies" rule: reads ONLY real rows from Postgres
// written by real fills at real market prices.
// No auth (like metaapi-diag): aggregates only, no secrets exist here.

import { NextResponse } from "next/server";
import { buildEngineSnapshot } from "@/lib/engine/status-snapshot";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const res = NextResponse.json(await buildEngineSnapshot());
    // Scale hardening: the snapshot is the public audit surface hammered by
    // dashboards, probes and the /status page. 15s edge cache + SWR keeps the
    // DB cool under load without ever showing stale trade state (cycles are 15s).
    res.headers.set("Cache-Control", "public, s-maxage=15, stale-while-revalidate=60");
    return res;
  } catch (e) {
    return NextResponse.json(
      { error: "engine status unavailable", detail: String(e).slice(0, 200) },
      { status: 503 },
    );
  }
}
