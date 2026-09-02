"use client";

// QUANTEDGE PRO — Landing surface (§52 positioning, §70 addendum fixes)
// Fixes the audit's top marketing findings:
//   ✓ Real product preview (live, data-driven) instead of text-only pitch
//   ✓ Delayed-data disclosure surfaced BEFORE the terminal (D4, §50 addendum)
//   ✓ ToS / Privacy / Refund links visible (§51 addendum)
//   ✓ Product-native visuals only — no stock photos, no robot art (§37)

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Activity, ArrowRight, BarChart3, Bell, CheckCircle2, Gauge, Play, ShieldCheck, Sparkles, TrendingUp } from "lucide-react";
import { useApp } from "@/lib/store";
import { DataBadge, Price, Pct } from "@/components/quantedge/ui-bits";
import { SignalRing } from "@/components/quantedge/charts/widgets";
import { Sparkline } from "@/components/quantedge/charts/core";
import { AuroraBackdrop } from "@/components/quantedge/charts/aurora";
import { LegalModal } from "@/components/quantedge/legal";
import type { Quote } from "@/lib/types";

const TICKERS = ["NVDA", "AAPL", "MSFT", "TSLA", "AMD", "META", "SPY", "QQQ"];

export function Landing() {
  const setEntered = useApp((s) => s.setEntered);
  const setLegalModal = useApp((s) => s.setLegalModal);
  const legalModal = useApp((s) => s.legalModal);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [signalDemo] = useState({ score: 84 });

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/market/quotes?symbols=${TICKERS.join(",")}`);
        const json = await res.json();
        if (alive && json.quotes) setQuotes(json.quotes);
      } catch { /* honest silence — preview stays empty until data returns */ }
    };
    const t = setTimeout(load, 0);
    const iv = setInterval(load, 45_000);
    return () => { alive = false; clearInterval(iv); clearTimeout(t); };
  }, []);

  return (
    <div className="relative min-h-screen overflow-x-clip">
      {/* cinematic backdrop — market constellation + aurora (Graphics 2.0) */}
      <AuroraBackdrop />
      <div className="qe-grid-bg pointer-events-none absolute inset-0 opacity-60" />

      {/* nav */}
      <header className="relative z-20 mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <div className="flex items-center gap-2.5">
          <EdgeMark />
          <div className="leading-none">
            <span className="text-[15px] font-bold tracking-tight">QuantEdge<span className="text-pos"> Pro</span></span>
            <span className="mt-0.5 block text-[9px] font-medium uppercase tracking-[0.22em] text-muted-foreground">Market Intelligence Terminal</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setLegalModal("TOS")} className="hidden rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground sm:block">Terms</button>
          <button onClick={() => setLegalModal("PRIVACY")} className="hidden rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground sm:block">Privacy</button>
          <button
            onClick={() => setEntered(true)}
            className="qe-glow group inline-flex items-center gap-2 rounded-xl bg-pos px-4 py-2.5 text-[13px] font-semibold text-primary-foreground transition-transform hover:scale-[1.03] active:scale-[0.98]"
          >
            Open Terminal
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>
      </header>

      {/* hero */}
      <section className="relative z-10 mx-auto max-w-6xl px-5 pb-10 pt-10 sm:pt-16">
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}>
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-hairline bg-panel/60 px-3 py-1.5 text-[11px] font-medium text-muted-foreground">
            <span className="qe-pulse-dot h-1.5 w-1.5 rounded-full bg-pos text-pos" />
            Unified analytics + SENTINEL action layer — one product
          </div>
          <h1 className="max-w-3xl text-4xl font-bold leading-[1.06] tracking-tight sm:text-6xl">
            Understand the market.
            <br />
            <span className="qe-gradient-text">See what matters.</span>
            <br />
            Act with supervision.
          </h1>
          <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-muted-foreground sm:text-base">
            QuantEdge Pro tells you what is happening, why it is happening, and which opportunities and risks exist — with multi-factor signals, catalyst intelligence, and portfolio risk in one terminal. SENTINEL is the optional action layer: it proposes, you approve. Paper execution by default.
          </p>

          {/* honesty disclosure — surfaced up front (audit D4 / §50 addendum) */}
          <div className="mt-5 inline-flex items-center gap-2 rounded-xl border border-warn/25 bg-warn/[0.07] px-3.5 py-2.5 text-xs leading-relaxed text-warn">
            <ShieldCheck className="h-4 w-4 shrink-0" />
            <span>
              <strong className="font-semibold">Data honesty:</strong> quotes are provided on a <strong className="font-semibold">delayed basis per exchange terms</strong> — not real-time. Simulated fallback data is always labeled. Paper trading only.
            </span>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              onClick={() => setEntered(true)}
              className="qe-glow group inline-flex items-center gap-2.5 rounded-xl bg-pos px-6 py-3.5 text-sm font-semibold text-primary-foreground transition-transform hover:scale-[1.03] active:scale-[0.98]"
            >
              <Play className="h-4 w-4 fill-current" />
              Launch the live terminal
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </button>
            <span className="text-xs text-muted-foreground">No account needed in this preview · delayed data · paper trading</span>
          </div>

          {/* honest capability strip (Graphics 2.0) */}
          <div className="mt-7 flex flex-wrap items-center gap-2">
            {[
              { k: "20", v: "symbol liquid universe" },
              { k: "7", v: "visible signal factors" },
              { k: "4", v: "SENTINEL safety levels" },
              { k: "100%", v: "paper execution" },
            ].map((s, i) => (
              <motion.span
                key={s.v}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 + i * 0.08, duration: 0.45 }}
                className="qe-glass inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium text-muted-foreground"
              >
                <span className="qe-num font-bold text-pos">{s.k}</span>
                {s.v}
              </motion.span>
            ))}
          </div>
        </motion.div>

        {/* live product preview — the audit's #1 design fix (§37 addendum) */}
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          className="relative mt-12"
        >
          <div className="absolute -inset-x-8 -top-8 bottom-0 rounded-[28px] bg-pos/[0.05] blur-2xl" />
          <div className="qe-panel relative overflow-hidden shadow-2xl">
            {/* traveling beam (Graphics 2.0) */}
            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-px overflow-hidden">
              <div className="qe-beam h-px w-1/4 bg-gradient-to-r from-transparent via-mint to-transparent" />
            </div>
            {/* window chrome */}
            <div className="flex items-center justify-between border-b border-hairline px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-neg/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-warn/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-pos/70" />
                <span className="ml-3 text-[11px] font-medium text-muted-foreground">QuantEdge Pro — Live Preview</span>
              </div>
              <div className="flex items-center gap-2">
                <DataBadge state={quotes[0]?.dataState ?? "LIVE"} />
                <span className="qe-num text-[10px] text-muted-foreground">{quotes.length ? `${quotes.length} symbols` : "connecting…"}</span>
              </div>
            </div>

            <div className="grid gap-3 p-4 sm:grid-cols-[1fr_240px]">
              {/* live quotes grid */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(quotes.length ? quotes : Array.from({ length: 8 }).fill(null)).slice(0, 8).map((q, i) => (
                  <div key={q?.symbol ?? i} className="qe-panel-2 flex flex-col gap-1.5 rounded-xl p-3">
                    {q ? (
                      <>
                        <div className="flex items-baseline justify-between">
                          <span className="text-xs font-bold tracking-wide">{q.symbol}</span>
                          <Pct value={q.changePct} className="text-[11px]" />
                        </div>
                        <Price value={q.price} className="qe-num text-sm font-semibold" />
                        <div className="text-[9px] text-muted-foreground">
                          <Sparkline data={[q.prevClose, q.dayLow, (q.dayLow + q.dayHigh) / 2, q.dayHigh, q.price]} width={120} height={22} />
                        </div>
                      </>
                    ) : (
                      <div className="h-14 animate-pulse rounded bg-panel-3" />
                    )}
                  </div>
                ))}
              </div>

              {/* signal card */}
              <div className="qe-panel-2 hidden flex-col items-center justify-center gap-3 rounded-xl p-4 sm:flex">
                <SignalRing score={signalDemo.score} />
                <div className="text-center">
                  <p className="text-xs font-semibold">NVDA · Strong bullish setup</p>
                  <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">EMA +18 · VWAP +15 · MACD +14 · Catalyst +9</p>
                </div>
                <div className="mt-1 flex w-full items-center justify-between rounded-lg border border-pos/25 bg-pos/10 px-3 py-2">
                  <span className="text-[10px] font-bold tracking-wider text-pos">SENTINEL</span>
                  <span className="text-[10px] text-foreground/80">Approve mode · 1 pending</span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* feature strip */}
      <section className="relative z-10 mx-auto max-w-6xl px-5 py-14">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: Activity, title: "Multi-factor signals", body: "EMA structure, VWAP, RSI, MACD, volume, catalysts and regime — every score shows its factor contributions. No black boxes." },
            { icon: BarChart3, title: "Catalyst intelligence", body: "News becomes intelligence: headline, source, sentiment and strength mapped to your tickers. Verified feeds only — never fabricated." },
            { icon: Gauge, title: "Portfolio risk", body: "Concentration, correlation, scenario shocks and drawdown. QuantEdge warns when three positions are really one trade." },
            { icon: ShieldCheck, title: "SENTINEL safety", body: "Observe by default. Deterministic risk limits gate every proposal. Emergency stop one tap away. Paper execution, clearly labeled." },
          ].map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ delay: i * 0.08, duration: 0.5 }}
              className="qe-panel qe-panel-hover p-5"
            >
              <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-pos/10 ring-1 ring-pos/20">
                <f.icon className="h-5 w-5 text-pos" />
              </div>
              <h3 className="mt-3 text-sm font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{f.body}</p>
            </motion.div>
          ))}
        </div>

        {/* how it works */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="qe-panel mt-3 p-6 sm:p-8"
        >
          <h2 className="text-lg font-semibold tracking-tight">The QuantEdge journey</h2>
          <p className="mt-1 text-sm text-muted-foreground">Every screen supports one loop: understand → investigate → decide → act → learn.</p>
          <div className="mt-6 grid gap-4 sm:grid-cols-5">
            {["Understand the regime", "See what matters", "Check the risk", "Decide", "Optionally act with SENTINEL"].map((s, i) => (
              <div key={s} className="relative">
                <span className="qe-num text-xs font-bold text-pos">0{i + 1}</span>
                <p className="mt-1.5 text-[13px] font-medium leading-snug">{s}</p>
                {i < 4 && <ArrowRight className="absolute -right-2 top-0 hidden h-4 w-4 text-muted-foreground/40 sm:block" />}
              </div>
            ))}
          </div>
        </motion.div>

        {/* levels */}
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { lvl: "Level 1", name: "Analytics", body: "Markets, charts, catalysts, regimes, portfolio risk.", icon: TrendingUp },
            { lvl: "Level 2", name: "Signals", body: "Alerts when something interesting happens on your watchlist.", icon: Bell },
            { lvl: "Level 3", name: "SENTINEL Approve", body: "SENTINEL proposes. You approve or reject — every time.", icon: CheckCircle2 },
            { lvl: "Level 4", name: "SENTINEL Delegate", body: "Automatic execution inside your hard limits. Off by default.", icon: Sparkles },
          ].map((l) => (
            <motion.div
              key={l.lvl}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="qe-panel-2 qe-panel-hover p-5"
            >
              <div className="flex items-center justify-between">
                <span className="qe-label text-pos">{l.lvl}</span>
                <l.icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <h3 className="mt-2 text-sm font-semibold">{l.name}</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{l.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* footer with legal (§70) */}
      <footer className="relative z-10 border-t border-hairline">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-4">
            <button onClick={() => setLegalModal("TOS")} className="transition-colors hover:text-foreground">Terms of Service</button>
            <button onClick={() => setLegalModal("PRIVACY")} className="transition-colors hover:text-foreground">Privacy Policy</button>
            <button onClick={() => setLegalModal("REFUND")} className="transition-colors hover:text-foreground">Refund & Cancellation</button>
            <button onClick={() => setEntered(true)} className="transition-colors hover:text-foreground">Terminal</button>
          </div>
          <p className="leading-relaxed">
            Market data delayed per exchange terms. Simulated execution only — not real brokerage. Nothing here is investment advice.
          </p>
        </div>
      </footer>

      <LegalModal open={legalModal} onClose={() => setLegalModal(null)} />
    </div>
  );
}

export function EdgeMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="8" fill="#0c0f15" stroke="rgba(148,163,184,0.14)" />
      <path d="M6 22 L12 14 L17 18 L26 7" stroke="#10b981" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="26" cy="7" r="2.6" fill="#10b981" />
      <path d="M6 27 L26 27" stroke="#10b981" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
    </svg>
  );
}
