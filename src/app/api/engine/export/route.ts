// DEEYOUNG PRO — public ledger CSV export (recommendations round, free).
// GET /api/engine/export — the full closed-trade ledger of the current run as
// text/csv. Same data as the public /status page (aggregates + ledger only,
// no secrets, no user data), in a form a spreadsheet can open. "No lies"
// rule: rows are read straight from Postgres, written by real fills.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getOrCreateRun } from "@/lib/engine/paper";

export const dynamic = "force-dynamic";

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET() {
  try {
    const { run } = await getOrCreateRun();
    const rows = await db.paperEnginePosition.findMany({
      where: { runId: run.id, status: "CLOSED" },
      orderBy: { closedAt: "asc" },
    });
    const header = [
      "bookKey", "symbol", "gate", "horizonMin", "side", "qty",
      "entryPrice", "exitPrice", "exitReason", "score", "rr",
      "grossPnlUsd", "feesNote", "netPnlUsd", "netR", "openedAt", "closedAt",
    ];
    // Fees are inside netPnlUsd (10bps/side) and slippage (2bps/side) — stated
    // in the comment row instead of a per-row column we do not store per fill.
    const lines = [
      header.join(","),
      ...rows.map((p) => [
        p.bookKey, p.symbol, p.gate, p.horizonMin, p.side, p.qty,
        p.entryPrice, p.exitPrice, p.exitReason, p.score, p.rr,
        p.grossPnlUsd, "net includes 10bps/side fee + 2bps/side slippage", p.netPnlUsd, p.netR,
        p.openedAt.toISOString(), p.closedAt?.toISOString() ?? "",
      ].map(csvCell).join(",")),
    ];
    const body = lines.join("\n");
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="deeyoung-engine-ledger-${run.id.slice(0, 8)}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: "ledger export unavailable", detail: String(e).slice(0, 200) },
      { status: 503 },
    );
  }
}
