// DEEYOUNG PRO — Control Room analytics (ADMIN only).
// GET /api/admin/analytics — two honest layers:
//   1. PLATFORM DB (always): real rows from this database. Users by plan,
//      signups, verified USDT payments, AI usage.
//   2. POSTHOG (env-gated): when POSTHOG_API_KEY is configured, top events
//      and the pageview trend are pulled live from the PostHog API. When it
//      is absent the response says exactly that, with the activation steps.

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

interface PosthogPayload {
  configured: boolean;
  note?: string;
  topEvents?: Array<{ event: string; count: number }>;
  pageviews?: Array<{ date: string; count: number }>;
  distinctUsersApprox?: number;
}

async function fetchPosthog(): Promise<PosthogPayload> {
  const key = process.env.POSTHOG_API_KEY;
  if (!key) {
    return {
      configured: false,
      note: "PostHog is not connected yet. Add POSTHOG_API_KEY (a PostHog personal API key) in Railway to activate this panel. Client events already capture pageviews, signups, checkouts, payments, analyst queries and broker connections.",
    };
  }
  const host = (process.env.POSTHOG_HOST || "https://us.i.posthog.com").replace(/\/$/, "");
  const headers = { Authorization: `Bearer ${key}` };
  const after = new Date(Date.now() - 7 * 86_400_000).toISOString();

  try {
    // Recent events window: top event names + approximate distinct users.
    const evRes = await fetch(`${host}/api/projects/@current/events/?limit=500&after=${after}`, {
      headers, signal: AbortSignal.timeout(10_000),
    });
    if (evRes.status === 401 || evRes.status === 403) {
      return { configured: false, note: "PostHog rejected the configured key (401/403). Generate a fresh personal API key in PostHog settings and update POSTHOG_API_KEY in Railway." };
    }
    const evJson: any = await evRes.json().catch(() => null);
    const events: Array<{ event: string; distinct_id: string }> = Array.isArray(evJson?.results) ? evJson.results : [];
    const counts = new Map<string, number>();
    const users = new Set<string>();
    for (const e of events) {
      counts.set(e.event, (counts.get(e.event) ?? 0) + 1);
      users.add(e.distinct_id);
    }
    const topEvents = [...counts.entries()]
      .map(([event, count]) => ({ event, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);

    // Pageview daily trend (7 days).
    let pageviews: Array<{ date: string; count: number }> = [];
    const trendUrl = `${host}/api/projects/@current/insights/trend/?events=${encodeURIComponent(JSON.stringify([{ id: "$pageview", type: "events" }]))}&interval=day&date_from=-7d`;
    const trRes = await fetch(trendUrl, { headers, signal: AbortSignal.timeout(10_000) });
    if (trRes.ok) {
      const trJson: any = await trRes.json().catch(() => null);
      const series = Array.isArray(trJson?.result) ? trJson.result[0] : null;
      if (series && Array.isArray(series.days) && Array.isArray(series.data)) {
        pageviews = series.days.map((d: string, i: number) => ({ date: String(d).slice(0, 10), count: Number(series.data[i] ?? 0) }));
      }
    }
    return { configured: true, topEvents, pageviews, distinctUsersApprox: users.size };
  } catch (e) {
    return { configured: false, note: `PostHog API unreachable right now: ${String(e).slice(0, 120)}` };
  }
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "FORBIDDEN", message: "Admin access required." }, { status: 403 });

  const since7d = new Date(Date.now() - 7 * 86_400_000);

  const [usersByPlan, usersTotal, banned, suspended, signups7d, paidOrders, orderStatuses, aiCalls7d] = await Promise.all([
    db.user.groupBy({ by: ["plan"], _count: { plan: true } }).catch(() => [] as Array<{ plan: string; _count: { plan: number } }>),
    db.user.count().catch(() => 0),
    db.user.count({ where: { status: "BANNED" } }).catch(() => 0),
    db.user.count({ where: { status: "SUSPENDED" } }).catch(() => 0),
    db.user.count({ where: { createdAt: { gte: since7d } } }).catch(() => 0),
    db.billingOrder.findMany({ where: { status: "PAID" }, select: { amount: true, currency: true, tier: true, paidAt: true } }).catch(() => []),
    db.billingOrder.groupBy({ by: ["status"], _count: { status: true } }).catch(() => [] as Array<{ status: string; _count: { status: number } }>),
    db.usageEvent.count({ where: { createdAt: { gte: since7d } } }).catch(() => 0),
  ]);

  const usdPaid = paidOrders
    .filter((o) => o.currency === "USD")
    .reduce((a, o) => a + (o.amount ?? 0), 0);

  return NextResponse.json({
    ok: true,
    db: {
      usersTotal,
      usersByPlan: usersByPlan.map((p) => ({ plan: p.plan, count: p._count.plan })),
      banned, suspended, signups7d,
      paidOrders: paidOrders.length,
      paidOrdersUsd: +usdPaid.toFixed(2),
      ordersByStatus: orderStatuses.map((s) => ({ status: s.status, count: s._count.status })),
      aiCalls7d,
    },
    posthog: await fetchPosthog(),
    asOf: Date.now(),
  });
}
