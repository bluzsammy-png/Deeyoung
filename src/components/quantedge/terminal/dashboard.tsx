"use client";

// QUANTEDGE PRO — Unified Dashboard (§53): one screen, one product.
// Understand → Investigate → Decide → Act. Analytics primary; SENTINEL integrated.

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Bot, Newspaper, ShieldAlert, Sparkles, TrendingUp } from "lucide-react";
import { useApp } from "@/lib/store";
import { fmtMoney, fmtPct, fmtPrice, fmtAgo } from "@/lib/format";
import { DataBadge, InfoTip, Pct, Price, SectionHead, StatTile } from "@/components/quantedge/ui-bits";
import { CatalystTimeline, FactorBars, RegimeOrb, SignalRing } from "@/components/quantedge/charts/widgets";
import { Sparkline } from "@/components/quantedge/charts/core";
import type { Catalyst, NewsEnvelope, PortfolioIntelligence, Quote, RegimeState, SignalResult } from "@/lib/types";

interface SignalsPayload {
  regime: RegimeState;
  signals: (SignalResult & { name: string; sector: string; lastPrice: number; changePct: number })[];
  account: { equity: number; cash: number; broker: string };
  sentinel: { mode: string; state: string; killSwitch: boolean };
}

export function DashboardView() {
  const setView = useApp((s) => s.setView);
  const setFocused = useApp((s) => s.setFocusedSymbol);
  const [data, setData] = useState<SignalsPayload | null>(null);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [news, setNews] = useState<NewsEnvelope | null>(null);
  const [briefing, setBriefing] = useState<{ ok: boolean; briefing?: string; message?: string } | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioIntelligence | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [sRes, qRes, nRes, pRes] = await Promise.all([
        fetch("/api/signals"),
        fetch("/api/market/quotes?symbols=SPY,QQQ,IWM,SMH,XLE,XLF"),
        fetch("/api/news"),
        fetch("/api/portfolio"),
      ]);
      const [s, q, n, p] = await Promise.all([sRes.json(), qRes.json(), nRes.json(), pRes.json()]);
      setData(s); setQuotes(q.quotes ?? []); setNews(n); setPortfolio(p.intel ?? null);
    } catch { /* keep last good frame */ }
    setLoading(false);
  }, []);

  const loadBriefing = useCallback(async () => {
    try {
      const b = await (await fetch("/api/ai/briefing", { method: "POST" })).json();
      setBriefing(b);
    } catch {
      setBriefing({ ok: false, message: "AI briefing is temporarily unavailable. Market data and signals continue to work." });
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 0);
    const iv = setInterval(load, 90_000);
    // the briefing is the slowest call — never block the dashboard on it
    const tb = setTimeout(loadBriefing, 200);
    const ib = setInterval(loadBriefing, 300_000);
    return () => { clearInterval(iv); clearTimeout(t); clearInterval(ib); clearTimeout(tb); };
  }, [load, loadBriefing]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning." : hour < 18 ? "Good afternoon." : "Good evening.";
  const opportunities = (data?.signals ?? []).filter((s) => s.direction !== "NEUTRAL" && s.score >= 55).slice(0, 4);

  return (
    <div className="space-y-4">
      {/* ── Header: greeting + regime + portfolio ── */}
      <div className="grid gap-3 lg:grid-cols-[1.35fr_1fr]">
        <div className="qe-panel relative overflow-hidden p-5">
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-pos/[0.07] blur-3xl" />
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[13px] text-muted-foreground">{greeting}</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight">Your market, decoded<span className="text-pos">.</span></h1>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-hairline bg-panel-2 px-3 py-1.5 text-xs">
                  <Bot className="h-3.5 w-3.5 text-pos" />
                  SENTINEL:
                  <span className="font-semibold">{data?.sentinel.mode ?? "…"}</span>
                  {data?.sentinel.killSwitch && <span className="font-bold text-neg">· EMERGENCY STOP</span>}
                </span>
                <button
                  onClick={() => setView("sentinel")}
                  className="group inline-flex items-center gap-1.5 rounded-full bg-pos/10 px-3 py-1.5 text-xs font-semibold text-pos transition-colors hover:bg-pos/20"
                >
                  Review opportunities
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </button>
              </div>
            </div>
            <RegimeOrb regime={data?.regime ?? null} size={128} />
          </div>

          {/* regime explanation (§13 why) */}
          {data?.regime && (
            <div className="mt-4 border-t border-hairline pt-3">
              <p className="text-xs leading-relaxed text-muted-foreground">
                <InfoTip title="Market Regime">
                  The regime is QuantEdge&apos;s read of overall market conditions — trend, volatility, and breadth combined. It adjusts signal thresholds, position sizing, and stop distances so behavior fits the environment.
                </InfoTip>{" "}
                {data.regime.explanation}
              </p>
            </div>
          )}
        </div>

        {/* portfolio strip */}
        <StatTile
          label="Your Portfolio (Paper)"
          value={portfolio ? fmtMoney(portfolio.equity, 0) : "—"}
          sub={portfolio ? (
            <span className="flex items-center gap-2">
              <Pct value={portfolio.totalPnlPct} />
              <span className={portfolio.totalPnl >= 0 ? "text-pos" : "text-neg"}>{fmtMoney(portfolio.totalPnl, 0, true)} total</span>
              <span>·</span>
              <Pct value={portfolio.dayPnlPct} className="!text-[11px]" />
              <span className="text-[11px]">today</span>
            </span>
          ) : "loading…"}
          tip="This is your paper brokerage equity: cash plus positions at delayed market prices. It is simulated money — always."
        >
          {portfolio && portfolio.warnings.length > 0 && (
            <div className="mt-3 rounded-lg border border-warn/25 bg-warn/[0.07] px-3 py-2">
              <p className="flex items-start gap-1.5 text-[11px] leading-snug text-warn">
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {portfolio.warnings[0]}
              </p>
            </div>
          )}
        </StatTile>
      </div>

      {/* ── Market overview ── */}
      <section>
        <SectionHead title="Market overview" sub="Delayed data · indices and sector proxies" right={<DataBadge state={quotes[0]?.dataState ?? "LIVE"} />} />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {quotes.map((q, i) => (
            <motion.button
              key={q.symbol}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              onClick={() => { setFocused(q.symbol); setView("markets"); }}
              className="qe-panel cursor-pointer p-3 text-left transition-colors hover:border-pos/30"
            >
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-bold">{q.symbol}</span>
                <Pct value={q.changePct} className="text-[11px]" />
              </div>
              <Price value={q.price} className="qe-num mt-1 block text-sm font-semibold" />
              <div className="mt-1.5">
                <Sparkline data={[q.prevClose, q.dayLow, q.open, (q.dayLow + q.dayHigh) / 2, q.dayHigh, q.price]} width={130} height={22} />
              </div>
            </motion.button>
          ))}
          {!quotes.length && Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-[86px] animate-pulse rounded-xl bg-panel-2" />)}
        </div>
      </section>

      {/* ── Opportunities + catalysts ── */}
      <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
        {/* opportunities */}
        <section>
          <SectionHead
            title="Top opportunities"
            sub="Multi-factor signal scan across the liquid universe"
            right={
              <button onClick={() => setView("markets")} className="group inline-flex items-center gap-1 text-xs font-semibold text-pos">
                All markets <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </button>
            }
          />
          <div className="space-y-2">
            {opportunities.map((s, i) => (
              <motion.button
                key={s.symbol}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.06 }}
                onClick={() => { setFocused(s.symbol); setView("markets"); }}
                className="qe-panel group flex w-full items-center gap-4 p-4 text-left transition-colors hover:border-pos/30"
              >
                <SignalRing score={s.score} size={64} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold">{s.symbol}</span>
                    <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold tracking-wider ${s.direction === "LONG" ? "bg-pos/15 text-pos" : "bg-neg/15 text-neg"}`}>
                      {s.direction}
                    </span>
                    <Pct value={s.changePct} className="text-[11px]" />
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {s.score >= 75 ? "Strong" : "Building"} {s.direction === "LONG" ? "bullish" : "bearish"} setup · {s.factors.filter((f) => f.contribution !== 0).length} factors aligned
                  </p>
                  <p className="qe-num mt-1 text-[10.5px] text-muted-foreground">
                    Entry {fmtPrice(s.entry)} · Stop {fmtPrice(s.stop)} · Target {fmtPrice(s.target)} · R:R {s.rr.toFixed(1)}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-pos" />
              </motion.button>
            ))}
            {!opportunities.length && !loading && (
              <div className="qe-panel-2 rounded-xl p-5 text-sm text-muted-foreground">
                No setups above the 55 display threshold right now. The scan continues — QuantEdge stays flat when factors conflict. That is by design.
              </div>
            )}
            {loading && Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-[88px] animate-pulse rounded-xl bg-panel-2" />)}
          </div>

          {/* factor breakdown of top signal (§14 visual) */}
          {opportunities[0] && (
            <div className="qe-panel mt-3 p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="qe-label">Signal anatomy — {opportunities[0].symbol}</span>
                <InfoTip title="Signal Score">
                  The score is the sum of factor contributions (each factor has a max weight). It measures alignment, not win probability. Hover each factor for its reasoning.
                </InfoTip>
              </div>
              <FactorBars factors={opportunities[0].factors} />
              <p className="mt-3 border-t border-hairline pt-2.5 text-[11px] leading-relaxed text-muted-foreground">
                <Sparkles className="mr-1 inline h-3 w-3 text-pos" />
                {opportunities[0].explanation}
              </p>
            </div>
          )}
        </section>

        {/* news & catalysts + briefing */}
        <section className="space-y-4">
          {/* AI briefing (grounded §5) */}
          <div className="qe-panel p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="qe-label">AI Morning Briefing</span>
              <InfoTip title="Grounded AI">
                The briefing writer receives only verified numbers from QuantEdge&apos;s data providers and is forbidden from citing anything else. If data degrades, the briefing pauses rather than inventing content.
              </InfoTip>
            </div>
            {briefing?.ok ? (
              <p className="text-[12.5px] leading-relaxed text-foreground/85">{briefing.briefing}</p>
            ) : (
              <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                {briefing?.message ?? "Generating from live data…"}
              </p>
            )}
          </div>

          {/* news (honest §11) */}
          <div className="qe-panel p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="qe-label flex items-center gap-1.5">
                <Newspaper className="h-3.5 w-3.5" /> Catalysts
              </span>
              {news && <DataBadge state={news.state === "OK" ? "LIVE" : "UNAVAILABLE"} />}
            </div>
            {news?.state === "OK" && news.catalysts.length > 0 ? (
              <CatalystTimeline items={news.catalysts.map((c: Catalyst) => ({
                id: c.id, headline: c.headline, source: c.source, publishedAt: c.publishedAt,
                strength: c.strength, sentiment: c.sentiment, tickers: c.tickers, category: c.category,
              }))} />
            ) : (
              <div className="rounded-lg border border-warn/25 bg-warn/[0.06] p-3">
                <p className="text-xs font-semibold text-warn">NEWS DATA UNAVAILABLE</p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  {news?.message ?? "Waiting for provider…"}
                </p>
                <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                  QuantEdge never displays invented news. Volume-based catalysts continue to feed signals from real market data.
                </p>
              </div>
            )}
          </div>

          {/* risk snapshot */}
          {portfolio && (
            <StatTile
              label="Portfolio risk"
              value={`${portfolio.portfolioVolatilityPct.toFixed(1)}%`}
              sub={`vol · HHI concentration ${Math.round(portfolio.concentrationHHI)} · max DD ${portfolio.maxDrawdownPct.toFixed(1)}%`}
              tip="Annualized portfolio volatility (correlation-adjusted), Herfindahl concentration index, and peak-to-trough drawdown of the paper account."
            >
              <div className="mt-3 space-y-2">
                {portfolio.scenarios.slice(0, 2).map((s) => (
                  <div key={s.name} className="flex items-center justify-between rounded-lg bg-panel-2 px-3 py-2 text-xs">
                    <span className="text-muted-foreground">{s.name}</span>
                    <span className="qe-num font-semibold text-neg">{fmtMoney(s.impactUsd, 0)}</span>
                  </div>
                ))}
              </div>
            </StatTile>
          )}
        </section>
      </div>

      {/* ── Recent activity ── */}
      <ActivityStrip />
    </div>
  );
}

function ActivityStrip() {
  const [events, setEvents] = useState<{ id: string; category: string; action: string; detail: string; createdAt: string }[]>([]);
  useEffect(() => {
    fetch("/api/audit").then((r) => r.json()).then((j) => setEvents(j.events?.slice(0, 6) ?? [])).catch(() => {});
  }, []);
  if (!events.length) return null;
  return (
    <section>
      <SectionHead title="Recent activity" sub="Immutable audit trail (last 6 events)" />
      <div className="qe-panel divide-y divide-hairline">
        {events.map((e) => (
          <div key={e.id} className="flex items-center gap-3 px-4 py-2.5 text-xs">
            <span className="rounded-md bg-panel-2 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-muted-foreground">{e.category}</span>
            <span className="font-medium">{e.action.replace(/_/g, " ").toLowerCase()}</span>
            <span className="ml-auto text-[11px] text-muted-foreground">{fmtAgo(e.createdAt)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
