// DEEYOUNG PRO — entitlements (shared client/server, pure functions only).
// Source of truth for what a plan unlocks. Server routes enforce (§34);
// client uses the same functions for cosmetic gating (lock overlays).
//
// Plan ladder (monetization v2):
//   FREE    — expired/no trial. Terminal shell + markets stay visible;
//             signals, portfolio risk and all Pro systems lock.
//   TRIAL   — 2 days, no card. Full analytics so users can see what the
//             product does. Pro systems (SENTINEL / Backtest / Briefing) stay
//             locked until they subscribe — the trial shows, it doesn't give away.
//   STARTER — full analytics forever.
//   PRO     — Starter + SENTINEL Approve, Backtest Lab, AI Daily Briefing.
//   ELITE   — Pro + SENTINEL Delegate (automation inside hard limits).
// "PREMIUM" is a legacy stored value, read back as PRO.

export type Plan = "FREE" | "TRIAL" | "STARTER" | "PRO" | "ELITE";
export type UserStatus = "ACTIVE" | "WARNED" | "SUSPENDED" | "BANNED";

export interface EntitledUser {
  plan: string;
  status: string;
  trialEndsAt?: string | Date | null;
}

export const TRIAL_DAYS = 2;

export const PLAN_RANK: Record<Plan, number> = {
  FREE: 0,
  TRIAL: 1,
  STARTER: 2,
  PRO: 3,
  ELITE: 4,
};

/** Feature gates — the minimum plan rank a user needs. Client overlays and
 *  server routes both read from this one map so they can never drift apart. */
export const FEATURE_MIN_RANK = {
  signals: 1, // multi-factor signal scores
  portfolio: 1, // portfolio risk analytics
  sentinel: 3, // SENTINEL incl. Approve mode
  research: 3, // Backtest Lab
  briefing: 3, // AI Daily Briefing
  delegate: 4, // SENTINEL Delegate (automation)
} as const;

export type GatedFeature = keyof typeof FEATURE_MIN_RANK;

/** Resolve the effective plan. Legacy "PREMIUM" maps to PRO; expired trials fall to FREE. */
export function effectivePlan(user: EntitledUser): Plan {
  if (user.plan === "STARTER" || user.plan === "PRO" || user.plan === "ELITE") return user.plan;
  if (user.plan === "PREMIUM") return "PRO";
  if (user.plan === "TRIAL") {
    const end = user.trialEndsAt ? new Date(user.trialEndsAt) : null;
    if (!end || Number.isNaN(end.getTime()) || end.getTime() > Date.now()) return "TRIAL";
  }
  return "FREE";
}

export function planRank(user: EntitledUser): number {
  return PLAN_RANK[effectivePlan(user)];
}

/** Does this user's plan include the feature? */
export function hasFeature(user: EntitledUser, feature: GatedFeature): boolean {
  return planRank(user) >= FEATURE_MIN_RANK[feature];
}

/** Anything better than FREE (trial or any paid plan). Used for soft-gated surfaces. */
export function hasPaidAccess(user: EntitledUser): boolean {
  return planRank(user) >= PLAN_RANK.TRIAL;
}

/** Kept for legacy call sites: previously meant "trial or paid". Now strictly paid. */
export function hasPremiumAccess(user: EntitledUser): boolean {
  return planRank(user) >= PLAN_RANK.PRO;
}

export const PAID_PLANS: readonly Plan[] = ["STARTER", "PRO", "ELITE"];

export function isPaidPlan(plan: string): boolean {
  return (PAID_PLANS as readonly string[]).includes(plan) || plan === "PREMIUM";
}

/** Trial countdown label. Short trials deserve hour-level precision: "47H", "2D". */
export function trialTimeLeftLabel(user: EntitledUser): string | null {
  if (user.plan !== "TRIAL" || !user.trialEndsAt) return null;
  const end = new Date(user.trialEndsAt).getTime();
  if (Number.isNaN(end)) return null;
  const msLeft = end - Date.now();
  if (msLeft <= 0) return "0H";
  const hours = Math.ceil(msLeft / 3_600_000);
  if (hours <= 48) return `${hours}H`;
  return `${Math.ceil(msLeft / 86_400_000)}D`;
}

export function trialDaysLeft(user: EntitledUser): number | null {
  if (user.plan !== "TRIAL" || !user.trialEndsAt) return null;
  const end = new Date(user.trialEndsAt).getTime();
  if (Number.isNaN(end)) return null;
  return Math.max(0, Math.ceil((end - Date.now()) / 86_400_000));
}

export function isAccountBlocked(status: string): boolean {
  return status === "BANNED" || status === "SUSPENDED";
}

/** Feature names shown on lock screens / upgrade prompts. */
export const PREMIUM_FEATURES = {
  signals: "Multi-factor signals — every score shows its math",
  portfolio: "Portfolio risk — concentration, correlation, drawdown",
  sentinel: "SENTINEL automation — supervised execution",
  research: "Backtest Lab — bias-guarded strategy validation",
  briefing: "AI Daily Briefing — the morning edge",
  delegate: "SENTINEL Delegate — automation inside hard limits",
} as const;
