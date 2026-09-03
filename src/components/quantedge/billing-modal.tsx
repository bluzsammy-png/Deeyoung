"use client";

// DEEYOUNG PRO — Billing modal. Paystack-backed subscriptions land here;
// until payment rails go live it collects waitlist demand (audited per account).
// Shows all three tiers with location-aware currency (src/lib/pricing.ts).

import { useEffect, useState } from "react";
import { Check, Clock, CreditCard, Loader2, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { authClient, type SessionUser } from "@/lib/auth-client";
import { effectivePlan, trialTimeLeftLabel } from "@/lib/entitlements";
import { TIERS, detectCurrencyFromBrowser, tierPrice, type CurrencyCode } from "@/lib/pricing";

export function BillingModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { toast } = useToast();
  const { data: session } = authClient.useSession();
  const user = session?.user as SessionUser | undefined;
  const [busy, setBusy] = useState(false);
  const [ccy, setCcy] = useState<CurrencyCode>("USD");

  useEffect(() => {
    if (open) setCcy(detectCurrencyFromBrowser());
  }, [open]);

  const plan = user ? effectivePlan(user) : "FREE";
  const trialLabel = user ? trialTimeLeftLabel(user) : null;

  const joinWaitlist = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/billing/waitlist", { method: "POST" });
      if (!res.ok) throw new Error();
      toast({
        title: "You're on the list",
        description: "We'll email you the moment card billing goes live for your plan.",
      });
    } catch {
      toast({ title: "Couldn't save that", description: "Please retry in a moment.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px] border-hairline bg-panel text-foreground">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-left">
            <Sparkles className="h-4 w-4 text-brand-hi" /> Choose your plan
          </DialogTitle>
          <DialogDescription className="text-left">
            {plan === "TRIAL"
              ? `${trialLabel ?? "2 days"} left in your trial. Pick a plan to keep everything.`
              : plan === "FREE"
                ? "Your trial has ended. Pick a plan to unlock the terminal again."
                : `You're on ${plan} — manage or switch below.`}
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
                <p className="mt-0.5 text-[11px] text-muted-foreground">{tier.tagline} · ≈ ₦{tier.prices.NGN.toLocaleString("en-US")} reference</p>
                <ul className="mt-2.5 grid gap-x-4 gap-y-1 sm:grid-cols-2">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-1.5 text-[11px] leading-relaxed text-foreground/85">
                      <Check className="mt-0.5 h-3 w-3 shrink-0 text-brand-hi" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        <div className="flex items-start gap-2 rounded-xl border border-hairline bg-panel-2 px-3.5 py-3 text-[11px] leading-relaxed text-muted-foreground">
          <CreditCard className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-hi" />
          <span>
            Card details are requested <strong className="text-foreground">when you subscribe</strong> — never during the trial.
            Your card is charged only when your plan renews, and you can cancel anytime.
          </span>
        </div>

        <div className="flex items-start gap-2 rounded-xl border border-warn/30 bg-warn/10 px-3.5 py-3 text-[11px] leading-relaxed text-warn">
          <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Card checkout is in final onboarding with our payment provider. Join the waitlist and we&apos;ll email
          you the moment your plan can be activated — trials and analytics stay open meanwhile.
        </div>

        {plan === "PRO" || plan === "ELITE" || plan === "STARTER" ? (
          <button disabled className="w-full rounded-xl bg-brand/20 py-3 text-sm font-bold text-brand-hi">
            {plan} is active
          </button>
        ) : (
          <button
            onClick={joinWaitlist}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3 text-sm font-bold text-white transition-all hover:brightness-110 disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Notify me when card checkout is live
          </button>
        )}

        <p className="-mt-1 text-center text-[11px] text-muted-foreground">
          Questions about plans?{" "}
          <a href="mailto:deyongsltd@gmail.com" className="text-brand-hi hover:underline">deyongsltd@gmail.com</a>
        </p>
      </DialogContent>
    </Dialog>
  );
}
