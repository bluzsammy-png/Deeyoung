// DEEYOUNG PRO — in-house live support: admin/agent side (requireAdmin gated).
// GET    /api/admin/support                  → thread list (last msg, unread counts)
// GET    /api/admin/support?key=             → full thread (marks visitor msgs read)
// POST   /api/admin/support {key, body}      → agent reply
// DELETE /api/admin/support?key=             → close/clear a thread (moderation)

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // Prisma + node:crypto — Edge runtime cannot load either

const MAX_BODY = 2000;
const THREAD_RE = /^[a-z0-9]{16,64}$/;

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "FORBIDDEN", message: "Admin access required." }, { status: 403 });

  const key = req.nextUrl.searchParams.get("key");

  try {
    if (key) {
      if (!THREAD_RE.test(key)) return NextResponse.json({ error: "BAD_KEY" }, { status: 400 });
      const msgs = await db.supportMessage.findMany({
        where: { threadKey: key },
        orderBy: { createdAt: "asc" },
        take: 200,
      });
      await db.supportMessage.updateMany({ where: { threadKey: key, role: "VISITOR", seen: false }, data: { seen: true } });
      return NextResponse.json({ messages: msgs }, { headers: { "Cache-Control": "no-store" } });
    }

    // Thread list: last activity per thread + unread badge, newest first.
    const recent = await db.supportMessage.findMany({
      orderBy: { createdAt: "desc" },
      take: 600, // scan window — enough to materialize the active threads
    });
    const threads = new Map<
      string,
      { key: string; last: string; lastRole: string; lastAt: string; unread: number; name: string | null; page: string | null; total: number }
    >();
    for (const m of recent) {
      const t = threads.get(m.threadKey) ?? {
        key: m.threadKey,
        last: "",
        lastRole: "",
        lastAt: "",
        unread: 0,
        name: null as string | null,
        page: null as string | null,
        total: 0,
      };
      t.total += 1;
      if (!t.last) {
        t.last = m.body;
        t.lastRole = m.role;
        t.lastAt = m.createdAt.toISOString();
      }
      if (m.role === "VISITOR" && !m.seen) t.unread += 1;
      if (!t.name && m.visitorName) t.name = m.visitorName;
      if (!t.page && m.page) t.page = m.page;
      threads.set(m.threadKey, t);
    }
    const list = [...threads.values()].sort((a, b) => b.lastAt.localeCompare(a.lastAt)).slice(0, 100);
    const unreadTotal = list.reduce((n, t) => n + t.unread, 0);
    return NextResponse.json({ threads: list, unreadTotal }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "DB" }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "FORBIDDEN", message: "Admin access required." }, { status: 403 });

  let payload: { key?: string; body?: string };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "BAD_JSON" }, { status: 400 });
  }
  const key = String(payload.key ?? "");
  const body = String(payload.body ?? "").trim().slice(0, MAX_BODY);
  if (!THREAD_RE.test(key)) return NextResponse.json({ error: "BAD_KEY" }, { status: 400 });
  if (!body) return NextResponse.json({ error: "EMPTY" }, { status: 400 });

  try {
    const exists = await db.supportMessage.findFirst({ where: { threadKey: key }, select: { id: true } });
    if (!exists) return NextResponse.json({ error: "NO_THREAD" }, { status: 404 });
    const [msg] = await Promise.all([
      db.supportMessage.create({ data: { threadKey: key, role: "AGENT", body } }),
      db.supportMessage.updateMany({ where: { threadKey: key, role: "VISITOR", seen: false }, data: { seen: true } }),
    ]);
    return NextResponse.json({ ok: true, id: msg.id }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "DB" }, { status: 503 });
  }
}

export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "FORBIDDEN", message: "Admin access required." }, { status: 403 });
  const key = req.nextUrl.searchParams.get("key") ?? "";
  if (!THREAD_RE.test(key)) return NextResponse.json({ error: "BAD_KEY" }, { status: 400 });
  try {
    await db.supportMessage.deleteMany({ where: { threadKey: key } });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "DB" }, { status: 503 });
  }
}
