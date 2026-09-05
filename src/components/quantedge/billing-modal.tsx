"use client";

// DEEYOUNG PRO — Billing modal.
// Two modes, driven by /api/billing/checkout (pure config: PAYMENT_LINK_* env):
//   • ready  — each tier renders a real Subscribe button that opens the live
//              payment URL (Cryptomus / Lemon Squeezy / any provider) in a new tab.
//   • waitlist — honest "checkout is coming online" state with audited signup.
// Shows all three tiers with location-aware currency (src/lib/pricing.ts).

import { useEffect, useState } from "react";
import { ArrowUpRight, Check, Clock, CreditCard, ExternalLink, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { authClient, type SessionUser } from "@/lib/auth-client";
import { effectivePlan } from "@/lib/entitlements";
import { TIERS, detectCurrencyFromBrowser, tierPrice, type CurrencyCode } from "@/lib/pricing";

type CheckoutLinks = { STARTER: string | null; PRO: string | null; ELITE: string | null };

export function BillingModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { toast } = useToast();
  const { data: session } = authClient.useSession();
  const user = session?.user as SessionUser | undefined;
  const [busy, setBusy] = useState(false);
  const [ccy, setCcy] = useState<CurrencyCode>("USD");
  const [links, setLinks] = useState<CheckoutLinks | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCcy(detectCurrencyFromBrowser());
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/billing/checkout", { cache: "no-store" });
        const json = await res.json();
        if (alive) {
          setLinks(json.links ?? null);
          setProvider(json.provider ?? null);
        }
      } catch { /* stay in waitlist mode */ }
    })();
    return () => { alive = false; };
  }, [open]);

  const plan = user ? effectivePlan(user) : "FREE";
  const checkoutReady = !!links && Object.values(links).some(Boolean);

  const joinWaitlist = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/billing/waitlist", { method: "POST" });
      if (!res.ok) throw new Error();
      setJoined(true);
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

  const subscribe = (tier: "STARTER" | "PRO" | "ELITE") => {
    const url = links?.[tier];
    if (!url) return;
    // provider handles payment + webhook upgrades the account server-side
    window.open(url, "_blank", "noopener,noreferrer");
    toast({
      title: "Opening secure checkout…",
      description: `Complete payment in the new tab — your ${tier} plan unlocks automatically once the payment provider confirms.`,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[600px] border-hairline bg-panel text-foreground">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-left">
            <Sparkles className="h-4 w-4 text-brand-hi" /> Choose your plan
          </DialogTitle>
          <DialogDescription className="text-left">
            {plan === "FREE"
              ? "Free plan — pick a plan to unlock the full terminal."
              : `You're on ${plan} — manage or switch below.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2.5">
          {TIERS.map((tier) => {
            const current = plan === tier.key;
            const link = links?.[tier.key as "STARTER" | "PRO" | "ELITE"] ?? null;
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
                {checkoutReady && !current && (
                  <button
                    onClick={() => subscribe(tier.key as "STARTER" | "PRO" | "ELITE")}
                    disabled={!link}
                    className="qe-btn qe-btn-primary mt-3 w-full px-4 py-2.5 text-[13px] disabled:opacity-50"
                  >
                    Subscribe to {tier.name}
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {checkoutReady ? (
          <>
            <div className="flex items-start gap-2 rounded-xl border border-hairline bg-panel-2 px-3.5 py-3 text-[11px] leading-relaxed text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-pos" />
              <span>
                Secure checkout handled by <strong className="text-foreground">{provider ?? "our payment provider"}</strong>.
                Your plan upgrades automatically the moment payment confirms — no waiting, no manual step.
              </span>
            </div>
            <div className="flex items-start gap-2 rounded-xl border border-hairline bg-panel-2 px-3.5 py-3 text-[11px] leading-relaxed text-muted-foreground">
              <CreditCard className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-hi" />
              <span>
                Card details are requested <strong className="text-foreground">when you subscribe</strong> — never at signup.
                You can cancel anytime.
              </span>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-start gap-2 rounded-xl border border-warn/30 bg-warn/10 px-3.5 py-3 text-[11px] leading-relaxed text-warn">
              <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Card checkout is in final onboarding with our payment provider. Join the waitlist and we&apos;ll email
              you the moment your plan can be activated — the free plan stays open meanwhile.
            </div>
            {joined ? (
              <div className="flex items-center justify-center gap-2 rounded-xl border border-pos/40 bg-pos/10 py-3 text-sm font-bold text-pos">
                <Check className="h-4 w-4" /> You&apos;re on the list — watch your inbox
              </div>
            ) : (
              <button
                onClick={joinWaitlist}
                disabled={busy}
                className="qe-btn qe-btn-primary w-full px-4 py-3 text-sm disabled:opacity-60"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Notify me when card checkout is live
              </button>
            )}
          </>
        )}

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
