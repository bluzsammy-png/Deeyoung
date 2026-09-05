"use client";

// DEEYOUNG PRO — Billing modal. Every tier's Subscribe button navigates to the
// real checkout page (/checkout/<tier>), which creates the server-side order
// and resolves the configured payment rail (hosted provider, USDT with manual
// verification, or an honest "being connected" state). No dead ends.

import { ExternalLink, ShieldCheck, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { authClient, type SessionUser } from "@/lib/auth-client";
import { effectivePlan } from "@/lib/entitlements";
import { TIERS, detectCurrencyFromBrowser, tierPrice, type CurrencyCode } from "@/lib/pricing";
import { useEffect, useState } from "react";

export function BillingModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const user = session?.user as SessionUser | undefined;
  const [ccy, setCcy] = useState<CurrencyCode>("USD");

  useEffect(() => {
    if (!open) return;
    setCcy(detectCurrencyFromBrowser());
  }, [open]);

  const plan = user ? effectivePlan(user) : "FREE";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[600px] border-hairline bg-panel text-foreground">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-left">
            <Sparkles className="h-4 w-4 text-brand-hi" /> Choose your plan
          </DialogTitle>
          <DialogDescription className="text-left">
            {plan === "FREE"
              ? "Pick a plan to unlock the full terminal."
              : `You're on ${plan}; manage or switch below.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2.5">
          {TIERS.map((tier) => {
            const current = plan === tier.key;
            return (
              <div
                key={tier.key}
                className={`rounded-2xl border p-4 transition-colors ${
                  current
                    ? "border-pos/40 bg-pos/[0.05]"
                    : tier.popular
                      ? "border-brand/40 bg-brand/[0.05]"
                      : "border-hairline bg-panel-2"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="text-sm font-bold">{tier.name}</span>
                    {tier.popular && !current && (
                      <span className="rounded-md bg-brand px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
                        Most popular
                      </span>
                    )}
                    {current && (
                      <span className="rounded-md bg-pos/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-pos">
                        Your plan
                      </span>
                    )}
                  </div>
                  <span className="qe-num text-lg font-bold">
                    {tierPrice(tier, ccy)}
                    <span className="text-[11px] font-medium text-muted-foreground">/mo</span>
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{tier.tagline}</p>
                {!current && (
                  <button
                    onClick={() => {
                      onOpenChange(false);
                      router.push(`/checkout/${tier.key.toLowerCase()}`);
                    }}
                    className="qe-btn qe-btn-primary mt-3 w-full px-4 py-2.5 text-[13px]"
                  >
                    Subscribe to {tier.name}
                    <ExternalLink className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex items-start gap-2 rounded-xl border border-hairline bg-panel-2 px-3.5 py-3 text-[11px] leading-relaxed text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-pos" />
          <span>
            Checkout runs on its own secure page: your order is created server-side with the exact price, then payment
            opens. Your plan unlocks the moment payment is verified. Cancel anytime.
          </span>
        </div>

        <p className="-mt-1 flex items-center justify-center gap-1.5 text-center text-[11px] text-muted-foreground">
          Questions about plans?{" "}
          <a href="mailto:deyongsltd@gmail.com" className="inline-flex items-center gap-1 text-brand-hi hover:underline">
            deyongsltd@gmail.com <ExternalLink className="h-3 w-3" />
          </a>
        </p>
      </DialogContent>
    </Dialog>
  );
}
