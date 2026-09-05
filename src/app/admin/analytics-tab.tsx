"use client";

// DEEYOUNG PRO — admin Analytics tab: how people actually use the app.
// Layer 1: the platform database (always real, always present).
// Layer 2: PostHog product analytics (live when POSTHOG_API_KEY is set).
// Nothing here is invented: absent data shows as absent, with the fix.

import { useCallback, useEffect, useState } from "react";
import { BarChart3, RefreshCw } from "lucide-react";

function SkeletonRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2" role="status" aria-label="loading">
      {Array.from({ length: rows }).map((_, i) => (
        <span key={i} className={`inline-block h-4 animate-pulse rounded bg-zinc-800 ${i % 2 ? "w-4/5" : "w-full"}`} />
      ))}
    </div>
  );
}

interface AnalyticsPayload {
  ok?: boolean;
  db: {
    usersTotal: number;
    usersByPlan: Array<{ plan: string; count: number }>;
    banned: number;
    suspended: number;
    signups7d: number;
    paidOrders: number;
    paidOrdersUsd: number;
    ordersByStatus: Array<{ status: string; count: number }>;
    aiCalls7d: number;
  };
  posthog: {
    configured: boolean;
    note?: string;
    topEvents?: Array<{ event: string; count: number }>;
    pageviews?: Array<{ date: string; count: number }>;
    distinctUsersApprox?: number;
  };
  asOf?: number;
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">{label}</div>
      <div className="mt-1 font-mono text-xl font-bold text-zinc-100">{value}</div>
      {sub ? <div className="mt-0.5 text-[11px] text-zinc-500">{sub}</div> : null}
    </div>
  );
}

export function AnalyticsTab() {
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/analytics", { cache: "no-store" });
      if (r.status === 403) { setFailed(true); return; }
      const j = await r.json();
      setData(j);
      setFailed(false);
    } catch { setFailed(true); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (failed) {
    return <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">Analytics needs admin access. Sign in with an ADMIN account and reopen this tab.</p>;
  }
  if (!data) {
    return <div className="space-y-3 text-sm text-zinc-400"><SkeletonRows rows={4} /></div>;
  }

  const ph = data.posthog;
  const maxPv = ph.pageviews?.length ? Math.max(...ph.pageviews.map((p) => p.count), 1) : 1;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-bold text-zinc-200">
          <BarChart3 className="h-4 w-4 text-emerald-400" /> How people use DeeYoung Pro
        </p>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-zinc-900 disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {/* layer 1: the platform database */}
      <section className="space-y-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-500">Platform database · source of truth</p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Total users" value={data.db.usersTotal} sub={`${data.db.signups7d} joined in 7 days`} />
          <Stat label="Paid accounts" value={data.db.usersByPlan.filter((p) => ["STARTER", "PRO", "ELITE"].includes(p.plan)).reduce((a, p) => a + p.count, 0)}
            sub={data.db.usersByPlan.map((p) => `${p.plan} ${p.count}`).join(" · ") || "no rows yet"} />
          <Stat label="Verified payments" value={data.db.paidOrders} sub={`$${data.db.paidOrdersUsd.toLocaleString("en-US")} USD collected`} />
          <Stat label="AI desk calls (7d)" value={data.db.aiCalls7d} sub={`${data.db.banned} banned · ${data.db.suspended} suspended`} />
        </div>
        {data.db.ordersByStatus.length ? (
          <p className="text-[11px] text-zinc-500">
            Orders by status: {data.db.ordersByStatus.map((s) => `${s.status} ${s.count}`).join(" · ")}
          </p>
        ) : null}
      </section>

      {/* layer 2: PostHog */}
      <section className="space-y-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-500">PostHog product analytics</p>
        {!ph.configured ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.07] p-4 text-[13px] leading-relaxed text-amber-200">
            <p className="font-bold">Not connected yet.</p>
            <p className="mt-1 text-amber-200/85">{ph.note}</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="Events (7d window)" value={ph.topEvents?.reduce((a, e) => a + e.count, 0) ?? 0} sub={`sample of latest 500`} />
              <Stat label="Distinct users seen" value={ph.distinctUsersApprox ?? 0} sub="unique ids in window" />
              <Stat label="Pageviews (7d)" value={ph.pageviews?.reduce((a, p) => a + p.count, 0) ?? 0} sub="from PostHog trend API" />
              <Stat label="Top event" value={ph.topEvents?.[0]?.event ?? "-"} sub={ph.topEvents?.[0] ? `${ph.topEvents[0].count} in window` : undefined} />
            </div>

            {ph.pageviews?.length ? (
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-500">Pageviews · last 7 days</p>
                <div className="mt-3 flex h-24 items-end gap-1.5">
                  {ph.pageviews.map((p) => (
                    <div key={p.date} className="group relative flex-1">
                      <div className="w-full rounded-t bg-emerald-500/70" style={{ height: `${Math.max(3, (p.count / maxPv) * 96)}px` }} />
                      <span className="pointer-events-none absolute -top-6 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-200 group-hover:block">
                        {p.date}: {p.count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {ph.topEvents?.length ? (
              <div className="overflow-hidden rounded-xl border border-zinc-800">
                <table className="w-full text-left text-[12px]">
                  <thead className="bg-zinc-900/80 text-[10px] uppercase tracking-wider text-zinc-500">
                    <tr><th className="px-4 py-2">Event</th><th className="px-4 py-2 text-right">Count (7d window)</th></tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/70 text-zinc-300">
                    {ph.topEvents.map((e) => (
                      <tr key={e.event}>
                        <td className="px-4 py-2 font-mono">{e.event}</td>
                        <td className="px-4 py-2 text-right font-mono">{e.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </>
        )}
      </section>

      <p className="text-[11px] leading-relaxed text-zinc-600">
        Captured events: $pageview, signup_completed, login_completed, checkout_opened, payment_verified, analyst_query, broker_connected. Analytics never blocks the product: a missing key disables capture silently.
      </p>
    </div>
  );
}
