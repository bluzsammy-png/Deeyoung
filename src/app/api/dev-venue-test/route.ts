// DEV-ONLY venue mirror tester — NEVER COMMIT. Forces mirrorOnEntry/Exit
// with synthetic oids so the full paper→venue mirror path can be audited
// without waiting for a real engine fill.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { mirrorOnEntry, mirrorOnExit } from "@/lib/engine/venue";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as {
    action?: "entry" | "exit"; symbol?: string; notionalUsd?: number; refPrice?: number;
  };
  const symbol = b.symbol || "BTCUSD";
  const now = Date.now();
  try {
    if (b.action === "exit") {
      // close the oldest mirrored open BUY for this symbol
      const buy = await db.venueMirrorOrder.findFirst({
        where: { symbol, side: "BUY", state: "FILLED" },
        orderBy: { createdAt: "asc" },
      });
      if (!buy) return NextResponse.json({ error: "no FILLED BUY to exit" }, { status: 404 });
      const oid = `X_DEVTEST_${now}`;
      await mirrorOnExit({ engineOid: oid, symbol, refPrice: b.refPrice ?? buy.fillPx ?? buy.refPrice, reason: "TARGET" });
      const row = await db.venueMirrorOrder.findUnique({ where: { clientOid: oid } });
      return NextResponse.json({ ok: true, exitRow: row });
    }
    const oid = `E_DEVTEST_${now}`;
    const refPrice = b.refPrice ?? 79000;
    await mirrorOnEntry({
      engineOid: oid, symbol, refPrice,
      notionalUsd: b.notionalUsd ?? 50,
      openMirrorCount: 0, todayNetR: 0,
    });
    const row = await db.venueMirrorOrder.findUnique({ where: { clientOid: oid } });
    return NextResponse.json({ ok: true, entryRow: row });
  } catch (e) {
    return NextResponse.json({ error: String(e).slice(0, 300) }, { status: 500 });
  }
}
