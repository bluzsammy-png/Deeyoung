"use client";

// DEEYOUNG PRO — UI primitives: honesty badges (§50), price flash (§40),
// contextual education ⓘ (§10), stat tiles.

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Info, ChevronDown } from "lucide-react";
import { fmtPct } from "@/lib/format";

// ─── Data honesty badge (LIVE / DELAYED / SIMULATED / STALE) — §50 ────────────

export function DataBadge({ state, className = "" }: { state: string; className?: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    LIVE: { label: "LIVE", cls: "text-pos border-pos/30 bg-pos/10" },
    DELAYED: { label: "DELAYED", cls: "text-warn border-warn/30 bg-warn/10" },
    SIMULATED: { label: "SIMULATED", cls: "text-warn border-warn/40 bg-warn/10" },
    STALE: { label: "STALE", cls: "text-neg border-neg/40 bg-neg/10" },
    UNAVAILABLE: { label: "UNAVAILABLE", cls: "text-muted-foreground border-hairline bg-panel-2" },
  };
  const m = map[state] ?? map.UNAVAILABLE;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[9.5px] font-bold tracking-[0.1em] ${m.cls} ${className}`}>
      {(state === "LIVE") && <span className="qe-pulse-dot h-1.5 w-1.5 rounded-full bg-pos" />}
      {m.label}
    </span>
  );
}

// ─── Price with directional flash on change ───────────────────────────────────

export function Price({ value, className = "", prefix = "$" }: { value: number; className?: string; prefix?: string }) {
  const prev = useRef(value);
  const [flash, setFlash] = useState<"" | "qe-flash-up" | "qe-flash-down">("");
  useEffect(() => {
    const t = setTimeout(() => {
      if (value > prev.current) setFlash("qe-flash-up");
      else if (value < prev.current) setFlash("qe-flash-down");
      prev.current = value;
    }, 0);
    const clear = setTimeout(() => setFlash(""), 950);
    return () => { clearTimeout(t); clearTimeout(clear); };
  }, [value]);
  return (
    <span className={`inline-block rounded px-1 ${flash} ${className}`}>
      {prefix}{value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </span>
  );
}

export function Pct({ value, digits = 2, className = "" }: { value: number; digits?: number; className?: string }) {
  const cls = value > 0 ? "text-pos" : value < 0 ? "text-neg" : "text-muted-foreground";
  return <span className={`qe-num ${cls} ${className}`}>{fmtPct(value, digits)}</span>;
}

// ─── Contextual education ⓘ (§10 — learn without leaving the screen) ──────────

export function InfoTip({ title, children, side = "top" }: { title: string; children: React.ReactNode; side?: "top" | "bottom" }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        aria-label={`What does ${title} mean?`}
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.span
            initial={{ opacity: 0, y: side === "top" ? 4 : -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.16 }}
            className={`qe-glass absolute left-1/2 z-50 w-64 -translate-x-1/2 rounded-xl p-3 text-left shadow-2xl ${side === "top" ? "bottom-6" : "top-6"}`}
          >
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-mint">{title}</span>
            <span className="block text-xs leading-relaxed text-foreground/85">{children}</span>
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

// ─── Stat tile ────────────────────────────────────────────────────────────────

export function StatTile({
  label, value, sub, accent, tip, children,
}: {
  label: string; value: React.ReactNode; sub?: React.ReactNode; accent?: string; tip?: React.ReactNode; children?: React.ReactNode;
}) {
  return (
    <div className="qe-panel flex flex-col justify-between p-4">
      <div className="flex items-center justify-between">
        <span className="qe-label">{label}</span>
        {tip && <InfoTip title={label}>{tip}</InfoTip>}
      </div>
      <div className="mt-2">
        <div className={`qe-num text-2xl font-semibold tracking-tight ${accent ?? ""}`}>{value}</div>
        {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
        {children}
      </div>
    </div>
  );
}

// ─── Section header with optional education link ──────────────────────────────

export function SectionHead({ title, sub, right, learn }: { title: string; sub?: string; right?: React.ReactNode; learn?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div>
        <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
          {title}
          {learn && (
            <button onClick={learn as unknown as () => void} className="text-mint transition-opacity hover:opacity-70" aria-label="Learn more">
              <Info className="h-3.5 w-3.5" />
            </button>
          )}
        </h2>
        {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

// ─── Collapsible "advanced" disclosure (§54 hide complexity) ──────────────────

export function AdvancedPanel({ title = "Advanced", children }: { title?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="qe-panel-2 rounded-xl">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        {title}
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Empty / honest states (§42 friendly errors) ──────────────────────────────

export function HonestState({ title, what, doing, action }: { title: string; what: string; doing: string; action?: React.ReactNode }) {
  return (
    <div className="qe-panel-2 flex flex-col items-start gap-2 rounded-xl p-5">
      <span className="qe-label text-warn">{title}</span>
      <p className="text-sm font-medium">{what}</p>
      <p className="text-xs leading-relaxed text-muted-foreground">{doing}</p>
      {action}
    </div>
  );
}
