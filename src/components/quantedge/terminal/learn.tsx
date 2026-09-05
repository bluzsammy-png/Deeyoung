"use client";

// DEEYOUNG PRO — Help / Learn Center (§9): friendly, visual, searchable,
// beginner-first. Not a technical manual.

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BookOpen, ChevronDown, Search } from "lucide-react";
import { SectionHead } from "@/components/quantedge/ui-bits";

interface Article { q: string; a: string; tags: string[] }
type Section = { id: string; title: string; blurb: string; articles: Article[] };

const SECTIONS: Section[] = [
  {
    id: "start",
    title: "Start here",
    blurb: "The 60-second mental model",
    articles: [
      { q: "What is DeeYoung Pro?", a: "An AI-powered market intelligence and trading terminal. It tells you what is happening in the market, why it is happening, which opportunities and risks exist; and, only if you ask, it can help you act through SENTINEL. Analytics is the primary product; SENTINEL is the optional action layer.", tags: ["basics"] },
      { q: "Analytics vs SENTINEL", a: "Analytics is the brain that never sleeps: market data, signals, catalysts, regimes, portfolio risk. SENTINEL sits on top as the hands: it takes Analytics' findings and, inside your limits, can propose or execute trades. SENTINEL can be fully disabled and Analytics keeps working. They are one product to you; the split is internal architecture.", tags: ["basics"] },
      { q: "What is a Signal?", a: "A signal is a setup where multiple measured factors align: trend structure (EMA), intraday control (VWAP), momentum (RSI, MACD), stretch (Bollinger), participation (relative volume), verified catalysts, and the market regime. Each factor contributes points; the total is the signal score.", tags: ["signals"] },
      { q: "What is Signal Confidence?", a: "It is the signal score: a measure of factor alignment, NOT a probability of winning. An 84% score does not mean 84% of these trades win. It means 84 points of alignment on a 100-point scale. Honest framing, always.", tags: ["signals"] },
      { q: "What is a Catalyst?", a: "An event that can move a price: earnings, guidance, analyst actions, contracts, regulatory decisions, unusual volume. DeeYoung only shows catalysts from verified providers. If no news provider is connected, the catalyst feed says NEWS DATA UNAVAILABLE; it never invents headlines. Volume-based catalysts keep working from real market data.", tags: ["catalysts"] },
      { q: "What is Market Regime?", a: "DeeYoung's read of overall conditions (Risk-On, Risk-Off, High Volatility, Sideways, Momentum) computed from index trends, breadth, and volatility. The regime adjusts signal thresholds, position sizing, and stop distances, so behavior fits the environment.", tags: ["regime"] },
      { q: "What is Paper Trading?", a: "Simulated trading against delayed market prices with modeled slippage, spread, and latency. Real money is never involved. Orders are clearly labeled 'DeeYoung Simulated'. Connecting Alpaca Paper (BYOK) routes fills to Alpaca's paper endpoint instead.", tags: ["paper"] },
    ],
  },
  {
    id: "analytics",
    title: "Analytics",
    blurb: "Reading the market like an analyst",
    articles: [
      { q: "Understanding VWAP", a: "Volume-Weighted Average Price: the average price weighted by volume through the session. Institutions benchmark against it: trading above VWAP means buyers have paid more as the day progressed (control), below means sellers do. DeeYoung weighs your position vs VWAP at up to 15 points.", tags: ["indicators"] },
      { q: "Understanding EMA", a: "Exponential Moving Average: a trend average that reacts faster to recent prices than a simple average. DeeYoung uses the 20/50 stack: price above both, and the 20 above the 50, is a bullish structure worth up to 18 points.", tags: ["indicators"] },
      { q: "Understanding RSI", a: "Relative Strength Index (0 to 100): momentum on a speedometer. 55–72 is the healthy bullish band; above 72 is overbought stretch; below 28 is oversold. DeeYoung rewards the healthy band and discounts extremes.", tags: ["indicators"] },
      { q: "Understanding MACD", a: "Moving Average Convergence Divergence: the gap between fast and slow trend averages, plus its signal line. A positive, expanding histogram means bullish momentum is building; shrinking means it is fading. Worth up to 14 points.", tags: ["indicators"] },
      { q: "Understanding Bollinger Bands", a: "A moving average with bands two standard deviations above and below. Price hugging the upper band is strong but stretched; squeezing bands (low width percentile) often precede expansion moves.", tags: ["indicators"] },
      { q: "Understanding volume & relative volume", a: "Price moves need participation. Relative volume compares today's traded volume to the recent average: 2× means twice the usual interest. Breakouts on 2×+ volume are trusted; the same move on 0.5× volume is suspect.", tags: ["volume"] },
      { q: "Understanding portfolio risk", a: "Beyond P&L: sector allocation, concentration (HHI), correlation between holdings, volatility, drawdown, and scenario shocks. DeeYoung explicitly warns when several positions behave like one trade (for example NVDA + AMD + SMH).", tags: ["risk"] },
    ],
  },
  {
    id: "sentinel",
    title: "SENTINEL",
    blurb: "The action layer and its safety model",
    articles: [
      { q: "Observe Mode", a: "The default. SENTINEL watches, scans, and explains, and never places an order. Signals appear in the terminal; nothing else happens. If you do nothing else, this mode is safe forever.", tags: ["modes"] },
      { q: "Approve Mode", a: "When a setup passes every deterministic risk check, SENTINEL creates a proposal card: entry, stop, target, risk dollars, R:R, regime, catalyst. You approve or reject. Approvals are single-use and expire in 2 minutes. Approval routes the order to the paper broker.", tags: ["modes"] },
      { q: "Delegate Mode", a: "Automatic execution inside hard limits you set (risk per trade, max positions, daily loss breaker, correlation caps, and more). It requires explicit confirmation to enable and can be disabled instantly. Even here, the deterministic risk engine gates every single order: the AI cannot bypass it.", tags: ["modes"] },
      { q: "How risk limits work", a: "Every proposal runs through the same checklist: kill switch, mode, asset/session restrictions, signal score, R:R floor, liquidity floor, spread ceiling, volatility band, position sizing, open-position cap, notional cap, daily/weekly loss breakers, drawdown breaker, correlated exposure cap, cash check, duplicate-position guard. Any failure blocks the action. You can read every check on each proposal card.", tags: ["risk"] },
      { q: "Emergency Stop", a: "One tap, never buried: it disables new automation, cancels pending approvals, blocks all SENTINEL actions, records an audit event, and notifies you. Releasing it is a separate, deliberate action. Analytics keeps running throughout.", tags: ["safety"] },
      { q: "Broker connection", a: "Default is the DeeYoung Simulated paper broker with honest fill modeling. Alpaca Paper is available via BYOK keys (Settings → Broker); your keys are encrypted server-side, never exposed to the browser, never logged.", tags: ["brokers"] },
    ],
  },
  {
    id: "research",
    title: "Research",
    blurb: "Testing ideas before trusting them",
    articles: [
      { q: "Backtesting, honestly", a: "The Strategy Lab runs the same signal engine over history with guards: entries fill at the next bar's open with slippage; if a bar touches both stop and target, the stop is assumed first; no look-ahead: the engine only sees bars up to each decision point. Metrics include return, drawdown, Sharpe, profit factor, expectancy, and alpha vs SPY.", tags: ["backtesting"] },
      { q: "Why warnings appear on every backtest", a: "Because honesty outperforms confidence: single-symbol tests carry survivorship bias (you picked today's winners), parameters were not optimized out-of-sample, and simulated fills approximate reality. Walk-forward validation is the roadmap's next research milestone.", tags: ["backtesting"] },
      { q: "Signal history", a: "Every signal SENTINEL tracks is recorded with entry, stop, target, regime, factors, and the eventual outcome: target hit, stop hit, or expired. No cherry-picking: the ledger includes the losers.", tags: ["research"] },
    ],
  },
  {
    id: "account",
    title: "Account",
    blurb: "Providers, privacy, notifications",
    articles: [
      { q: "Notifications", a: "Web notifications cover new high-confidence signals, approval requests, executions, stops/targets, risk limits, and system degradation. Configure event types, quiet hours, and importance thresholds in Settings → Notifications.", tags: ["notifications"] },
      { q: "BYOK: bring your own key", a: "Where providers cost money (news APIs, Alpaca), you connect your own keys. Keys are stored encrypted, used server-side only, never rendered in the UI, and never returned by APIs. DeeYoung shows usage metering so you can see exactly what consumed what.", tags: ["providers"] },
      { q: "Data honesty policy", a: "The engine reads live crypto exchange candles every minute. Stock and forex research quotes come from free data tiers, delayed per exchange terms, and labeled as such. Stale data is labeled STALE; simulated fallback is labeled SIMULATED and pauses automation. Unavailable news is labeled NEWS DATA UNAVAILABLE. We never pretend degraded data is live.", tags: ["honesty"] },
      { q: "Where my data lives", a: "Authoritative state (account, positions, orders, SENTINEL config, audit trail) lives server-side in your account, not in browser storage. localStorage only holds display preferences.", tags: ["privacy"] },
    ],
  },
];

export function LearnView() {
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>("start-0");

  const filtered = useMemo(() => {
    if (!query.trim()) return SECTIONS;
    const q = query.toLowerCase();
    return SECTIONS.map((s) => ({
      ...s,
      articles: s.articles.filter((a) => a.q.toLowerCase().includes(q) || a.a.toLowerCase().includes(q) || a.tags.some((t) => t.includes(q))),
    })).filter((s) => s.articles.length > 0);
  }, [query]);

  return (
    <div className="space-y-4">
      <SectionHead title="Learn center" sub="Understand DeeYoung without leaving the screen" />

      {/* search */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search: 'regime', 'VWAP', 'approve', 'kill switch'…"
          className="w-full rounded-xl border border-hairline bg-panel py-3 pl-11 pr-4 text-sm outline-none transition-colors focus:border-brand"
        />
      </div>

      {filtered.map((section) => (
        <div key={section.id} className="qe-panel overflow-hidden">
          <div className="flex items-center gap-3 border-b border-hairline px-5 py-3.5">
            <BookOpen className="h-4 w-4 text-brand-hi" />
            <div>
              <h3 className="text-sm font-bold">{section.title}</h3>
              <p className="text-[11px] text-muted-foreground">{section.blurb}</p>
            </div>
            <span className="qe-num ml-auto text-[10px] text-muted-foreground">{section.articles.length} articles</span>
          </div>
          <div className="divide-y divide-hairline">
            {section.articles.map((a, i) => {
              const id = `${section.id}-${i}`;
              const open = openId === id;
              return (
                <div key={id}>
                  <button
                    onClick={() => setOpenId(open ? null : id)}
                    className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left transition-colors hover:bg-panel-2"
                  >
                    <span className="text-[13px] font-medium">{a.q}</span>
                    <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
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
                        <p className="px-5 pb-4 text-[12.5px] leading-relaxed text-muted-foreground">{a.a}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
            {section.articles.length === 0 && (
              <p className="px-5 py-4 text-xs text-muted-foreground">No matches in this section.</p>
            )}
          </div>
        </div>
      ))}

      {filtered.length === 0 && (
        <div className="qe-panel-2 rounded-xl p-8 text-center">
          <p className="text-sm font-medium">Nothing found for “{query}”.</p>
          <p className="mt-1 text-xs text-muted-foreground">Try a concept: “regime”, “VWAP”, “approval”, “simulated”.</p>
        </div>
      )}
    </div>
  );
}
