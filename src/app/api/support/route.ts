// DEEYOUNG PRO — in-house live support: visitor side.
// POST /api/support        → send a message into a thread (creates thread lazily)
// GET  /api/support?key=&since= → poll the visitor's own thread
//
// Design notes:
// - No account, no email: the widget keeps a random threadKey in localStorage.
//   This is a support desk, not an identity system — treat keys as capabilities.
// - Rate limits mirror the signup-velocity philosophy: generous for humans
//   (CGNAT towers share IPs), hostile to floods. Per-key AND per-hashed-IP.
// - Auto-reply is honest: it states a human will answer in the admin console —
//   no fake "an agent is typing" theatre.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clientIpFromHeaders, hashIp } from "@/lib/trust";

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // Prisma + node:crypto — Edge runtime cannot load either

const MAX_BODY = 2000;
const MAX_MSGS_PER_KEY_PER_HOUR = 30;
const MAX_MSGS_PER_IP_PER_HOUR = 80;
const THREAD_RE = /^[a-z0-9]{16,64}$/;

export async function POST(req: NextRequest) {
  let payload: { threadKey?: string; body?: string; name?: string; page?: string };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "BAD_JSON" }, { status: 400 });
  }

  const body = String(payload.body ?? "").trim().slice(0, MAX_BODY);
  if (!body) return NextResponse.json({ error: "EMPTY", message: "Message is empty." }, { status: 400 });

  const name = String(payload.name ?? "").trim().slice(0, 60) || null;
  const page = String(payload.page ?? "").slice(0, 200) || null;

  // Thread key: client-provided (returning visitor) or minted here (first contact).
  let threadKey = String(payload.threadKey ?? "");
  if (threadKey && !THREAD_RE.test(threadKey)) {
    return NextResponse.json({ error: "BAD_KEY" }, { status: 400 });
  }
  if (!threadKey) {
    threadKey = crypto.randomUUID().replace(/-/g, "").slice(0, 32);
  }

  const ip = clientIpFromHeaders(req.headers);
  const ipHash = ip && !isPrivate(ip) ? hashIp(ip) : null;
  const since = new Date(Date.now() - 60 * 60 * 1000);

  try {
    const [byKey, byIp] = await Promise.all([
      db.supportMessage.count({ where: { threadKey, createdAt: { gte: since } } }),
      ipHash
        ? db.supportMessage.count({ where: { ipHash, createdAt: { gte: since } } })
        : Promise.resolve(0),
    ]);
    if (byKey >= MAX_MSGS_PER_KEY_PER_HOUR || byIp >= MAX_MSGS_PER_IP_PER_HOUR) {
      return NextResponse.json(
        { error: "RATE_LIMITED", message: "Too many messages — please wait a bit." },
        { status: 429 },
      );
    }

    await db.supportMessage.create({
      data: { threadKey, role: "VISITOR", body, visitorName: name, page, ipHash },
    });

    // One honest auto-ack per thread, right after the visitor's first message.
    const prior = await db.supportMessage.count({ where: { threadKey, role: "AGENT" } });
    if (prior === 0) {
      await db.supportMessage.create({
        data: {
          threadKey,
          role: "AGENT",
          body:
            "Thanks for reaching out — your message landed in the DeeYoung support desk. A team member will reply here; keep this page open and replies appear automatically.",
          seen: false,
        },
      });
    }
  } catch (e) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[support] POST failed:", e);
      return NextResponse.json({ error: "DB", message: String(e).slice(0, 300) }, { status: 503 });
    }
    return NextResponse.json({ error: "DB", message: "Could not deliver — try again." }, { status: 503 });
  }

  return NextResponse.json({ ok: true, threadKey }, { headers: { "Cache-Control": "no-store" } });
}

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key") ?? "";
  if (!THREAD_RE.test(key)) return NextResponse.json({ error: "BAD_KEY" }, { status: 400 });
  const since = new Date(Date.now() - 12 * 60 * 60 * 1000); // thread history window

  try {
    // Visitor pulls their thread; AGENT rows flip to seen (delivery receipt).
    const msgs = await db.supportMessage.findMany({
      where: { threadKey: key, createdAt: { gte: since } },
      orderBy: { createdAt: "asc" },
      take: 100,
      select: { id: true, role: true, body: true, createdAt: true, seen: true },
    });
    await db.supportMessage.updateMany({ where: { threadKey: key, role: "AGENT", seen: false }, data: { seen: true } });
    return NextResponse.json(
      { messages: msgs.map((m) => ({ ...m, mine: m.role === "VISITOR" })) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "DB" }, { status: 503 });
  }
}

function isPrivate(ip: string): boolean {
  return (
    ip === "unknown" ||
    ip.startsWith("10.") ||
    ip.startsWith("127.") ||
    ip.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    ip.startsWith("::1") ||
    ip.startsWith("fc") ||
    ip.startsWith("fd")
  );
}
