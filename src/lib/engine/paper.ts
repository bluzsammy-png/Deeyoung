// DEEYOUNG PRO — OWN PAPER TRADING ENGINE (execution-of-record).
// 2026-09-04: user directive — stop depending on third-party broker signups;
// own the execution stack. Every fill derives from a REAL observed market
// price at a REAL timestamp (no invented numbers, no fake trades), fees and
// slippage are charged on both sides, and every order/position is persisted
// to Postgres so the run is auditable from /api/engine/status at any time.
//
// Fill model (conservative, matches the validated 22bps-RT cost baseline):
//   entry fill  = refPrice × (1 + 2bps)   adverse slippage
//   exit fill   = refPrice × (1 − 2bps)   for STOP / TIME market exits
//   TARGET exit = exact target price       (resting-limit semantics, no slip)
//   fee         = 10bps of traded notional, per side (taker)
//
// Accounting: cashUsd = settled equity = startingUsd + Σ realized netPnl.
// totalEquity = cashUsd + Σ_open [ qty×(mark − entry) − exit-fee reserve ].

import { db } from "@/lib/db";

export const RUN_LABEL = process.env.ENGINE_RUN_LABEL || "primary";
export const SLIPPAGE_BPS = 2;
export const FEE_BPS_PER_SIDE = 10;
const EQUITY_POINTS_CAP = 2880; // 15s spacing ≈ 12h of curve

const bps = (x: number) => x / 10_000;

export interface EntryInput {
  bookKey: string; // "65_10_BTCUSD" — one OPEN position per key
  symbol: string;
  gate: number;
  horizonMin: number;
  refPrice: number; // observed market price NOW
  stop: number;
  target: number;
  atrPct: number;
  score: number;
  rr: number;
  notionalUsd: number;
  factors: Array<{ key?: string; name?: string; contribution: number }>;
  clientOid?: string; // override for tests
  runLabel?: string;  // engine functions are run-scoped; tests thread their own label
}

export interface EntryResult {
  status: "FILLED" | "REJECTED" | "DUPLICATE";
  fillPrice?: number;
  qty?: number;
  feeUsd?: number;
  positionId?: string;
  reason?: string;
}

export interface ExitInput {
  positionId: string;
  exitRefPrice: number; // observed market price NOW
  reason: "STOP" | "TARGET" | "TIME_10M" | "TIME_30M";
  clientOid?: string;
  runLabel?: string;
}

export interface ExitResult {
  status: "FILLED" | "REJECTED" | "ALREADY_CLOSED";
  exitPrice?: number;
  netPnlUsd?: number;
  netR?: number;
  reason?: string;
}

function dayKeyOf(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}

/** Get-or-create the run + account. Idempotent per label. */
export async function getOrCreateRun(label: string = RUN_LABEL) {
  const run = await db.engineRun.upsert({
    where: { label },
    create: { label, status: "ACTIVE" },
    update: { status: "ACTIVE", updatedAt: new Date() },
  });
  const acct = await db.paperEngineAccount.upsert({
    where: { runId: run.id },
    create: { runId: run.id },
    update: {},
  });
  return { run, acct };
}

/**
 * Submit + fill a market ENTRY. Rejected when the book already holds an open
 * position (playbook concurrency is enforced by the caller; this is the
 * per-book invariant). Idempotent via clientOid — replays return DUPLICATE.
 */
export async function paperEntry(input: EntryInput): Promise<EntryResult> {
  if (!(input.refPrice > 0) || !(input.notionalUsd > 0)) {
    return { status: "REJECTED", reason: "BAD_INPUT" };
  }
  if (input.stop >= input.refPrice || input.target <= input.refPrice) {
    return { status: "REJECTED", reason: "BAD_LEVELS" };
  }

  const open = await db.paperEnginePosition.findFirst({
    where: { bookKey: input.bookKey, status: "OPEN" },
  });
  if (open) return { status: "DUPLICATE", reason: "BOOK_ALREADY_OPEN", positionId: open.id };

  const clientOid = input.clientOid ?? `E_${input.bookKey}_${Math.floor(Date.now() / 60_000)}`;
  const dup = await db.paperEngineOrder.findUnique({ where: { clientOid } });
  if (dup) return { status: "DUPLICATE", reason: "OID_EXISTS", positionId: dup.positionId ?? undefined };

  const fillPrice = input.refPrice * (1 + bps(SLIPPAGE_BPS));
  const qty = input.notionalUsd / fillPrice;
  const feeUsd = qty * fillPrice * bps(FEE_BPS_PER_SIDE);

  const { run } = await getOrCreateRun(input.runLabel ?? RUN_LABEL);

  const pos = await db.paperEnginePosition.create({
    data: {
      runId: run.id,
      bookKey: input.bookKey,
      symbol: input.symbol,
      gate: input.gate,
      horizonMin: input.horizonMin,
      side: "LONG",
      qty,
      entryPrice: fillPrice,
      stopPrice: input.stop,
      targetPrice: input.target,
      atrPct: input.atrPct,
      score: input.score,
      rr: input.rr,
      notionalUsd: input.notionalUsd,
      factors: JSON.stringify(input.factors),
      status: "OPEN",
    },
  });

  await db.paperEngineOrder.create({
    data: {
      runId: run.id,
      clientOid,
      bookKey: input.bookKey,
      symbol: input.symbol,
      side: "BUY",
      kind: "ENTRY",
      refPrice: input.refPrice,
      fillPrice,
      slippageBps: SLIPPAGE_BPS,
      feeUsd,
      qty,
      notionalUsd: input.notionalUsd,
      status: "FILLED",
      positionId: pos.id,
      filledAt: new Date(),
    },
  });

  return { status: "FILLED", fillPrice, qty, feeUsd, positionId: pos.id };
}

/**
 * Close an OPEN position. The conditional updateMany on status=OPEN is the
 * concurrency lock: only the first caller wins; losers get ALREADY_CLOSED.
 */
export async function paperExit(input: ExitInput): Promise<ExitResult> {
  const { run, acct } = await getOrCreateRun(input.runLabel ?? RUN_LABEL);
  const pos = await db.paperEnginePosition.findUnique({ where: { id: input.positionId } });
  if (!pos || pos.runId !== run.id) return { status: "REJECTED", reason: "NO_SUCH_POSITION" };
  if (pos.status !== "OPEN") return { status: "ALREADY_CLOSED" };

  const isTarget = input.reason === "TARGET";
  const exitFill = isTarget
    ? pos.targetPrice
    : input.exitRefPrice * (1 - bps(SLIPPAGE_BPS));
  if (!(exitFill > 0)) return { status: "REJECTED", reason: "BAD_PRICE" };

  const grossPnl = pos.qty * (exitFill - pos.entryPrice);
  const feeEntry = pos.qty * pos.entryPrice * bps(FEE_BPS_PER_SIDE);
  const feeExit = pos.qty * exitFill * bps(FEE_BPS_PER_SIDE);
  const netPnl = grossPnl - feeEntry - feeExit;
  const entryNotional = pos.qty * pos.entryPrice;
  const netPct = (netPnl / entryNotional) * 100;
  const stopDistPct = ((pos.entryPrice - pos.stopPrice) / pos.entryPrice) * 100 || 1e-9;
  const netR = netPct / stopDistPct;

  const now = new Date();
  const clientOid = input.clientOid ?? `X_${pos.id}_${input.reason}_${Math.floor(now.getTime() / 60_000)}`;

  const claim = await db.paperEnginePosition.updateMany({
    where: { id: pos.id, status: "OPEN" },
    data: {
      status: "CLOSED",
      closedAt: now,
      exitPrice: exitFill,
      exitReason: input.reason,
      grossPnlUsd: grossPnl,
      netPnlUsd: netPnl,
      netR,
    },
  });
  if (claim.count === 0) return { status: "ALREADY_CLOSED" };

  await db.paperEngineOrder.create({
    data: {
      runId: run.id,
      clientOid,
      bookKey: pos.bookKey,
      symbol: pos.symbol,
      side: "SELL",
      kind: `EXIT_${input.reason}`,
      refPrice: input.exitRefPrice,
      fillPrice: exitFill,
      slippageBps: isTarget ? 0 : SLIPPAGE_BPS,
      feeUsd: feeExit,
      qty: pos.qty,
      notionalUsd: pos.qty * exitFill,
      status: "FILLED",
      positionId: pos.id,
      filledAt: now,
    },
  });

  // settled equity & day bookkeeping
  const cashUsd = acct.cashUsd + netPnl;
  const dKey = dayKeyOf(now.getTime());
  const dayPnlR = acct.dayKey === dKey ? acct.dayPnlR + netR : netR;
  await db.paperEngineAccount.update({
    where: { runId: run.id },
    data: { cashUsd, realizedPnl: acct.realizedPnl + netPnl, feesUsd: acct.feesUsd + feeEntry + feeExit, dayKey: dKey, dayPnlR, updatedAt: now },
  });

  return { status: "FILLED", exitPrice: exitFill, netPnlUsd: netPnl, netR };
}

/** Mark-to-market equity snapshot + drawdown tracking. Call after each poll. */
export async function paperMarkToMarket(
  marks: Record<string, number>, // symbol → observed price
  label: string = RUN_LABEL,
): Promise<{ equity: number; openCount: number }> {
  const { run, acct } = await getOrCreateRun(label);
  const open = await db.paperEnginePosition.findMany({ where: { runId: run.id, status: "OPEN" } });
  let unrealized = 0;
  for (const p of open) {
    const mark = marks[p.symbol];
    if (!mark) continue;
    const exitReserve = p.qty * mark * bps(FEE_BPS_PER_SIDE);
    unrealized += p.qty * (mark - p.entryPrice) - exitReserve;
  }
  const equity = acct.cashUsd + unrealized;
  const peak = Math.max(acct.peakEquity, equity);
  const ddPct = peak > 0 ? ((peak - equity) / peak) * 100 : 0;

  let curve: Array<{ t: number; e: number }> = [];
  try { curve = JSON.parse(acct.equityCurve) as Array<{ t: number; e: number }>; } catch { /* reset curve */ }
  curve.push({ t: Date.now(), e: +equity.toFixed(2) });
  if (curve.length > EQUITY_POINTS_CAP) curve = curve.slice(-EQUITY_POINTS_CAP);

  await db.paperEngineAccount.update({
    where: { runId: run.id },
    data: {
      peakEquity: peak,
      maxDdPct: Math.max(acct.maxDdPct, ddPct),
      equityCurve: JSON.stringify(curve),
      updatedAt: new Date(),
    },
  });
  return { equity, openCount: open.length };
}

/** Total equity right now without writing a curve point. */
export async function paperEquityNow(marks: Record<string, number> = {}, label: string = RUN_LABEL): Promise<number> {
  const { run, acct } = await getOrCreateRun(label);
  const open = await db.paperEnginePosition.findMany({
    where: { runId: run.id, status: "OPEN" },
  });
  let unrealized = 0;
  for (const p of open) {
    const mark = marks[p.symbol];
    if (!mark) continue;
    unrealized += p.qty * (mark - p.entryPrice) - p.qty * mark * bps(FEE_BPS_PER_SIDE);
  }
  return acct.cashUsd + unrealized;
}

/** Cooldown guard data for a bookKey: last close time + whether it lost. */
export async function paperLastClose(bookKey: string, label: string = RUN_LABEL) {
  const { run } = await getOrCreateRun(label);
  const last = await db.paperEnginePosition.findFirst({
    where: { runId: run.id, bookKey, status: "CLOSED" },
    orderBy: { closedAt: "desc" },
  });
  return last ? { closedAtMs: last.closedAt?.getTime() ?? 0, netPnlUsd: last.netPnlUsd ?? 0 } : null;
}

export async function paperTodayNetR(gate: number, horizonMin: number, label: string = RUN_LABEL): Promise<number> {
  const { run } = await getOrCreateRun(label);
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const rows = await db.paperEnginePosition.findMany({
    where: { runId: run.id, gate, horizonMin, status: "CLOSED", closedAt: { gte: dayStart } },
    select: { netR: true },
  });
  return rows.reduce((a, b) => a + (b.netR ?? 0), 0);
}

export async function paperLastLossAtMs(label: string = RUN_LABEL): Promise<number | null> {
  const { run } = await getOrCreateRun(label);
  const last = await db.paperEnginePosition.findFirst({
    where: { runId: run.id, status: "CLOSED", netPnlUsd: { lt: 0 } },
    orderBy: { closedAt: "desc" },
  });
  return last?.closedAt?.getTime() ?? null;
}

export async function paperClosedCount(gate?: number, label: string = RUN_LABEL): Promise<number> {
  const { run } = await getOrCreateRun(label);
  return db.paperEnginePosition.count({
    where: { runId: run.id, status: "CLOSED", ...(gate !== undefined ? { gate } : {}) },
  });
}

export async function paperOpenCount(label: string = RUN_LABEL): Promise<number> {
  const { run } = await getOrCreateRun(label);
  return db.paperEnginePosition.count({ where: { runId: run.id, status: "OPEN" } });
}
