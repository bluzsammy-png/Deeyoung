// DEEYOUNG PRO — OWNER DAILY DIGEST (once per day, human-readable).
// The 15-minute telemetry loop speaks JSON for forensics; this module speaks
// HUMAN: once a day the engine pushes a plain-text performance summary to the
// same ntfy topic so the owner can watch the paper account converge (30+ trade
// sample) without logging into the site or reading JSON.
//
// Honest-data rule: every number is read from the same Prisma rows the engine
// itself writes (PaperEngineAccount / PaperEnginePosition) — no invented
// figures, ever. "Marked equity" is the engine's own most recent equity-curve
// point (written continuously by the runner's mark-to-market pass), not a
// freshly fetched price — it is labeled with its age so it can never be
// mistaken for live.
//
// Schedule: fires on the first 5-minute tick at or after DIGEST_HOUR_UTC
// (default 21 = 2pm Los Angeles) IF today's UTC-date digest has not been sent.
// The once-per-day marker lives in BrainMemory (scope "daily-digest"), so
// redeploys/reboots self-heal: a process that was down at the hour still sends
// that day's digest on its first boot after — never twice. A failed ntfy
// publish is NOT marked, so the next tick retries it.
//
// Env: DIGEST_HOUR_UTC overrides the hour (0-23); TELEMETRY_DISABLED=1 or
// DIGEST_DISABLED=1 suppresses; NTFY_TOPIC overrides the topic.

import { db } from "@/lib/db";
import { publishNtfy } from "@/lib/engine/telemetry";

const DIGEST_HOUR_UTC = (() => {
  const h = Number(process.env.DIGEST_HOUR_UTC);
  return Number.isFinite(h) && h >= 0 && h <= 23 ? Math.floor(h) : 21;
})();
const TICK_MS = 5 * 60_000;
const SCOPE = "daily-digest";
const MAX_BODY = 3_500; // same ntfy free-tier cap as telemetry

const money = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const signed = (n: number) => (n < 0 ? `-${money(Math.abs(n))}` : `+${money(n)}`);
const px = (n: number) => +n.toFixed(6) + "";

function utcDateKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

async function lastSentDateKey(): Promise<string | null> {
  try {
    const row = await db.brainMemory.findUnique({ where: { scope: SCOPE } });
    if (!row) return null;
    return (JSON.parse(row.stateJson) as { lastUtcDate?: string }).lastUtcDate ?? null;
  } catch {
    return null; // unreadable marker = treat as never sent (at-worst one repeat)
  }
}

async function markSent(dateKey: string): Promise<void> {
  try {
    const data = {
      stateJson: JSON.stringify({ lastUtcDate: dateKey, sentAt: new Date().toISOString() }),
      updatedAt: new Date(),
    };
    await db.brainMemory.upsert({ where: { scope: SCOPE }, update: data, create: { scope: SCOPE, ...data } });
  } catch {
    /* marker failure must never crash the loop — worst case a repeat tomorrow */
  }
}

export async function buildDigestBody(): Promise<string> {
  const { getOrCreateRun } = await import("@/lib/engine/paper");
  const { run, acct } = await getOrCreateRun();

  const since = new Date(Date.now() - 24 * 3_600_000);
  const since7d = new Date(Date.now() - 7 * 24 * 3_600_000);
  const [closed24, open, allClosed, closed7d] = await Promise.all([
    db.paperEnginePosition.findMany({
      where: { runId: run.id, status: "CLOSED", closedAt: { gte: since } },
      orderBy: { closedAt: "asc" },
    }),
    db.paperEnginePosition.findMany({ where: { runId: run.id, status: "OPEN" }, orderBy: { openedAt: "desc" } }),
    db.paperEnginePosition.findMany({
      where: { runId: run.id, status: "CLOSED" },
      select: { netPnlUsd: true },
      orderBy: { closedAt: "desc" },
    }),
    db.paperEnginePosition.findMany({
      where: { runId: run.id, status: "CLOSED", closedAt: { gte: since7d } },
      select: { netPnlUsd: true, netR: true },
    }),
  ]);

  let markedEquity: number | null = null;
  let curveAgeMin: number | null = null;
  let curveWorstDd: { pct: number; spanDays: number } | null = null;
  try {
    const curve = JSON.parse(acct.equityCurve) as Array<{ t: number; e: number }>;
    const last = curve[curve.length - 1];
    if (last) {
      markedEquity = last.e;
      curveAgeMin = Math.max(0, Math.round((Date.now() - last.t) / 60_000));
    }
    // worst peak-to-trough drawdown over whatever span the curve actually
    // covers (labeled honestly in the output — the curve is a rolling window)
    if (curve.length >= 10) {
      let peak = curve[0].e;
      let worst = 0;
      for (const pt of curve) {
        if (pt.e > peak) peak = pt.e;
        if (peak > 0) worst = Math.max(worst, ((peak - pt.e) / peak) * 100);
      }
      const spanDays = (curve[curve.length - 1].t - curve[0].t) / 86_400_000;
      curveWorstDd = { pct: worst, spanDays: +spanDays.toFixed(1) };
    }
  } catch { /* fresh account — settled cash still reported below */ }

  const wins24 = closed24.filter((p) => (p.netPnlUsd ?? 0) > 0).length;
  const losses24 = closed24.length - wins24;
  const net24 = closed24.reduce((a, p) => a + (p.netPnlUsd ?? 0), 0);
  const r24 = closed24.reduce((a, p) => a + (p.netR ?? 0), 0);
  const winsAll = allClosed.filter((p) => (p.netPnlUsd ?? 0) > 0).length;
  const wrAll = allClosed.length ? (winsAll / allClosed.length) * 100 : null;
  const net7d = closed7d.reduce((a, p) => a + (p.netPnlUsd ?? 0), 0);
  const wins7d = closed7d.filter((p) => (p.netPnlUsd ?? 0) > 0).length;
  const worstR7d = closed7d.length ? Math.min(...closed7d.map((p) => p.netR ?? 0)) : null;

  // current streak from the most recent close backwards
  let streak = "none";
  if (allClosed.length) {
    const firstWin = (allClosed[0].netPnlUsd ?? 0) > 0;
    let n = 0;
    for (const p of allClosed) {
      if (((p.netPnlUsd ?? 0) > 0) !== firstWin) break;
      n++;
    }
    streak = `${n}${firstWin ? "W" : "L"}`;
  }

  const L: string[] = [];
  L.push(`Equity ${money(markedEquity ?? acct.cashUsd)}${markedEquity !== null ? ` (marked, ${curveAgeMin}m old)` : " (settled cash)"}`);
  L.push(`Settled cash ${money(acct.cashUsd)} | start ${money(acct.startingUsd)} | realized ${signed(acct.realizedPnl)}`);
  L.push(`Fees to date ${money(acct.feesUsd)} | max DD ${acct.maxDdPct.toFixed(2)}% | day ${acct.dayPnlR >= 0 ? "+" : ""}${acct.dayPnlR.toFixed(2)}R`);
  L.push("");
  if (closed24.length) {
    L.push(`Last 24h: ${closed24.length} closed, ${wins24}W/${losses24}L, net ${signed(net24)} (${r24 >= 0 ? "+" : ""}${r24.toFixed(2)}R)`);
    for (const p of closed24) {
      L.push(`  ${signed(p.netPnlUsd ?? 0)} ${p.symbol} ${p.exitReason ?? "?"} (${(p.netR ?? 0) >= 0 ? "+" : ""}${(p.netR ?? 0).toFixed(2)}R)`);
    }
  } else {
    L.push("Last 24h: no trades closed (desk flat or positions still running)");
  }
  L.push("");
  if (closed7d.length) {
    const worstTxt = worstR7d !== null && worstR7d < 0 ? ` | worst trade ${worstR7d.toFixed(2)}R` : "";
    L.push(`Last 7d: ${closed7d.length} closed, ${wins7d}W/${closed7d.length - wins7d}L, net ${signed(net7d)}${worstTxt}`);
  } else {
    L.push("Last 7d: no closed trades yet");
  }
  if (curveWorstDd && curveWorstDd.spanDays >= 0.5) {
    L.push(`Worst drawdown ${curveWorstDd.pct.toFixed(2)}% over the ${curveWorstDd.spanDays}d marked-equity window`);
  }
  L.push("");
  L.push(`Overall: ${allClosed.length} closed${wrAll !== null ? `, ${wrAll.toFixed(1)}% win rate` : ""} | streak ${streak} | open ${open.length}`);
  for (const p of open.slice(0, 5)) {
    L.push(`  OPEN ${p.symbol} ${p.side} entry ${px(p.entryPrice)} stop ${px(p.stopPrice)} tgt ${px(p.targetPrice)} (${money(p.notionalUsd)})`);
  }
  return L.join("\n").slice(0, MAX_BODY);
}

async function tick(): Promise<void> {
  try {
    const now = new Date();
    const dateKey = utcDateKey(now);
    if (now.getUTCHours() < DIGEST_HOUR_UTC) return;
    if ((await lastSentDateKey()) === dateKey) return;
    const body = await buildDigestBody();
    const ok = await publishNtfy(`QuantEdge daily ${dateKey}`, body);
    if (ok) await markSent(dateKey);
  } catch (e) {
    console.log(`[daily-digest] tick failed: ${String(e).slice(0, 160)}`);
  }
}

export function startDailyDigestLoop(): void {
  if (process.env.DIGEST_DISABLED === "1") {
    console.log("[daily-digest] disabled by env");
    return;
  }
  const g = globalThis as unknown as { __deedailydigest?: boolean };
  if (g.__deedailydigest) return;
  g.__deedailydigest = true;

  const t = setTimeout(() => {
    void tick();
    const iv = setInterval(() => void tick(), TICK_MS);
    if (typeof iv.unref === "function") iv.unref();
  }, 45_000);
  if (typeof t.unref === "function") t.unref();

  console.log(`[daily-digest] armed (fires daily at ${DIGEST_HOUR_UTC}:00 UTC or first boot after, then every ${TICK_MS / 60_000}m check)`);
}
