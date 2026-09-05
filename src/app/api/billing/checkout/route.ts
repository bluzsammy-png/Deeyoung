// DEEYOUNG PRO — checkout links resolver. The pricing UI calls this to get the
// live payment URLs per tier. Links are pure configuration (Railway variables)
// so switching providers NEVER touches code:
//   PAYMENT_LINK_STARTER / PAYMENT_LINK_PRO / PAYMENT_LINK_ELITE
//   BILLING_PROVIDER_NAME (display label, e.g. "Cryptomus" / "Lemon Squeezy")
// Recommended stack (works in Nigeria, no Paystack/Stripe):
//   • Cryptomus — USDT/USDC/BTC checkout, instant settlement, no monthly fee
//   • Lemon Squeezy — global Visa/Mastercard, acts as merchant of record

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const links = {
    STARTER: process.env.PAYMENT_LINK_STARTER ?? null,
    PRO: process.env.PAYMENT_LINK_PRO ?? null,
    ELITE: process.env.PAYMENT_LINK_ELITE ?? null,
  };
  return NextResponse.json({
    provider: process.env.BILLING_PROVIDER_NAME ?? null,
    ready: Object.values(links).some(Boolean),
    links,
  });
}
