"use client";

// DEEYOUNG PRO — PostHog product analytics (env-gated: no key → fully disabled).
// Add NEXT_PUBLIC_POSTHOG_KEY in Railway to activate. See DEPLOY.md.

import { useEffect } from "react";
import posthog from "posthog-js";

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key) return; // analytics disabled by configuration
    posthog.init(key, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
      capture_pageview: false, // SPA: captured manually below
      persistence: "localStorage+cookie",
    });
    posthog.capture("$pageview");
    return () => {
      try { posthog.shutdown(); } catch { /* noop */ }
    };
  }, []);
  return <>{children}</>;
}
