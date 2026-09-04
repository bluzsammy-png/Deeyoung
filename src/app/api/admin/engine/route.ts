// DEEYOUNG PRO — Admin engine-control API (ADMIN only, shared gate).
//   GET  /api/admin/engine → full engine snapshot (account, trades, venue,
//                           feed provenance, build) + runtime control state
//   POST /api/admin/engine → { action: "PAUSE" | "RESUME", reason? }
// Pause semantics: blocks NEW entries; open positions always keep being
// managed to their exits by the runner. Every action is audit-logged with
// the acting admin attached.

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { buildEngineSnapshot } from "@/lib/engine/status-snapshot";
import { getEngineControl, setEnginePaused } from "@/lib/engine/control";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "FORBIDDEN", message: "Admin access required." }, { status: 403 });

  const snapshot = await buildEngineSnapshot();
  const control = await getEngineControl();
  return NextResponse.json({ ok: true, control, snapshot, admin: { email: admin.email, name: admin.name } });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "FORBIDDEN", message: "Admin access required." }, { status: 403 });

  const body = await req.json().catch(() => null);
  const action = String(body?.action ?? "").toUpperCase();
  const reason = String(body?.reason ?? "").trim();

  if (!["PAUSE", "RESUME"].includes(action)) {
    return NextResponse.json({ error: "Invalid action — use PAUSE or RESUME." }, { status: 400 });
  }
  if (action === "PAUSE" && reason.length < 3) {
    return NextResponse.json({ error: "A reason (3+ chars) is required to pause the engine — it is audited." }, { status: 422 });
  }

  const control = await setEnginePaused(action === "PAUSE", reason || null, admin.email);

  await db.auditEvent.create({
    data: {
      userId: admin.id,
      category: "ADMIN",
      action: `ENGINE_${action}`,
      detail: JSON.stringify({ paused: control.paused, reason: control.reason }),
    },
  });

  return NextResponse.json({ ok: true, control });
}
