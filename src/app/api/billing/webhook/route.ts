// DEEYOUNG PRO — universal billing webhook. Provider-agnostic by design:
// works with Cryptomus (crypto USDT/USDC — Nigeria-friendly, no monthly fee,
// no chargebacks) and/or Lemon Squeezy (global cards, merchant of record).
// Neither requires Stripe or Paystack. Activation is pure configuration:
//   BILLING_WEBHOOK_SECRET — HMAC-SHA256 key (Cryptomus: your API key's
//     HMAC secret; Lemon Squeezy: the webhook signing secret)
// On a verified "paid" event the buyer's plan is upgraded in the ledger —
// the same honest DB the rest of the platform reads.

import { NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

interface Mapping {
  email: string | null;
  tier: string | null;
  paid: boolean;
}

/** Extract {email, tier, paid} from Cryptomus or Lemon Squeezy payload shapes. */
function mapPayload(raw: any): Mapping {
  // Cryptomus "Payment status" webhook:
  // { type:"payment", status:"paid"|"paid_over", order_id, amount, additional_data }
  if (raw?.type === "payment" || raw?.payment_status || raw?.order_id) {
    const paid = ["paid", "paid_over"].includes(String(raw.status ?? raw.payment_status ?? ""));
    let email: string | null = raw?.additional_data?.email ?? null;
    let tier: string | null = raw?.additional_data?.tier ?? null;
    if (!email && typeof raw?.additional_data === "string") {
      // convention "email|TIER" or "email:TIER"
      const parts = raw.additional_data.split(/[|:]/);
      email = parts[0]?.trim() ?? null;
      tier = parts[1]?.trim() ?? null;
    }
    if (!email && raw?.order_id) email = String(raw.order_id).split("|")[0] ?? null;
    if (!tier && raw?.order_id) tier = String(raw.order_id).split("|")[1] ?? null;
    return { email, tier, paid };
  }
  // Lemon Squeezy "order_created" webhook:
  // { meta:{event_name:"order_created", custom_data:{email,tier}}, data:{...} }
  const cd = raw?.meta?.custom_data ?? {};
  if (raw?.meta?.event_name) {
    return {
      email: cd.email ?? raw?.data?.attributes?.user_email ?? null,
      tier: cd.tier ?? null,
      paid: ["order_created", "subscription_created", "subscription_payment_success"].includes(String(raw.meta.event_name)),
    };
  }
  // Generic convention: { email, tier, event:"paid" }
  return { email: raw?.email ?? null, tier: raw?.tier ?? null, paid: String(raw?.event ?? raw?.status ?? "").toLowerCase().includes("paid") };
}

export async function POST(req: Request) {
  const secret = process.env.BILLING_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "billing webhook not configured" }, { status: 503 });

  const bodyText = await req.text();
  const sigHeader = req.headers.get("x-signature") ?? req.headers.get("x-signature-sha256") ?? "";
  const expected = crypto.createHmac("sha256", secret).update(bodyText).digest("hex");
  const provided = sigHeader.replace(/^sha256=/, "");
  if (provided.length !== expected.length) return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  const ok = crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  if (!ok) return NextResponse.json({ error: "invalid signature" }, { status: 401 });

  let payload: any;
  try { payload = JSON.parse(bodyText); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }

  const { email, tier, paid } = mapPayload(payload);
  if (!paid) return NextResponse.json({ ok: true, ignored: "not a paid event" });
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "no buyer email in payload" }, { status: 422 });

  const plan = ["STARTER", "PRO", "ELITE"].includes(String(tier ?? "").toUpperCase()) ? String(tier).toUpperCase() : "PRO";
  const row = await db.user.update({
    where: { email: email.toLowerCase() },
    data: { plan },
    select: { email: true, plan: true },
  }).catch(() => null);
  if (!row) return NextResponse.json({ error: "user not found for email" }, { status: 404 });

  return NextResponse.json({ ok: true, email: row.email, plan: row.plan });
}
