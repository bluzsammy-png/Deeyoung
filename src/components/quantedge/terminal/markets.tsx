"use client";

// DEEYOUNG PRO — Markets view: heatmap (§37), live quote table, asset detail
// with candlestick chart, signal anatomy, and catalyst intelligence (§12).

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useApp } from "@/lib/store";
import { fmtPct, fmtPrice } from "@/lib/format";
import { DataBadge, InfoTip, Pct, Price, SectionHead } from "@/components/quantedge/ui-bits";
import { CandleChart } from "@/components/quantedge/charts/core";
import { FactorBars, MarketHeatmap, SignalRing } from "@/components/quantedge/charts/widgets";
import type { CandleSeries, Quote, SignalResult } from "@/lib/types";

const TFS = ["1D", "5D", "1M", "6M", "1Y"] as const;

export function MarketsView() {
  const focused = useApp((s) => s.focusedSymbol);
  const setFocused = useApp((s) => s.setFocusedSymbol);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [filter, setFilter] = useState<"ALL" | "EQUITY" | "ETF">("ALL");

  useEffect(() => {
    let alive = true;
    const t = setTimeout(load, 0);
    const iv = setInterval(load, 45_000);
    return () => { alive = false; clearInterval(iv); clearTimeout(t); };
    async function load() {
      const res = await fetch("/api/market/quotes");
      const json = await res.json();
      if (alive && json.quotes) setQuotes(json.quotes);
    }
  }, []);

  const filtered = useMemo(() =>
    quotes.filter((q) => filter === "ALL" || q.assetClass === filter),
  [quotes, filter]);

  return (
    <div className="space-y-4">
      <SectionHead
        title="Markets"
        sub="Full tracked universe · delayed per exchange terms"
        right={<DataBadge state={quotes[0]?.dataState ?? "LIVE"} />}
      />

      {/* heatmap */}
      <div className="qe-panel p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="qe-label">Market heatmap</span>
          <InfoTip title="Heatmap">
            Each tile is a tracked symbol, tinted by today&apos;s change: green for gains, red for losses, intensity by size of the move. Tap any tile to open its terminal.
          </InfoTip>
        </div>
        <MarketHeatmap
          cells={quotes.map((q) => ({ symbol: q.symbol, changePct: q.changePct, weight: q.avgVolume * q.price, name: q.name }))}
          onPick={setFocused}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_400px]">
        {/* quote table */}
        <div className="qe-panel overflow-hidden">
          <div className="flex items-center gap-1.5 border-b border-hairline px-3 py-2.5">
            {(["ALL", "EQUITY", "ETF"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-colors ${filter === f ? "bg-brand/12 text-brand" : "text-muted-foreground hover:text-foreground"}`}
              >
                {f}
              </button>
            ))}
            <span className="ml-auto pr-1 text-[10px] text-muted-foreground">{filtered.length} symbols</span>
          </div>
          <div className="qe-scroll max-h-[520px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 bg-panel text-left">
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2 font-semibold">Symbol</th>
                  <th className="px-3 py-2 text-right font-semibold">Last</th>
                  <th className="px-3 py-2 text-right font-semibold">Chg%</th>
                  <th className="hidden px-3 py-2 text-right font-semibold sm:table-cell">Rel Vol</th>
                  <th className="hidden px-3 py-2 text-right font-semibold md:table-cell">Range</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((q) => {
                  const rangePos = q.dayHigh > q.dayLow ? ((q.price - q.dayLow) / (q.dayHigh - q.dayLow)) * 100 : 50;
                  return (
                    <tr
                      key={q.symbol}
                      onClick={() => setFocused(q.symbol)}
                      className={`cursor-pointer border-t border-hairline transition-colors hover:bg-panel-2 ${focused === q.symbol ? "bg-brand/[0.07]" : ""}`}
                    >
                      <td className="px-3 py-2.5">
                        <div className="font-bold">{q.symbol}</div>
                        <div className="max-w-[140px] truncate text-[10px] text-muted-foreground">{q.name}</div>
                      </td>
                      <td className="px-3 py-2.5 text-right"><Price value={q.price} className="text-[11.5px] font-semibold" /></td>
                      <td className="px-3 py-2.5 text-right"><Pct value={q.changePct} /></td>
                      <td className="qe-num hidden px-3 py-2.5 text-right md:table-cell">
                        <span className={(q.volume / Math.max(1, q.avgVolume)) >= 1.5 ? "font-semibold text-warn" : "text-muted-foreground"}>
                          {q.avgVolume ? (q.volume / q.avgVolume).toFixed(2) : "—"}×
                        </span>
                      </td>
                      <td className="hidden px-3 py-2.5 md:table-cell">
                        <div className="ml-auto h-1.5 w-24 overflow-hidden rounded-full bg-panel-3">
                          <div
                            className={`h-full rounded-full ${rangePos > 50 ? "bg-pos" : "bg-neg"}`}
                            style={{ width: `${Math.min(100, Math.max(4, rangePos))}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* detail */}
        <AssetDetail symbol={focused} />
      </div>
    </div>
  );
}

function AssetDetail({ symbol }: { symbol: string }) {
  const [tf, setTf] = useState<(typeof TFS)[number]>("1M");
  const [candles, setCandles] = useState<CandleSeries | null>(null);
  const [signal, setSignal] = useState<(SignalResult & { name?: string }) | null>(null);

  const loadCandles = useCallback(async () => {
    const res = await fetch(`/api/market/candles?symbol=${symbol}&tf=${tf}`);
    setCandles(await res.json());
  }, [symbol, tf]);

  useEffect(() => {
    const t = setTimeout(loadCandles, 0);
    return () => clearTimeout(t);
  }, [loadCandles]);

  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      const res = await fetch("/api/signals");
      const json = await res.json();
      if (alive) setSignal(json.signals?.find((s: { symbol: string }) => s.symbol === symbol) ?? null);
    }, 0);
    return () => { alive = false; clearTimeout(t); };
  }, [symbol]);

  const intraday = tf === "1D" || tf === "5D";

  return (
    <div className="space-y-3">
      <div className="qe-panel p-4">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold tracking-tight">{symbol}</h3>
            <p className="text-xs text-muted-foreground">{signal?.name ?? candles?.provider ?? ""}</p>
            <Price value={candles?.candles.at(-1)?.c ?? 0} className="qe-num mt-2 block text-2xl font-semibold" />
          </div>
          {signal && <SignalRing score={signal.score} size={72} />}
        </div>
      </div>

      {/* chart */}
      <div className="qe-panel p-3">
        <div className="mb-2 flex items-center justify-between px-1">
          <div className="flex gap-1">
            {TFS.map((t) => (
              <button
                key={t}
                onClick={() => setTf(t)}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors ${tf === t ? "bg-brand/12 text-brand" : "text-muted-foreground hover:text-foreground"}`}
              >
                {t}
              </button>
            ))}
          </div>
          {candles && <DataBadge state={candles.dataState} />}
        </div>
        {candles ? (
          <CandleChart candles={candles.candles} height={300} showVWAP={intraday} />
        ) : (
          <div className="h-[300px] animate-pulse rounded-xl bg-panel-2" />
        )}
      </div>

      {/* signal anatomy */}
      {signal ? (
        <div className="qe-panel p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="qe-label">Signal anatomy</span>
            <span className={`rounded-md px-2 py-0.5 text-[9px] font-bold tracking-wider ${signal.direction === "LONG" ? "bg-pos/15 text-pos" : signal.direction === "SHORT" ? "bg-neg/15 text-neg" : "bg-panel-3 text-muted-foreground"}`}>
              {signal.direction}
            </span>
          </div>
          <FactorBars factors={signal.factors} />
          <div className="qe-num mt-4 grid grid-cols-3 gap-2 border-t border-hairline pt-3 text-center text-[11px]">
            <div><span className="block text-muted-foreground">Entry</span>{fmtPrice(signal.entry)}</div>
            <div><span className="block text-muted-foreground">Stop</span><span className="text-neg">{fmtPrice(signal.stop)}</span></div>
            <div><span className="block text-muted-foreground">Target</span><span className="text-pos">{fmtPrice(signal.target)}</span></div>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">{signal.explanation}</p>
        </div>
      ) : (
        <div className="qe-panel-2 rounded-xl p-4 text-xs text-muted-foreground">
          No stored signal for {symbol} in this scan cycle. The engine scores the liquid universe on a rotation — run the SENTINEL scan or check back shortly.
        </div>
      )}
    </div>
  );
}
