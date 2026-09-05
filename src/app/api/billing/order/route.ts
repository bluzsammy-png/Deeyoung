// DEEYOUNG PRO — subscription order creation + payment verification.
// The single entry point every "Subscribe" button lands on. Three rails,
// selected by pure server configuration (Railway variables, no code changes):
//   1. hosted   — PAYMENT_LINK_<TIER> set → buyer is redirected to the live
//                 provider checkout (Cryptomus / Lemon Squeezy / any). The
//                 provider webhook (BILLING_WEBHOOK_SECRET, HMAC-verified)
//                 upgrades the plan on "paid".
//   2. crypto   — default rail: buyer sends the order's UNIQUE USDT (TRC-20)
//                 amount and submits the txid. Verification is ON-CHAIN and
//                 AUTOMATIC (src/lib/crypto-verify.ts): confirmed transfer,
//                 official USDT contract, our wallet, exact unique amount,
//                 arrived after order creation. On success the plan upgrades
//                 immediately; any mismatch stays SUBMITTED for manual review
//                 in /admin → Billing (the human path still exists).
//   3. none     — reachable only if the crypto wallet is deliberately
//                 overridden to empty AND no PAYMENT_LINK_* is set.
// Amounts are ALWAYS read server-side from src/lib/pricing.ts — the client
// never gets to name its own price.

import { NextResponse } from "next/server";
import { withGuard } from "@/lib/guard";
import { db } from "@/lib/db";
import { TIERS, CURRENCY_SYMBOL, type CurrencyCode } from "@/lib/pricing";
import {
  cryptoAmountUsd,
  cryptoAsset,
  cryptoNetwork,
  cryptoWallet,
  verifyUsdtTransfer,
} from "@/lib/crypto-verify";

export const dynamic = "force-dynamic";

const TIERS_SET: Set<string> = new Set(TIERS.map((t) => t.key));
const CURRENCIES = new Set(Object.keys(CURRENCY_SYMBOL));

// In-memory verification rate limit per account: 12 on-chain lookups per
// 15 minutes. Enough for honest retries (a fresh transfer confirms in about
// a minute); far below anything that could hammer the provider.
const VERIFY_WINDOW_MS = 15 * 60_000;
const VERIFY_MAX = 12;
const verifyHits = new Map<string, number[]>();

function verifyAllowed(userId: string): boolean {
  const now = Date.now();
  const hits = (verifyHits.get(userId) ?? []).filter((t) => now - t < VERIFY_WINDOW_MS);
  if (hits.length >= VERIFY_MAX) return false;
  hits.push(now);
  verifyHits.set(userId, hits);
  if (verifyHits.size > 5000) {
    for (const [k, v] of verifyHits) {
      if (v.every((t) => now - t >= VERIFY_WINDOW_MS)) verifyHits.delete(k);
    }
  }
  return true;
}

function paymentLinkFor(tier: string): string | null {
  const envKey = `PAYMENT_LINK_${tier}`;
  const v = process.env[envKey];
  return v && v.trim() ? v.trim() : null;
}

/** POST /api/billing/order { tier, currency } → create the order, resolve the rail. */
export const POST = withGuard(async (req: Request, { user }) => {
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

  // Rail 2 — direct USDT (TRC-20), verified on-chain at PATCH time.
  // The amount is unique per order (anti-replay), so the buyer must send
  // exactly what this endpoint returns. CRYPTO_RAIL=off is the kill switch.
  if (process.env.CRYPTO_RAIL !== "off") {
    return NextResponse.json({
      state: "crypto",
      orderId: order.id,
      address: cryptoWallet(),
      network: cryptoNetwork(),
      asset: cryptoAsset(),
      amountUsd: cryptoAmountUsd(order.id, tierDef.prices.USD),
    });
  }

  // Rail 3 — rails deliberately disabled. Record the demand, tell the truth.
  return NextResponse.json({ state: "unavailable", orderId: order.id });
});

/** PATCH /api/billing/order { orderId, reference } — buyer submits a txid; we verify on-chain. */
export const PATCH = withGuard(async (req: Request, { user }) => {
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

  // A txid can only ever be attached to one order (cross-order replay guard).
  const clash = await db.billingOrder.findFirst({
    where: { reference, id: { not: order.id } },
    select: { id: true },
  });
  if (clash) {
    return NextResponse.json(
      { error: "DUPLICATE_REFERENCE", message: "That transaction id is already attached to an order." },
      { status: 409 },
    );
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

  // Throttled accounts: keep the honest SUBMITTED state, no provider call.
  if (!verifyAllowed(user.id)) {
    return NextResponse.json({
      ok: true,
      status: "SUBMITTED",
      verified: false,
      message: "Verification attempts are cooling down. Try again in a few minutes.",
    });
  }

  const tierDef = TIERS.find((t) => t.key === order.tier);
  if (!tierDef) {
    return NextResponse.json({ ok: true, status: "SUBMITTED", verified: false });
  }
  const expectedUsd = cryptoAmountUsd(order.id, tierDef.prices.USD);
  const result = await verifyUsdtTransfer(reference, expectedUsd, order.createdAt);

  if (result.verdict === "PAID") {
    await db.billingOrder.update({
      where: { id: order.id },
      data: { status: "PAID", paidAt: new Date(), provider: "USDT_TRC20" },
    });
    await db.user.update({ where: { id: order.userId }, data: { plan: order.tier } });
    await db.auditEvent.create({
      data: {
        userId: user.id,
        category: "SUBSCRIPTION",
        action: "ORDER_AUTO_VERIFIED",
        detail: JSON.stringify({
          orderId: order.id,
          tier: order.tier,
          txid: reference,
          amount: result.amount,
          from: result.from,
        }),
      },
    }).catch(() => undefined);
    return NextResponse.json({ ok: true, status: "PAID", verified: true, plan: order.tier });
  }

  if (result.verdict === "PROVIDER_DOWN") {
    return NextResponse.json({
      ok: true,
      status: "SUBMITTED",
      verified: false,
      message: "On-chain verification is temporarily unavailable. Your reference is saved and the team will review it.",
    });
  }

  if (result.verdict === "MISMATCH") {
    return NextResponse.json({
      ok: true,
      status: "SUBMITTED",
      verified: false,
      message:
        result.detail === "amount"
          ? "A transfer with that id was found but its amount does not match this order. The team will review it manually."
          : "A transfer with that id was found but it is not a USDT payment to our address. The team will review it manually.",
    });
  }

  // NOT_FOUND: the transfer may still be confirming. Buyer can retry shortly.
  return NextResponse.json({
    ok: true,
    status: "SUBMITTED",
    verified: false,
    retryable: true,
    message:
      "No confirmed USDT transfer with that id has reached our address yet. If it just left your wallet, wait one minute and submit again.",
  });
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
