"use client";

// DEEYOUNG PRO — Research: Backtest Lab (§21) + bias warnings (§22)
// Honest metrics; next-bar fills; walk-forward caveat surfaced by default.

import { useState } from "react";
import { motion } from "framer-motion";
import { FlaskConical, TriangleAlert } from "lucide-react";
import { fmtPct } from "@/lib/format";
import { SectionHead, InfoTip, Pct } from "@/components/quantedge/ui-bits";
import { SymbolSearch } from "@/components/quantedge/symbol-search";
import { EquityCurve } from "@/components/quantedge/charts/core";
import type { BacktestMetrics } from "@/lib/types";

const SYMBOLS = ["NVDA", "AAPL", "MSFT", "TSLA", "AMD", "META", "PLTR", "COIN", "QQQ", "SMH", "SPY", "JPM"];
const RANGES = [3, 6, 12, 24];

interface BacktestResponse {
  metrics: BacktestMetrics;
  equityCurve: { t: number; equity: number; benchmark: number }[];
  warnings: string[];
  symbol: string;
  rangeMonths: number;
  params: Record<string, number | string>;
  trades: { entryT: number; exitT: number; direction: string; entry: number; exit: number; pnlPct: number; pnlUsd: number; score: number; exitReason: string }[];
}

export function ResearchView() {
  const [symbol, setSymbol] = useState("NVDA");
  const [rangeMonths, setRangeMonths] = useState(12);
  const [minScore, setMinScore] = useState(70);
  const [risk, setRisk] = useState(1);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BacktestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/backtest", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, rangeMonths, minScore, riskPerTradePct: risk }),
      });
      const json = await res.json();
      if (!res.ok) setError(json.error ?? "Backtest failed");
      else setResult(json);
    } catch {
      setError("Network error; the engine did not run.");
    }
    setBusy(false);
  };

  const m = result?.metrics;

  return (
    <div className="space-y-4">
      <SectionHead
        title="Strategy Lab · Backtesting"
        sub="The same signal engine your terminal uses, tested against history"
        right={<InfoTip title="Honest backtests">
          Entries fill at the next bar&apos;s open with modeled slippage, never at the signal price. When a bar touches both stop and target, we assume the stop hit first (conservative). Results are approximations, not promises.
        </InfoTip>}
      />

      {/* controls */}
      <div className="qe-panel p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-56">
            <label className="qe-label mb-1.5 block">Symbol · search anything worldwide</label>
            <SymbolSearch onPick={(h) => setSymbol(h.symbol)} placeholder="e.g. TM, 7203.T, BTC-USD, EURGBP…" />
            <select value={symbol} onChange={(e) => setSymbol(e.target.value)} className="mt-2 w-full rounded-lg border border-input bg-panel-2 px-3 py-2 text-sm font-semibold outline-none focus:border-brand">
              {SYMBOLS.map((s) => <option key={s} value={s}>{s}</option>)}
              {!SYMBOLS.includes(symbol) && <option value={symbol}>{symbol} (searched)</option>}
            </select>
          </div>
          <div>
            <label className="qe-label mb-1.5 block">Range</label>
            <div className="flex gap-1">
              {RANGES.map((r) => (
                <button key={r} onClick={() => setRangeMonths(r)}
                  className={`rounded-lg px-3 py-2 text-xs font-semibold ${rangeMonths === r ? "bg-brand/12 text-brand" : "bg-panel-2 text-muted-foreground hover:text-foreground"}`}>
                  {r}M
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="qe-label mb-1.5 block">Min signal score · {minScore}</label>
            <input type="range" min={40} max={95} value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} className="w-40 accent-[#10b981]" />
          </div>
          <div>
            <label className="qe-label mb-1.5 block">Risk per trade · {risk}%</label>
            <input type="range" min={0.25} max={3} step={0.25} value={risk} onChange={(e) => setRisk(Number(e.target.value))} className="w-40 accent-[#10b981]" />
          </div>
          <button onClick={run} disabled={busy}
            className="qe-glow inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white transition-transform hover:scale-[1.02] disabled:opacity-50">
            <FlaskConical className="h-4 w-4" />
            {busy ? "Running…" : "Run backtest"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-neg/30 bg-neg/[0.07] p-4 text-sm text-neg">{error}</div>
      )}

      {m && result && (
        <>
          {/* metrics */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {[
              { label: "Total return", value: <Pct value={m.totalReturnPct} />, hint: "vs benchmark" },
              { label: "Alpha vs SPY", value: <Pct value={m.alphaPct} />, hint: `${fmtPct(m.benchmarkReturnPct)} SPY` },
              { label: "Max drawdown", value: <span className="text-neg">-{m.maxDrawdownPct.toFixed(1)}%</span>, hint: "peak to trough" },
              { label: "Sharpe", value: m.sharpe.toFixed(2), hint: "risk-adjusted" },
              { label: "Win rate", value: `${m.winRatePct.toFixed(0)}%`, hint: `${m.numTrades} trades` },
              { label: "Profit factor", value: m.profitFactor.toFixed(2), hint: `expectancy ${fmtPct(m.expectancyPct)}` },
            ].map((s, i) => (
              <motion.div key={s.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="qe-panel p-3">
                <span className="qe-label">{s.label}</span>
                <div className="qe-num mt-1 text-lg font-semibold">{s.value}</div>
                <div className="text-[10px] text-muted-foreground">{s.hint}</div>
              </motion.div>
            ))}
          </div>

          {/* equity curve */}
          <div className="qe-panel p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="qe-label">Strategy equity vs SPY benchmark ($100k start)</span>
              <span className="text-[10px] text-muted-foreground">solid = strategy · dashed = SPY</span>
            </div>
            <EquityCurve data={result.equityCurve} height={280} />
          </div>

          {/* warnings — honesty first (§22) */}
          <div className="rounded-xl border border-warn/30 bg-warn/[0.06] p-4">
            <p className="flex items-center gap-2 text-xs font-bold text-warn">
              <TriangleAlert className="h-4 w-4" /> Read before trusting these numbers
            </p>
            <ul className="mt-2 space-y-1.5">
              {result.warnings.map((w, i) => (
                <li key={i} className="text-[11.5px] leading-relaxed text-foreground/75">· {w}</li>
              ))}
            </ul>
          </div>

          {/* trades */}
          {result.trades.length > 0 && (
            <div className="qe-panel overflow-hidden">
              <div className="border-b border-hairline px-4 py-3"><span className="qe-label">Trade log ({result.trades.length})</span></div>
              <div className="qe-scroll max-h-[300px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-panel">
                    <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-2 font-semibold">Direction</th>
                      <th className="px-4 py-2 text-right font-semibold">Entry</th>
                      <th className="px-4 py-2 text-right font-semibold">Exit</th>
                      <th className="px-4 py-2 text-right font-semibold">P&L</th>
                      <th className="px-4 py-2 text-right font-semibold">Score</th>
                      <th className="px-4 py-2 text-right font-semibold">Exit reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.trades.map((t, i) => (
                      <tr key={i} className="border-t border-hairline">
                        <td className="px-4 py-2 font-semibold">{t.direction}</td>
                        <td className="qe-num px-4 py-2 text-right">${t.entry.toFixed(2)}</td>
                        <td className="qe-num px-4 py-2 text-right">${t.exit.toFixed(2)}</td>
                        <td className={`qe-num px-4 py-2 text-right font-semibold ${t.pnlPct >= 0 ? "text-pos" : "text-neg"}`}>{fmtPct(t.pnlPct)}</td>
                        <td className="qe-num px-4 py-2 text-right text-muted-foreground">{t.score}</td>
                        <td className="px-4 py-2 text-right text-[10px] text-muted-foreground">{t.exitReason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {!m && !busy && !error && (
        <div className="qe-panel-2 rounded-xl p-6 text-center">
          <p className="text-sm font-medium">Configure and run your first backtest.</p>
          <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
            The lab uses the same multi-factor signal engine as the live scan, so what you test is what you trade on paper. Entries execute at the next bar open with slippage; a walk-forward panel is on the roadmap.
          </p>
        </div>
      )}
    </div>
  );
}
