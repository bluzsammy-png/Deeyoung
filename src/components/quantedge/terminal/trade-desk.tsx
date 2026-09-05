"use client";

// DEEYOUNG PRO — Trade Desk: ask the bot for a grounded trade plan on any
// covered instrument (gold, FX majors, equities). The bot only sees real
// pipeline numbers and the deterministic engine's output — it cannot invent
// levels, and every plan is paper-context with explicit risk framing.

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, Bot, Loader2, Minus, RefreshCw, Send, ShieldAlert } from "lucide-react";
import { DataBadge, SectionHead } from "@/components/quantedge/ui-bits";
import { track } from "@/lib/analytics";
import { SymbolSearch } from "@/components/quantedge/symbol-search";
import { fmtInstrument } from "@/lib/format";
import type { Quote } from "@/lib/types";

interface TradePlan {
  bias: "LONG" | "SHORT" | "NEUTRAL";
  conviction: number;
  timeframe: string;
  entry: number;
  stop: number;
  target1: number;
  target2: number;
  rr: number;
  rationale: string;
  risks: string[];
  invalidation: string;
}

interface AnalystResponse {
  ok: boolean;
  symbol: string;
  instrument: string;
  livePrice: number;
  dataState: string;
  regimeLabel: string;
  source: "LLM_GROUNDED" | "ENGINE_FALLBACK";
  plan: TradePlan;
  message?: string;
  disclaimer: string;
  asOf: number;
}

const QUICK_ASKS = [
  "Should I short gold here?",
  "Give me a 2-day plan with tight risk",
  "What invalidates the bearish case?",
];

export function TradeDeskView() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [symbol, setSymbol] = useState("XAUUSD");
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AnalystResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/market/quotes")
      .then((r) => r.json())
      .then((j) => setQuotes(j.quotes ?? []))
      .catch(() => undefined);
  }, []);

  /** Pull the quote for ANY searched symbol (outside the default universe) into state. */
  const ensureQuote = useCallback(async (sym: string) => {
    if (quotes.some((q) => q.symbol === sym)) return;
    try {
      const res = await fetch(`/api/market/quotes?symbols=${encodeURIComponent(sym)}`);
      const json = await res.json();
      if (Array.isArray(json.quotes) && json.quotes[0]) {
        setQuotes((prev) => [...prev.filter((q) => q.symbol !== sym), json.quotes[0] as Quote]);
      }
    } catch { /* quote appears when the next refresh lands */ }
  }, [quotes]);

  const active = useMemo(() => quotes.find((q) => q.symbol === symbol) ?? null, [quotes, symbol]);

  const ask = useCallback(async (q?: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/analyst", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, question: q ?? question }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.message ?? "The analyst is unavailable right now. Try again shortly.");
        if (json.plan) setResult(json);
      } else {
        setResult(json);
        track("analyst_query", { symbol, source: json.source ?? null });
      }
    } catch {
      setError("Couldn't reach the Trade Desk. Check your connection and retry.");
    } finally {
      setBusy(false);
    }
  }, [symbol, question]);

  const biasStyle = (bias: string) =>
    bias === "LONG" ? "bg-pos/15 text-pos border-pos/30"
    : bias === "SHORT" ? "bg-neg/15 text-neg border-neg/30"
    : "bg-muted/20 text-muted-foreground border-hairline";

  return (
    <div className="space-y-4">
      <SectionHead
        title="Trade Desk"
        sub="Grounded trade plans: live data in, disciplined plan out, nothing invented"
        right={<DataBadge state={(result?.dataState as Quote["dataState"]) ?? active?.dataState ?? "DELAYED"} />}
      />

      {/* ask panel */}
      <div className="qe-panel p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Search any market</span>
            <SymbolSearch onPick={(h) => { setSymbol(h.symbol); setResult(null); void ensureQuote(h.symbol); }} placeholder="Type a ticker or company…" />
            <span className="mb-1.5 mt-3 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Market</span>
            <select
              value={symbol}
              onChange={(e) => { setSymbol(e.target.value); setResult(null); }}
              className="w-full rounded-xl border border-hairline bg-panel-2 px-3 py-2.5 text-sm font-semibold outline-none focus:border-brand/50"
            >
              {quotes.length === 0 && <option value="XAUUSD">XAUUSD · Gold</option>}
              {quotes.map((q) => (
                <option key={q.symbol} value={q.symbol}>
                  {q.symbol} · {q.assetClass === "FX" ? "FX" : q.assetClass === "METAL" ? "Metals" : q.sector}
                </option>
              ))}
            </select>
          </label>
          <label className="flex-[2]">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Your question (optional)</span>
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !busy) ask(); }}
              placeholder="e.g. should I short gold into the NY session?"
              className="w-full rounded-xl border border-hairline bg-panel-2 px-3.5 py-2.5 text-sm outline-none placeholder:text-muted-foreground/50 focus:border-brand/50"
            />
          </label>
          <button
            onClick={() => ask()}
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-white transition-all hover:brightness-110 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Ask the bot
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {QUICK_ASKS.map((qa) => (
            <button
              key={qa}
              onClick={() => { setQuestion(qa); ask(qa); }}
              disabled={busy}
              className="rounded-full border border-hairline bg-panel-2 px-3 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-brand/40 hover:text-foreground disabled:opacity-50"
            >
              {qa}
            </button>
          ))}
          {active && (
            <span className="ml-auto text-xs text-muted-foreground">
              Live <span className="font-semibold text-foreground">{fmtInstrument(active.price, active.symbol)}</span> · {active.changePct >= 0 ? "+" : ""}{active.changePct.toFixed(2)}%
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-neg/30 bg-neg/10 px-3.5 py-3 text-xs leading-relaxed text-neg">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}

      {/* plan card */}
      {result?.ok && result.plan && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="qe-panel overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-5 py-3.5">
            <div className="flex items-center gap-2.5">
              <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-bold tracking-wider ${biasStyle(result.plan.bias)}`}>
                {result.plan.bias === "LONG" ? <ArrowUpRight className="h-3.5 w-3.5" />
                  : result.plan.bias === "SHORT" ? <ArrowDownRight className="h-3.5 w-3.5" />
                  : <Minus className="h-3.5 w-3.5" />}
                {result.plan.bias}
              </span>
              <span className="text-sm font-bold">{result.symbol}</span>
              <span className="text-[11px] text-muted-foreground">{result.plan.timeframe}</span>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <span className="inline-flex items-center gap-1 rounded-md bg-panel-2 px-2 py-1">
                <Bot className="h-3 w-3 text-brand-hi" />
                {result.source === "LLM_GROUNDED" ? "AI · grounded on live data" : "engine plan (AI offline)"}
              </span>
              <button onClick={() => ask()} disabled={busy} className="inline-flex items-center gap-1 rounded-md bg-panel-2 px-2 py-1 transition-colors hover:text-foreground disabled:opacity-50">
                <RefreshCw className={`h-3 w-3 ${busy ? "animate-spin" : ""}`} /> Re-ask
              </button>
            </div>
          </div>

          <div className="grid gap-4 p-5 sm:grid-cols-[1.4fr_1fr]">
            <div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { label: "Entry", value: result.plan.entry, cls: "" },
                  { label: "Stop", value: result.plan.stop, cls: "text-neg" },
                  { label: "Target 1", value: result.plan.target1, cls: "text-pos" },
                  { label: "Target 2", value: result.plan.target2, cls: "text-pos" },
                ].map((cell) => (
                  <div key={cell.label} className="rounded-xl border border-hairline bg-panel-2 p-3">
                    <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground">{cell.label}</p>
                    <p className={`qe-num mt-1 text-sm font-bold ${cell.cls}`}>{fmtInstrument(cell.value, result.symbol)}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <span className="rounded-md bg-panel-2 px-2 py-1">R:R <span className="qe-num font-bold text-foreground">1:{result.plan.rr}</span></span>
                <span className="rounded-md bg-panel-2 px-2 py-1">Conviction <span className="qe-num font-bold text-foreground">{result.plan.conviction}/100</span></span>
                <span className="rounded-md bg-panel-2 px-2 py-1">Regime: {result.regimeLabel}</span>
              </div>
              <p className="mt-3 text-[13px] leading-relaxed text-foreground/85">{result.plan.rationale}</p>
              <p className="mt-2 text-xs leading-relaxed text-warn">
                <span className="font-semibold">Invalidation:</span> {result.plan.invalidation}
              </p>
            </div>

            <div className="space-y-2.5">
              <div className="rounded-xl border border-hairline bg-panel-2 p-3.5">
                <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground">Risks on this plan</p>
                <ul className="mt-2 space-y-1.5">
                  {result.plan.risks.map((r, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
                      <ShieldAlert className="mt-0.5 h-3 w-3 shrink-0 text-warn" />
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
              <p className="rounded-xl border border-hairline bg-panel-2 p-3 text-[10px] leading-relaxed text-muted-foreground">
                {result.disclaimer}
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {!result && !busy && (
        <div className="qe-panel-2 rounded-xl p-5 text-sm leading-relaxed text-muted-foreground">
          Pick a market. <span className="font-semibold text-foreground">XAUUSD (gold)</span> is preselected; add a question if you
          have one, and the bot returns a short plan: direction, entry, stop, two targets, R:R and what kills the idea.
          Every number is grounded in live data and the signal engine&apos;s factor math. The bot proposes; nothing executes
          without you.
        </div>
      )}
    </div>
  );
}
