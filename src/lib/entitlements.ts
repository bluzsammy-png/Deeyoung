// QUANTEDGE PRO — entitlements (shared client/server, pure functions only).
// Source of truth for what a plan unlocks. Server routes enforce (§34);
// client uses the same functions for cosmetic gating (lock overlays).

export type Plan = "TRIAL" | "FREE" | "PREMIUM";
export type UserStatus = "ACTIVE" | "WARNED" | "SUSPENDED" | "BANNED";

export interface EntitledUser {
  plan: string;
  status: string;
  trialEndsAt?: string | Date | null;
}

export const TRIAL_DAYS = 14;

/** Resolve the effective plan, demoting expired trials to FREE. */
export function effectivePlan(user: EntitledUser): Plan {
  if (user.plan === "PREMIUM") return "PREMIUM";
  if (user.plan === "TRIAL") {
    const end = user.trialEndsAt ? new Date(user.trialEndsAt) : null;
    if (!end || Number.isNaN(end.getTime()) || end.getTime() > Date.now()) return "TRIAL";
  }
  return "FREE";
}

/** Premium = paid Pro or an unexpired trial. Enforced server-side on every Pro route. */
export function hasPremiumAccess(user: EntitledUser): boolean {
  return effectivePlan(user) !== "FREE";
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

/** Features locked on the FREE plan (all open during trial/Pro). */
export const PREMIUM_FEATURES = {
  sentinel: "SENTINEL automation — supervised & delegated execution",
  research: "Backtest Lab — bias-guarded strategy validation",
  briefing: "AI Daily Briefing — the morning edge",
} as const;
