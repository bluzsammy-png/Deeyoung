"use client";

// DEEYOUNG PRO — product analytics event helper (PostHog, env-gated).
// No NEXT_PUBLIC_POSTHOG_KEY configured → this is a silent no-op, so the
// product behaves identically with analytics off. Never throws, never
// blocks a click, never stores anything locally.

type Props = Record<string, string | number | boolean | null | undefined>;

export function track(event: string, props: Props = {}) {
  try {
    if (typeof window === "undefined") return;
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
    void import("posthog-js").then((m) => {
      m.default.capture(event, props);
    }).catch(() => undefined);
  } catch {
    /* analytics must never break the product */
  }
}
