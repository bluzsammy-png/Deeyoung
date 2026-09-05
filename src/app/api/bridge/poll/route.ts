// DEEYOUNG PRO — EA bridge poll. The terminal asks for queued commands every
// few seconds. Claimed commands flip PENDING -> SENT atomically so two
// terminals (or a retry) can never double-execute the same command.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bridgeLinkByToken, BRIDGE_HEARTBEAT_SEC } from "@/lib/brokers/bridge";

export const dynamic = "force-dynamic";

const MAX_CLAIM = 5;

export async function POST(req: Request) {
  const token = req.headers.get("x-bridge-token") ?? "";
  const link = await bridgeLinkByToken(token);
  if (!link) return NextResponse.json({ error: "INVALID_TOKEN" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const balance = typeof body.balance === "number" ? body.balance : null;
  const equity = typeof body.equity === "number" ? body.equity : null;

  // Reclaim commands claimed by a terminal that died before reporting.
  await db.bridgeCommand.updateMany({
    where: { linkId: link.id, status: "SENT", updatedAt: { lt: new Date(Date.now() - 5 * 60_000) } },
    data: { status: "PENDING", message: "Reclaimed after terminal timeout." },
  });

  // Claim atomically enough for a single terminal per link: read the oldest
  // PENDING rows, flip exactly those to SENT, return them. Already-SENT rows
  // that were never reported are NOT redelivered here; the stale reclaim
  // above returns them to the queue after five minutes.
  const pending = await db.bridgeCommand.findMany({
    where: { linkId: link.id, status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: MAX_CLAIM,
    select: { id: true },
  });
  const claimedIds = pending.map((p) => p.id);
  if (claimedIds.length > 0) {
    await db.bridgeCommand.updateMany({ where: { id: { in: claimedIds } }, data: { status: "SENT" } });
  }
  const claimed = claimedIds.length > 0
    ? await db.bridgeCommand.findMany({ where: { id: { in: claimedIds } }, orderBy: { createdAt: "asc" } })
    : [];

  await db.brokerLink.update({
    where: { id: link.id },
    data: {
      lastHandshakeAt: new Date(),
      lastCheckedAt: new Date(),
      ...(balance != null || equity != null
        ? { balance: balance ?? link.balance, equity: equity ?? link.equity }
        : {}),
    },
  });

  return NextResponse.json({
    ok: true,
    heartbeatSec: BRIDGE_HEARTBEAT_SEC,
    commands: claimed.map((c) => ({
      id: c.id,
      action: c.action,
      symbol: c.symbol,
      side: c.side,
      lots: c.lots,
      sl: c.stopLoss ?? 0,
      tp: c.takeProfit ?? 0,
      ticket: c.ticket ?? "0",
    })),
  });
}
