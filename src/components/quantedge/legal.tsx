"use client";

// DEEYOUNG PRO — Legal surfaces (§51 addendum / §70): ToS, Privacy, Refund.
// Plain-language, honest, linked from landing + in-app.

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useApp } from "@/lib/store";

const CONTENT: Record<string, { title: string; body: string[] }> = {
  TOS: {
    title: "Terms of Service",
    body: [
      "DeeYoung Pro provides market analytics, educational content, and simulated (paper) trading tools. By using this preview you agree that DeeYoung Pro is an analytics and education product, not a broker-dealer, investment adviser, or money transmitter.",
      "Nothing in DeeYoung Pro is investment advice, a recommendation, or a guarantee of profit. Signal scores describe factor alignment — an 84% signal score is NOT an 84% probability of winning. All trading shown is simulated paper execution on delayed market data; no real money can be deposited, traded, or withdrawn.",
      "SENTINEL automation operates only inside the limits you configure, only against a paper broker, and can be stopped at any time with the Emergency Stop. You remain responsible for any decisions you make based on information in the product.",
      "Market data is supplied on a delayed basis per exchange terms and may be unavailable or, in degraded states, clearly labeled as simulated. DeeYoung Pro does not warrant uninterrupted or error-free data service.",
      "This service is provided \"as is\" without warranties of any kind. To the maximum extent permitted by law, DeeYoung Pro is not liable for trading losses, lost profits, or data availability failures. These terms may be updated with notice in the product.",
    ],
  },
  PRIVACY: {
    title: "Privacy Policy",
    body: [
      "We collect the minimum data needed to run your terminal: account identifiers, your watchlists, portfolio positions on the paper broker, SENTINEL configuration, and product usage metering (which providers were called and how many units, for cost honesty).",
      "Trading and account state is stored server-side in your account — never only in your browser. Secrets such as broker or data-provider API keys (BYOK) are stored encrypted server-side, are never exposed to the frontend, never logged, and never returned by the API.",
      "We do not sell personal data. Notifications are delivered through the channels you enable (web push, email) and can be disabled per event type with quiet hours in Settings → Notifications.",
      "You may request export or deletion of your account data at any time. Simulated trades and audit events may be retained in aggregate, de-identified form for product reliability and security auditing.",
    ],
  },
  REFUND: {
    title: "Refund & Cancellation Policy",
    body: [
      "DeeYoung Pro's preview tier is free. If a paid subscription is offered in the future, the policy below will apply and will be restated at checkout before any charge.",
      "Cancellation: you may cancel a subscription at any time from Account → Subscription. Access continues to the end of the paid period; we do not prorate partial periods unless required by law.",
      "Refunds: if you are charged in error, or the product was materially unavailable for more than 72 consecutive hours, contact support within 14 days for a full refund of the affected period. Refunds are returned to the original payment method.",
      "Subscriptions purchased through native app stores (if offered) must be cancelled and refunded through that store's own process under Apple/Google policies.",
    ],
  },
};

export function LegalModal({ open, onClose }: { open: "TOS" | "PRIVACY" | "REFUND" | null; onClose: () => void }) {
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
                {c.body.map((p, i) => (
                  <p key={i} className="text-[13px] leading-relaxed text-foreground/85">{p}</p>
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
