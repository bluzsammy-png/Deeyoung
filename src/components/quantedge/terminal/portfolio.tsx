"use client";

// QUANTEDGE PRO — Portfolio Intelligence (§15) + paper trade ticket (§20)
// Beyond P&L: allocation, correlation, scenarios, concentration warnings.

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "@/hooks/use-toast";
import { ArrowDownRight, ArrowUpRight, ShieldAlert } from "lucide-react";
import { fmtMoney, fmtPrice, fmtDateTime } from "@/lib/format";
import { DataBadge, InfoTip, Pct, Price, SectionHead, StatTile, AdvancedPanel } from "@/components/quantedge/ui-bits";
import { AllocationDonut, CorrelationMatrix, RiskGauge } from "@/components/quantedge/charts/widgets";
import { EquityCurve } from "@/components/quantedge/charts/core";
import type { PortfolioIntelligence } from "@/lib/types";
import type { Order } from "@prisma/client";

interface PortfolioPayload {
  intel: PortfolioIntelligence;
  orders: (Order & { fills: unknown[] })[];
}

export function PortfolioView() {
  const [data, setData] = useState<PortfolioPayload | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/portfolio");
      setData(await res.json());
    } catch { /* hold frame */ }
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 0);
    const iv = setInterval(load, 45_000);
    return () => { clearInterval(iv); clearTimeout(t); };
  }, [load]);

  if (!data?.intel) {
    return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-32 animate-pulse rounded-xl bg-panel-2" />)}</div>;
  }
  const intel = data.intel;

  return (
    <div className="space-y-4">
      <SectionHead
        title="Portfolio intelligence"
        sub="Paper account · risk beyond P&L"
        right={<DataBadge state={intel.positions[0]?.dataState ?? "LIVE"} />}
      />

      {/* headline stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Equity" value={fmtMoney(intel.equity, 0)} sub={`${fmtMoney(intel.cash, 0)} cash`} />
        <StatTile label="Total P&L" value={<span className={intel.totalPnl >= 0 ? "text-pos" : "text-neg"}>{fmtMoney(intel.totalPnl, 0, true)}</span>} sub={<Pct value={intel.totalPnlPct} />} />
        <StatTile label="Today" value={<span className={intel.dayPnl >= 0 ? "text-pos" : "text-neg"}>{fmtMoney(intel.dayPnl, 0, true)}</span>} sub={<Pct value={intel.dayPnlPct} />} />
        <StatTile
          label="Exposure"
          value={`${intel.longExposurePct.toFixed(0)}%`}
          sub={`${intel.positions.length} position${intel.positions.length === 1 ? "" : "s"} · ${fmtMoney(intel.investedValue, 0)} invested`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-4">
          {/* positions */}
          <div className="qe-panel overflow-hidden">
            <div className="border-b border-hairline px-4 py-3">
              <span className="qe-label">Positions</span>
            </div>
            {intel.positions.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-muted-foreground">
                No open positions yet. Review opportunities on the dashboard, approve a SENTINEL proposal, or place a paper trade below.
              </p>
            ) : (
              <div className="qe-scroll max-h-[360px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-panel">
                    <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-2 font-semibold">Symbol</th>
                      <th className="px-4 py-2 text-right font-semibold">Qty</th>
                      <th className="px-4 py-2 text-right font-semibold">Avg</th>
                      <th className="px-4 py-2 text-right font-semibold">Last</th>
                      <th className="px-4 py-2 text-right font-semibold">P&L</th>
                      <th className="hidden px-4 py-2 text-right font-semibold sm:table-cell">Weight</th>
                    </tr>
                  </thead>
                  <tbody>
                    {intel.positions.map((p) => (
                      <tr key={p.symbol} className="border-t border-hairline">
                        <td className="px-4 py-2.5">
                          <div className="font-bold">{p.symbol}</div>
                          <div className="text-[10px] text-muted-foreground">{p.sector}</div>
                        </td>
                        <td className="qe-num px-4 py-2.5 text-right">{p.qty}</td>
                        <td className="qe-num px-4 py-2.5 text-right text-muted-foreground">{fmtPrice(p.avgPrice)}</td>
                        <td className="px-4 py-2.5 text-right"><Price value={p.lastPrice} className="text-[11.5px]" /></td>
                        <td className="px-4 py-2.5 text-right">
                          <div className={`qe-num font-semibold ${p.unrealizedPnl >= 0 ? "text-pos" : "text-neg"}`}>{fmtMoney(p.unrealizedPnl, 0, true)}</div>
                          <Pct value={p.unrealizedPct} className="text-[10px]" />
                        </td>
                        <td className="qe-num hidden px-4 py-2.5 text-right sm:table-cell">{p.weightPct.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* orders */}
          <div className="qe-panel overflow-hidden">
            <div className="border-b border-hairline px-4 py-3">
              <span className="qe-label">Recent orders</span>
            </div>
            <div className="qe-scroll max-h-[240px] overflow-y-auto">
              {data.orders.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-muted-foreground">No orders yet.</p>
              ) : (
                data.orders.map((o) => (
                  <div key={o.id} className="flex items-center gap-3 border-b border-hairline px-4 py-2.5 text-xs last:border-0">
                    <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold ${o.side === "BUY" ? "bg-pos/15 text-pos" : "bg-neg/15 text-neg"}`}>{o.side}</span>
                    <span className="font-semibold">{o.symbol}</span>
                    <span className="qe-num text-muted-foreground">{o.filledQty || o.qty} @ {o.avgFillPrice ? fmtPrice(o.avgFillPrice) : "—"}</span>
                    <span className={`ml-auto rounded-md px-1.5 py-0.5 text-[9px] font-bold ${o.status === "REJECTED" ? "bg-neg/15 text-neg" : o.status === "FILLED" ? "bg-pos/15 text-pos" : "bg-panel-3 text-muted-foreground"}`}>
                      {o.status}
                    </span>
                    <span className="w-24 text-right text-[10px] text-muted-foreground">{fmtDateTime(o.createdAt)}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* equity snapshot */}
          {data.intel.positions.length > 0 && (
            <div className="qe-panel p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="qe-label">Equity trace (paper account)</span>
                <InfoTip title="Equity trace">Marked from SENTINEL heartbeat snapshots: cash + positions at delayed market prices. Dashed line would be your benchmark; the trace here is your own account equity.</InfoTip>
              </div>
              <EquityCurve
                showBenchmark={false}
                data={(JSON.parse((data as unknown as { snap?: never[] }).snap ?? "[]") as never[]) as never[]}
              />
            </div>
          )}
        </div>

        <div className="space-y-4">
          {/* risk gauge + warnings */}
          <StatTile
            label="Risk composite"
            value={<RiskGauge value={Math.min(100, intel.concentrationHHI / 40 + intel.portfolioVolatilityPct * 1.4 + (intel.maxDrawdownPct > 8 ? 20 : 0))} size={190} label="composite" />}
            tip="A composite of concentration (HHI), correlation-adjusted volatility, and drawdown. It is a conversation-starter, not a limit."
          >
            {intel.warnings.length > 0 && (
              <div className="mt-3 space-y-2">
                {intel.warnings.slice(0, 3).map((w, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.08 }}
                    className="flex items-start gap-2 rounded-lg border border-warn/25 bg-warn/[0.07] px-3 py-2"
                  >
                    <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" />
                    <p className="text-[11px] leading-snug text-warn">{w}</p>
                  </motion.div>
                ))}
              </div>
            )}
            {intel.warnings.length === 0 && (
              <p className="mt-3 rounded-lg border border-pos/25 bg-pos/[0.07] px-3 py-2 text-[11px] leading-snug text-pos">
                No concentration or correlation warnings. Diversification guidelines respected.
              </p>
            )}
          </StatTile>

          {/* allocation */}
          {intel.allocation.length > 0 && (
            <div className="qe-panel p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="qe-label">Sector allocation</span>
                <InfoTip title="Allocation">Share of invested value by sector. Several tech names can quietly equal one big tech bet — this is where that hides.</InfoTip>
              </div>
              <AllocationDonut slices={intel.allocation.map((a) => ({ label: a.sector, pct: a.pct }))} />
            </div>
          )}

          {/* correlation */}
          {intel.correlation && (
            <div className="qe-panel p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="qe-label">Correlation (1M daily)</span>
                <InfoTip title="Correlation">1.00 = moves together, −1.00 = opposite. Pairs above 0.85 tend to draw down together — read the warm cells as shared risk.</InfoTip>
              </div>
              <CorrelationMatrix symbols={intel.correlation.symbols} matrix={intel.correlation.matrix} />
            </div>
          )}

          {/* scenarios */}
          <div className="qe-panel p-4">
            <span className="qe-label">Scenario shocks</span>
            <div className="mt-3 space-y-2">
              {intel.scenarios.map((s) => (
                <div key={s.name} className="flex items-center justify-between rounded-lg bg-panel-2 px-3 py-2.5 text-xs">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <ArrowDownRight className="h-3.5 w-3.5 text-neg" /> {s.name}
                  </span>
                  <span className="qe-num font-semibold text-neg">{fmtMoney(s.impactUsd, 0)} <span className="text-[10px]">({fmtMoney(s.impactPct, 1, true)}%)</span></span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <AdvancedPanel title="Trade ticket — paper execution">
        <TradeTicket onDone={load} />
      </AdvancedPanel>
    </div>
  );
}

function TradeTicket({ onDone }: { onDone: () => void }) {
  const [symbol, setSymbol] = useState("NVDA");
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [qty, setQty] = useState(10);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: symbol.toUpperCase(), side, qty, requestId: `${symbol}-${side}-${qty}-${Date.now()}` }),
      });
      const json = await res.json();
      if (json.ok) {
        toast({
          title: `${side} ${json.execution.filledQty} ${symbol.toUpperCase()} @ $${json.execution.avgFillPrice}`,
          description: `${json.execution.brokerLabel} · slippage ${json.execution.fills?.[0]?.slippageBps ?? 0}bps · latency ${json.execution.latencyMs}ms. This was a simulated fill — not real money.`,
        });
        onDone();
      } else {
        toast({ title: "Order rejected", description: json.execution?.rejectReason ?? json.error ?? "Unknown reason", variant: "destructive" });
      }
    } catch {
      toast({ title: "Network hiccup", description: "The order did not reach the paper broker. Nothing was filled.", variant: "destructive" });
    }
    setBusy(false);
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <label className="qe-label mb-1.5 block">Symbol</label>
        <input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value.toUpperCase().slice(0, 8))}
          className="qe-num w-28 rounded-lg border border-input bg-panel-2 px-3 py-2 text-sm font-semibold outline-none focus:border-pos"
        />
      </div>
      <div>
        <label className="qe-label mb-1.5 block">Side</label>
        <div className="flex overflow-hidden rounded-lg border border-hairline">
          <button onClick={() => setSide("BUY")} className={`px-4 py-2 text-xs font-bold ${side === "BUY" ? "bg-pos text-white" : "bg-panel-2 text-muted-foreground"}`}>BUY</button>
          <button onClick={() => setSide("SELL")} className={`px-4 py-2 text-xs font-bold ${side === "SELL" ? "bg-neg text-white" : "bg-panel-2 text-muted-foreground"}`}>SELL</button>
        </div>
      </div>
      <div>
        <label className="qe-label mb-1.5 block">Quantity</label>
        <input
          type="number"
          min={1}
          value={qty}
          onChange={(e) => setQty(Math.max(1, Number(e.target.value)))}
          className="qe-num w-24 rounded-lg border border-input bg-panel-2 px-3 py-2 text-sm outline-none focus:border-pos"
        />
      </div>
      <button
        onClick={submit}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-xl bg-pos px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-transform hover:scale-[1.02] disabled:opacity-50"
      >
        <ArrowUpRight className="h-4 w-4" />
        {busy ? "Routing…" : "Place paper order"}
      </button>
      <p className="w-full text-[11px] text-muted-foreground">
        Fills are simulated with modeled slippage, spread, and latency on delayed data. QuantEdge Simulated ≠ real brokerage execution.
      </p>
    </div>
  );
}

void ArrowDownRight;
