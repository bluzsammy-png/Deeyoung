// DEEYOUNG PRO — EA bridge report. The terminal reports what actually happened
// to claimed commands. Fills exist ONLY when the terminal reports them; a
// failed close on a mirrored position is re-queued (bounded) because leaving a
// live mirror open after the engine closed would be a silent risk leak.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bridgeLinkByToken } from "@/lib/brokers/bridge";

export const dynamic = "force-dynamic";

const MAX_CLOSE_RETRIES = 3;

interface ReportRow {
  id: string;
  ok: boolean;
  ticket?: string;
  price?: number;
  volume?: number;
  message?: string;
  unsupported?: boolean;
}

export async function POST(req: Request) {
  const token = req.headers.get("x-bridge-token") ?? "";
  const link = await bridgeLinkByToken(token);
  if (!link) return NextResponse.json({ error: "INVALID_TOKEN" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { results?: ReportRow[]; balance?: number; equity?: number } | null;
  const results = Array.isArray(body?.results) ? body.results.slice(0, 20) : [];
  const now = new Date();

  await db.brokerLink.update({
    where: { id: link.id },
    data: {
      lastHandshakeAt: now,
      lastCheckedAt: now,
      ...(typeof body?.balance === "number" || typeof body?.equity === "number"
        ? { balance: body.balance ?? link.balance, equity: body.equity ?? link.equity }
        : {}),
    },
  });

  let accepted = 0;

  for (const r of results) {
    const cmd = await db.bridgeCommand.findFirst({ where: { id: String(r.id ?? ""), linkId: link.id } });
    if (!cmd || cmd.status === "FILLED" || cmd.status === "REJECTED" || cmd.status === "UNSUPPORTED") continue;

    const status = !r.ok ? (r.unsupported ? "UNSUPPORTED" : "REJECTED") : "FILLED";
    await db.bridgeCommand.update({
      where: { id: cmd.id },
      data: {
        status,
        fillPrice: r.ok && typeof r.price === "number" ? r.price : null,
        fillVolume: r.ok && typeof r.volume === "number" ? r.volume : null,
        fillTicket: r.ok && r.ticket ? String(r.ticket).slice(0, 40) : null,
        message: String(r.message ?? "").slice(0, 300),
        reportedAt: now,
      },
    });
    accepted++;

    if (!cmd.mirrorId) continue;
    const mirror = await db.brokerMirrorTrade.findUnique({ where: { id: cmd.mirrorId } });
    if (!mirror) continue;

    if (cmd.action === "OPEN") {
      if (r.ok) {
        await db.brokerMirrorTrade.update({
          where: { id: mirror.id },
          data: {
            status: "FILLED",
            fillPrice: typeof r.price === "number" ? r.price : null,
            fillQty: typeof r.volume === "number" ? r.volume : null,
            brokerRef: r.ticket ? String(r.ticket).slice(0, 40) : mirror.brokerRef,
            detail: String(r.message ?? "Filled on your terminal.").slice(0, 300),
          },
        });
      } else {
        await db.brokerMirrorTrade.update({
          where: { id: mirror.id },
          data: {
            status: r.unsupported ? "UNSUPPORTED" : "REJECTED",
            detail: String(r.message ?? "The terminal could not execute the order.").slice(0, 300),
          },
        });
      }
    } else if (cmd.action === "CLOSE") {
      if (r.ok) {
        await db.brokerMirrorTrade.update({
          where: { id: mirror.id },
          data: {
            status: "CLOSED",
            closePrice: typeof r.price === "number" ? r.price : null,
            closedAt: now,
            detail: String(r.message ?? "Closed on your terminal.").slice(0, 300),
          },
        });
      } else {
        // Retry the close, bounded. A mirror that stays open after the engine
        // exited must never be silent.
        const closes = await db.bridgeCommand.count({ where: { mirrorId: mirror.id, action: "CLOSE" } });
        const attempts = String(r.message ?? "close failed").slice(0, 200);
        if (closes < MAX_CLOSE_RETRIES) {
          await db.bridgeCommand.create({
            data: {
              linkId: link.id,
              action: "CLOSE",
              symbol: cmd.symbol,
              side: cmd.side === "BUY" ? "SELL" : "BUY",
              lots: cmd.lots,
              ticket: cmd.ticket,
              refOid: cmd.refOid,
              mirrorId: mirror.id,
            },
          });
          await db.brokerMirrorTrade.update({
            where: { id: mirror.id },
            data: { detail: `Close retry queued (attempt ${closes}). Last terminal reply: ${attempts}`.slice(0, 300) },
          });
        } else {
          await db.brokerMirrorTrade.update({
            where: { id: mirror.id },
            data: { detail: `Terminal could not close the position after ${closes} attempts: ${attempts}`.slice(0, 300) },
          });
        }
      }
    }
  }

  return NextResponse.json({ ok: true, accepted });
}
