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
    return NextResponse.json(await buildEngineSnapshot());
  } catch (e) {
    return NextResponse.json(
      { error: "engine status unavailable", detail: String(e).slice(0, 200) },
      { status: 503 },
    );
  }
}
