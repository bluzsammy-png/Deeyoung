"use client";

// QUANTEDGE PRO — Root application shell: landing ↔ terminal.
// Single-page product (per platform constraint): all navigation is in-app.

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useApp } from "@/lib/store";
import { Landing } from "@/components/quantedge/landing";
import { Terminal } from "@/components/quantedge/terminal/terminal";

export function QuantEdgeApp() {
  const entered = useApp((s) => s.entered);
  const setEntered = useApp((s) => s.setEntered);

  // deep-link support: /?terminal=1 enters directly
  useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("terminal")) {
      setEntered(true);
    }
  }, [setEntered]);

  return (
    <AnimatePresence mode="wait">
      {entered ? (
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
      ) : (
        <motion.div key="landing" exit={{ opacity: 0, scale: 0.995 }} transition={{ duration: 0.3 }}>
          <Landing />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
