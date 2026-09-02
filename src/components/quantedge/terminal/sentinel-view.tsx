"use client";

// DEEYOUNG PRO — SENTINEL center (§16, §17, §18, §45)
// Modes: Observe (default) → Approve → Delegate. Deterministic risk checks shown
// verbatim. Emergency Stop one tap away. Everything audited.

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "@/hooks/use-toast";
import { AlertTriangle, Bot, CheckCircle2, PauseCircle, Play, ShieldCheck, XCircle } from "lucide-react";
import { fmtMoney, fmtPrice, fmtAgo, fmtDateTime } from "@/lib/format";
import { AdvancedPanel, DataBadge, InfoTip, SectionHead } from "@/components/quantedge/ui-bits";
import { ExecutionTimeline } from "@/components/quantedge/charts/widgets";
import { useApp } from "@/lib/store";
import type { RiskCheck, SentinelState } from "@/lib/types";

interface Approval {
  id: string; symbol: string; side: string; qty: number; entry: number; stop: number; target: number;
  riskUsd: number; rr: number; score: number; regime: string; catalyst: string | null;
  riskChecks: string; proposal: string; status: string; expiresAt: string; createdAt: string; decidedAt: string | null;
}
interface Notification { id: string; title: string; body: string; importance: string; createdAt: string }
interface AuditEvent { id: string; category: string; action: string; detail: string; createdAt: string }
interface SentinelStatePayload {
  mode: "OBSERVE" | "APPROVE" | "DELEGATE";
  state: SentinelState;
  killSwitch: boolean;
  config: Record<string, unknown> & {
    riskPerTradePct: number; maxPositionPct: number; maxNotionalUsd: number; maxOpenPositions: number;
    maxDailyLossPct: number; minRR: number; minSignalScore: number; minLiquidityUsd: number;
    maxSpreadBps: number; maxCorrelatedExposurePct: number; maxPortfolioDrawdownPct: number; maxDailyTrades: number;
    allowedAssets: string; allowedSessions: string;
  };
  approvals: Approval[];
  notifications: Notification[];
  auditEvents: AuditEvent[];
  openSignals: { id: string; symbol: string; direction: string; score: number; status: string; resultPct: number | null; openedAt: string; resolvedAt: string | null }[];
  account: { equity: number; broker: string };
}

const MODE_INFO: Record<string, { label: string; desc: string }> = {
  OBSERVE: { label: "Observe", desc: "Signal-only. No orders, ever. The default." },
  APPROVE: { label: "Approve", desc: "SENTINEL proposes trades. You approve or reject each one, every time." },
  DELEGATE: { label: "Delegate", desc: "Automatic execution inside hard limits you set. Requires explicit confirmation." },
};

const STATE_STYLES: Record<string, string> = {
  ACTIVE: "text-pos", WAITING_FOR_APPROVAL: "text-warn", PAUSED: "text-warn",
  RISK_LOCKED: "text-neg", EMERGENCY_STOP: "text-neg", DATA_UNAVAILABLE: "text-neg",
  NEWS_PROVIDER_UNAVAILABLE: "text-warn", BROKER_DISCONNECTED: "text-neg", SYSTEM_DEGRADED: "text-warn",
};

export function SentinelView() {
  const [data, setData] = useState<SentinelStatePayload | null>(null);
  const [ticking, setTicking] = useState(false);
  const [tickResult, setTickResult] = useState<{ scanned: number; signalsFound: number; proposalsCreated: number; executed: number; state: string; notes: string[] } | null>(null);
  const setUnread = useApp((s) => s.setUnreadNotifications);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/sentinel/state");
      const json = await res.json();
      setData(json);
      const pending = (json.approvals ?? []).filter((a: Approval) => a.status === "PENDING").length;
      setUnread(pending);
    } catch { /* hold */ }
  }, [setUnread]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    const iv = setInterval(load, 30_000);
    return () => { clearInterval(iv); clearTimeout(t); };
  }, [load]);

  const runTick = async () => {
    setTicking(true);
    try {
      const res = await fetch("/api/sentinel/tick", { method: "POST" });
      setTickResult(await res.json());
      await load();
    } catch { /* skip */ }
    setTicking(false);
  };

  const setMode = async (mode: string, confirmDelegate = false) => {
    const res = await fetch("/api/sentinel/config", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, confirmDelegate }),
    });
    const json = await res.json();
    if (!res.ok) {
      toast({ title: "Change blocked", description: json.error, variant: "destructive" });
      return;
    }
    toast({ title: `SENTINEL → ${MODE_INFO[mode]?.label ?? mode}`, description: MODE_INFO[mode]?.desc });
    await load();
  };

  const toggleKill = async (engaged: boolean) => {
    const res = await fetch("/api/sentinel/kill", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ engaged, confirmRelease: true }),
    });
    const json = await res.json();
    if (res.ok) {
      toast({
        title: engaged ? "EMERGENCY STOP ENGAGED" : "Emergency stop released",
        description: engaged
          ? `Automation disabled. ${json.cancelledApprovals ?? 0} pending approval(s) cancelled. Audited.`
          : "SENTINEL re-armed. Mode unchanged. Observe remains the safe default.",
        variant: engaged ? "destructive" : "default",
      });
      await load();
    }
  };

  if (!data) return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-28 animate-pulse rounded-xl bg-panel-2" />)}</div>;

  const pending = data.approvals.filter((a) => a.status === "PENDING");
  const resolved = data.approvals.filter((a) => a.status !== "PENDING");
  const resolvedSignals = data.openSignals.filter((s) => s.status !== "OPEN");

  return (
    <div className="space-y-4">
      <SectionHead
        title="SENTINEL"
        sub="The optional action layer — it proposes, disposes nothing without permission"
        right={<button onClick={runTick} disabled={ticking} className="inline-flex items-center gap-2 rounded-xl bg-brand/12 px-4 py-2 text-xs font-semibold text-brand-hi transition-colors hover:bg-brand/20 disabled:opacity-50">
          {ticking ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-brand border-t-transparent" /> : <Play className="h-3.5 w-3.5" />}
          Run scan now
        </button>}
      />

      {/* kill switch banner */}
      {data.killSwitch && (
        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="qe-alarm rounded-xl border border-neg/50 bg-neg/10 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-neg" />
              <div>
                <p className="text-sm font-bold text-neg">EMERGENCY STOP IS ENGAGED</p>
                <p className="mt-0.5 text-xs text-foreground/75">New automation is disabled, pending approvals were cancelled, and every SENTINEL action is blocked. Analytics continues to run.</p>
              </div>
            </div>
            <button onClick={() => toggleKill(false)} className="rounded-xl border border-neg/50 px-4 py-2 text-xs font-bold text-neg transition-colors hover:bg-neg/10">
              Release stop
            </button>
          </div>
        </motion.div>
      )}

      {/* status + modes */}
      <div className="grid gap-3 lg:grid-cols-[1fr_1.4fr]">
        <div className="qe-panel p-5">
          <div className="flex items-center justify-between">
            <span className="qe-label">Current state</span>
            <Bot className="h-4 w-4 text-pos" />
          </div>
          <p className={`mt-2 text-2xl font-bold tracking-tight ${STATE_STYLES[data.state] ?? ""}`}>{data.state.replace(/_/g, " ")}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {data.killSwitch ? "Kill switch engaged — see banner." :
             data.state === "WAITING_FOR_APPROVAL" ? "Proposals are queued and expire in 2 minutes. Your move." :
             data.state === "ACTIVE" ? `Mode ${data.mode}. Risk engine gates every action; nothing bypasses it.` :
             `SENTINEL is ${data.state.toLowerCase().replace(/_/g, " ")} — analytics keeps running, action layer waits.`}
          </p>

          {/* modes */}
          <div className="mt-4 space-y-2">
            {Object.entries(MODE_INFO).map(([key, info]) => {
              const active = data.mode === key;
              return (
                <button
                  key={key}
                  onClick={() => !active && (key === "DELEGATE"
                    ? toast({
                        title: "Confirm Delegate mode",
                        description: "Automatic execution will place real paper orders inside your limits without per-trade approval. Enable it?",
                        action: <button className="rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-white" onClick={() => setMode("DELEGATE", true)}>Confirm Delegate</button>,
                      })
                    : setMode(key))}
                  className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors ${
                    active ? "border-pos/40 bg-pos/[0.08]" : "border-hairline bg-panel-2 hover:border-pos/25"
                  }`}
                >
                  {active ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-pos" /> : <PauseCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
                  <div>
                    <p className={`text-xs font-bold ${active ? "text-pos" : ""}`}>{info.label} {active && "· active"}</p>
                    <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{info.desc}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* approval queue */}
        <div className="space-y-3">
          <div className="qe-panel p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="qe-label">Approval queue {pending.length > 0 && <span className="ml-1 rounded-full bg-warn/20 px-2 py-0.5 text-[10px] font-bold text-warn">{pending.length} pending</span>}</span>
              <InfoTip title="Approvals">
                Proposals are user-specific, trade-specific, single-use, and expire in 2 minutes. Approving routes the order to the paper broker with modeled slippage — never real money.
              </InfoTip>
            </div>
            {pending.length === 0 ? (
              <div className="rounded-xl border border-hairline bg-panel-2 p-4 text-center">
                <p className="text-xs text-muted-foreground">
                  {data.mode === "APPROVE"
                    ? "No pending proposals. SENTINEL posts here when a setup clears the risk engine."
                    : `Switch to Approve mode to receive proposals. Current mode: ${data.mode}.`}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <AnimatePresence>
                  {pending.map((a) => (
                    <ApprovalCard key={a.id} approval={a} onDecided={load} />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* last tick */}
          {tickResult && (
            <div className="qe-panel p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="qe-label">Last scan</span>
                <DataBadge state={tickResult.state === "ACTIVE" ? "LIVE" : "UNAVAILABLE"} />
              </div>
              <div className="qe-num grid grid-cols-4 gap-2 text-center text-xs">
                <div><span className="block text-muted-foreground">Scanned</span>{tickResult.scanned}</div>
                <div><span className="block text-muted-foreground">Signals</span>{tickResult.signalsFound}</div>
                <div><span className="block text-muted-foreground">Proposals</span>{tickResult.proposalsCreated}</div>
                <div><span className="block text-muted-foreground">Executed</span>{tickResult.executed}</div>
              </div>
              {tickResult.notes.length > 0 && (
                <div className="mt-3 space-y-1">
                  {tickResult.notes.slice(0, 4).map((n, i) => (
                    <p key={i} className="text-[11px] leading-snug text-muted-foreground">· {n}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* risk limits */}
      <AdvancedPanel title="Risk limits — the deterministic cage (editable)">
        <RiskLimitsEditor config={data.config} onSaved={load} />
      </AdvancedPanel>

      {/* signal history */}
      {resolvedSignals.length > 0 && (
        <div className="qe-panel overflow-hidden">
          <div className="border-b border-hairline px-4 py-3">
            <span className="qe-label">Signal history — outcomes, not cherry-picks (§24)</span>
          </div>
          <div className="qe-scroll max-h-[280px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-panel">
                <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2 font-semibold">Symbol</th>
                  <th className="px-4 py-2 text-right font-semibold">Score</th>
                  <th className="px-4 py-2 font-semibold">Outcome</th>
                  <th className="px-4 py-2 text-right font-semibold">Result</th>
                  <th className="hidden px-4 py-2 text-right font-semibold sm:table-cell">Opened</th>
                </tr>
              </thead>
              <tbody>
                {resolvedSignals.map((s) => (
                  <tr key={s.id} className="border-t border-hairline">
                    <td className="px-4 py-2.5 font-bold">{s.symbol} <span className="text-[9px] font-medium text-muted-foreground">{s.direction}</span></td>
                    <td className="qe-num px-4 py-2.5 text-right">{s.score}</td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold ${s.status === "TARGET_HIT" ? "bg-pos/15 text-pos" : s.status === "STOP_HIT" ? "bg-neg/15 text-neg" : "bg-panel-3 text-muted-foreground"}`}>
                        {s.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className={`qe-num px-4 py-2.5 text-right font-semibold ${(s.resultPct ?? 0) >= 0 ? "text-pos" : "text-neg"}`}>
                      {s.resultPct == null ? "—" : `${s.resultPct > 0 ? "+" : ""}${s.resultPct.toFixed(2)}%`}
                    </td>
                    <td className="hidden px-4 py-2.5 text-right text-[10px] text-muted-foreground sm:table-cell">{fmtDateTime(s.openedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* audit trail */}
      <div className="qe-panel overflow-hidden">
        <div className="border-b border-hairline px-4 py-3">
          <span className="qe-label">Audit trail — immutable record (§45)</span>
        </div>
        <div className="qe-scroll max-h-[300px] overflow-y-auto">
          {data.auditEvents.map((e) => {
            let detail: Record<string, unknown> = {};
            try { detail = JSON.parse(e.detail); } catch { /* empty */ }
            return (
              <div key={e.id} className="flex items-start gap-3 border-b border-hairline px-4 py-2.5 text-xs last:border-0">
                <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold ${e.category === "EMERGENCY_STOP" ? "bg-neg/15 text-neg" : e.category === "RISK" ? "bg-warn/15 text-warn" : "bg-panel-3 text-muted-foreground"}`}>
                  {e.category}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{e.action.replace(/_/g, " ").toLowerCase()}</p>
                  {Object.keys(detail).length > 0 && (
                    <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{JSON.stringify(detail)}</p>
                  )}
                </div>
                <span className="shrink-0 text-[10px] text-muted-foreground">{fmtAgo(e.createdAt)}</span>
              </div>
            );
          })}
          {data.auditEvents.length === 0 && <p className="px-4 py-6 text-center text-xs text-muted-foreground">No audit events yet.</p>}
        </div>
      </div>
    </div>
  );
}

// ─── Approval card (§16 spec verbatim) ────────────────────────────────────────

function ApprovalCard({ approval, onDecided }: { approval: Approval; onDecided: () => void }) {
  const [busy, setBusy] = useState<"APPROVE" | "REJECT" | null>(null);
  const [secsLeft, setSecsLeft] = useState(Math.max(0, Math.floor((new Date(approval.expiresAt).getTime() - Date.now()) / 1000)));
  const [checks, setChecks] = useState<RiskCheck[]>([]);

  useEffect(() => {
    try { setChecks(JSON.parse(approval.riskChecks)); } catch { /* none */ }
    const iv = setInterval(() => {
      setSecsLeft(Math.max(0, Math.floor((new Date(approval.expiresAt).getTime() - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(iv);
  }, [approval.expiresAt, approval.riskChecks]);

  const decide = async (decision: "APPROVE" | "REJECT") => {
    setBusy(decision);
    try {
      const res = await fetch("/api/approvals", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvalId: approval.id, decision }),
      });
      const json = await res.json();
      if (res.ok) {
        toast({
          title: decision === "APPROVE" ? `Approved — routing ${approval.symbol}` : `Rejected ${approval.symbol}`,
          description: decision === "APPROVE"
            ? json.execution?.status === "REJECTED"
              ? json.execution.rejectReason
              : `Filled ${json.execution?.filledQty ?? 0} @ $${json.execution?.avgFillPrice?.toFixed(2) ?? "—"} (${json.execution?.brokerLabel ?? "paper"})`
            : "No order sent. Decision logged to audit trail.",
        });
      } else {
        toast({ title: "Decision failed", description: json.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Network error", description: "Your decision was not recorded. The approval may expire — that is safe behavior.", variant: "destructive" });
    }
    setBusy(null);
    onDecided();
  };

  const passedAll = checks.every((c) => c.pass);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.97, borderColor: "rgba(240,185,11,0.5)" }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      className="rounded-xl border border-warn/40 bg-warn/[0.05] p-4"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="rounded-lg bg-warn/15 px-2 py-1 text-[10px] font-bold tracking-wider text-warn">SENTINEL OPPORTUNITY</span>
          <span className="text-sm font-bold">{approval.symbol}</span>
          <span className="rounded-md bg-pos/15 px-1.5 py-0.5 text-[9px] font-bold text-pos">{approval.side}</span>
        </div>
        <span className={`qe-num rounded-lg px-2 py-1 text-[11px] font-bold ${secsLeft < 30 ? "text-neg" : "text-muted-foreground"}`}>
          {Math.floor(secsLeft / 60)}:{String(secsLeft % 60).padStart(2, "0")}
        </span>
      </div>

      <div className="qe-num mt-3 grid grid-cols-3 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-6">
        <div><span className="block text-[10px] text-muted-foreground">Entry</span>{fmtPrice(approval.entry)}</div>
        <div><span className="block text-[10px] text-muted-foreground">Stop</span><span className="text-neg">{fmtPrice(approval.stop)}</span></div>
        <div><span className="block text-[10px] text-muted-foreground">Target</span><span className="text-pos">{fmtPrice(approval.target)}</span></div>
        <div><span className="block text-[10px] text-muted-foreground">Risk</span>{fmtMoney(approval.riskUsd, 0)}</div>
        <div><span className="block text-[10px] text-muted-foreground">R:R</span>{approval.rr.toFixed(1)}</div>
        <div><span className="block text-[10px] text-muted-foreground">Signal</span><span className="font-bold text-pos">{approval.score}</span></div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
        <span>Regime: {approval.regime.replace(/_/g, " ")}</span>
        <span>· Catalyst: {approval.catalyst ?? "None verified"}</span>
        <span>· Qty: {approval.qty}</span>
      </div>

      {/* risk checks */}
      <details className="mt-3 rounded-lg border border-hairline bg-panel-2 px-3 py-2">
        <summary className="cursor-pointer text-[11px] font-semibold text-muted-foreground">
          Risk check: <span className={passedAll ? "font-bold text-pos" : "font-bold text-neg"}>{passedAll ? "PASSED" : "PARTIAL"}</span> — {checks.length} deterministic gates
        </summary>
        <div className="mt-2 space-y-1">
          {checks.map((c) => (
            <div key={c.name} className="flex items-start gap-2 text-[10.5px]">
              {c.pass ? <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-pos" /> : <XCircle className="mt-0.5 h-3 w-3 shrink-0 text-neg" />}
              <span className="font-medium">{c.name}:</span>
              <span className="text-muted-foreground">{c.detail}</span>
            </div>
          ))}
        </div>
      </details>

      <div className="mt-3 flex gap-2">
        <button
          onClick={() => decide("APPROVE")}
          disabled={busy !== null || secsLeft === 0}
          className="flex-1 rounded-xl bg-brand py-2.5 text-xs font-bold text-white transition-transform hover:scale-[1.01] disabled:opacity-40"
        >
          {busy === "APPROVE" ? "Routing…" : "Approve"}
        </button>
        <button
          onClick={() => decide("REJECT")}
          disabled={busy !== null || secsLeft === 0}
          className="flex-1 rounded-xl border border-hairline bg-panel-2 py-2.5 text-xs font-bold text-foreground transition-colors hover:border-neg/40 hover:text-neg disabled:opacity-40"
        >
          {busy === "REJECT" ? "Rejecting…" : "Reject"}
        </button>
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">
        Expires automatically at {fmtDateTime(approval.expiresAt)} · single-use · audited · paper execution only
      </p>
    </motion.div>
  );
}

// ─── Risk limits editor ───────────────────────────────────────────────────────

function RiskLimitsEditor({ config, onSaved }: { config: SentinelStatePayload["config"]; onSaved: () => void }) {
  const [form, setForm] = useState(config);
  const [saving, setSaving] = useState(false);

  const fields: { key: keyof SentinelStatePayload["config"]; label: string; min: number; max: number; step: number; suffix?: string; tip: string }[] = [
    { key: "riskPerTradePct", label: "Risk per trade", min: 0.1, max: 5, step: 0.1, suffix: "%", tip: "Max equity risked on any single trade. Sizing derives from this and the stop distance." },
    { key: "maxPositionPct", label: "Max position", min: 1, max: 100, step: 1, suffix: "%", tip: "Largest single position as % of equity." },
    { key: "maxNotionalUsd", label: "Max notional", min: 500, max: 1000000, step: 500, suffix: "$", tip: "Hard cap on order value." },
    { key: "maxOpenPositions", label: "Max open positions", min: 1, max: 50, step: 1, tip: "Concurrent position ceiling." },
    { key: "maxDailyLossPct", label: "Daily loss breaker", min: 0.5, max: 20, step: 0.5, suffix: "%", tip: "Realized daily loss that locks the risk engine (circuit breaker)." },
    { key: "minSignalScore", label: "Min signal score", min: 40, max: 95, step: 1, tip: "Regime adjustments are added on top of this floor." },
    { key: "minRR", label: "Min risk:reward", min: 0.5, max: 10, step: 0.1, tip: "Proposals below this ratio never reach you." },
    { key: "maxCorrelatedExposurePct", label: "Max correlated exposure", min: 5, max: 100, step: 5, suffix: "%", tip: "Same-sector exposure cap — blocks 'three positions, one trade'." },
  ];

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/sentinel/config", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      toast({
        title: res.ok ? "Risk limits updated" : "Update rejected",
        description: res.ok ? `${(json.changes ?? []).length} change(s) saved and audited.` : json.error,
        variant: res.ok ? "default" : "destructive",
      });
      if (res.ok) onSaved();
    } catch {
      toast({ title: "Network error", description: "Limits unchanged.", variant: "destructive" });
    }
    setSaving(false);
  };

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {fields.map((f) => (
          <div key={String(f.key)} className="qe-panel-2 rounded-xl p-3">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold">{f.label}</label>
              <InfoTip title={f.label}>{f.tip}</InfoTip>
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <input
                type="range"
                min={f.min} max={f.max} step={f.step}
                value={Number(form[f.key])}
                onChange={(e) => setForm({ ...form, [f.key]: Number(e.target.value) })}
                className="w-full accent-[#10b981]"
              />
              <span className="qe-num w-16 shrink-0 text-right text-xs font-bold">
                {f.suffix === "$" ? `$${Number(form[f.key]).toLocaleString()}` : `${Number(form[f.key])}${f.suffix === "%" ? "%" : ""}`}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-pos" />
          These limits gate SENTINEL deterministically. The AI cannot change or bypass them — architecturally.
        </p>
        <button onClick={save} disabled={saving} className="rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white disabled:opacity-50">
          {saving ? "Saving…" : "Save & audit"}
        </button>
      </div>
    </div>
  );
}
