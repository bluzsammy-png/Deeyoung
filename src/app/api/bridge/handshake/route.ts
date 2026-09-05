// DEEYOUNG PRO — EA bridge handshake. Authenticated by the per-link bridge
// token in the X-Bridge-Token header (no session cookies from a terminal).

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bridgeLinkByToken, BRIDGE_HEARTBEAT_SEC, EA_MAGIC, EA_VERSION } from "@/lib/brokers/bridge";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const token = req.headers.get("x-bridge-token") ?? "";
  const link = await bridgeLinkByToken(token);
  if (!link) return NextResponse.json({ error: "INVALID_TOKEN" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });

  const login = String(body.login ?? "").trim().slice(0, 40);
  const server = String(body.server ?? "").trim().slice(0, 120);
  const currency = String(body.currency ?? "USD").trim().slice(0, 12) || "USD";
  const version = String(body.version ?? "").trim().slice(0, 20);
  const balance = typeof body.balance === "number" ? body.balance : null;
  const equity = typeof body.equity === "number" ? body.equity : null;

  await db.brokerLink.update({
    where: { id: link.id },
    data: {
      status: "CONNECTED",
      statusDetail: `EA bridge connected from terminal ${login || "?"} on ${server || "?"}.`,
      login: login || link.login,
      server: server || link.server,
      currency,
      balance: balance ?? link.balance,
      equity: equity ?? link.equity,
      eaVersion: version || EA_VERSION,
      lastHandshakeAt: new Date(),
      lastCheckedAt: new Date(),
      verifiedAt: link.verifiedAt ?? new Date(),
    },
  });

  return NextResponse.json({
    ok: true,
    heartbeatSec: BRIDGE_HEARTBEAT_SEC,
    magic: EA_MAGIC,
    linkLabel: link.label,
    autoMirror: link.autoMirror,
  });
}
