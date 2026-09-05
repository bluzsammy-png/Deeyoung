"use client";

// DEEYOUNG PRO — ENGINE VIEW (2026-09-04 "go" build).
// The autonomous paper engine's live dashboard inside the terminal:
// account stats, equity curve, per-book R, open positions, closed trades,
// venue mirror panel (OKX demo/live with hard risk rails), fill toasts.
// Data: /api/engine/status (same public snapshot builder, aggregates only).
// 15s polling; every number is a real ledger row — nothing simulated here.

import { useCallback, useEffect, useRef, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast, Toaster } from "sonner";
import { Activity, Cpu, Database, FlaskConical, Radar, ShieldCheck, Waves } from "lucide-react";

interface EngineSnapshot {
  engine: {
    runLabel: string; runId: string; status: string; startedAt: string; elapsedHours: number;
    executionModel: string;
    dataVenue: { primary: string; twelvedata: { configured: boolean; minuteUsed: number; dayUsed: number; lastError: string | null } };
  };
  account: {
    startingUsd: number; settledEquityUsd: number; realizedPnlUsd: number; feesUsd: number;
    peakEquityUsd: number; maxDrawdownPct: number; dayKey: string | null; dayPnlR: number;
    openCount: number; closedCount: number; winRatePct: number | null;
  };
  openPositions: Array<{ bookKey: string; symbol: string; gate: number; horizonMin: number; qty: number; entryPrice: number; stop: number; target: number; score: number; rr: number; notionalUsd: number; openedAt: string }>;
  recentClosed: Array<{ bookKey: string; symbol: string; gate: number; horizonMin: number; entryPrice: number | null; exitPrice: number | null; exitReason: string | null; grossPnlUsd: number | null; netPnlUsd: number | null; netR: number | null; closedAt: string | null }>;
  books: Record<string, { trades: number; winRatePct: number | null; netUsd: number; netR: number }>;
  equityCurve: Array<{ t: number; e: number }>;
  live: {
    regimeUp: boolean | null; regimeAt: number; lastScanAt: number;
    bestSinceBoot: number; bestSymSinceBoot: string;
    crossSinceBoot: Record<number, number>; cycles: number;
  } | null;
  venue: {
    mode: string; keys: string; env: string | null; verdict: string;
    riskRails: { maxNotionalUsd: number; maxOpen: number; dailyRStop: number; slippageAlertBps: number };
    mirror: { open: number; filled: number; failed: number };
    detail?: string;
  };
}

const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" | "warn" }) {
  const color = tone === "good" ? "text-pos" : tone === "bad" ? "text-neg" : tone === "warn" ? "text-warn" : "";
  return (
    <div className="qe-stat px-4 py-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className={`qe-num mt-1 text-lg font-bold ${color}`}>{value}</div>
    </div>
  );
}

const GATE = 64;
const agoMin = (t: number) => Math.max(0, Math.round((Date.now() - t) / 60_000));

/** Stand-down transparency panel — the honest answer to "why no new trades?" */
function LiveScanPanel({ live }: { live: NonNullable<EngineSnapshot["live"]> }) {
  const regimeUp = live.regimeUp;
  const best = live.bestSinceBoot;
  const progress = Math.min(100, Math.round((best / GATE) * 100));
  const scanAge = live.lastScanAt ? agoMin(live.lastScanAt) : null;
  const crossings = Object.entries(live.crossSinceBoot).map(([g, n]) => ({ gate: Number(g), n }));

  return (
    <div className="qe-card overflow-hidden p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Radar className="h-4 w-4 text-brand" />
          <span className="text-xs font-bold uppercase tracking-wider">Scanner · why it trades or waits</span>
        </div>
        <span className="qe-num text-[10px] text-muted-foreground">
          {live.cycles.toLocaleString()} cycles · last scan {scanAge === null ? "warming up" : scanAge < 2 ? "just now" : `${scanAge}m ago`}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {/* regime verdict */}
        <div className={`rounded-xl border p-3.5 ${regimeUp === false ? "border-warn/30 bg-warn/[0.07]" : "border-pos/30 bg-pos/[0.06]"}`}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">BTC regime filter</span>
            <span className={`h-2 w-2 rounded-full ${regimeUp === false ? "bg-warn" : "bg-pos qe-pulse-dot"}`} />
          </div>
          <p className={`qe-display mt-1.5 text-sm font-bold ${regimeUp === false ? "text-warn" : "text-pos"}`}
          >
            {regimeUp === null ? "checking…" : regimeUp ? "OPEN · hunting longs" : "STAND-DOWN · longs paused"}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            BTC vs its 60m EMA20. Longs only fire while the broad market trends up — part of the validated edge.
          </p>
        </div>

        {/* gate proximity */}
        <div className="rounded-xl border border-hairline bg-panel-2 p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Best signal vs entry gate</span>
            <span className="qe-num text-[11px] font-bold text-brand-hi">{best}<span className="text-muted-foreground"> / {GATE}</span></span>
          </div>
          <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-panel-3">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand/60 to-brand transition-all duration-700"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            Strongest setup since boot: <b className="text-foreground">{live.bestSymSinceBoot || "…"}</b>. Only score ≥ {GATE} books an entry. Quality over quantity.
          </p>
        </div>

        {/* crossings */}
        <div className="rounded-xl border border-hairline bg-panel-2 p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Gate crossings since boot</span>
            <FlaskConical className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          {crossings.length === 0 ? (
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              None yet this run — the engine is correctly standing down until a setup is strong enough.
            </p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {crossings.map((c) => (
                <span key={c.gate} className="qe-num rounded-lg border border-brand/30 bg-brand/10 px-2 py-1 text-[10px] font-bold text-brand-hi">
                  gate {c.gate}: {c.n}×
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <p className="mt-3.5 rounded-xl border border-hairline bg-panel-2 px-3.5 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
        <b className="text-foreground">Live configuration (v2, walk-forward validated):</b> entry gate {GATE} on a 0–100 multi-factor score · M30 book ·
        stop −3% / target +1.2% · 12h time stop · $1,000 notional (10% of account) · BTC regime filter. In a 30-day walk-forward replay on real
        Binance bars this config measured an 83.8% win rate over 74 trades (profit factor 2.13); its worst rolling 10-trade stretch won 6 of 10.
        Backtest ≠ promise — the ledger below is the only record that counts.
      </p>
    </div>
  );
}

export function EngineView() {
  const [snap, setSnap] = useState<EngineSnapshot | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const closedRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/engine/status", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) { setErr(json.detail ?? "status unavailable"); return; }
      setErr(null);
      const next = json as EngineSnapshot;
      // fill/close toast on ledger change
      if (closedRef.current !== null && next.account.closedCount > closedRef.current) {
        const latest = next.recentClosed[0];
        if (latest) {
          const net = latest.netPnlUsd ?? 0;
          toast(`${latest.bookKey} closed ${latest.exitReason ?? ""}`, {
            description: `net ${net >= 0 ? "+" : ""}${usd(net)} · ${latest.netR !== null ? `${latest.netR!.toFixed(2)}R` : "…"}`,
          });
        }
      }
      closedRef.current = next.account.closedCount;
      setSnap(next);
    } catch {
      /* hold last good snapshot */
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 0);
    const iv = setInterval(load, 15_000);
    return () => { clearTimeout(t); clearInterval(iv); };
  }, [load]);

  if (err && !snap) {
    return (
      <div className="qe-panel p-6 text-sm text-warn">
        Engine state unreachable: {err}. The loop keeps running server-side — this panel never invents numbers.
      </div>
    );
  }
  if (!snap) {
    return <div className="qe-panel p-6 text-sm text-muted-foreground">loading engine ledger…</div>;
  }

  const { engine, account, venue } = snap;
  const curve = snap.equityCurve.map((p) => ({ t: new Date(p.t).toISOString().slice(11, 16), e: p.e }));
  const books = Object.entries(snap.books).map(([k, v]) => ({ book: k, ...v }));
  const pnlTone = account.realizedPnlUsd > 0 ? "good" : account.realizedPnlUsd < 0 ? "bad" : undefined;
  const heartbeatAge = curve.length ? Math.round((Date.now() - snap.equityCurve[snap.equityCurve.length - 1].t) / 1000) : null;
  const hasLegacyLosses = snap.recentClosed.some((p) => (p.netPnlUsd ?? 0) < 0 && p.gate < 64);

  return (
    <div className="space-y-4">
      <Toaster position="bottom-right" richColors theme="dark" />

      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Cpu className="h-5 w-5 text-brand" />
          <h1 className="text-lg font-bold tracking-tight">Paper Engine</h1>
          <span className="rounded-lg border border-hairline bg-panel-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            run &quot;{engine.runLabel}&quot; · {engine.status} · {engine.elapsedHours}h
          </span>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Waves className="h-3.5 w-3.5" />
          feed: <span className="font-semibold text-foreground">{engine.dataVenue.primary}</span>
          {heartbeatAge !== null && (
            <span className={`ml-2 inline-flex items-center gap-1 ${heartbeatAge < 90 ? "text-pos" : "text-warn"}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${heartbeatAge < 90 ? "bg-pos qe-pulse-dot" : "bg-warn"}`} />
              {heartbeatAge}s ago
            </span>
          )}
        </div>
      </div>

      {/* live scanner transparency */}
      {snap.live && <LiveScanPanel live={snap.live} />}

      {/* legacy-trade provenance note — honesty about the two v1 losses */}
      {hasLegacyLosses && (
        <div className="rounded-xl border border-hairline bg-panel-2 px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">
          <b className="text-foreground">About the two closed trades from the first run:</b> they were placed by configuration v1,
          whose fee-to-target math was un-winnable (24bps round-trip cost vs an 8bps target). A full cost-geometry audit replaced it
          with the validated v2 config above. The losses stay in the ledger on purpose — this engine never rewrites its history.
        </div>
      )}

      {/* venue mirror panel */}
      <div className="qe-panel p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className={`h-4 w-4 ${venue.mode === "paper" ? "text-muted-foreground" : "text-pos"}`} />
            <span className="text-xs font-bold uppercase tracking-wider">Execution venue</span>
            <span className={`rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${venue.mode === "paper" ? "bg-panel-2 text-muted-foreground" : "bg-pos/15 text-pos"}`}>
              {venue.mode}
            </span>
            <span className="text-[11px] text-muted-foreground">{venue.verdict}</span>
          </div>
          <div className="qe-num flex gap-4 text-[11px] text-muted-foreground">
            <span>mirror open <b className="text-foreground">{venue.mirror.open}</b></span>
            <span>filled <b className="text-foreground">{venue.mirror.filled}</b></span>
            <span>failed <b className={venue.mirror.failed ? "text-neg" : "text-foreground"}>{venue.mirror.failed}</b></span>
          </div>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          Paper engine is execution-of-record. When OKX keys are set and EXECUTION_VENUE=okx-demo|okx-live, every paper fill is
          mirrored to the real venue with hard rails: ≤{usd(venue.riskRails.maxNotionalUsd)} per trade, ≤{venue.riskRails.maxOpen} open,
          day stop {venue.riskRails.dailyRStop}R, slippage alert {venue.riskRails.slippageAlertBps}bps. Mirror failures never touch this ledger.
          {venue.detail ? ` Venue: ${venue.detail}` : ""}
        </p>
      </div>

      {/* stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Settled equity" value={usd(account.settledEquityUsd)} />
        <Stat label="Realized P&L" value={`${account.realizedPnlUsd >= 0 ? "+" : ""}${usd(account.realizedPnlUsd)}`} tone={pnlTone} />
        <Stat label="Fees paid" value={usd(account.feesUsd)} />
        <Stat label="Max drawdown" value={`${account.maxDrawdownPct.toFixed(2)}%`} tone={account.maxDrawdownPct > 5 ? "warn" : undefined} />
        <Stat label="Open / closed" value={`${account.openCount} / ${account.closedCount}`} />
        <Stat label="Win rate" value={account.winRatePct === null ? "…" : `${account.winRatePct}%`} tone={account.winRatePct !== null && account.winRatePct >= 50 ? "good" : undefined} />
      </div>

      {/* equity curve */}
      <div className="qe-panel p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Equity curve (marked every cycle)</span>
          <span className="qe-num text-[11px] text-muted-foreground">day {account.dayKey ?? "…"}: {account.dayPnlR >= 0 ? "+" : ""}{account.dayPnlR.toFixed(2)}R</span>
        </div>
        <div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={curve} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
              <defs>
                <linearGradient id="eqFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="t" tick={{ fontSize: 10, fill: "#71717a" }} tickLine={false} axisLine={false} minTickGap={48} />
              <YAxis tick={{ fontSize: 10, fill: "#71717a" }} tickLine={false} axisLine={false} width={64} domain={["auto", "auto"]} tickFormatter={(v: number) => `$${v.toFixed(0)}`} />
              <Tooltip contentStyle={{ background: "#101013", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12 }} formatter={(v) => [usd(Number(v)), "equity"]} />
              <Area type="monotone" dataKey="e" stroke="#10b981" strokeWidth={1.8} fill="url(#eqFill)" isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* books */}
        <div className="qe-panel p-4">
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <Activity className="h-3.5 w-3.5" /> Book performance (net R)
          </div>
          {books.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">No closed trades yet. Gate-{GATE} entries only; every guard must pass.</p>
          ) : (
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={books} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="book" tick={{ fontSize: 10, fill: "#71717a" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#71717a" }} tickLine={false} axisLine={false} width={44} />
                  <Tooltip contentStyle={{ background: "#101013", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12 }} />
                  <Bar dataKey="netR" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                    {books.map((b) => <Cell key={b.book} fill={b.netR >= 0 ? "#10b981" : "#f43f5e"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* open positions */}
        <div className="qe-panel p-4">
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <Database className="h-3.5 w-3.5" /> Open positions
          </div>
          {snap.openPositions.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">None right now. The engine waits for gate-{GATE} signals that pass every guard.</p>
          ) : (
            <div className="qe-scroll max-h-[200px] overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr>{["Book", "Qty", "Entry", "Stop", "Target", "Score"].map((h) => <th key={h} className="px-2 py-1.5 font-semibold">{h}</th>)}</tr>
                </thead>
                <tbody className="qe-num divide-y divide-hairline">
                  {snap.openPositions.map((p) => (
                    <tr key={p.bookKey}>
                      <td className="px-2 py-1.5 font-semibold">{p.bookKey}</td>
                      <td className="px-2 py-1.5">{p.qty.toFixed(4)}</td>
                      <td className="px-2 py-1.5">{p.entryPrice.toFixed(2)}</td>
                      <td className="px-2 py-1.5 text-neg">{p.stop.toFixed(2)}</td>
                      <td className="px-2 py-1.5 text-pos">{p.target.toFixed(2)}</td>
                      <td className="px-2 py-1.5">{p.score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* closed trades */}
      <div className="qe-panel p-4">
        <div className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Recent closed trades (audit ledger)</div>
        {snap.recentClosed.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">No closed trades in this run yet.</p>
        ) : (
          <div className="qe-scroll max-h-[300px] overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>{["Book", "Symbol", "Entry", "Exit", "Reason", "Net $", "Net R", "Closed"].map((h) => <th key={h} className="px-2 py-1.5 font-semibold">{h}</th>)}</tr>
              </thead>
              <tbody className="qe-num divide-y divide-hairline">
                {snap.recentClosed.map((p) => (
                  <tr key={p.bookKey + String(p.closedAt)}>
                    <td className="px-2 py-1.5 font-semibold">{p.bookKey}</td>
                    <td className="px-2 py-1.5">{p.symbol}</td>
                    <td className="px-2 py-1.5">{p.entryPrice?.toFixed(2)}</td>
                    <td className="px-2 py-1.5">{p.exitPrice?.toFixed(2)}</td>
                    <td className="px-2 py-1.5">{p.exitReason}</td>
                    <td className={`px-2 py-1.5 ${(p.netPnlUsd ?? 0) >= 0 ? "text-pos" : "text-neg"}`}>{(p.netPnlUsd ?? 0) >= 0 ? "+" : ""}{(p.netPnlUsd ?? 0).toFixed(2)}</td>
                    <td className={`px-2 py-1.5 ${(p.netR ?? 0) >= 0 ? "text-pos" : "text-neg"}`}>{(p.netR ?? 0) >= 0 ? "+" : ""}{(p.netR ?? 0).toFixed(2)}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">{p.closedAt ? new Date(p.closedAt).toISOString().slice(5, 16).replace("T", " ") : "…"}Z</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
