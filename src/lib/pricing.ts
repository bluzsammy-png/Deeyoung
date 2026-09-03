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
    prices: { NGN: 5000, USD: 4, GBP: 3, EUR: 4, GHS: 55, KES: 520, ZAR: 75, CAD: 5, AUD: 7, INR: 350 },
    features: [
      "Every market: stocks, FX majors and gold — charts, regimes, catalysts",
      "Multi-factor signal scores — math visible",
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
    prices: { NGN: 15000, USD: 12, GBP: 9, EUR: 11, GHS: 165, KES: 1550, ZAR: 220, CAD: 16, AUD: 18, INR: 1000 },
    features: [
      "Everything in Starter",
      "SENTINEL Approve — it drafts, you decide",
      "Backtest Lab with bias-guarded results",
      "AI Daily Briefing before the open",
      "Catalyst intelligence & alerts",
    ],
  },
  {
    key: "ELITE",
    name: "Elite",
    tagline: "For traders who want it automated",
    prices: { NGN: 35000, USD: 28, GBP: 22, EUR: 26, GHS: 385, KES: 3600, ZAR: 500, CAD: 38, AUD: 42, INR: 2400 },
    features: [
      "Everything in Pro",
      "SENTINEL Delegate — auto-executes inside your hard limits",
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
