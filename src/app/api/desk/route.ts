// DEEYOUNG PRO — public Cross-Market Playbook Desk.
// GET /api/desk — computed factor-engine reads across FX, metals, energy,
// indices and stocks. Deliberately public (homepage proof surface, same
// rationale as /api/engine/status): aggregates only, no user data, no secrets.
// Never fabricated: symbols without a good read are simply absent.

import { NextResponse } from "next/server";
import { deskSnapshot } from "@/lib/engine/desk";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const res = NextResponse.json(await deskSnapshot());
    res.headers.set("Cache-Control", "public, s-maxage=120, stale-while-revalidate=300");
    return res;
  } catch (e) {
    return NextResponse.json(
      { error: "desk unavailable", detail: String(e).slice(0, 200) },
      { status: 503 },
    );
  }
}
