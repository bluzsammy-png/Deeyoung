"use client";

// DEEYOUNG PRO — PremiumGate: cosmetic lock overlay for gated views.
// Server routes enforce the same rule (402 PREMIUM_REQUIRED); this is UX, not security.

import { useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { Bot, FlaskConical, Lock, Newspaper, TrendingUp, Wallet } from "lucide-react";
import { authClient, type SessionUser } from "@/lib/auth-client";
import { effectivePlan, hasFeature, FEATURE_MIN_RANK, PREMIUM_FEATURES, type GatedFeature } from "@/lib/entitlements";
import { BillingModal } from "@/components/quantedge/billing-modal";

const FEATURE_META: Record<GatedFeature, { icon: typeof Bot; title: string; blurb: string; tier: string }> = {
  signals: {
    icon: TrendingUp,
    title: "Multi-factor signals",
    blurb:
      "Seven factors — EMA structure, VWAP, RSI, MACD, volume, catalysts and regime — scored in the open, with entry, stop and target on every setup. Included with every plan, starting at Starter.",
    tier: "Starter",
  },
  portfolio: {
    icon: Wallet,
    title: "Portfolio risk",
    blurb:
      "Equity, P&L, concentration, correlation and scenario shocks — the numbers that keep one bad week from ending your journey. Included with every plan, starting at Starter.",
    tier: "Starter",
  },
  sentinel: {
    icon: Bot,
    title: "SENTINEL automation",
    blurb:
      "A supervised execution layer that watches your signals around the clock and proposes risk-checked trades for your approval. Paper broker, real discipline. Part of Pro.",
    tier: "Pro",
  },
  research: {
    icon: FlaskConical,
    title: "Backtest Lab",
    blurb:
      "Validate a strategy against years of candles with bias guards on every result. Stop guessing whether your edge is real — measure win rate, drawdown, and R-multiples before you risk money. Part of Pro.",
    tier: "Pro",
  },
  briefing: {
    icon: Newspaper,
    title: "AI Daily Briefing",
    blurb:
      "A grounded morning read of regime, names, and risk — written only from verified market data, never invented. Your five-minute edge before the open. Part of Pro.",
    tier: "Pro",
  },
  delegate: {
    icon: Bot,
    title: "SENTINEL Delegate",
    blurb:
      "Automatic execution inside your hard limits — risk caps, daily loss ceilings and minimum quality bars you set once. Elite hands it the keys, carefully.",
    tier: "Elite",
  },
};

export function PremiumGate({ feature, children }: { feature: GatedFeature; children: ReactNode }) {
  const { data: session } = authClient.useSession();
  const user = session?.user as SessionUser | undefined;
  const [billingOpen, setBillingOpen] = useState(false);

  if (user && hasFeature(user, feature)) return <>{children}</>;
  return (
    <>
      <LockedScreen feature={feature} onUpgrade={() => setBillingOpen(true)} />
      <BillingModal open={billingOpen} onOpenChange={setBillingOpen} />
    </>
  );
}

function LockedScreen({ feature, onUpgrade }: { feature: GatedFeature; onUpgrade: () => void }) {
  const meta = FEATURE_META[feature];
  const Icon = meta.icon;
  const { data: session } = authClient.useSession();
  const user = session?.user as SessionUser | undefined;
  const plan = user ? effectivePlan(user) : "FREE";
  const duringTrial = plan === "TRIAL";

  // Show the other Pro systems on the upsell list (skip the one being viewed).
  const upsellList = (Object.keys(PREMIUM_FEATURES) as GatedFeature[])
    .filter((f) => f !== feature && FEATURE_MIN_RANK[f] >= 3)
    .map((f) => PREMIUM_FEATURES[f]);

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
          <Lock className="h-3 w-3" /> {meta.tier} feature
        </div>
        <h2 className="mt-3 text-xl font-bold tracking-tight">{meta.title}</h2>
        <p className="mx-auto mt-2.5 max-w-[420px] text-[13px] leading-relaxed text-muted-foreground">{meta.blurb}</p>

        {upsellList.length > 0 && (
          <div className="mx-auto mt-5 max-w-[380px] rounded-2xl border border-hairline bg-panel-2 p-4 text-left">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Pro also unlocks</p>
            <ul className="mt-2.5 space-y-1.5 text-xs leading-relaxed">
              {upsellList.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <Lock className="mt-0.5 h-3 w-3 shrink-0 text-brand-hi" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        )}

        <button
          onClick={onUpgrade}
          className="mt-6 w-full rounded-xl bg-brand py-3 text-sm font-bold text-white transition-all hover:brightness-110"
        >
          See plans & subscribe
        </button>
        <p className="mt-2.5 text-[11px] text-muted-foreground/70">
          {duringTrial
            ? "Your 2-day trial shows the full analytics. This system is part of a paid plan — subscribe to unlock it."
            : "Subscribe from any plan to unlock this system."}
        </p>
      </div>
    </motion.div>
  );
}
