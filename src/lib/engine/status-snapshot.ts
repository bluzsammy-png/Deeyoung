// DEEYOUNG PRO — engine status snapshot builder (shared by /api/engine/status
// and the public /status page). Reads ONLY real rows written by real fills at
// real market prices — "no lies" rule applies to every number here.

import { db } from "@/lib/db";
import { getOrCreateRun } from "@/lib/engine/paper";
import { feedSource } from "@/lib/engine/feed";
import { twelvedataStatus } from "@/lib/market/twelvedata";
import { venueStatus } from "@/lib/engine/venue";

export function bookStats(rows: Array<{ gate: number; horizonMin: number; netPnlUsd: number | null; netR: number | null; grossPnlUsd: number | null }>) {
  const books: Record<string, { n: number; wins: number; netSum: number; rSum: number }> = {};
  for (const r of rows) {
    const k = `${r.gate}_${r.horizonMin}`;
    const b = books[k] ?? (books[k] = { n: 0, wins: 0, netSum: 0, rSum: 0 });
    b.n++;
    if ((r.netPnlUsd ?? 0) > 0) b.wins++;
    b.netSum += r.netPnlUsd ?? 0;
    b.rSum += r.netR ?? 0;
  }
  return Object.fromEntries(Object.entries(books).map(([k, b]) => [k, {
    trades: b.n,
    winRatePct: b.n ? +((b.wins / b.n) * 100).toFixed(1) : null,
    netUsd: +b.netSum.toFixed(2),
    netR: +b.rSum.toFixed(2),
  }]));
}

export async function buildEngineSnapshot() {
  const { run, acct } = await getOrCreateRun();

  const [open, closed, orders] = await Promise.all([
    db.paperEnginePosition.findMany({ where: { runId: run.id, status: "OPEN" }, orderBy: { openedAt: "desc" } }),
    db.paperEnginePosition.findMany({ where: { runId: run.id, status: "CLOSED" }, orderBy: { closedAt: "desc" }, take: 30 }),
    db.paperEngineOrder.findMany({ where: { runId: run.id }, orderBy: { createdAt: "desc" }, take: 25 }),
  ]);
  const closedAll = await db.paperEnginePosition.findMany({
    where: { runId: run.id, status: "CLOSED" },
    select: { gate: true, horizonMin: true, netPnlUsd: true, netR: true, grossPnlUsd: true },
  });

  let curve: Array<{ t: number; e: number }> = [];
  try { curve = JSON.parse(acct.equityCurve) as Array<{ t: number; e: number }>; } catch { /* fresh */ }

  const wins = closedAll.filter((r) => (r.netPnlUsd ?? 0) > 0).length;
  const t0 = run.startedAt.getTime();

  return {
    engine: {
      runLabel: run.label,
      runId: run.id,
      status: run.status,
      startedAt: run.startedAt,
      elapsedHours: +((Date.now() - t0) / 3_600_000).toFixed(2),
      executionModel: "own paper engine — fills at observed market price, 2bps slippage/side + 10bps taker fee/side",
      dataVenue: { primary: feedSource(), twelvedata: twelvedataStatus() },
    },
    account: {
      startingUsd: acct.startingUsd,
      settledEquityUsd: +acct.cashUsd.toFixed(2),
      realizedPnlUsd: +acct.realizedPnl.toFixed(2),
      feesUsd: +acct.feesUsd.toFixed(2),
      peakEquityUsd: +acct.peakEquity.toFixed(2),
      maxDrawdownPct: +acct.maxDdPct.toFixed(2),
      dayKey: acct.dayKey,
      dayPnlR: +acct.dayPnlR.toFixed(2),
      openCount: open.length,
      closedCount: closedAll.length,
      winRatePct: closedAll.length ? +((wins / closedAll.length) * 100).toFixed(1) : null,
    },
    openPositions: open.map((p) => ({
      bookKey: p.bookKey, symbol: p.symbol, gate: p.gate, horizonMin: p.horizonMin,
      qty: p.qty, entryPrice: p.entryPrice, stop: p.stopPrice, target: p.targetPrice,
      score: p.score, rr: p.rr, notionalUsd: p.notionalUsd, openedAt: p.openedAt,
    })),
    recentClosed: closed.map((p) => ({
      bookKey: p.bookKey, symbol: p.symbol, gate: p.gate, horizonMin: p.horizonMin,
      entryPrice: p.entryPrice, exitPrice: p.exitPrice, exitReason: p.exitReason,
      grossPnlUsd: p.grossPnlUsd, netPnlUsd: p.netPnlUsd, netR: p.netR,
      openedAt: p.openedAt, closedAt: p.closedAt,
    })),
    recentOrders: orders.map((o) => ({
      clientOid: o.clientOid, bookKey: o.bookKey, symbol: o.symbol, side: o.side,
      kind: o.kind, refPrice: o.refPrice, fillPrice: o.fillPrice, slippageBps: o.slippageBps,
      feeUsd: o.feeUsd, qty: o.qty, status: o.status, createdAt: o.createdAt,
    })),
    books: bookStats(closedAll),
    equityCurve: curve.slice(-96),
    brainScope: "global",
    venue: await venueStatus(),
  };
}
