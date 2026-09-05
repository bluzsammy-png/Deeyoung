// DEEYOUNG PRO — subscription order creation + payment reference submission.
// The single entry point every "Subscribe" button lands on. Three rails,
// selected by pure server configuration (Railway variables, no code changes):
//   1. hosted   — PAYMENT_LINK_<TIER> set → buyer is redirected to the live
//                 provider checkout (Cryptomus / Lemon Squeezy / any). The
//                 provider webhook (BILLING_WEBHOOK_SECRET, HMAC-verified)
//                 upgrades the plan on "paid".
//   2. crypto   — CRYPTO_USDT_ADDRESS set → buyer sends USDT (TRC-20) and
//                 submits the txid; the order goes SUBMITTED and the owner
//                 verifies it in /admin → Billing. Verification is manual and
//                 honest: the plan changes only after a human confirms.
//   3. none     — no rails configured → the order is still recorded (real
//                 demand data) and the buyer is told the truth: checkout is
//                 being connected, and they are on the list.
// Amounts are ALWAYS read server-side from src/lib/pricing.ts — the client
// never gets to name its own price.

import { NextRequest, NextResponse } from "next/server";
import { withGuard } from "@/lib/guard";
import { db } from "@/lib/db";
import { TIERS, CURRENCY_SYMBOL, type CurrencyCode } from "@/lib/pricing";

export const dynamic = "force-dynamic";

const TIERS_SET = new Set(TIERS.map((t) => t.key));
const CURRENCIES = new Set(Object.keys(CURRENCY_SYMBOL));

function paymentLinkFor(tier: string): string | null {
  const envKey = `PAYMENT_LINK_${tier}`;
  const v = process.env[envKey];
  return v && v.trim() ? v.trim() : null;
}

/** POST /api/billing/order { tier, currency } → create the order, resolve the rail. */
export const POST = withGuard(async (req: NextRequest, { user }) => {
  const body = (await req.json().catch(() => ({}))) as { tier?: string; currency?: string };
  const tier = String(body.tier ?? "").toUpperCase();
  const currency = String(body.currency ?? "USD").toUpperCase();

  if (!TIERS_SET.has(tier)) {
    return NextResponse.json({ error: "INVALID_TIER", message: "Unknown plan." }, { status: 400 });
  }
  if (!CURRENCIES.has(currency)) {
    return NextResponse.json({ error: "INVALID_CURRENCY", message: "Unknown currency." }, { status: 400 });
  }

  // Cap open orders per account: real anti-abuse, not theater.
  const openOrders = await db.billingOrder.count({
    where: { userId: user.id, status: { in: ["PENDING", "SUBMITTED"] } },
  });
  if (openOrders >= 5) {
    return NextResponse.json(
      { error: "TOO_MANY_OPEN", message: "You already have pending orders. Finish or wait for review first." },
      { status: 429 },
    );
  }

  const tierDef = TIERS.find((t) => t.key === tier)!;
  const amount = tierDef.prices[currency as CurrencyCode];

  const order = await db.billingOrder.create({
    data: {
      userId: user.id,
      tier,
      currency,
      amount,
      provider: paymentLinkFor(tier) ? (process.env.BILLING_PROVIDER_NAME ?? "HOSTED").slice(0, 40) : "MANUAL",
    },
  });

  await db.auditEvent.create({
    data: {
      userId: user.id,
      category: "SUBSCRIPTION",
      action: "ORDER_CREATED",
      detail: JSON.stringify({ orderId: order.id, tier, currency, amount }),
    },
  }).catch(() => undefined);

  // Rail 1 — hosted provider checkout.
  const link = paymentLinkFor(tier);
  if (link) {
    return NextResponse.json({ state: "hosted", orderId: order.id, url: link });
  }

  // Rail 2 — direct USDT (TRC-20) with manual verification.
  const wallet = process.env.CRYPTO_USDT_ADDRESS?.trim();
  if (wallet) {
    return NextResponse.json({
      state: "crypto",
      orderId: order.id,
      address: wallet,
      network: (process.env.CRYPTO_NETWORK ?? "TRC-20").slice(0, 20),
      asset: (process.env.CRYPTO_ASSET ?? "USDT").slice(0, 10),
      amountUsd: tierDef.prices.USD,
    });
  }

  // Rail 3 — nothing configured yet. Record the demand, tell the truth.
  return NextResponse.json({ state: "unavailable", orderId: order.id });
});

/** PATCH /api/billing/order { orderId, reference } — buyer submits a txid/reference. */
export const PATCH = withGuard(async (req: NextRequest, { user }) => {
  const body = (await req.json().catch(() => ({}))) as { orderId?: string; reference?: string };
  const orderId = String(body.orderId ?? "");
  const reference = String(body.reference ?? "").trim();

  if (!orderId || !reference) {
    return NextResponse.json({ error: "BAD_INPUT", message: "Order id and payment reference are required." }, { status: 400 });
  }
  if (!/^[A-Za-z0-9._:-]{8,120}$/.test(reference)) {
    return NextResponse.json({ error: "BAD_REFERENCE", message: "That does not look like a valid transaction id." }, { status: 400 });
  }

  const order = await db.billingOrder.findUnique({ where: { id: orderId } });
  if (!order || order.userId !== user.id) {
    // Not yours → indistinguishable from missing (no IDOR oracle).
    return NextResponse.json({ error: "NOT_FOUND", message: "Order not found." }, { status: 404 });
  }
  if (order.status !== "PENDING" && order.status !== "SUBMITTED") {
    return NextResponse.json({ error: "NOT_EDITABLE", message: "This order can no longer be updated." }, { status: 409 });
  }

  await db.billingOrder.update({
    where: { id: order.id },
    data: { reference, status: "SUBMITTED" },
  });

  await db.auditEvent.create({
    data: {
      userId: user.id,
      category: "SUBSCRIPTION",
      action: "ORDER_REFERENCE_SUBMITTED",
      detail: JSON.stringify({ orderId: order.id, refLen: reference.length }),
    },
  }).catch(() => undefined);

  return NextResponse.json({ ok: true, status: "SUBMITTED" });
});

/** GET /api/billing/order — the caller's own orders (checkout page state). */
export const GET = withGuard(async (_req, { user }) => {
  const orders = await db.billingOrder.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { id: true, tier: true, currency: true, amount: true, status: true, createdAt: true },
  });
  return NextResponse.json({ orders });
});
