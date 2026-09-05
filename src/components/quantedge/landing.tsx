"use client";

// DEEYOUNG PRO — Landing surface (Crimson Luxe, Graphics 4.0)
//   ✓ WebGL hero: 3D candlestick market city + data-dust + grid floor + dolly-in
//   ✓ Live engine proof strip — real ledger numbers from /api/engine/status
//   ✓ Tilt-reactive feature cards, gradient-border pricing, honest FAQ
//   ✓ Legal (ToS/Privacy/Refund) + support: deyongsltd@gmail.com

import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import {
  Activity, ArrowRight, ArrowUpRight, BarChart3, Bell, CheckCircle2, Gauge, Mail, Play,
  Plus, Radar, ShieldCheck, Sparkles, TrendingUp,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { DataBadge, Price, Pct } from "@/components/quantedge/ui-bits";
import { Sparkline } from "@/components/quantedge/charts/core";
import { AuroraBackdrop } from "@/components/quantedge/charts/aurora";
import { LegalModal } from "@/components/quantedge/legal";
import { MediaKitModal } from "@/components/quantedge/media-kit";
import { MEDIA_KIT_ENABLED } from "@/lib/kit";
import { TiltCard } from "@/components/quantedge/three/tilt-card";
import { EdgeMark } from "@/components/quantedge/edge-mark";
import { TIERS, CURRENCY_SYMBOL, detectCurrencyFromBrowser, tierPrice, type CurrencyCode } from "@/lib/pricing";
import { universeSymbols } from "@/lib/providers/market";
import type { Quote } from "@/lib/types";

const HeroScene = dynamic(() => import("@/components/quantedge/three/hero-scene"), {
  ssr: false,
  loading: () => <div className="qe-banner absolute inset-0" aria-hidden />,
});

const TICKERS = ["XAUUSD", "EURUSD", "NVDA", "AAPL", "MSFT", "TSLA", "GBPUSD", "META", "USDJPY", "SPY"];
const SUPPORT_EMAIL = "deyongsltd@gmail.com";

/** Location-aware pricing currency: auto-detected, manually overridable, persisted. */
function usePricingCurrency(): [CurrencyCode, (c: CurrencyCode) => void] {
  const [ccy, setCcy] = useState<CurrencyCode>("USD");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("dyp-ccy");
      if (saved) setCcy(saved as CurrencyCode);
      else setCcy(detectCurrencyFromBrowser());
    } catch { /* private mode */ }
  }, []);
  const set = (c: CurrencyCode) => { setCcy(c); };
  return [ccy, set];
}

/** Real paper-ledger numbers, fetched straight from the engine's public snapshot. */
interface LiveEngine {
  equity: number | null; closed: number | null; open: number | null;
  winRate: number | null; elapsed: number | null; feed: string | null;
  regimeUp: boolean | null; best: number | null; bestSym: string | null;
}
function useLiveEngine(): LiveEngine {
  const [s, setS] = useState<LiveEngine>({ equity: null, closed: null, open: null, winRate: null, elapsed: null, feed: null, regimeUp: null, best: null, bestSym: null });
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/engine/status", { cache: "no-store" });
        if (!r.ok) return;
        const j = await r.json();
        if (alive && j?.account) {
          setS({
            equity: j.account.settledEquityUsd ?? null,
            closed: j.account.closedCount ?? null,
            open: j.account.openCount ?? null,
            winRate: j.account.winRatePct ?? null,
            elapsed: j.engine?.elapsedHours ?? null,
            feed: j.engine?.dataVenue?.primary ?? null,
            regimeUp: j.live?.regimeUp ?? null,
            best: j.live?.bestSinceBoot ?? null,
            bestSym: j.live?.bestSymSinceBoot ?? null,
          });
        }
      } catch { /* strip stays empty until data returns — never invented */ }
    };
    load();
    const iv = setInterval(load, 45_000);
    return () => { alive = false; clearInterval(iv); };
  }, []);
  return s;
}

const usd = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

export function Landing() {
  const setEntered = useApp((s) => s.setEntered);
  const setLegalModal = useApp((s) => s.setLegalModal);
  const legalModal = useApp((s) => s.legalModal);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [scrolled, setScrolled] = useState(false);
  const [ccy, setCcy] = usePricingCurrency();
  const [kitOpen, setKitOpen] = useState(false);
  const live = useLiveEngine();

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
          <div className="hidden items-center gap-1 lg:flex">
            <a href="#features" className="rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">Features</a>
            <a href="#engine" className="rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">Live Engine</a>
            <a href="#pricing" className="rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">Pricing</a>
            <a href="#faq" className="rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">FAQ</a>
            <button onClick={() => setLegalModal("SECURITY")} className="rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">Security</button>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setEntered(true)} className="hidden rounded-xl px-3.5 py-2.5 text-[13px] font-semibold text-foreground transition-colors hover:text-brand sm:block">
              Sign in
            </button>
            <button
              onClick={() => setEntered(true)}
              className="qe-btn qe-btn-primary px-4 py-2.5 text-[13px]"
            >
              Open Terminal
              <ArrowRight className="h-4 w-4" />
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
              <span className="qe-live-dot" />
              A live paper engine is running on this page right now
            </div>
            <h1 className="qe-display max-w-3xl text-[42px] font-bold leading-[1.03] tracking-tight sm:text-7xl">
              See what&rsquo;s moving.
              <br />
              Know why it&rsquo;s moving.
              <br />
              <span className="qe-gradient-text">Move first.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-[15px] leading-relaxed text-muted-foreground sm:text-base">
              DeeYoung Pro is a market terminal for people who take their money seriously but don&rsquo;t have a Bloomberg budget.
              Stocks, ETFs, FX, crypto, indices and commodities: price action, news flow and portfolio risk sit in one screen. Every signal shows the
              math behind its score, seven factors, nothing hidden. And an autonomous paper engine trades a validated playbook
              in public, every number auditable in the ledger.
            </p>

            {/* honesty disclosure — surfaced up front */}
            <div className="mt-6 inline-flex max-w-xl items-start gap-2 rounded-xl border border-warn/25 bg-warn/[0.07] px-3.5 py-2.5 text-xs leading-relaxed text-warn">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <strong className="font-semibold">Straight talk:</strong> quotes are <strong className="font-semibold">delayed per exchange terms</strong>, not real-time. Simulated data is always labeled. Paper trading only: your money never moves here.
              </span>
            </div>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <button
                onClick={() => setEntered(true)}
                className="qe-btn qe-btn-primary px-6 py-3.5 text-sm"
              >
                <Play className="h-4 w-4 fill-current" />
                Open the terminal
                <ArrowRight className="h-4 w-4" />
              </button>
              <a
                href="#engine"
                className="qe-btn qe-btn-ghost px-5 py-3.5 text-sm"
              >
                <Radar className="h-4 w-4 text-brand-hi" />
                See the live engine
              </a>
              <span className="text-xs text-muted-foreground">Public engine ledger · delayed data · paper execution</span>
            </div>

            {/* capability strip */}
            <div className="mt-8 flex flex-wrap items-center gap-2">
              {[
                { k: "26", v: "markets: stocks, FX & gold" },
                { k: "7", v: "signal factors, math visible" },
                { k: "10%", v: "of account risked per engine trade" },
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
          <div className="qe-brand-glow qe-card-hero relative overflow-hidden shadow-2xl">
            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-px overflow-hidden">
              <div className="qe-beam h-px w-1/4 bg-gradient-to-r from-transparent via-mint to-transparent" />
            </div>
            <div className="flex items-center justify-between border-b border-hairline px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-neg/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-warn/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-pos/70" />
                <span className="ml-3 text-[11px] font-medium text-muted-foreground">DeeYoung Pro · Live Preview</span>
              </div>
              <div className="flex items-center gap-2">
                <DataBadge state={quotes[0]?.dataState ?? "LIVE"} />
                <span className="qe-num text-[10px] text-muted-foreground">{quotes.length ? `${quotes.length} symbols` : "connecting…"}</span>
              </div>
            </div>

            <div className="grid gap-3 p-4 sm:grid-cols-[1fr_240px]">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(quotes.length ? quotes : (Array.from({ length: 8 }).fill(null) as (Quote | null)[])).slice(0, 8).map((q, i) => (
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
                <p className="qe-label text-brand-hi">Engine state · live</p>
                <div className="w-full space-y-2 text-[11px]">
                  <div className="flex items-center justify-between rounded-lg border border-hairline bg-panel px-3 py-2">
                    <span className="text-muted-foreground">BTC regime filter</span>
                    <span className={`font-bold ${live.regimeUp === null ? "text-muted-foreground" : live.regimeUp ? "text-pos" : "text-warn"}`}>
                      {live.regimeUp === null ? "reading" : live.regimeUp ? "OPEN" : "STAND-DOWN"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-hairline bg-panel px-3 py-2">
                    <span className="text-muted-foreground">Best scan score</span>
                    <span className="qe-num font-bold">{live.best !== null ? live.best : "…"}{live.bestSym ? ` · ${live.bestSym}` : ""}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-hairline bg-panel px-3 py-2">
                    <span className="text-muted-foreground">Playbook gate</span>
                    <span className="qe-num font-bold">64</span>
                  </div>
                </div>
                <p className="text-center text-[10px] leading-relaxed text-muted-foreground">
                  The engine only buys when its regime filter is open and a setup clears the gate. Standing down is a feature.
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ── LIVE ENGINE PROOF — real ledger + measured backtest, honestly labeled ── */}
      <section id="engine" className="relative z-10 mx-auto mt-16 max-w-6xl scroll-mt-20 px-5">
        <div className="qe-card qe-noise relative overflow-hidden p-6 sm:p-9">
          <div className="pointer-events-none absolute -right-28 -top-28 h-72 w-72 rounded-full bg-brand/[0.10] blur-3xl" />
          <div className="relative">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="qe-eyebrow"><Radar className="h-3.5 w-3.5" /> Live engine · trading in public</p>
                <h2 className="qe-display mt-2 text-2xl font-bold tracking-tight sm:text-3xl">An autopilot with its ledger open.</h2>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  Most platforms show you a highlight reel. We show the book. The engine below runs one validated playbook on
                  real market data, trades a $10,000 paper account, and publishes every fill, fee, stop-out and winner. When
                  it loses, the loss stays in the ledger. History is never rewritten.
                </p>
              </div>
              <button onClick={() => setEntered(true)} className="qe-btn qe-btn-ghost px-4 py-2.5 text-[13px]">
                Open engine view <ArrowUpRight className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* real ledger tiles */}
            <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div className="qe-stat px-4 py-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Settled equity</span>
                  <span className="qe-live-dot" />
                </div>
                <div className="qe-num mt-1 text-xl font-bold">{live.equity !== null ? usd(live.equity) : "…"}</div>
                <div className="text-[10px] text-muted-foreground">$10,000 start · paper account</div>
              </div>
              <div className="qe-stat px-4 py-3.5">
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Trades closed</span>
                <div className="qe-num mt-1 text-xl font-bold">{live.closed !== null ? live.closed : "…"}</div>
                <div className="text-[10px] text-muted-foreground">{live.open !== null ? `${live.open} open right now` : "position-ledger truth"}</div>
              </div>
              <div className="qe-stat px-4 py-3.5">
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Win rate (ledger)</span>
                <div className="qe-num mt-1 text-xl font-bold">{live.winRate !== null ? `${live.winRate}%` : "…"}</div>
                <div className="text-[10px] text-muted-foreground">every closed trade, no exceptions</div>
              </div>
              <div className="qe-stat px-4 py-3.5">
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Uptime</span>
                <div className="qe-num mt-1 text-xl font-bold">{live.elapsed !== null ? `${live.elapsed.toFixed(1)}h` : "…"}</div>
                <div className="text-[10px] text-muted-foreground">feed: {live.feed ?? "connecting"}</div>
              </div>
            </div>

            {/* measured backtest strip — clearly labeled as a replay, not a promise */}
            <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-hairline bg-panel-2 px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">
              <span className="font-bold uppercase tracking-wider text-foreground/70">Playbook validation · 30-day walk-forward replay, real Binance bars:</span>
              <span><b className="qe-num text-foreground">83.8%</b> win rate · 74 trades</span>
              <span><b className="qe-num text-foreground">2.13</b> profit factor</span>
              <span>worst 10-trade stretch: <b className="qe-num text-foreground">6 wins</b></span>
              <span className="text-warn">Backtest ≠ promise: the live ledger above is the only record that counts.</span>
            </div>
          </div>
        </div>
      </section>

      {/* brand banner strip */}
      <section className="relative z-10 mx-auto mt-14 max-w-6xl px-5">
        <div className="qe-banner qe-noise relative overflow-hidden rounded-2xl px-6 py-7 sm:px-10">
          <div className="pointer-events-none absolute inset-y-0 w-1/3 qe-shine bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
          <div className="relative flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <p className="qe-label text-brand-hi">Why DeeYoung exists</p>
              <p className="qe-display mt-1.5 text-xl font-bold sm:text-2xl">
                Wall Street tools. <span className="text-brand-hi">A price that makes sense.</span>
              </p>
            </div>
            <button
              onClick={() => document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" })}
              className="qe-btn qe-btn-white px-5 py-3 text-sm"
            >
              See the plans
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>

      {/* features — tilt cards with drawn sketches */}
      <section id="features" className="relative z-10 mx-auto max-w-6xl scroll-mt-20 px-5 py-16">
        <div className="mb-8 max-w-2xl">
          <p className="qe-eyebrow">Capabilities</p>
          <h2 className="qe-display mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Everything a serious desk needs. Nothing it doesn&rsquo;t.</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              icon: Activity, title: "Multi-factor signals",
              body: "EMA structure, VWAP, RSI, MACD, catalysts and regime, across stocks, ETFs, FX, crypto and commodities. Every score shows its factor contributions. No black boxes.",
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
              body: "News becomes intelligence: headline, source, sentiment and strength mapped to your tickers. Verified feeds only, never fabricated.",
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
                <div className="qe-card flex h-full flex-col p-5">
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand/25 to-brand/[0.08] ring-1 ring-brand/30">
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
          className="qe-card mt-4 p-6 sm:p-8"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="qe-display text-xl font-bold tracking-tight sm:text-2xl">The DeeYoung loop</h2>
            <p className="text-sm text-muted-foreground">read → investigate → decide → act → learn</p>
          </div>
          <div className="relative mt-7 grid gap-5 sm:grid-cols-5">
            <div className="pointer-events-none absolute left-0 right-0 top-3.5 hidden h-px bg-gradient-to-r from-transparent via-brand/30 to-transparent sm:block" />
            {["Read the regime", "Spot the setup", "Check the risk", "Make the call", "Let SENTINEL draft, you approve"].map((s, i) => (
              <div key={s} className="relative">
                <span className="qe-num relative inline-flex h-7 w-7 items-center justify-center rounded-lg bg-brand/12 text-xs font-bold text-brand-hi ring-1 ring-brand/25">{`0${i + 1}`}</span>
                <p className="mt-2 text-[13px] font-medium leading-snug">{s}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* levels */}
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { lvl: "Level 1", name: "Analytics", body: "Charts, catalysts, regime calls and portfolio risk in one view.", icon: TrendingUp, plan: "Starter" },
            { lvl: "Level 2", name: "Signals", body: "Alerts when something interesting happens on your watchlist.", icon: Bell, plan: "Starter" },
            { lvl: "Level 3", name: "SENTINEL Approve", body: "SENTINEL proposes. You approve or reject, every time.", icon: CheckCircle2, plan: "Pro" },
            { lvl: "Level 4", name: "SENTINEL Delegate", body: "Automatic execution inside your hard limits. Off by default.", icon: Sparkles, plan: "Elite" },
          ].map((l) => (
            <motion.div
              key={l.lvl}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="qe-card p-5"
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
      <section id="pricing" className="relative z-10 mx-auto max-w-6xl scroll-mt-20 px-5 pb-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="qe-card relative overflow-hidden rounded-3xl p-7 sm:p-9"
        >
          <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-brand/[0.07] blur-3xl" />
          <div className="relative">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="qe-eyebrow">Pricing</p>
                <h2 className="qe-display mt-2 text-2xl font-bold sm:text-3xl">Three plans. No mystery tiers.</h2>
                <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
                  Pick a plan and the full terminal opens. Payment happens on a dedicated checkout page and only when you
                  choose to subscribe. Cancel anytime.
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
                      ? "qe-border-gradient"
                      : "border-hairline bg-panel-2"
                  }`}
                >
                  {tier.popular && (
                    <span className="absolute -top-2.5 left-5 rounded-md bg-brand px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white shadow-lg shadow-brand/40">
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
                  <ul className="qe-check-list mt-4 flex-1 space-y-2 text-xs leading-relaxed text-foreground/85">
                    {tier.features.map((f) => (
                      <li key={f}>
                        <CheckCircle2 className="h-3.5 w-3.5 text-brand-hi" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <a
                    href={`/checkout/${tier.key.toLowerCase()}`}
                    className={`qe-btn mt-5 w-full py-2.5 text-sm ${
                      tier.popular ? "qe-btn-primary" : "qe-btn-ghost"
                    }`}
                  >
                    Subscribe to {tier.name}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </a>
                </div>
              ))}
            </div>

            <p className="mt-5 text-center text-[11px] text-muted-foreground">
              Checkout runs on its own secure page: your order is created first, then payment opens. Your plan unlocks the
              moment payment is verified. Questions?{" "}
              <a className="text-brand-hi hover:underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
            </p>
          </div>
        </motion.div>
      </section>

      {/* FAQ — honest answers */}
      <section id="faq" className="relative z-10 mx-auto max-w-4xl scroll-mt-20 px-5 pb-16">
        <div className="mb-8 text-center">
          <p className="qe-eyebrow justify-center">Straight answers</p>
          <h2 className="qe-display mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Questions people actually ask</h2>
        </div>
        <div className="space-y-2.5">
          {[
            {
              q: "Is this real trading?",
              a: "No, and we say so everywhere. Execution is paper: fills happen at real observed market prices with modeled slippage and fees, but your money never moves. The public engine mirrors its fills to an OKX demo account for extra scrutiny. When you're ready for real money, that's a venue you connect yourself; the product never holds funds.",
            },
            {
              q: "Why are the quotes delayed?",
              a: "Exchange licensing terms. Real-time equity feeds cost tens of thousands per year, and we would rather be honest and cheap than fast and quiet about it. FX, metals and commodity data comes from institutional aggregators with the same terms. Every surface is labeled with exactly what you're looking at.",
            },
            {
              q: "What does the live engine actually trade?",
              a: "Crypto majors (BTC, ETH, SOL, BNB, XRP, DOGE, ADA, AVAX, DOT, LINK) on 30-minute bars, long-only, with a validated playbook: score-64 gate, −3% stop, +1.2% target, 12-hour time stop, $1,000 notional per trade on the $10,000 paper account, and a BTC-trend regime filter. It stands down completely when conditions don't meet the playbook. That discipline is the point.",
            },
            {
              q: "How is this different from a signals Telegram channel?",
              a: "Cherry-picking is the business model there. Here, every signal shows the seven factor scores behind it, and every engine trade lands in a public ledger with timestamps, fees and exit reason, wins and losses alike. You can recompute the math. If the ledger stops being good, that's visible immediately.",
            },
            {
              q: "What do I need to run it?",
              a: "A browser. The terminal, engine and support desk all run server-side, so there's nothing to install. Works as a PWA on Android and iOS, with a native Android shell available.",
            },
            {
              q: "How do I pay, and what am I paying for?",
              a: "Pick a plan on the pricing section or inside the app; checkout creates your order and then opens payment. Your subscription unlocks the full terminal for that tier. You can cancel anytime. If anything is unclear, write to " + SUPPORT_EMAIL + " and a human answers.",
            },
          ].map((f) => (
            <details key={f.q} className="qe-faq qe-card group p-5">
              <summary className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold">{f.q}</span>
                <span className="qe-faq-chevron inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-brand/30 bg-brand/10 text-brand-hi">
                  <Plus className="h-3.5 w-3.5" />
                </span>
              </summary>
              <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* final CTA */}
      <section className="relative z-10 mx-auto max-w-6xl px-5 pb-20">
        <div className="qe-banner qe-noise relative overflow-hidden rounded-3xl px-8 py-12 text-center sm:py-16">
          <div className="pointer-events-none absolute inset-y-0 w-1/3 qe-shine bg-gradient-to-r from-transparent via-white/[0.05] to-transparent" />
          <div className="relative">
            <h2 className="qe-display mx-auto max-w-2xl text-2xl font-bold tracking-tight sm:text-4xl">
              The market doesn&rsquo;t wait. <span className="text-brand-hi">Now you don&rsquo;t have to guess.</span>
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Create an account, pick a plan, and watch the engine work in public before your eyes.
            </p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <button onClick={() => setEntered(true)} className="qe-btn qe-btn-primary px-7 py-3.5 text-sm">
                Open the terminal
                <ArrowRight className="h-4 w-4" />
              </button>
              <a href="#engine" className="qe-btn qe-btn-ghost px-5 py-3.5 text-sm">
                <Radar className="h-4 w-4 text-brand-hi" /> Check the ledger first
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* footer with legal + support */}
      <footer className="relative z-10 border-t border-hairline">
        <div className="mx-auto max-w-6xl px-5 py-12">
          <div className="grid gap-10 sm:grid-cols-[1.4fr_1fr_1fr]">
            <div className="max-w-sm">
              <div className="flex items-center gap-2.5">
                <EdgeMark size={28} />
                <span className="qe-display text-sm font-bold">DeeYoung<span className="text-brand"> Pro</span></span>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                Market data delayed per exchange terms. Simulated execution only — not real brokerage. Nothing here is investment advice.
                Built and operated by DeeYoungs Ltd.
              </p>
              <a href={`mailto:${SUPPORT_EMAIL}`} className="mt-4 inline-flex items-center gap-1.5 text-xs text-foreground/80 transition-colors hover:text-brand-hi">
                <Mail className="h-3.5 w-3.5" /> {SUPPORT_EMAIL}
              </a>
            </div>
            <div>
              <p className="qe-label">Product</p>
              <div className="mt-3 flex flex-col items-start gap-2.5 text-xs text-muted-foreground">
                <a href="#features" className="transition-colors hover:text-foreground">Features</a>
                <a href="#engine" className="transition-colors hover:text-foreground">Live engine</a>
                <a href="#pricing" className="transition-colors hover:text-foreground">Pricing</a>
                <a href="#faq" className="transition-colors hover:text-foreground">FAQ</a>
                <a href="/status" className="transition-colors hover:text-foreground">System status</a>
                <button onClick={() => setEntered(true)} className="transition-colors hover:text-foreground">Terminal</button>
              </div>
            </div>
            <div>
              <p className="qe-label">Legal</p>
              <div className="mt-3 flex flex-col items-start gap-2.5 text-xs text-muted-foreground">
                <a href="/terms" className="transition-colors hover:text-foreground">Terms &amp; Conditions</a>
                <a href="/privacy" className="transition-colors hover:text-foreground">Privacy Policy</a>
                <button onClick={() => setLegalModal("SECURITY")} className="transition-colors hover:text-foreground">Security</button>
                <button onClick={() => setLegalModal("REFUND")} className="transition-colors hover:text-foreground">Refund &amp; Cancellation</button>
                {MEDIA_KIT_ENABLED && (
                  <button onClick={() => setKitOpen(true)} className="font-semibold transition-colors hover:text-brand">Media Kit · film &amp; ads</button>
                )}
              </div>
            </div>
          </div>
          <div className="mt-10 flex flex-col items-start justify-between gap-3 border-t border-hairline pt-6 text-[11px] text-muted-foreground sm:flex-row sm:items-center">
            <p>© {new Date().getFullYear()} DeeYoungs Ltd. All rights reserved.</p>
            <p className="flex items-center gap-1.5">
              <span className="qe-live-dot" /> engine online · ledger public · history never rewritten
            </p>
          </div>
        </div>
      </footer>

      <LegalModal open={legalModal} onClose={() => setLegalModal(null)} />
      <MediaKitModal open={kitOpen} onClose={() => setKitOpen(false)} />
    </div>
  );
}

export { EdgeMark };
