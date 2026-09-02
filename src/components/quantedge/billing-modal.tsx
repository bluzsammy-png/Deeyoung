"use client";

// QUANTEDGE PRO — Billing modal. Paystack-backed subscriptions land here;
// until payment rails go live it collects waitlist demand (audited per account).

import { useState } from "react";
import { Check, Clock, Loader2, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { authClient, type SessionUser } from "@/lib/auth-client";
import { effectivePlan, trialDaysLeft } from "@/lib/entitlements";

export const PRO_PRICE_NGN = "₦15,000";
export const PRO_PRICE_USD = "$12";

const PRO_INCLUDES = [
  "SENTINEL automation — Approve & Delegate modes",
  "Backtest Lab with bias-guarded results",
  "AI Daily Briefing before the open",
  "Unlimited paper trading & portfolio intelligence",
  "Priority support",
];

export function BillingModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { toast } = useToast();
  const { data: session } = authClient.useSession();
  const user = session?.user as SessionUser | undefined;
  const [busy, setBusy] = useState(false);

  const plan = user ? effectivePlan(user) : "FREE";
  const daysLeft = user ? trialDaysLeft(user) : null;

  const joinWaitlist = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/billing/waitlist", { method: "POST" });
      if (!res.ok) throw new Error();
      toast({
        title: "You're on the list",
        description: "We'll email you the moment Pro billing goes live. Your trial keeps full access meanwhile.",
      });
    } catch {
      toast({ title: "Couldn't save that", description: "Please retry in a moment.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[440px] border-hairline bg-panel text-foreground">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-left">
            <Sparkles className="h-4 w-4 text-pos" /> Upgrade to Pro
          </DialogTitle>
          <DialogDescription className="text-left">
            {plan === "TRIAL" && daysLeft !== null
              ? `${daysLeft} day${daysLeft === 1 ? "" : "s"} of full access left in your trial.`
              : plan === "PREMIUM"
                ? "You're on Pro — everything is unlocked."
                : "Lock the full terminal back in."}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-2xl border border-hairline bg-panel-2 p-5">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-bold">Pro</span>
            <span className="qe-num text-2xl font-bold">
              {PRO_PRICE_NGN}<span className="text-xs font-medium text-muted-foreground">/mo</span>
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground">≈ {PRO_PRICE_USD}/mo · billed monthly · cancel anytime</p>
          <ul className="mt-4 space-y-2">
            {PRO_INCLUDES.map((f) => (
              <li key={f} className="flex items-start gap-2 text-xs leading-relaxed">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-pos" />
                {f}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-start gap-2 rounded-xl border border-warn/30 bg-warn/10 px-3.5 py-3 text-[11px] leading-relaxed text-warn">
          <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Card payments are launching shortly (Paystack business verification in progress).
          Join the waitlist and we&apos;ll email you the moment checkout is live.
        </div>

        {plan === "PREMIUM" ? (
          <button disabled className="w-full rounded-xl bg-pos/20 py-3 text-sm font-bold text-pos">
            Pro is active
          </button>
        ) : (
          <button
            onClick={joinWaitlist}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-pos py-3 text-sm font-bold text-[#04110a] transition-all hover:brightness-110 disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Notify me when billing is live
          </button>
        )}
      </DialogContent>
    </Dialog>
  );
}
