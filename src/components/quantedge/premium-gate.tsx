"use client";

// DEEYOUNG PRO — PremiumGate: cosmetic lock overlay for Pro views.
// Server routes enforce the same rule (402 PREMIUM_REQUIRED); this is UX, not security.

import { useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { Bot, FlaskConical, Lock, Newspaper, Sparkles } from "lucide-react";
import { authClient, type SessionUser } from "@/lib/auth-client";
import { hasPremiumAccess, PREMIUM_FEATURES } from "@/lib/entitlements";
import { BillingModal } from "@/components/quantedge/billing-modal";

const FEATURE_META = {
  sentinel: {
    icon: Bot,
    title: "SENTINEL automation",
    blurb:
      "A supervised execution layer that watches your signals around the clock, proposes risk-checked trades for your approval — or trades your rules automatically in Delegate mode. Paper broker, real discipline.",
  },
  research: {
    icon: FlaskConical,
    title: "Backtest Lab",
    blurb:
      "Validate a strategy against years of candles with bias guards on every result. Stop guessing whether your edge is real — measure win rate, drawdown, and R-multiples before you risk a naira.",
  },
  briefing: {
    icon: Newspaper,
    title: "AI Daily Briefing",
    blurb:
      "A grounded morning read of regime, names, and risk — written only from verified market data, never invented. Your five-minute edge before the open.",
  },
} as const;

export type PremiumFeature = keyof typeof PREMIUM_FEATURES;

export function PremiumGate({ feature, children }: { feature: PremiumFeature; children: ReactNode }) {
  const { data: session } = authClient.useSession();
  const user = session?.user as SessionUser | undefined;
  const [billingOpen, setBillingOpen] = useState(false);

  if (user && hasPremiumAccess(user)) return <>{children}</>;
  return (
    <>
      <LockedScreen feature={feature} onUpgrade={() => setBillingOpen(true)} />
      <BillingModal open={billingOpen} onOpenChange={setBillingOpen} />
    </>
  );
}

function LockedScreen({ feature, onUpgrade }: { feature: PremiumFeature; onUpgrade: () => void }) {
  const meta = FEATURE_META[feature];
  const Icon = meta.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex min-h-[60vh] items-center justify-center"
    >
      <div className="qe-panel relative w-full max-w-[520px] overflow-hidden p-8 text-center">
        <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-brand/[0.09] blur-3xl" />
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/12">
          <Icon className="h-7 w-7 text-brand-hi" />
        </div>
        <div className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-warn/40 bg-warn/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-warn">
          <Lock className="h-3 w-3" /> Pro feature
        </div>
        <h2 className="mt-3 text-xl font-bold tracking-tight">{meta.title}</h2>
        <p className="mx-auto mt-2.5 max-w-[420px] text-[13px] leading-relaxed text-muted-foreground">{meta.blurb}</p>

        <div className="mx-auto mt-5 max-w-[380px] rounded-2xl border border-hairline bg-panel-2 p-4 text-left">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Pro unlocks everything</p>
          <ul className="mt-2.5 space-y-1.5 text-xs leading-relaxed">
            {Object.values(PREMIUM_FEATURES).map((f) => (
              <li key={f} className="flex items-start gap-2">
                <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-brand-hi" />
                {f}
              </li>
            ))}
          </ul>
        </div>

        <button
          onClick={onUpgrade}
          className="mt-6 w-full rounded-xl bg-brand py-3 text-sm font-bold text-white transition-all hover:brightness-110"
        >
          Upgrade to Pro
        </button>
        <p className="mt-2.5 text-[11px] text-muted-foreground/70">
          Your plan changed after the 14-day trial — upgrade to restore full access.
        </p>
      </div>
    </motion.div>
  );
}
