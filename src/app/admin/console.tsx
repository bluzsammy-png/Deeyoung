"use client";

// DEEYOUNG PRO — Control Room client: standalone sign-in + three tabs
// (Overview / Engine / Users). Talks only to /api/admin/* — every surface
// server-gated to ADMIN. Honest data only: whatever the ledger says.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity, Ban, Bot, CheckCircle2, Cpu, Database, Gauge, Loader2, LogOut, MessageCircle, PauseCircle,
  Play, RefreshCw, ShieldAlert, ShieldCheck, Users as UsersIcon, XCircle,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { SupportTab } from "./support-tab";

// ── types (mirrors /api/admin/engine + /api/admin/users) ──
interface Snapshot {
  engine: {
    runLabel: string; status: string; startedAt: string; elapsedHours: number;
    executionModel: string;
    dataVenue: { primary: string; twelvedata: { configured: boolean; minuteUsed: number; dayUsed: number; lastError: string | null } };
    feedMap: Record<string, { source: string; at: number; degraded?: string }>;
    feedCounters: { tdServed: number; binanceServed: number; tdSkippedBudget: number };
    control: { paused: boolean; reason: string | null; updatedBy: string | null; updatedAt: string | null };
  };
  account: {
    startingUsd: number; settledEquityUsd: number; realizedPnlUsd: number; feesUsd: number;
    peakEquityUsd: number; maxDrawdownPct: number; openCount: number; closedCount: number; winRatePct: number | null;
  };
  openPositions: Array<{ bookKey: string; symbol: string; qty: number; entryPrice: number; stop: number; target: number; score: number; openedAt: string }>;
  recentClosed: Array<{ bookKey: string; symbol: string; entryPrice: number | null; exitPrice: number | null; exitReason: string | null; netPnlUsd: number | null; netR: number | null; closedAt: string | null }>;
  recentOrders: Array<{ clientOid: string; symbol: string; side: string; kind: string; fillPrice: number | null; status: string; createdAt: string }>;
  books: Record<string, { trades: number; winRatePct: number | null; netUsd: number; netR: number }>;
  equityCurve: Array<{ t: number; e: number }>;
  venue: { mode: string; verdict: string; target?: string; simulator?: boolean; mirror: { open: number; filled: number; failed: number } };
  build: { marker: string; sha: string | null };
}
interface EnginePayload { ok: boolean; control: Snapshot["engine"]["control"]; snapshot: Snapshot }
interface UsersPayload {
  users: Array<{ id: string; name: string | null; email: string; role: string; status: string; plan: string; emailVerified: boolean; signupCountFromIp: number; createdAt: string }>;
  stats: { total: number; banned: number; suspended: number; trial: number; paid: number };
}

const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const okTone = (v: number) => (v >= 0 ? "text-emerald-400" : "text-rose-400");

// ── success/failed marks + skeleton loading primitives ──
function WinMark() {
  return <CheckCircle2 aria-label="success" className="mr-1 inline h-3.5 w-3.5 text-emerald-400" />;
}
function FailMark() {
  return <XCircle aria-label="failed" className="mr-1 inline h-3.5 w-3.5 text-rose-400" />;
}
function Skeleton({ className = "" }: { className?: string }) {
  return <span className={`inline-block animate-pulse rounded bg-zinc-800 ${className}`} />;
}
function SkeletonRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2" role="status" aria-label="loading">
      {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className={`h-4 ${i % 2 ? "w-4/5" : "w-full"}`} />)}
    </div>
  );
}

export function AdminSignIn({ googleEnabled = false }: { googleEnabled?: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [googleBusy, setGoogleBusy] = useState(false);

  const google = async () => {
    setGoogleBusy(true); setErr(null);
    try {
      const r = await fetch("/api/auth/sign-in/social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "google", callbackURL: "/admin" }),
      });
      const d = await r.json();
      if (d?.url) { window.location.href = d.url; return; }
      setErr("Google sign-in unavailable — falling back to email.");
    } catch {
      setErr("Google sign-in failed — use email and password.");
    }
    setGoogleBusy(false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    const { error } = await authClient.signIn.email({ email, password });
    if (error) { setErr(error.message ?? "Sign-in failed"); setBusy(false); return; }
    router.refresh();
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900/60 p-7">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="h-6 w-6 text-emerald-400" />
          <div>
            <h1 className="text-lg font-bold tracking-tight text-zinc-100">DeeYoung Control Room</h1>
            <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">owner access only</p>
          </div>
        </div>
        <label htmlFor="ad-email" className="mt-6 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Email</label>
        <input id="ad-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email"
          className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none focus:border-emerald-500/60" placeholder="you@example.com" />
        <label htmlFor="ad-pass" className="mt-4 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Password</label>
        <input id="ad-pass" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password"
          className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none focus:border-emerald-500/60" placeholder="••••••••" />
        {err && <p className="mt-3 rounded-lg border border-rose-900/60 bg-rose-950/40 px-3 py-2 text-xs text-rose-300">{err}</p>}
        <button type="submit" disabled={busy}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-bold text-emerald-950 transition hover:brightness-110 disabled:opacity-50">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Sign in
        </button>
        {googleEnabled && (
          <>
            <div className="mt-4 flex items-center gap-3 text-[10px] uppercase tracking-widest text-zinc-600">
              <span className="h-px flex-1 bg-zinc-800" /> or <span className="h-px flex-1 bg-zinc-800" />
            </div>
            <button type="button" onClick={google} disabled={googleBusy}
              className="mt-3 flex w-full items-center justify-center gap-2.5 rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-zinc-100 transition hover:border-zinc-500 disabled:opacity-50">
              <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true"><path fill="#EA4335" d="M12 5.04c1.7 0 3.22.59 4.42 1.74l3.29-3.29C17.73 1.63 15.09.5 12 .5 7.42.5 3.44 3.13 1.5 6.93l3.85 2.99C6.27 7.05 8.9 5.04 12 5.04z"/><path fill="#4285F4" d="M23.5 12.27c0-.79-.07-1.55-.2-2.27H12v4.51h6.44c-.29 1.48-1.14 2.73-2.41 3.57l3.72 2.89c2.17-2 3.75-4.96 3.75-8.7z"/><path fill="#FBBC05" d="M5.35 14.08a7.06 7.06 0 0 1 0-4.16L1.5 6.93a11.51 11.51 0 0 0 0 10.14l3.85-2.99z"/><path fill="#34A853" d="M12 23.5c3.09 0 5.68-1.02 7.58-2.76l-3.72-2.89c-1.03.7-2.36 1.11-3.86 1.11-3.1 0-5.73-2.01-6.65-4.88l-3.85 2.99C3.44 20.87 7.42 23.5 12 23.5z"/></svg>
              {googleBusy ? "Redirecting to Google…" : "Continue with Google"}
            </button>
          </>
        )}
        <p className="mt-4 text-center text-[11px] leading-relaxed text-zinc-600">
          Admin side of the platform. User product lives at <a href="/" className="text-zinc-400 underline decoration-dotted">/</a>.
        </p>
      </form>
    </main>
  );
}

export function AdminForbidden({ reason }: { reason: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-2xl border border-rose-900/60 bg-rose-950/30 p-7 text-center">
        <ShieldAlert className="mx-auto h-8 w-8 text-rose-400" />
        <h1 className="mt-3 text-lg font-bold text-rose-200">Access denied</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-rose-300/80">{reason}</p>
        <a href="/" className="mt-5 inline-block rounded-lg border border-zinc-700 px-4 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-900">Back to product</a>
      </div>
    </main>
  );
}

export function AdminConsole({ adminEmail }: { adminEmail: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<"overview" | "engine" | "users" | "support">("overview");
  const [data, setData] = useState<EnginePayload | null>(null);
  const [users, setUsers] = useState<UsersPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState(false);

  const loadEngine = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/engine", { cache: "no-store" });
      if (r.status === 403) { setLoadErr(true); return; }
      const j = await r.json();
      setData(j); setErr(null); setLoadErr(false);
    } catch { setLoadErr(true); }
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/users", { cache: "no-store" });
      if (r.ok) setUsers(await r.json());
    } catch { /* keep last */ }
  }, []);

  useEffect(() => {
    const t = setTimeout(loadEngine, 0);
    const iv = setInterval(loadEngine, 30_000);
    return () => { clearInterval(iv); clearTimeout(t); };
  }, [loadEngine]);
  useEffect(() => {
    if (tab !== "users") return;
    const t = setTimeout(loadUsers, 0);
    return () => clearTimeout(t);
  }, [tab, loadUsers]);

  if (loadErr && !data) {
    return <AdminForbidden reason="Admin session could not be verified (403 from the API). Sign in with an admin account." />;
  }

  const tabs = [
    { id: "overview" as const, label: "Overview", icon: Gauge },
    { id: "engine" as const, label: "Engine", icon: Cpu },
    { id: "users" as const, label: "Users", icon: UsersIcon },
    { id: "support" as const, label: "Support", icon: MessageCircle },
  ];

  return (
    <main className="mx-auto max-w-6xl px-5 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-5">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-7 w-7 text-emerald-400" />
          <div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-100">DeeYoung Control Room</h1>
            <p className="text-[11px] text-zinc-500">signed in as <span className="font-mono text-zinc-400">{adminEmail}</span> · separate admin side — user product at <a href="/" className="underline decoration-dotted text-zinc-400">/</a></p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { loadEngine(); if (tab === "users") loadUsers(); }}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-900">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
          <button onClick={async () => { await authClient.signOut(); router.refresh(); }}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-900">
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </div>
      </header>

      <nav className="mt-5 flex gap-1.5">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold transition ${tab === t.id ? "bg-emerald-500/15 text-emerald-300" : "text-zinc-400 hover:bg-zinc-900"}`}>
            <t.icon className="h-3.5 w-3.5" /> {t.label}
          </button>
        ))}
      </nav>

      {err && <p className="mt-4 rounded-lg border border-amber-900/60 bg-amber-950/30 px-4 py-2.5 text-xs text-amber-300">{err}</p>}

      {!data ? (
        <div className="mt-16 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-zinc-500" /></div>
      ) : tab === "overview" ? (
        <Overview data={data} />
      ) : tab === "engine" ? (
        <EngineTab data={data} />
      ) : tab === "support" ? (
        <SupportTab />
      ) : (
        <UsersTab users={users} onChanged={loadUsers} />
      )}

      <footer className="mt-10 border-t border-zinc-800 pt-4 text-[11px] text-zinc-600">
        {data ? <>build <span className="font-mono text-zinc-500">{data.snapshot.build.marker}</span>{data.snapshot.build.sha ? ` · commit ${String(data.snapshot.build.sha).slice(0, 7)}` : ""} · auto-refresh 30s · every number is a real ledger row</> : <><Skeleton className="h-3 w-64" /></>}
      </footer>
    </main>
  );
}

// ── Overview tab ──
function Overview({ data }: { data: EnginePayload }) {
  const s = data.snapshot;
  const e = s.engine;
  const a = s.account;
  const feedEntries = Object.entries(e.feedMap ?? {});
  const tdLive = feedEntries.filter(([, v]) => v.source === "twelvedata").length;

  return (
    <div className="mt-5 space-y-4">
      {e.control.paused && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-800/60 bg-amber-950/40 px-4 py-3 text-sm text-amber-300">
          <PauseCircle className="h-4 w-4 shrink-0" />
          <span><b>Engine PAUSED</b> — no new entries. Exits still managed. Reason: {e.control.reason ?? "—"} ({e.control.updatedBy ?? "admin"})</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Tile label="Win rate" value={a.winRatePct === null ? "—" : `${a.winRatePct}%`} />
        <Tile label="Closed trades" value={String(a.closedCount)} />
        <Tile label="Realized P&L" value={`${a.realizedPnlUsd >= 0 ? "+" : ""}${usd(a.realizedPnlUsd)}`} tone={okTone(a.realizedPnlUsd)} />
        <Tile label="Equity" value={usd(a.settledEquityUsd)} />
        <Tile label="Open" value={String(a.openCount)} />
        <Tile label="Max DD" value={`${a.maxDrawdownPct.toFixed(2)}%`} tone={a.maxDrawdownPct > 5 ? "text-amber-400" : undefined} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Data feed" icon={Database}>
          <Row k="Primary" v={e.dataVenue.primary} />
          <Row k="Twelve Data" v={e.dataVenue.twelvedata.configured ? `keyed · ${e.dataVenue.twelvedata.minuteUsed}/min · ${e.dataVenue.twelvedata.dayUsed}/day` : "key pending"} />
          <Row k="Session mix" v={`twelvedata ${e.feedCounters?.tdServed ?? 0} · binance ${e.feedCounters?.binanceServed ?? 0} (budget-skipped ${e.feedCounters?.tdSkippedBudget ?? 0})`} />
          {e.dataVenue.twelvedata.lastError && <Row k="TD last error" v={e.dataVenue.twelvedata.lastError} tone="text-rose-400" />}
          <div className="mt-3 flex flex-wrap gap-1.5 border-t border-zinc-800 pt-3">
            {feedEntries.length === 0 && <span className="text-xs text-zinc-500">no feed reads yet this session</span>}
            {feedEntries.map(([sym, v]) => (
              <span key={sym} title={v.degraded ? `degraded: ${v.degraded}` : v.source}
                className={`rounded-md border px-2 py-0.5 font-mono text-[10px] ${v.source === "twelvedata" ? "border-emerald-700/50 bg-emerald-950/30 text-emerald-300" : v.degraded ? "border-rose-800/60 bg-rose-950/30 text-rose-300" : "border-zinc-700 bg-zinc-900 text-zinc-400"}`}>
                {sym.replace("USD", "")}:{v.source === "twelvedata" ? "TD" : "BIN"}{v.degraded ? "!" : ""}
              </span>
            ))}
          </div>
          <p className="mt-2 text-[10.5px] leading-relaxed text-zinc-600">{tdLive}/{feedEntries.length} symbols last read from authenticated Twelve Data — free plan rotates a 7/min share across {feedEntries.length || 10} symbols; the rest ride the keyless Binance public feed.</p>
        </Panel>

        <Panel title="Execution venue" icon={Bot}>
          <Row k="Mode" v={s.venue.mode} />
          <Row k="Verdict" v={s.venue.verdict} />
          {s.venue.target && <Row k="Target" v={`${s.venue.target}${s.venue.simulator ? " · self-hosted simulator" : ""}`} />}
          <Row k="Mirror ledger" v={`open ${s.venue.mirror.open} · filled ${s.venue.mirror.filled} · failed ${s.venue.mirror.failed}`} />
          <Row k="Run" v={`${e.runLabel} · ${e.status} · ${e.elapsedHours}h`} />
          <Row k="Risk rails" v="$100 max notional · ≤3 open · −3R daily stop · 30bps slippage alert" />
        </Panel>
      </div>

      <Panel title="Per-book performance (closed trades)" icon={Activity}>
        {Object.keys(s.books).length === 0 ? (
          <p className="text-xs text-zinc-500">No closed trades yet — playbook gates refuse low-conviction entries by design.</p>
        ) : (
          <table className="w-full text-left font-mono text-xs">
            <thead className="text-[10px] uppercase tracking-wider text-zinc-500">
              <tr>{["Book", "Trades", "Win %", "Net $", "Net R"].map((h) => <th key={h} className="pb-1.5 pr-4 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/70">
              {Object.entries(s.books).map(([k, b]) => (
                <tr key={k}>
                  <td className="py-1.5 pr-4">{k}</td>
                  <td className="py-1.5 pr-4">{b.trades}</td>
                  <td className="py-1.5 pr-4">{b.winRatePct ?? "—"}%</td>
                  <td className={`py-1.5 pr-4 ${okTone(b.netUsd)}`}>{b.netUsd >= 0 ? "+" : ""}{b.netUsd.toFixed(2)}</td>
                  <td className={`py-1.5 pr-4 ${okTone(b.netR)}`}>{b.netR >= 0 ? "+" : ""}{b.netR.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}

// ── Engine tab (positions / closed / orders) ──
function EngineTab({ data }: { data: EnginePayload }) {
  const s = data.snapshot;
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const paused = s.engine.control.paused;

  const act = async (action: "PAUSE" | "RESUME") => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/admin/engine", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Action failed");
      setReason("");
      setTimeout(() => window.location.reload(), 600);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Try again");
    } finally { setBusy(false); }
  };

  return (
    <div className="mt-5 space-y-4">
      <Panel title="Engine control" icon={Gauge}>
        <p className="text-xs leading-relaxed text-zinc-500">
          Pause blocks <b className="text-zinc-300">new entries only</b> — open positions keep being managed to their stops, targets and time exits. The change takes effect on the runner&apos;s next cycle (≤ ~20s) and is audit-logged.
        </p>
        {err && <p className="mt-2 rounded-lg border border-rose-900/60 bg-rose-950/40 px-3 py-2 text-xs text-rose-300">{err}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="reason (required to pause)"
            className="min-w-[220px] flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500/60" />
          {paused ? (
            <button onClick={() => act("RESUME")} disabled={busy} className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-bold text-emerald-950 hover:brightness-110 disabled:opacity-50">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} Resume entries
            </button>
          ) : (
            <button onClick={() => act("PAUSE")} disabled={busy || reason.trim().length < 3} className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-xs font-bold text-amber-950 hover:brightness-110 disabled:opacity-40">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PauseCircle className="h-3.5 w-3.5" />} Pause entries
            </button>
          )}
        </div>
      </Panel>

      <Panel title={`Open positions (${s.openPositions.length})`} icon={Bot}>
        {s.openPositions.length === 0 ? <p className="text-xs text-zinc-500">None right now.</p> : (
          <table className="w-full text-left font-mono text-xs">
            <thead className="text-[10px] uppercase tracking-wider text-zinc-500"><tr>{["Book", "Symbol", "Qty", "Entry", "Stop", "Target", "Score", "Opened"].map((h) => <th key={h} className="pb-1.5 pr-4 font-medium">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-zinc-800/70">
              {s.openPositions.map((p) => (
                <tr key={p.bookKey}>
                  <td className="py-1.5 pr-4">{p.bookKey}</td><td className="py-1.5 pr-4">{p.symbol}</td>
                  <td className="py-1.5 pr-4">{p.qty.toFixed(4)}</td><td className="py-1.5 pr-4">{p.entryPrice.toFixed(2)}</td>
                  <td className="py-1.5 pr-4 text-rose-400">{p.stop.toFixed(2)}</td><td className="py-1.5 pr-4 text-emerald-400">{p.target.toFixed(2)}</td>
                  <td className="py-1.5 pr-4">{p.score}</td>
                  <td className="py-1.5 pr-4 text-zinc-500">{new Date(p.openedAt).toISOString().slice(5, 16).replace("T", " ")}Z</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <Panel title={`Recent closed trades (${s.recentClosed.length})`} icon={Activity}>
        {s.recentClosed.length === 0 ? <p className="text-xs text-zinc-500">No closed trades yet.</p> : (
          <div className="qe-scroll max-h-80 overflow-y-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-zinc-500"><tr>{["Book", "Symbol", "Entry", "Exit", "Reason", "Net $", "Net R", "Closed"].map((h) => <th key={h} className="pb-1.5 pr-4 font-medium">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-zinc-800/70">
                {s.recentClosed.map((p, i) => (
                  <tr key={p.bookKey + String(p.closedAt) + i}>
                    <td className="py-1.5 pr-4">{p.bookKey}</td><td className="py-1.5 pr-4">{p.symbol}</td>
                    <td className="py-1.5 pr-4">{p.entryPrice?.toFixed(2)}</td><td className="py-1.5 pr-4">{p.exitPrice?.toFixed(2)}</td>
                    <td className="py-1.5 pr-4 text-zinc-400">{p.exitReason}</td>
                    <td className={`py-1.5 pr-4 ${okTone(p.netPnlUsd ?? 0)}`}>{(p.netPnlUsd ?? 0) > 0 ? <WinMark /> : (p.netPnlUsd ?? 0) < 0 ? <FailMark /> : null}{(p.netPnlUsd ?? 0) >= 0 ? "+" : ""}{(p.netPnlUsd ?? 0).toFixed(2)}</td>
                    <td className={`py-1.5 pr-4 ${okTone(p.netR ?? 0)}`}>{(p.netR ?? 0) >= 0 ? "+" : ""}{(p.netR ?? 0).toFixed(2)}</td>
                    <td className="py-1.5 pr-4 text-zinc-500">{p.closedAt ? new Date(p.closedAt).toISOString().slice(5, 16).replace("T", " ") : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title={`Recent orders (${s.recentOrders.length})`} icon={Database}>
        {s.recentOrders.length === 0 ? <p className="text-xs text-zinc-500">No orders yet.</p> : (
          <div className="qe-scroll max-h-64 overflow-y-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-zinc-500"><tr>{["Created", "Symbol", "Side", "Kind", "Fill", "Status"].map((h) => <th key={h} className="pb-1.5 pr-4 font-medium">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-zinc-800/70">
                {s.recentOrders.map((o) => (
                  <tr key={o.clientOid}>
                    <td className="py-1.5 pr-4 text-zinc-500">{new Date(o.createdAt).toISOString().slice(5, 16).replace("T", " ")}Z</td>
                    <td className="py-1.5 pr-4">{o.symbol}</td><td className="py-1.5 pr-4">{o.side}</td><td className="py-1.5 pr-4">{o.kind}</td>
                    <td className="py-1.5 pr-4">{o.fillPrice?.toFixed(2) ?? "—"}</td>
                    <td className={`py-1.5 pr-4 ${o.status === "FILLED" ? "text-emerald-400" : o.status === "REJECTED" ? "text-rose-400" : "text-zinc-400"}`}>{o.status === "FILLED" ? <WinMark /> : o.status === "REJECTED" ? <FailMark /> : null}{o.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

// ── Users tab ──
function UsersTab({ users, onChanged }: { users: UsersPayload | null; onChanged: () => void }) {
  const [dialog, setDialog] = useState<{ userId: string; email: string; action: "WARN" | "SUSPEND" | "BAN" | "UNBAN" } | null>(null);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const act = async () => {
    if (!dialog) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/admin/users", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: dialog.userId, action: dialog.action, reason, message: msg }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message ?? j.error ?? "Action failed");
      setDialog(null); setReason(""); setMsg("");
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Try again");
    } finally { setBusy(false); }
  };

  const tone: Record<string, string> = {
    ACTIVE: "border-emerald-700/50 bg-emerald-950/30 text-emerald-300",
    WARNED: "border-amber-800/60 bg-amber-950/30 text-amber-300",
    SUSPENDED: "border-amber-800/60 bg-amber-950/40 text-amber-300",
    BANNED: "border-rose-800/60 bg-rose-950/30 text-rose-300",
  };

  return (
    <div className="mt-5 space-y-4">
      {users && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Tile label="Users" value={String(users.stats.total)} />
          <Tile label="Trial" value={String(users.stats.trial)} />
          <Tile label="Paid" value={String(users.stats.paid)} />
          <Tile label="Suspended" value={String(users.stats.suspended)} tone={users.stats.suspended ? "text-amber-400" : undefined} />
          <Tile label="Banned" value={String(users.stats.banned)} tone={users.stats.banned ? "text-rose-400" : undefined} />
        </div>
      )}
      <Panel title="User list & moderation" icon={UsersIcon}>
        {!users ? <SkeletonRows rows={4} /> : users.users.length === 0 ? (
          <p className="text-xs text-zinc-500">No users have signed up yet.</p>
        ) : (
          <div className="qe-scroll max-h-[54vh] overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-[#0d0f13] text-[10px] uppercase tracking-wider text-zinc-500">
                <tr>{["User", "Plan", "Status", "Signups/IP", "Joined", "Moderate"].map((h) => <th key={h} className="border-b border-zinc-800 px-2 py-2 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/70">
                {users.users.map((u) => (
                  <tr key={u.id}>
                    <td className="px-2 py-2"><p className="font-semibold text-zinc-200">{u.name ?? "—"}</p><p className="text-[10.5px] text-zinc-500">{u.email}{u.role === "ADMIN" ? " · ADMIN" : ""}{u.emailVerified ? "" : " · unverified"}</p></td>
                    <td className="px-2 py-2 text-[11px]">{u.plan}</td>
                    <td className="px-2 py-2"><span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold ${tone[u.status] ?? "border-zinc-700 text-zinc-300"}`}>{u.status}</span></td>
                    <td className={`px-2 py-2 font-mono text-[11px] ${u.signupCountFromIp >= 3 ? "font-bold text-rose-400" : "text-zinc-500"}`}>{u.signupCountFromIp}</td>
                    <td className="px-2 py-2 text-[11px] text-zinc-500">{new Date(u.createdAt).toISOString().slice(0, 10)}</td>
                    <td className="px-2 py-2">
                      {u.role === "ADMIN" ? <span className="text-[10px] text-zinc-600">—</span> : (
                        <div className="flex flex-wrap justify-end gap-1 sm:justify-start">
                          {u.status !== "BANNED" && u.status !== "SUSPENDED" && (
                            <>
                              <button onClick={() => setDialog({ userId: u.id, email: u.email, action: "WARN" })} className="rounded-md border border-zinc-700 px-2 py-1 text-[10px] font-semibold text-zinc-300 hover:bg-zinc-900">Warn</button>
                              <button onClick={() => setDialog({ userId: u.id, email: u.email, action: "SUSPEND" })} className="rounded-md border border-amber-800/60 px-2 py-1 text-[10px] font-semibold text-amber-300 hover:bg-amber-950/30">Suspend</button>
                            </>
                          )}
                          {u.status === "BANNED" ? (
                            <button onClick={() => setDialog({ userId: u.id, email: u.email, action: "UNBAN" })} className="rounded-md border border-emerald-800/60 px-2 py-1 text-[10px] font-semibold text-emerald-300 hover:bg-emerald-950/30">Unban</button>
                          ) : (
                            <button onClick={() => setDialog({ userId: u.id, email: u.email, action: "BAN" })} className="rounded-md border border-rose-800/60 px-2 py-1 text-[10px] font-semibold text-rose-300 hover:bg-rose-950/30">Ban</button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {dialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-zinc-100">{dialog.action === "UNBAN" ? "Restore access" : `Confirm ${dialog.action.toLowerCase()}`}</h3>
              <button onClick={() => setDialog(null)} aria-label="Close"><XCircle className="h-4 w-4 text-zinc-500" /></button>
            </div>
            <p className="mt-1.5 text-xs text-zinc-400">{dialog.email}{dialog.action === "BAN" ? " — permanent block, all sessions revoked" : dialog.action === "SUSPEND" ? " — read-only lock, sessions revoked" : dialog.action === "UNBAN" ? " — full access restored" : " — warning recorded + user notified"}</p>
            {dialog.action !== "UNBAN" && (
              <>
                <label htmlFor="md-reason" className="mt-4 block text-[10px] font-bold uppercase tracking-wider text-zinc-500">Reason (required, shown to user + audited)</label>
                <input id="md-reason" value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500/60" />
                <label htmlFor="md-msg" className="mt-3 block text-[10px] font-bold uppercase tracking-wider text-zinc-500">Message (optional)</label>
                <input id="md-msg" value={msg} onChange={(e) => setMsg(e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500/60" />
              </>
            )}
            {err && <p className="mt-3 rounded-lg border border-rose-900/60 bg-rose-950/40 px-3 py-2 text-xs text-rose-300">{err}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setDialog(null)} className="rounded-lg border border-zinc-700 px-3.5 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-800">Cancel</button>
              <button onClick={act} disabled={busy || (dialog.action !== "UNBAN" && reason.trim().length < 3)}
                className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold disabled:opacity-40 ${dialog.action === "BAN" ? "bg-rose-500 text-white" : "bg-emerald-500 text-emerald-950"}`}>
                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {dialog.action === "UNBAN" ? <Ban className="h-3.5 w-3.5" /> : null} Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── shared bits ──
function Tile({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">{label}</div>
      <div className={`mt-1 font-mono text-lg font-bold ${tone ?? "text-zinc-100"}`}>{value}</div>
    </div>
  );
}

function Panel({ title, icon: Icon, children }: { title: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <h2 className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-400">
        <Icon className="h-3.5 w-3.5 text-emerald-400" /> {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ k, v, tone }: { k: string; v: string; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-xs">
      <span className="shrink-0 text-zinc-500">{k}</span>
      <span className={`truncate text-right font-mono ${tone ?? "text-zinc-200"}`}>{v}</span>
    </div>
  );
}
