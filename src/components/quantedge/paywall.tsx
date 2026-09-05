"use client";

// DEEYOUNG PRO — hard paywall view. A signed-in account without a paid plan
// never reaches the terminal: this is what they see instead. Nothing is free
// beyond the homepage, so this screen is the honest front door to checkout.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, LogOut, ShieldCheck } from "lucide-react";
import { authClient, type SessionUser } from "@/lib/auth-client";
import { EdgeMark } from "@/components/quantedge/edge-mark";
import { TIERS, detectCurrencyFromBrowser, tierPrice, type CurrencyCode } from "@/lib/pricing";

export function PaywallView() {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const user = session?.user as SessionUser | undefined;
  const [ccy, setCcy] = useState<CurrencyCode>("USD");

  useEffect(() => {
    setCcy(detectCurrencyFromBrowser());
  }, []);

  const signOut = async () => {
    await authClient.signOut();
    router.refresh();
    window.location.href = "/";
  };

  return (
    <div className="relative min-h-screen overflow-x-clip">
      <div className="qe-grid-bg pointer-events-none absolute inset-0 opacity-60" />
      <header className="relative z-10 border-b border-hairline">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-2.5">
            <EdgeMark />
            <span className="qe-display text-[15px] font-bold tracking-tight">
              DeeYoung<span className="text-brand"> Pro</span>
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-muted-foreground">{user?.email}</span>
            <button onClick={signOut} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 font-semibold text-muted-foreground transition-colors hover:text-foreground">
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-5xl px-5 py-12">
        <p className="qe-eyebrow">Subscription required</p>
        <h1 className="qe-display mt-2 max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">
          Your account is ready. Pick a plan to open the terminal.
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Every DeeYoung Pro plan includes the full market terminal: charts, catalysts, portfolio risk and the public
          engine ledger. Higher tiers add SENTINEL automation, the Backtest Lab and AI briefings. Cancel anytime.
        </p>

        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          {TIERS.map((tier) => (
            <div
              key={tier.key}
              className={`relative flex flex-col rounded-2xl border p-5 ${
                tier.popular ? "qe-border-gradient" : "border-hairline bg-panel-2"
              }`}
            >
              {tier.popular && (
                <span className="absolute -top-2.5 left-5 rounded-md bg-brand px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white shadow-lg shadow-brand/40">
                  Most popular
                </span>
              )}
              <div className="flex items-baseline justify-between">
                <h2 className="qe-display text-sm font-bold">{tier.name}</h2>
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{tier.tagline}</span>
              </div>
              <p className="qe-display mt-3 text-3xl font-bold">
                {tierPrice(tier, ccy)}
                <span className="text-sm font-medium text-muted-foreground">/month</span>
              </p>
              <ul className="qe-check-list mt-4 flex-1 space-y-2 text-xs leading-relaxed text-foreground/85">
                {tier.features.map((f) => (
                  <li key={f}>
                    <CheckCircle2 className="h-3.5 w-3.5 text-brand-hi" />
                    {f}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => router.push(`/checkout/${tier.key.toLowerCase()}`)}
                className={`qe-btn mt-5 w-full py-2.5 text-sm ${tier.popular ? "qe-btn-primary" : "qe-btn-ghost"}`}
              >
                Subscribe to {tier.name}
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>

        <div className="mt-6 flex items-start gap-2 rounded-xl border border-hairline bg-panel-2 px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-pos" />
          <span>
            Payment is requested only at checkout, never at signup. Questions first? Write to{" "}
            <a className="text-brand-hi hover:underline" href="mailto:deyongsltd@gmail.com">deyongsltd@gmail.com</a>.
          </span>
        </div>
      </main>
    </div>
  );
}
