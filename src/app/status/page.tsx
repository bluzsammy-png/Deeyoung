// DEEYOUNG PRO — public /status page: one glanceable, no-auth surface for the
// autonomous paper engine. Same data as /api/engine/status (shared snapshot
// builder). Aggregates only — no secrets, no keys, no account detail beyond
// the engine's own paper ledger. Every number is real or the page says so.
// Auto-refreshes every 15s via meta refresh (works with zero client JS).

import { buildEngineSnapshot } from "@/lib/engine/status-snapshot";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "DeeYoung Pro: Paper Engine Status",
  description: "Live audit surface of the autonomous paper trading engine",
  other: { refresh: "15" },
};

function usd(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Server-rendered SVG sparkline of the equity curve (no client JS). */
function Sparkline({ points }: { points: Array<{ t: number; e: number }> }) {
  if (points.length < 2) return null;
  const W = 560, H = 56, PAD = 2;
  const es = points.map((p) => p.e);
  const min = Math.min(...es), max = Math.max(...es);
  const span = max - min || 1;
  const step = (W - PAD * 2) / (points.length - 1);
  const path = points.map((p, i) => `${(PAD + i * step).toFixed(1)},${(H - PAD - ((p.e - min) / span) * (H - PAD * 2)).toFixed(1)}`).join(" ");
  const up = es[es.length - 1] >= es[0];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-14 w-full" preserveAspectRatio="none" role="img" aria-label="Equity sparkline">
      <polyline points={path} fill="none" stroke={up ? "#34d399" : "#fb7185"} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" | "warn" }) {
  const color = tone === "good" ? "text-emerald-400" : tone === "bad" ? "text-rose-400" : tone === "warn" ? "text-amber-400" : "text-zinc-100";
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className={`mt-1 font-mono text-lg font-semibold ${color}`}>{value}</div>
    </div>
  );
}

export default async function StatusPage() {
  let snap: Awaited<ReturnType<typeof buildEngineSnapshot>> | null = null;
  let err: string | null = null;
  try {
    snap = await buildEngineSnapshot();
  } catch (e) {
    err = String(e).slice(0, 300);
  }

  if (!snap) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16 font-sans text-zinc-200">
        <h1 className="text-2xl font-bold">Paper Engine: Status</h1>
        <div className="mt-6 rounded-lg border border-amber-800/60 bg-amber-950/30 px-5 py-4 text-sm text-amber-300">
          Engine state unreachable right now (database warming or migration in progress). This page never fabricates
          data, refresh in a minute. Raw detail: <code className="text-amber-200">/api/engine/status</code>
        </div>
        {err ? <pre className="mt-4 overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950 p-4 text-xs text-zinc-500">{err}</pre> : null}
      </main>
    );
  }

  const { engine, account } = snap;
  const pnlTone = account.realizedPnlUsd > 0 ? "good" : account.realizedPnlUsd < 0 ? "bad" : undefined;
  const td = engine.dataVenue.twelvedata;
  const venue = snap.venue as { mode: string; verdict: string; mirror: { open: number; filled: number; failed: number } };

  return (
    <main className="mx-auto max-w-5xl px-6 py-12 font-sans text-zinc-200">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Paper Engine: Status</h1>
        <div className="flex items-center gap-2 text-xs">
          <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
          <span className="font-mono uppercase text-emerald-400">{engine.status}</span>
          <span className="text-zinc-500">· run &ldquo;{engine.runLabel}&rdquo; · {engine.elapsedHours}h elapsed</span>
        </div>
      </div>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-500">{engine.executionModel}. Every fill below is a real
        row written from a real observed market price. Nothing on this page is simulated or invented.</p>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Settled equity" value={usd(account.settledEquityUsd)} />
        <Stat label="Realized P&L" value={`${account.realizedPnlUsd >= 0 ? "+" : ""}${usd(account.realizedPnlUsd)}`} tone={pnlTone} />
        <Stat label="Fees paid" value={usd(account.feesUsd)} />
        <Stat label="Max drawdown" value={`${account.maxDrawdownPct.toFixed(2)}%`} tone={account.maxDrawdownPct > 5 ? "warn" : undefined} />
        <Stat label="Open / closed" value={`${account.openCount} / ${account.closedCount}`} />
        <Stat label="Win rate" value={account.winRatePct === null ? "n/a" : `${account.winRatePct}%`} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-sm">
          <span className="text-zinc-500">Data feed: </span>
          <span className="font-mono text-zinc-100">{engine.dataVenue.primary}</span>
          <span className="text-zinc-500">
            {td.configured
              ? ` · Twelve Data keyed (${td.minuteUsed}/min, ${td.dayUsed}/day)`
              : " · Twelve Data key pending. Adapter lights up the moment a key is set"}
          </span>
          {td.lastError ? <span className="ml-1 font-mono text-rose-400">{td.lastError}</span> : null}
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-sm">
          <span className="text-zinc-500">Execution venue: </span>
          <span className="font-mono text-zinc-100">{venue.mode}</span>
          <span className="text-zinc-500"> · {venue.verdict} · mirror open {venue.mirror.open} / filled {venue.mirror.filled} / failed {venue.mirror.failed}</span>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3">
        <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-zinc-500">
          <span>Equity curve (last {snap.equityCurve.length} marks)</span>
          <span className="normal-case text-zinc-600">auto-refresh 15s</span>
        </div>
        <Sparkline points={snap.equityCurve} />
      </div>

      <h2 className="mt-10 text-sm font-semibold uppercase tracking-wider text-zinc-400">Open positions</h2>
      {snap.openPositions.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-500">None right now. The engine only enters on gate-65/70 signals that pass every playbook guard.</p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-lg border border-zinc-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-900 text-[11px] uppercase tracking-wider text-zinc-500">
              <tr>{["Book", "Symbol", "Qty", "Entry", "Stop", "Target", "Score", "Opened"].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/70 font-mono">
              {snap.openPositions.map((p) => (
                <tr key={p.bookKey}>
                  <td className="px-3 py-2">{p.bookKey}</td>
                  <td className="px-3 py-2">{p.symbol}</td>
                  <td className="px-3 py-2">{p.qty.toFixed(4)}</td>
                  <td className="px-3 py-2">{p.entryPrice.toFixed(2)}</td>
                  <td className="px-3 py-2 text-rose-400">{p.stop.toFixed(2)}</td>
                  <td className="px-3 py-2 text-emerald-400">{p.target.toFixed(2)}</td>
                  <td className="px-3 py-2">{p.score}</td>
                  <td className="px-3 py-2 text-zinc-500">{new Date(p.openedAt).toISOString().slice(11, 16)}Z</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="mt-10 text-sm font-semibold uppercase tracking-wider text-zinc-400">Recent closed trades</h2>
      {snap.recentClosed.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-500">No closed trades in this run yet.</p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-lg border border-zinc-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-900 text-[11px] uppercase tracking-wider text-zinc-500">
              <tr>{["Book", "Symbol", "Entry", "Exit", "Reason", "Net $", "Net R", "Closed"].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/70 font-mono">
              {snap.recentClosed.map((p) => (
                <tr key={p.bookKey + String(p.closedAt)}>
                  <td className="px-3 py-2">{p.bookKey}</td>
                  <td className="px-3 py-2">{p.symbol}</td>
                  <td className="px-3 py-2">{p.entryPrice?.toFixed(2)}</td>
                  <td className="px-3 py-2">{p.exitPrice?.toFixed(2)}</td>
                  <td className="px-3 py-2 text-zinc-400">{p.exitReason}</td>
                  <td className={`px-3 py-2 ${(p.netPnlUsd ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{(p.netPnlUsd ?? 0) >= 0 ? "+" : ""}{(p.netPnlUsd ?? 0).toFixed(2)}</td>
                  <td className={`px-3 py-2 ${(p.netR ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{(p.netR ?? 0) >= 0 ? "+" : ""}{(p.netR ?? 0).toFixed(2)}</td>
                  <td className="px-3 py-2 text-zinc-500">{p.closedAt ? new Date(p.closedAt).toISOString().slice(5, 16).replace("T", " ") : "-"}Z</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-10 border-t border-zinc-800 pt-4 text-xs text-zinc-600">
        Raw JSON: <a className="text-zinc-400 underline decoration-dotted hover:text-zinc-200" href="/api/engine/status">/api/engine/status</a>
        {" · "}Venue diagnostics: <a className="text-zinc-400 underline decoration-dotted hover:text-zinc-200" href="/api/brokers/metaapi-diag">/api/brokers/metaapi-diag</a>
        <div className="mt-2 font-mono">
          build {snap.build.marker}{snap.build.sha ? ` · commit ${String(snap.build.sha).slice(0, 7)}` : " · commit unknown"}
        </div>
      </div>
    </main>
  );
}
