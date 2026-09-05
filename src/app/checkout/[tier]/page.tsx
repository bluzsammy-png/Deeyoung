// DEEYOUNG PRO — checkout per tier. Public page (the free surface is the
// homepage; this page is the sales funnel endpoint, like /terms and /privacy).
// Payment itself always requires a signed-in account and resolves server-side
// via /api/billing/order — the client never handles amounts.

import { notFound } from "next/navigation";
import Link from "next/link";
import { EdgeMark } from "@/components/quantedge/edge-mark";
import { TIERS } from "@/lib/pricing";
import { CheckoutClient } from "../checkout-client";

export const dynamic = "force-dynamic";

export default async function CheckoutPage({ params }: { params: Promise<{ tier: string }> }) {
  const { tier } = await params;
  const key = tier.toUpperCase();
  const tierDef = TIERS.find((t) => t.key === key);
  if (!tierDef) notFound();

  return (
    <div className="relative min-h-screen overflow-x-clip">
      <div className="qe-grid-bg pointer-events-none absolute inset-0 opacity-60" />
      <header className="relative z-10 border-b border-hairline">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            <EdgeMark />
            <span className="qe-display text-[15px] font-bold tracking-tight">
              DeeYoung<span className="text-brand"> Pro</span>
            </span>
          </Link>
          <Link href="/" className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
            Back to home
          </Link>
        </div>
      </header>
      <main className="relative z-10 mx-auto max-w-5xl px-5 py-10">
        <CheckoutClient tierKey={tierDef.key} />
      </main>
      <footer className="relative z-10 border-t border-hairline">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-[11px] text-muted-foreground">
          <span>© {new Date().getFullYear()} DeeYoungs Ltd. All rights reserved.</span>
          <span className="flex items-center gap-4">
            <Link href="/terms" className="transition-colors hover:text-foreground">Terms</Link>
            <Link href="/privacy" className="transition-colors hover:text-foreground">Privacy</Link>
            <a href="mailto:deyongsltd@gmail.com" className="transition-colors hover:text-foreground">Support</a>
          </span>
        </div>
      </footer>
    </div>
  );
}
