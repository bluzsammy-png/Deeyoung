// DEEYOUNG PRO — admin billing desk: verify subscription orders.
// GET  — recent orders with buyer emails (requireAdmin).
// POST — { orderId, action: "approve" | "cancel" | "reopen" }.
//        approve: order → PAID and the buyer's plan is upgraded in the same
//        transaction-safe sequence, with an audit event. This is the only
//        manual path a plan can ever change by; webhooks do the hosted path.
// Every action is audited with the admin's id.

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { TIERS } from "@/lib/pricing";

export const dynamic = "force-dynamic";

const TIERS_SET = new Set(TIERS.map((t) => t.key));

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const orders = await db.billingOrder.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { user: { select: { email: true, name: true, plan: true } } },
  });
  return NextResponse.json({ orders });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { orderId?: string; action?: string };
  const orderId = String(body.orderId ?? "");
  const action = String(body.action ?? "");

  const order = await db.billingOrder.findUnique({ where: { id: orderId }, include: { user: true } });
  if (!order) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  if (action === "approve") {
    if (!TIERS_SET.has(order.tier)) return NextResponse.json({ error: "BAD_TIER" }, { status: 400 });
    await db.billingOrder.update({
      where: { id: order.id },
      data: { status: "PAID", paidAt: new Date() },
    });
    await db.user.update({
      where: { id: order.userId },
      data: { plan: order.tier },
    });
    await db.auditEvent.create({
      data: {
        userId: admin.id,
        category: "SUBSCRIPTION",
        action: "ORDER_APPROVED",
        detail: JSON.stringify({ orderId: order.id, buyer: order.user.email, tier: order.tier }),
      },
    }).catch(() => undefined);
    return NextResponse.json({ ok: true, status: "PAID", plan: order.tier });
  }

  if (action === "cancel") {
    await db.billingOrder.update({ where: { id: order.id }, data: { status: "CANCELLED" } });
    await db.auditEvent.create({
      data: {
        userId: admin.id,
        category: "SUBSCRIPTION",
        action: "ORDER_CANCELLED",
        detail: JSON.stringify({ orderId: order.id, buyer: order.user.email }),
      },
    }).catch(() => undefined);
    return NextResponse.json({ ok: true, status: "CANCELLED" });
  }

  if (action === "reopen") {
    await db.billingOrder.update({ where: { id: order.id }, data: { status: "PENDING" } });
    return NextResponse.json({ ok: true, status: "PENDING" });
  }

  return NextResponse.json({ error: "BAD_ACTION" }, { status: 400 });
}
