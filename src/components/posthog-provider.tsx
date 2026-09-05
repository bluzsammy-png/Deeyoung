"use client";

// DEEYOUNG PRO — PostHog product analytics (env-gated: no key → fully disabled).
// Add NEXT_PUBLIC_POSTHOG_KEY in Railway to activate. See DEPLOY.md.
// Captures: $pageview on EVERY route change (App Router SPA navigations would
// otherwise be invisible after the first load), and identifies signed-in users
// by their real user id (email + plan attached) once per session.

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import posthog from "posthog-js";
import { authClient } from "@/lib/auth-client";

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const identified = useRef<string | null>(null);

  // init once
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key) return; // analytics disabled by configuration
    if (!posthog.__loaded) {
      posthog.init(key, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
        capture_pageview: false, // SPA: captured on route change below
        persistence: "localStorage+cookie",
      });
    }
  }, []);

  // $pageview on every route change (including the first render)
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY || !posthog.__loaded) return;
    posthog.capture("$pageview", { $current_url: window.location.href });
  }, [pathname]);

  // identify signed-in users once per session
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await authClient.getSession();
        const user = data?.user as { id?: string; email?: string; plan?: string } | undefined;
        if (cancelled || !user?.id || identified.current === user.id) return;
        identified.current = user.id;
        posthog.identify(user.id, { email: user.email, plan: user.plan });
      } catch {
        // anonymous visitors stay anonymous — never break the page
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return <>{children}</>;
}
