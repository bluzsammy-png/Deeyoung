// DEEYOUNG PRO — public site content overrides.
// GET — returns { key: value } for every whitelisted key that has an override.
// Public by design: it is the landing page's own copy. No secrets, no user
// data, capped sizes. Cached briefly to absorb landing traffic.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { CONTENT_KEYS } from "@/lib/site-content";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await db.siteContent.findMany({
      where: { key: { in: [...CONTENT_KEYS] } },
      select: { key: true, value: true },
    });
    const out: Record<string, string> = {};
    for (const r of rows) if (r.value) out[r.key] = r.value;
    return NextResponse.json(out, { headers: { "Cache-Control": "public, max-age=30" } });
  } catch {
    // content service is strictly additive — a failure must never break the page
    return NextResponse.json({}, { headers: { "Cache-Control": "public, max-age=30" } });
  }
}
