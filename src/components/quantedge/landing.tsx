"use client";

// DEEYOUNG PRO — Landing surface (Crimson Luxe, Graphics 3.0)
//   ✓ WebGL hero: rotating 3D candlestick market city (static drawn fallback)
//   ✓ Tilt-reactive feature cards with hand-drawn SVG data sketches
//   ✓ Full-bleed crimson banners, pricing banner (₦15,000/mo Pro), honest disclosures
//   ✓ Legal (ToS/Privacy/Refund) + support: deyongsltd@gmail.com

import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Activity, ArrowRight, BarChart3, Bell, CheckCircle2, Gauge, Mail, Play, ShieldCheck, Sparkles, TrendingUp } from "lucide-react";
import { useApp } from "@/lib/store";
import { DataBadge, Price, Pct } from "@/components/quantedge/ui-bits";
import { SignalRing } from "@/components/quantedge/charts/widgets";
import { Sparkline } from "@/components/quantedge/charts/core";
import { AuroraBackdrop } from "@/components/quantedge/charts/aurora";
import { LegalModal } from "@/components/quantedge/legal";
import { MediaKitModal } from "@/components/quantedge/media-kit";
import { MEDIA_KIT_ENABLED } from "@/lib/kit";
import { TiltCard } from "@/components/quantedge/three/tilt-card";
import { TIERS, CURRENCY_SYMBOL, detectCurrencyFromBrowser, tierPrice, type CurrencyCode } from "@/lib/pricing";
import type { Quote } from "@/lib/types";

const HeroScene = dynamic(() => import("@/components/quantedge/three/hero-scene"), {
  ssr: false,
  loading: () => <div className="qe-banner absolute inset-0" aria-hidden />,
});

const TICKERS = ["XAUUSD", "EURUSD", "NVDA", "AAPL", "MSFT", "TSLA", "GBPUSD", "META", "USDJPY", "SPY"];
const SUPPORT_EMAIL = "deyongsltd@gmail.com";

/** Location-aware pricing currency: auto-detected, manually overridable, persisted.
 *  Set inside a rAF (not the effect body) to stay hydration-safe: server renders
 *  the USD default, then the detected currency swaps in on the first frame. */
function usePricingCurrency() {
  const [ccy, setCcy] = useState<CurrencyCode>("USD");
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      let initial = detectCurrencyFromBrowser();
      try {
        const saved = localStorage.getItem("dyp-ccy") as CurrencyCode | null;
        if (saved && saved in CURRENCY_SYMBOL) initial = saved;
      } catch { /* private mode */ }
      setCcy(initial);
    });
    return () => cancelAnimationFrame(raf);
  }, []);
  return [ccy, setCcy] as const;
}

export function Landing() {
  const setEntered = useApp((s) => s.setEntered);
  const setLegalModal = useApp((s) => s.setLegalModal);
  const legalModal = useApp((s) => s.legalModal);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [signalDemo] = useState({ score: 84 });
  const [scrolled, setScrolled] = useState(false);
  const [ccy, setCcy] = usePricingCurrency();
  const [kitOpen, setKitOpen] = useState(false);

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
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { alive = false; clearInterval(iv); clearTimeout(t); window.removeEventListener("scroll", onScroll); };
  }, []);

  return (
    <div className="relative min-h-screen overflow-x-clip">
      {/* cinematic backdrop */}
      <AuroraBackdrop />
      <div className="qe-grid-bg pointer-events-none absolute inset-0 opacity-60" />

      {/* nav — glass, lifts on scroll */}
      <header className={`sticky top-0 z-30 transition-all duration-300 ${scrolled ? "qe-glass border-b border-hairline shadow-[0_12px_40px_-20px_rgba(0,0,0,0.8)]" : ""}`}>
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-2.5">
            <EdgeMark />
            <div className="leading-none">
              <span className="qe-display text-[15px] font-bold tracking-tight">DeeYoung<span className="text-brand"> Pro</span></span>
              <span className="mt-0.5 block text-[9px] font-medium uppercase tracking-[0.22em] text-muted-foreground">Read the market. Move first.</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setLegalModal("TOS")} className="hidden rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground sm:block">Terms</button>
            <button onClick={() => setLegalModal("PRIVACY")} className="hidden rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground sm:block">Privacy</button>
            <button onClick={() => setLegalModal("SECURITY")} className="hidden rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground sm:block">Security</button>
            {MEDIA_KIT_ENABLED && (
              <button onClick={() => setKitOpen(true)} className="rounded-lg px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:text-brand">Media Kit</button>
            )}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="hidden rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground md:block">Support</a>
            <button
              onClick={() => setEntered(true)}
              className="qe-glow group inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-[13px] font-semibold text-white transition-transform hover:scale-[1.03] active:scale-[0.98]"
            >
              Open Terminal
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>
        </div>
      </header>

      {/* hero — 3D stage */}
      <section className="relative z-10 mx-auto max-w-6xl px-5 pb-6 pt-8 sm:pt-14">
        <div className="relative">
          {/* WebGL market city behind the headline */}
          <div className="pointer-events-none absolute -inset-x-10 -top-24 bottom-[-120px] sm:bottom-[-60px]">
            <HeroScene />
          </div>

          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }} className="relative">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-brand/25 bg-brand/[0.08] px-3 py-1.5 text-[11px] font-medium text-foreground/90">
              <span className="qe-pulse-dot h-1.5 w-1.5 rounded-full bg-brand text-brand" />
              Serious tools for serious traders — priced for real life
            </div>
            <h1 className="qe-display max-w-3xl text-[42px] font-bold leading-[1.03] tracking-tight sm:text-7xl">
              See what&rsquo;s moving.
              <br />
              Know why it&rsquo;s moving.
              <br />
              <span className="qe-gradient-text">Move first.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-[15px] leading-relaxed text-muted-foreground sm:text-base">
              DeeYoung Pro is a market terminal for people who take their money seriously but don&rsquo;t have a Bloomberg budget. Gold, FX majors and US stocks — price action, news flow and portfolio risk sit in one screen. Every signal shows the math behind its score — seven factors, nothing hidden. When you want a second pair of hands, SENTINEL drafts the trade and waits for your go-ahead. Paper execution until you decide otherwise.
            </p>

            {/* honesty disclosure — surfaced up front */}
            <div className="mt-6 inline-flex max-w-xl items-start gap-2 rounded-xl border border-warn/25 bg-warn/[0.07] px-3.5 py-2.5 text-xs leading-relaxed text-warn">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <strong className="font-semibold">Straight talk:</strong> quotes are <strong className="font-semibold">delayed per exchange terms</strong>, not real-time. Simulated data is always labeled. Paper trading only — your money never moves here.
              </span>
            </div>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <button
                onClick={() => setEntered(true)}
                className="qe-glow group inline-flex items-center gap-2.5 rounded-xl bg-brand px-6 py-3.5 text-sm font-bold text-white transition-transform hover:scale-[1.03] active:scale-[0.98]"
              >
                <Play className="h-4 w-4 fill-current" />
                Open the terminal — it&rsquo;s free
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </button>
              <span className="text-xs text-muted-foreground">No account needed to look around · delayed data · paper trading</span>
            </div>

            {/* honest capability strip */}
            <div className="mt-8 flex flex-wrap items-center gap-2">
              {[
                { k: "26", v: "markets: stocks, FX & gold" },
                { k: "7", v: "signal factors, math visible" },
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
                  <span className="qe-num font-bold text-brand">{s.k}</span>
                  {s.v}
                </motion.span>
              ))}
            </div>
          </motion.div>
        </div>

        {/* live product preview — data-driven proof, red beam */}
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          className="relative mt-14"
        >
          <div className="absolute -inset-x-8 -top-8 bottom-0 rounded-[28px] bg-brand/[0.07] blur-2xl" />
          <div className="qe-brand-glow qe-panel relative overflow-hidden shadow-2xl">
            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-px overflow-hidden">
              <div className="qe-beam h-px w-1/4 bg-gradient-to-r from-transparent via-mint to-transparent" />
            </div>
            <div className="flex items-center justify-between border-b border-hairline px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-neg/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-warn/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-pos/70" />
                <span className="ml-3 text-[11px] font-medium text-muted-foreground">DeeYoung Pro — Live Preview</span>
              </div>
              <div className="flex items-center gap-2">
                <DataBadge state={quotes[0]?.dataState ?? "LIVE"} />
                <span className="qe-num text-[10px] text-muted-foreground">{quotes.length ? `${quotes.length} symbols` : "connecting…"}</span>
              </div>
            </div>

            <div className="grid gap-3 p-4 sm:grid-cols-[1fr_240px]">
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

              <div className="qe-panel-2 hidden flex-col items-center justify-center gap-3 rounded-xl p-4 sm:flex">
                <SignalRing score={signalDemo.score} />
                <div className="text-center">
                  <p className="text-xs font-semibold">NVDA · Strong bullish setup</p>
                  <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">EMA +18 · VWAP +15 · MACD +14 · Catalyst +9</p>
                </div>
                <div className="mt-1 flex w-full items-center justify-between rounded-lg border border-brand/25 bg-brand/10 px-3 py-2">
                  <span className="text-[10px] font-bold tracking-wider text-brand">SENTINEL</span>
                  <span className="text-[10px] text-foreground/80">Approve mode · 1 pending</span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* brand banner strip */}
      <section className="relative z-10 mx-auto mt-14 max-w-6xl px-5">
        <div className="qe-banner relative overflow-hidden rounded-2xl px-6 py-6 sm:px-10">
          <div className="pointer-events-none absolute inset-y-0 w-1/3 qe-shine bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
          <div className="relative flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <p className="qe-label text-brand-hi">Why DeeYoung exists</p>
              <p className="qe-display mt-1.5 text-xl font-bold sm:text-2xl">
                Wall Street tools. <span className="text-brand-hi">A price that makes sense.</span>
              </p>
            </div>
            <button
              onClick={() => setEntered(true)}
              className="group inline-flex shrink-0 items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-black transition-transform hover:scale-[1.03]"
            >
              Try it free for 2 days
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>
        </div>
      </section>

      {/* features — tilt cards with drawn sketches */}
      <section className="relative z-10 mx-auto max-w-6xl px-5 py-16">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              icon: Activity, title: "Multi-factor signals",
              body: "EMA structure, VWAP, RSI, MACD, catalysts and regime — on stocks, FX majors and gold. Every score shows its factor contributions. No black boxes.",
              sketch: (
                <svg viewBox="0 0 120 36" className="h-9 w-full">
                  {[14, 30, 22, 38, 26, 34, 18, 30].map((h, i) => (
                    <rect key={i} x={i * 15 + 2} y={34 - h} width={9} height={h} rx={2} fill={i === 3 ? "#dc2626" : "#3f3f46"} />
                  ))}
                </svg>
              ),
            },
            {
              icon: BarChart3, title: "Catalyst intelligence",
              body: "News becomes intelligence: headline, source, sentiment and strength mapped to your tickers. Verified feeds only — never fabricated.",
              sketch: (
                <svg viewBox="0 0 120 36" className="h-9 w-full">
                  <path d="M4 28 L24 20 L44 24 L64 10 L84 16 L104 6 L116 12" stroke="#ef4444" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="104" cy="6" r="3.4" fill="#dc2626" />
                  <circle cx="24" cy="20" r="2.4" fill="#f5f5f5" />
                </svg>
              ),
            },
            {
              icon: Gauge, title: "Portfolio risk",
              body: "Concentration, correlation, scenario shocks and drawdown. DeeYoung Pro warns when three positions are really one trade.",
              sketch: (
                <svg viewBox="0 0 120 36" className="h-9 w-full">
                  <path d="M8 30 A 52 52 0 0 1 112 30" stroke="#3f3f46" strokeWidth="6" fill="none" strokeLinecap="round" />
                  <path d="M8 30 A 52 52 0 0 1 78 6" stroke="#dc2626" strokeWidth="6" fill="none" strokeLinecap="round" />
                  <circle cx="78" cy="6" r="4.4" fill="#f5f5f5" />
                </svg>
              ),
            },
            {
              icon: ShieldCheck, title: "SENTINEL safety",
              body: "Starts in observe mode. Hard risk limits gate every proposal. One-tap emergency stop. Paper execution, clearly labeled.",
              sketch: (
                <svg viewBox="0 0 120 36" className="h-9 w-full">
                  <path d="M60 3 L88 12 V22 C88 29 74 34 60 34 C46 34 32 29 32 22 V12 Z" fill="none" stroke="#dc2626" strokeWidth="2.4" strokeLinejoin="round" />
                  <path d="M50 18 L57 25 L72 11" stroke="#f5f5f5" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ),
            },
          ].map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ delay: i * 0.08, duration: 0.5 }}
            >
              <TiltCard>
                <div className="qe-panel qe-panel-hover flex h-full flex-col p-5">
                  <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-brand/12 ring-1 ring-brand/30">
                    <f.icon className="h-5 w-5 text-brand-hi" />
                  </div>
                  <h3 className="qe-display mt-3.5 text-[15px] font-bold">{f.title}</h3>
                  <p className="mt-1.5 flex-1 text-xs leading-relaxed text-muted-foreground">{f.body}</p>
                  <div className="mt-4 border-t border-hairline pt-3 opacity-80">{f.sketch}</div>
                </div>
              </TiltCard>
            </motion.div>
          ))}
        </div>

        {/* how it works */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="qe-panel mt-4 p-6 sm:p-8"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="qe-display text-xl font-bold tracking-tight sm:text-2xl">The DeeYoung loop</h2>
            <p className="text-sm text-muted-foreground">read → investigate → decide → act → learn</p>
          </div>
          <div className="mt-7 grid gap-5 sm:grid-cols-5">
            {["Read the regime", "Spot the setup", "Check the risk", "Make the call", "Let SENTINEL draft — you approve"].map((s, i) => (
              <div key={s} className="relative">
                <span className="qe-num inline-flex h-7 w-7 items-center justify-center rounded-lg bg-brand/12 text-xs font-bold text-brand-hi ring-1 ring-brand/25">0{i + 1}</span>
                <p className="mt-2 text-[13px] font-medium leading-snug">{s}</p>
                {i < 4 && <ArrowRight className="absolute -right-2.5 top-1 hidden h-4 w-4 text-muted-foreground/40 sm:block" />}
              </div>
            ))}
          </div>
        </motion.div>

        {/* levels */}
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { lvl: "Level 1", name: "Analytics", body: "Charts, catalysts, regime calls and portfolio risk — one view.", icon: TrendingUp, plan: "Starter" },
            { lvl: "Level 2", name: "Signals", body: "Alerts when something interesting happens on your watchlist.", icon: Bell, plan: "Starter" },
            { lvl: "Level 3", name: "SENTINEL Approve", body: "SENTINEL proposes. You approve or reject — every time.", icon: CheckCircle2, plan: "Pro" },
            { lvl: "Level 4", name: "SENTINEL Delegate", body: "Automatic execution inside your hard limits. Off by default.", icon: Sparkles, plan: "Elite" },
          ].map((l) => (
            <motion.div
              key={l.lvl}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="qe-panel-2 qe-panel-hover p-5"
            >
              <div className="flex items-center justify-between">
                <span className="qe-label text-brand-hi">{l.lvl}</span>
                <l.icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <h3 className="qe-display mt-2 text-sm font-bold">{l.name}</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{l.body}</p>
              <span className="mt-3 inline-block rounded-md border border-brand/25 bg-brand/[0.08] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-brand-hi">
                {l.plan}
              </span>
            </motion.div>
          ))}
        </div>
      </section>

      {/* pricing — three tiers, location-aware currency */}
      <section className="relative z-10 mx-auto max-w-6xl px-5 pb-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="qe-panel relative overflow-hidden rounded-3xl p-7 sm:p-9"
        >
          <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-brand/[0.07] blur-3xl" />
          <div className="relative">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="qe-label text-brand-hi">Pricing</p>
                <h2 className="qe-display mt-2 text-2xl font-bold sm:text-3xl">Three plans. No mystery tiers.</h2>
                <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
                  Full analytics from day one on every plan — no trial games. Card details only when you subscribe,
                  charged when your plan renews, cancel anytime.
                </p>
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                Currency
                <select
                  value={ccy}
                  onChange={(e) => { setCcy(e.target.value as CurrencyCode); try { localStorage.setItem("dyp-ccy", e.target.value); } catch { /* private mode */ } }}
                  className="rounded-lg border border-hairline bg-panel-2 px-2.5 py-1.5 text-xs font-semibold text-foreground outline-none focus:border-brand/50"
                >
                  {(Object.keys(CURRENCY_SYMBOL) as CurrencyCode[]).map((code) => (
                    <option key={code} value={code}>{code}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-7 grid gap-4 lg:grid-cols-3">
              {TIERS.map((tier) => (
                <div
                  key={tier.key}
                  className={`relative flex flex-col rounded-2xl border p-5 ${
                    tier.popular
                      ? "qe-brand-glow border-brand/50 bg-brand/[0.06]"
                      : "border-hairline bg-panel-2"
                  }`}
                >
                  {tier.popular && (
                    <span className="absolute -top-2.5 left-5 rounded-md bg-brand px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
                      Most popular
                    </span>
                  )}
                  <div className="flex items-baseline justify-between">
                    <h3 className="qe-display text-sm font-bold">{tier.name}</h3>
                    <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{tier.tagline}</span>
                  </div>
                  <p className="qe-display mt-3 text-3xl font-bold">
                    {tierPrice(tier, ccy)}
                    <span className="text-sm font-medium text-muted-foreground">/month</span>
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">≈ ₦{tier.prices.NGN.toLocaleString("en-US")} reference price</p>
                  <ul className="mt-4 flex-1 space-y-2 text-xs leading-relaxed text-foreground/85">
                    {tier.features.map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-hi" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => setEntered(true)}
                    className={`mt-5 w-full rounded-xl py-2.5 text-sm font-bold transition-all ${
                      tier.popular
                        ? "qe-glow bg-brand text-white hover:brightness-110"
                        : "border border-hairline bg-panel text-foreground hover:border-brand/40"
                    }`}
                  >
                    Get started
                  </button>
                </div>
              ))}
            </div>

            <p className="mt-5 text-center text-[11px] text-muted-foreground">
              Card checkout is in final onboarding with our payment provider — join the in-app waitlist to be notified
              the moment your plan can be activated. Questions?{" "}
              <a className="text-brand-hi hover:underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
            </p>
          </div>
        </motion.div>
      </section>

      {/* footer with legal + support */}
      <footer className="relative z-10 border-t border-hairline">
        <div className="mx-auto max-w-6xl px-5 py-10">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-sm">
              <div className="flex items-center gap-2.5">
                <EdgeMark size={28} />
                <span className="qe-display text-sm font-bold">DeeYoung<span className="text-brand"> Pro</span></span>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                Market data delayed per exchange terms. Simulated execution only — not real brokerage. Nothing here is investment advice.
              </p>
            </div>
            <div className="flex flex-col gap-2 text-xs text-muted-foreground sm:items-end">
              <div className="flex flex-wrap gap-4 sm:justify-end">
                <button onClick={() => setLegalModal("TOS")} className="transition-colors hover:text-foreground">Terms of Service</button>
                <button onClick={() => setLegalModal("PRIVACY")} className="transition-colors hover:text-foreground">Privacy Policy</button>
                <button onClick={() => setLegalModal("SECURITY")} className="transition-colors hover:text-foreground">Security</button>
                <button onClick={() => setLegalModal("REFUND")} className="transition-colors hover:text-foreground">Refund & Cancellation</button>
                {MEDIA_KIT_ENABLED && (
                  <button onClick={() => setKitOpen(true)} className="font-semibold transition-colors hover:text-brand">Media Kit — film & ads</button>
                )}
                <button onClick={() => setEntered(true)} className="transition-colors hover:text-foreground">Terminal</button>
              </div>
              <a href={`mailto:${SUPPORT_EMAIL}`} className="inline-flex items-center gap-1.5 text-foreground/80 transition-colors hover:text-brand-hi">
                <Mail className="h-3.5 w-3.5" /> {SUPPORT_EMAIL}
              </a>
              <p>© {new Date().getFullYear()} DeeYoungs Ltd. All rights reserved.</p>
            </div>
          </div>
        </div>
      </footer>

      <LegalModal open={legalModal} onClose={() => setLegalModal(null)} />
      <MediaKitModal open={kitOpen} onClose={() => setKitOpen(false)} />
    </div>
  );
}

export function EdgeMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden>
      <defs>
        <radialGradient id="dym-tile" cx="30%" cy="18%" r="105%">
          <stop offset="0%" stopColor="#1b1b1f" />
          <stop offset="55%" stopColor="#101013" />
          <stop offset="100%" stopColor="#070708" />
        </radialGradient>
        <linearGradient id="dym-d" x1="0" y1="0" x2="0.25" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="62%" stopColor="#e8eaef" />
          <stop offset="100%" stopColor="#c3c7d1" />
        </linearGradient>
        <linearGradient id="dym-wire" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#b91c1c" />
          <stop offset="55%" stopColor="#dc2626" />
          <stop offset="100%" stopColor="#f87171" />
        </linearGradient>
        <clipPath id="dym-clip">
          <path d="M148 128 H246 C338 128 402 182 402 260 C402 338 338 392 246 392 H148 Z" />
        </clipPath>
      </defs>
      <rect width="512" height="512" rx="118" fill="url(#dym-tile)" />
      <rect x="10" y="10" width="492" height="492" rx="110" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="2" />
      <path d="M148 128 H246 C338 128 402 182 402 260 C402 338 338 392 246 392 H148 Z" fill="url(#dym-d)" />
      <path d="M228 204 H282 C308 204 326 228 326 260 C326 292 308 316 282 316 H228 Z" fill="#0b0b0d" />
      <g clipPath="url(#dym-clip)">
        <path d="M194 332.8 L436 116.8 L456 139.2 L214 355.2 Z" fill="#0c0c0e" />
        <path d="M199 338.4 L441 122.4 L451 133.6 L209 349.6 Z" fill="url(#dym-wire)" />
      </g>
      <path d="M371 184.4 L443 121.4 L453 132.6 L381 195.6 Z" fill="url(#dym-wire)" />
      <circle cx="461" cy="119" r="10" fill="#ef4444" />
      <circle cx="461" cy="119" r="5.5" fill="#fecaca" />
    </svg>
  );
}
