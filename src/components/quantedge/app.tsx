"use client";

// DEEYOUNG PRO — Root application shell: landing ↔ auth ↔ terminal.
// Single-page product (per platform constraint): all navigation is in-app.

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useApp } from "@/lib/store";
import { authClient, type SessionUser } from "@/lib/auth-client";
import { hasPaidAccess, isAccountBlocked } from "@/lib/entitlements";
import { Landing } from "@/components/quantedge/landing";
import { Terminal } from "@/components/quantedge/terminal/terminal";
import { AuthView, BlockedView } from "@/components/quantedge/auth-view";
import { PaywallView } from "@/components/quantedge/paywall";
import { EdgeMark } from "@/components/quantedge/landing";

function AuthSplash() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1.6 }}>
        <EdgeMark size={44} />
      </motion.div>
    </div>
  );
}

export function DeeYoungApp() {
  const entered = useApp((s) => s.entered);
  const setEntered = useApp((s) => s.setEntered);
  const { data: session, isPending } = authClient.useSession();
  const user = session?.user as SessionUser | undefined;

  // deep-link support: /?terminal=1 enters directly, /?reset=<token> opens the reset form
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.has("terminal") || params.has("reset")) {
      setEntered(true);
    }
  }, [setEntered]);

  let content: React.ReactNode;
  if (!entered) {
    content = (
      <motion.div key="landing" exit={{ opacity: 0, scale: 0.995 }} transition={{ duration: 0.3 }}>
        <Landing />
      </motion.div>
    );
  } else if (isPending) {
    content = <AuthSplash key="splash" />;
  } else if (!user) {
    content = <AuthView key="auth" onBack={() => setEntered(false)} />;
  } else if (isAccountBlocked(user.status)) {
    content = <BlockedView key="blocked" status={user.status} />;
  } else if (!hasPaidAccess(user) && user.role !== "ADMIN") {
    // Hard paywall: nothing is free beyond the homepage. Signed-in accounts
    // without a paid plan see the plan picker; admins bypass (operators).
    content = <PaywallView key="paywall" />;
  } else {
    content = (
      <motion.div
        key="terminal"
        initial={{ opacity: 0, scale: 0.995 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="h-screen"
      >
        <Terminal />
      </motion.div>
    );
  }

  return <AnimatePresence mode="wait">{content}</AnimatePresence>;
}
