"use client";

// DEEYOUNG PRO — Legal surfaces (§51 addendum / §70 / §2026-09 privacy+security refresh):
// ToS, Privacy, Security, Refund. Plain-language, honest, linked from landing + in-app.
// Content reflects CURRENT product reality: subscriptions + 2-day trial, MT4/MT5 broker
// linking (AES-256-GCM credential vault), AI Trade Desk, IP rate limits, Turnstile,
// PostHog analytics, Resend transactional email, local-currency pricing.

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useApp } from "@/lib/store";

export type LegalDoc = "TOS" | "PRIVACY" | "SECURITY" | "REFUND";

type Section = { h?: string; ps: string[] };
const CONTENT: Record<LegalDoc, { title: string; sections: Section[] }> = {
  TOS: {
    title: "Terms of Service",
    sections: [
      {
        ps: [
          "Effective September 2026. By creating an account or using DeeYoung Pro you agree to these terms. If you do not agree, do not use the service.",
        ],
      },
      {
        h: "What DeeYoung Pro is",
        ps: [
          "DeeYoung Pro is a market analytics, research, and education platform. We are not a broker-dealer, investment adviser, money manager, or money transmitter. We do not hold, move, or trade your money.",
          "Nothing in DeeYoung Pro is investment advice, a recommendation, or a guarantee of profit. Signal scores describe factor alignment — an 84% signal score is NOT an 84% probability of winning. The AI Trade Desk produces research notes generated from market data and AI models; AI output can be wrong, incomplete, or outdated, and must never be your only input for a decision.",
          "Trading shown inside the terminal is simulated paper execution on delayed market data. Market data is supplied on a delayed basis per exchange terms, may be unavailable, and in degraded states is clearly labeled as simulated or delayed.",
        ],
      },
      {
        h: "Eligibility",
        ps: [
          "You must be at least 18 years old and able to form a binding contract. One account per person; you are responsible for keeping your credentials secure and for all activity under your account. Accounts used for abuse, fraud, scraping, or resale may be suspended or terminated.",
        ],
      },
      {
        h: "Plans, trial, and billing",
        ps: [
          "DeeYoung Pro offers a Free plan, a 2-day trial, and paid subscriptions (Starter, Pro, Elite) priced in your local currency where available. The trial unlocks analytics features only and does not require a card — you cannot be charged during a trial.",
          "Card or payment details are only requested when you actively choose to subscribe, and payment processing is handled by our payment processor at checkout; the exact billing terms are restated at checkout before any charge. Feature availability is gated by plan and enforced server-side. Prices and plan features may change with notice; changes never apply retroactively to a period you have already paid for.",
        ],
      },
      {
        h: "Broker linking (MT4 / MT5)",
        ps: [
          "Optionally, you may link a MetaTrader 4 or MetaTrader 5 account to mirror its data inside your terminal. You authorize us to access that account strictly through the official bridge provider for the purposes you configure. By default the link is read-only (investor mode). Placing orders through a linked account requires your explicit action and an Elite plan with delegated mode confirmed.",
          "You remain solely responsible for anything that happens in your brokerage account, for complying with your broker's own terms, and for the risk of any trade you place — with or without our tools. We never guarantee order execution, pricing, or availability of the bridge.",
        ],
      },
      {
        h: "Acceptable use",
        ps: [
          "Do not scrape, resell, share accounts, attempt to circumvent plan limits or rate limits, probe or attack the service, or use DeeYoung Pro for market manipulation or any unlawful activity. Automated access requires written permission.",
        ],
      },
      {
        h: "Disclaimers and liability",
        ps: [
          "The service is provided \"as is\" without warranties of any kind. To the maximum extent permitted by law, DeeYoungs Ltd is not liable for trading losses, lost profits, or data availability failures. Trading foreign exchange, gold, CFDs, and other instruments carries a high risk of loss and is not suitable for everyone. These terms may be updated with notice in the product; continuing to use the service after an update means you accept it.",
        ],
      },
    ],
  },
  PRIVACY: {
    title: "Privacy Policy",
    sections: [
      {
        ps: [
          "Effective September 2026. This policy explains what DeeYoungs Ltd collects, why, how it is stored, and the control you have. Plain language: we collect the minimum needed to run your terminal, we never sell your data, and broker credentials get the strongest protection we can give them.",
        ],
      },
      {
        h: "What we collect and why",
        ps: [
          "Account data: your email address and a securely hashed password (we can never read your password). Used to create and secure your account and to send transactional email such as address verification and password resets.",
          "Product data: your watchlists, signal configurations, paper portfolio positions, sentinel configuration, and Trade Desk question history — stored server-side so your terminal follows you across devices.",
          "Usage metering: which market-data and AI providers were called and how many units were consumed, so you get cost-honest limits and we can prevent abuse.",
          "Technical data: your IP address (rate limiting, abuse prevention, and security auditing — for example, limiting automated mass signups), and bot-protection checks on signup. We also read your browser locale and timezone once to show prices in your local currency; that preference is stored on your device, not used to profile you.",
          "Product analytics: privacy-respecting, aggregate product analytics (via PostHog) covering page views and feature usage, so we know what to improve. No ad networks, no cross-site tracking, no advertising cookies.",
        ],
      },
      {
        h: "Broker credentials (MT4 / MT5) — special care",
        ps: [
          "If you link a MetaTrader account, your login, server, and password are encrypted with AES-256-GCM before they touch the database, with a unique initialization vector and authentication tag per record. They are never returned by any API, never displayed in the interface after saving, never logged, and never visible to staff in readable form.",
          "Links default to read-only (investor mode). Deleting a link erases the encrypted credentials immediately. You can remove access at any time from Settings → Account, and you can also revoke us from your broker's side.",
        ],
      },
      {
        h: "AI processing",
        ps: [
          "When you ask the Trade Desk a question, your question plus relevant market data (quotes, candles, indicator values) is sent to our AI provider to generate the analysis. We do not send your password, broker credentials, or billing information to the AI provider. Your question history stays in your account and can be deleted by you.",
        ],
      },
      {
        h: "Third parties we rely on",
        ps: [
          "Hosting and database (Supabase PostgreSQL in production), transactional email (Resend), bot protection (Cloudflare Turnstile), product analytics (PostHog), AI models (our AI provider), and — only if you link a broker — the official MetaApi bridge. Each processes data only to deliver the function above. We do not sell personal data, ever.",
        ],
      },
      {
        h: "Storage, retention, and your rights",
        ps: [
          "Data lives server-side in your account (encrypted in transit; broker credentials also encrypted at rest). We retain account data while your account is active. You may request export or deletion of your data at any time by emailing deyongsltd@gmail.com — deletion removes your account, watchlists, history, and encrypted broker credentials. De-identified, aggregate records may be retained for security auditing and product reliability.",
        ],
      },
      {
        h: "Cookies and local storage",
        ps: [
          "We use one session cookie to keep you signed in and local storage for interface preferences (currency, layout). No third-party advertising trackers.",
        ],
      },
    ],
  },
  SECURITY: {
    title: "Security Policy",
    sections: [
      {
        ps: [
          "How we protect DeeYoung Pro and your data — in specifics, not slogans. Last reviewed September 2026.",
        ],
      },
      {
        h: "Encryption",
        ps: [
          "All traffic is encrypted in transit (TLS). Passwords are hashed with a modern password-hashing scheme — plaintext passwords are never stored, logged, or recoverable. Broker credentials (MT4/MT5) are encrypted at rest with AES-256-GCM before entering the database, using a unique IV and authentication tag per record; ciphertext, IV, and tag are stored in separate columns and decrypted only in memory when your terminal needs them.",
        ],
      },
      {
        h: "Application hardening",
        ps: [
          "Every feature request is authorized server-side against your plan — plan locks are enforced in the API, not just hidden in the interface. Cross-account access (IDOR) is tested and blocked: you can only ever read or delete your own records. Strict Content-Security-Policy with frame-ancestors 'none', X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy, Permissions-Policy, and HSTS are served on all routes. CSRF protection validates request origins; signups are rate-limited per network and checked by bot protection; disposable email domains are blocked.",
        ],
      },
      {
        h: "Testing and review",
        ps: [
          "We run internal security reviews on every major change. The latest full audit covered authentication, session and origin validation, authorization on every API route, injection resistance, stored-XSS sinks, secrets hygiene, and security-header configuration. The current audit passed with findings fixed and re-verified; a summary is available on request.",
        ],
      },
      {
        h: "Responsible disclosure",
        ps: [
          "Found a vulnerability? Email deyongsltd@gmail.com with \"SECURITY\" in the subject. We acknowledge reports within 72 hours and will not pursue good-faith researchers who respect user data, avoid service degradation, and give us reasonable time to fix before public disclosure. Please do not run denial-of-service or spam tests.",
        ],
      },
      {
        h: "If something goes wrong",
        ps: [
          "In the event of a data incident affecting your account, we will notify affected users directly without undue delay, describe what happened and what we did, and rotate all potentially affected secrets — including re-keying encrypted broker credentials.",
        ],
      },
    ],
  },
  REFUND: {
    title: "Refund & Cancellation Policy",
    sections: [
      {
        ps: [
          "The Free plan and the 2-day trial cost nothing and require no card — you can never be charged by starting a trial.",
        ],
      },
      {
        h: "Subscriptions",
        ps: [
          "Card details are only requested when you actively choose to subscribe, and the exact billing terms are restated at checkout before any charge. Prices are shown in your local currency where available before you pay.",
          "You may cancel at any time from Account → Subscription. Access continues to the end of the paid period; we do not prorate partial periods unless required by law.",
        ],
      },
      {
        h: "Refunds",
        ps: [
          "If you are charged in error, or the product was materially unavailable for more than 72 consecutive hours, contact deyongsltd@gmail.com within 14 days for a full refund of the affected period. Approved refunds are returned to the original payment method.",
          "Subscriptions purchased through native app stores (if offered) must be cancelled and refunded through that store's own process under Apple/Google policies.",
        ],
      },
    ],
  },
};

export function LegalModal({ open, onClose }: { open: LegalDoc | null; onClose: () => void }) {
  const c = open ? CONTENT[open] : null;
  return (
    <AnimatePresence>
      {c && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-6"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 60, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            onClick={(e) => e.stopPropagation()}
            className="qe-panel flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl"
          >
            <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
              <h2 className="text-base font-semibold">{c.title}</h2>
              <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-panel-3 hover:text-foreground" aria-label="Close">
                <X className="h-4.5 w-4.5" />
              </button>
            </div>
            <div className="qe-scroll overflow-y-auto px-5 py-4">
              <div className="space-y-4">
                {c.sections.map((sec, i) => (
                  <div key={i} className="space-y-2">
                    {sec.h && <h3 className="text-[13px] font-semibold tracking-wide text-foreground">{sec.h}</h3>}
                    {sec.ps.map((p, j) => (
                      <p key={j} className="text-[13px] leading-relaxed text-foreground/85">{p}</p>
                    ))}
                  </div>
                ))}
                <p className="border-t border-hairline pt-3 text-[11px] text-muted-foreground">
                  © DeeYoungs Ltd · Last updated: September 2026 · Questions: deyongsltd@gmail.com
                </p>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
