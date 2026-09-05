"use client";

// DEEYOUNG PRO — Signals view (Level 2 experience §7): live scan + alert-style feed.
// What is a signal? What is confidence? Answered inline (§9/§10).

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Bell, Filter } from "lucide-react";
import { fmtPct, fmtPrice, fmtAgo } from "@/lib/format";
import { DataBadge, InfoTip, Pct, SectionHead } from "@/components/quantedge/ui-bits";
import { SignalRing } from "@/components/quantedge/charts/widgets";
import { useApp } from "@/lib/store";
import type { RegimeState, SignalResult } from "@/lib/types";

type Scan = {
  regime: RegimeState;
  signals: (SignalResult & { name: string; sector: string; lastPrice: number; changePct: number })[];
};

export function SignalsView() {
  const setFocused = useApp((s) => s.setFocusedSymbol);
  const setView = useApp((s) => s.setView);
  const [scan, setScan] = useState<Scan | null>(null);
  const [minScore, setMinScore] = useState(55);
  const [dir, setDir] = useState<"ALL" | "LONG" | "SHORT">("ALL");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/signals");
      setScan(await res.json());
    } catch { /* hold */ }
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 0);
    const iv = setInterval(load, 60_000);
    return () => { clearInterval(iv); clearTimeout(t); };
  }, [load]);

  const signals = (scan?.signals ?? [])
    .filter((s) => s.score >= minScore)
    .filter((s) => dir === "ALL" || s.direction === dir)
    .sort((a, b) => b.score - a.score);

  return (
    <div className="space-y-4">
      <SectionHead
        title="Signals"
        sub="What is happening, and where factors align: the primary brain's output"
        right={<DataBadge state={scan?.signals[0]?.dataState ?? "LIVE"} />}
      />

      {/* education strip (§9) */}
      <div className="qe-panel flex flex-wrap items-center gap-x-6 gap-y-2 p-4 text-[11.5px] leading-relaxed text-muted-foreground">
        <span><strong className="text-foreground">Signal</strong>: a factor-aligned setup worth your attention. <InfoTip title="What is a Signal?">DeeYoung computes factor contributions from trend (EMA), intraday control (VWAP), momentum (RSI/MACD), stretch (Bollinger), participation (volume), verified catalysts, and regime. Alignment above your threshold becomes a signal.</InfoTip></span>
        <span><strong className="text-foreground">Confidence</strong>: factor alignment, NOT win probability. <InfoTip title="What is Signal Confidence?">An 84% score means strong alignment across measured factors. It is NOT an 84% probability that the trade will win. Past alignment says nothing about any single outcome.</InfoTip></span>
        <span><strong className="text-foreground">Regime-adjusted</strong>: thresholds shift with the market. <InfoTip title="Regime influence">In Risk-Off or High Volatility regimes, DeeYoung raises signal thresholds, reduces sizing, and widens stops automatically.</InfoTip></span>
      </div>

      {/* filters */}
      <div className="qe-panel flex flex-wrap items-center gap-3 p-3">
        <Filter className="h-3.5 w-3.5 text-muted-foreground" />
        <div className="flex gap-1">
          {(["ALL", "LONG", "SHORT"] as const).map((d) => (
            <button key={d} onClick={() => setDir(d)}
              className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold ${dir === d ? "bg-brand/12 text-brand" : "text-muted-foreground hover:text-foreground"}`}>
              {d}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">Min score</span>
          <input type="range" min={30} max={90} value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} className="w-36 accent-[#10b981]" />
          <span className="qe-num text-xs font-bold">{minScore}</span>
        </div>
        <span className="ml-auto text-[10px] text-muted-foreground">Regime: {scan?.regime.label ?? "…"} · {signals.length} shown</span>
      </div>

      {/* signal cards */}
      <div className="grid gap-3 lg:grid-cols-2">
        {signals.map((s, i) => (
          <motion.button
            key={s.symbol}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i * 0.04, 0.4) }}
            onClick={() => { setFocused(s.symbol); setView("markets"); }}
            className="qe-panel group p-4 text-left transition-colors hover:border-brand/30"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold">{s.symbol}</span>
                  <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold ${s.direction === "LONG" ? "bg-pos/15 text-pos" : "bg-neg/15 text-neg"}`}>{s.direction}</span>
                  <Pct value={s.changePct} className="text-[11px]" />
                  <span className="rounded bg-panel-2 px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">{s.sector}</span>
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{s.name}</p>
              </div>
              <SignalRing score={s.score} size={62} />
            </div>

            {/* mini factor strip */}
            <div className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-panel-3">
              {s.factors.map((f, fi) => {
                const w = Math.abs(f.contribution);
                const total = s.factors.reduce((a, b) => a + Math.abs(b.contribution), 0) || 1;
                return (
                  <span
                    key={fi}
                    title={`${f.name}: ${f.contribution > 0 ? "+" : ""}${f.contribution}`}
                    style={{ width: `${(w / total) * 100}%` }}
                    className={f.contribution >= 0 ? "bg-pos/80" : "bg-neg/80"}
                  />
                );
              })}
            </div>

            <div className="qe-num mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
              <span>Entry <span className="text-foreground">{fmtPrice(s.entry)}</span></span>
              <span>Stop <span className="text-neg">{fmtPrice(s.stop)}</span></span>
              <span>Target <span className="text-pos">{fmtPrice(s.target)}</span></span>
              <span>R:R <span className="text-foreground">{s.rr.toFixed(1)}</span></span>
              <span>Rel vol <span className={s.catalystScore >= 3 ? "text-warn" : ""}>{s.factors.find((f) => f.key === "VOLUME")?.detail.match(/[\d.]+×/)?.[0] ?? "…"}</span></span>
              <span className="ml-auto">{fmtAgo(s.generatedAt)}</span>
            </div>

            <p className="mt-2 line-clamp-2 text-[11px] leading-snug text-muted-foreground/90">{s.explanation}</p>
          </motion.button>
        ))}
      </div>

      {signals.length === 0 && (
        <div className="qe-panel-2 flex flex-col items-center gap-2 rounded-xl p-8 text-center">
          <Bell className="h-5 w-5 text-muted-foreground" />
          <p className="text-sm font-medium">Nothing above {minScore} in this filter.</p>
          <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
            Flat is a position. The scan reruns every minute; when factor alignment clears your threshold, cards appear here and, in Approve mode, land in your approval queue.
          </p>
        </div>
      )}
    </div>
  );
}
