"use client";

// DEEYOUNG PRO — Legal surfaces modal (ToS / Privacy / Security / Refund).
// Copy lives in src/lib/legal-content.ts, shared with the public /terms and
// /privacy pages so the two surfaces can never drift apart.

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { LEGAL_CONTENT, type LegalDoc } from "@/lib/legal-content";

export type { LegalDoc };

export function LegalModal({ open, onClose }: { open: LegalDoc | null; onClose: () => void }) {
  const c = open ? LEGAL_CONTENT[open] : null;
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
