// DEEYOUNG PRO — pricing tiers + location-aware currency (pure functions).
// Prices are hand-set per currency (rounded, PPP-aware) — no runtime FX math,
// no surprises. NGN is the reference price; everything else is display.

export type CurrencyCode = "NGN" | "USD" | "GBP" | "EUR" | "GHS" | "KES" | "ZAR" | "CAD" | "AUD" | "INR";

export interface Tier {
  key: "STARTER" | "PRO" | "ELITE";
  name: string;
  tagline: string;
  popular?: boolean;
  prices: Record<CurrencyCode, number>;
  features: string[];
}

export const TIERS: Tier[] = [
  {
    key: "STARTER",
    name: "Starter",
    tagline: "The full analytics terminal",
    prices: { NGN: 30000, USD: 24, GBP: 18, EUR: 22, GHS: 330, KES: 3100, ZAR: 440, CAD: 32, AUD: 36, INR: 2000 },
    features: [
      "Every market: stocks, FX majors, gold, crypto, indices and commodities",
      "Multi-factor signal scores, math fully visible",
      "Portfolio risk: concentration, correlation, drawdown",
      "Watchlist + price & signal alerts",
      "Unlimited paper trading",
    ],
  },
  {
    key: "PRO",
    name: "Pro",
    tagline: "Analytics + the action layer",
    popular: true,
    prices: { NGN: 90000, USD: 70, GBP: 56, EUR: 66, GHS: 1000, KES: 9300, ZAR: 1320, CAD: 96, AUD: 110, INR: 6000 },
    features: [
      "Everything in Starter",
      "SENTINEL Approve: it drafts, you decide",
      "Backtest Lab with bias-guarded results",
      "AI Daily Briefing before the open",
      "Catalyst intelligence & alerts",
    ],
  },
  {
    key: "ELITE",
    name: "Elite",
    tagline: "For traders who want it automated",
    prices: { NGN: 210000, USD: 158, GBP: 126, EUR: 150, GHS: 2300, KES: 21400, ZAR: 3040, CAD: 220, AUD: 250, INR: 13800 },
    features: [
      "Everything in Pro",
      "SENTINEL Delegate: auto-executes inside your hard limits",
      "Priority support line",
      "Early access to new engines",
      "Founding-member badge",
    ],
  },
];

export const CURRENCY_SYMBOL: Record<CurrencyCode, string> = {
  NGN: "₦", USD: "$", GBP: "£", EUR: "€", GHS: "GH₵", KES: "KSh", ZAR: "R", CAD: "C$", AUD: "A$", INR: "₹",
};

const REGION_CURRENCY: Record<string, CurrencyCode> = {
  NG: "NGN", US: "USD", GB: "GBP", GH: "GHS", KE: "KES", ZA: "ZAR", CA: "CAD", AU: "AUD", IN: "INR",
  // Eurozone
  DE: "EUR", FR: "EUR", ES: "EUR", IT: "EUR", NL: "EUR", PT: "EUR", IE: "EUR", BE: "EUR", AT: "EUR",
  FI: "EUR", GR: "EUR", LU: "EUR", SK: "EUR", SI: "EUR", HR: "EUR", LT: "EUR", LV: "EUR", EE: "EUR",
};

const TZ_CURRENCY: Record<string, CurrencyCode> = {
  "Africa/Lagos": "NGN", "Africa/Abuja": "NGN", "Africa/Accra": "GHS", "Africa/Nairobi": "KES",
  "Africa/Johannesburg": "ZAR", "Africa/Harare": "USD", "Africa/Cairo": "USD",
  "Europe/London": "GBP", "Europe/Dublin": "EUR", "Europe/Paris": "EUR", "Europe/Berlin": "EUR",
  "Europe/Madrid": "EUR", "Europe/Rome": "EUR", "Europe/Amsterdam": "EUR", "Europe/Lisbon": "EUR",
  "America/New_York": "USD", "America/Chicago": "USD", "America/Denver": "USD",
  "America/Los_Angeles": "USD", "America/Toronto": "CAD", "America/Vancouver": "CAD",
  "Australia/Sydney": "AUD", "Australia/Melbourne": "AUD", "Asia/Kolkata": "INR",
};

/** Detect the visitor's currency from browser locale + timezone. Defaults to USD. */
export function detectCurrency(language?: string | null, timezone?: string | null): CurrencyCode {
  if (language) {
    const region = language.split("-")[1]?.toUpperCase();
    if (region && REGION_CURRENCY[region]) return REGION_CURRENCY[region];
  }
  if (timezone && TZ_CURRENCY[timezone]) return TZ_CURRENCY[timezone];
  if (timezone) {
    const tz = timezone.toLowerCase();
    if (tz.includes("lagos") || tz.includes("abuja")) return "NGN";
    if (tz.includes("accra")) return "GHS";
    if (tz.includes("nairobi")) return "KES";
    if (tz.includes("johannesburg")) return "ZAR";
    if (tz.startsWith("europe/")) return "EUR";
    if (tz.startsWith("australia")) return "AUD";
    if (tz.startsWith("asia/kolk")) return "INR";
  }
  return "USD";
}

export function detectCurrencyFromBrowser(): CurrencyCode {
  if (typeof navigator === "undefined") return "USD";
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return detectCurrency(navigator.language, tz);
}

/** "₦15,000" / "$12" / "KSh 1,550" — no decimals for whole amounts. */
export function formatPrice(ccy: CurrencyCode, amount: number): string {
  const fractionDigits = amount % 1 === 0 ? 0 : 2;
  const formatted = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: 0,
  }).format(amount);
  const sym = CURRENCY_SYMBOL[ccy];
  // Postfix-style currencies keep the code before the number for clarity.
  if (ccy === "KES") return `KSh ${formatted}`;
  return `${sym}${formatted}`;
}

export function tierPrice(tier: Tier, ccy: CurrencyCode): string {
  return formatPrice(ccy, tier.prices[ccy]);
}
