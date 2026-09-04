// DEEYOUNG PRO — EXECUTION VENUE LAYER (2026-09-04 "go" build).
// Architecture per user approval: the OWN paper engine stays the
// execution-of-record (ledger, P&L, brain, playbook). This layer MIRRORS
// every paper fill to a real venue (OKX demo first, live later) and enforces
// the user-approved hard risk rails on the real-money side:
//   • LIVE_MAX_NOTIONAL_USD (default 100) — per-trade notional cap
//   • LIVE_MAX_OPEN         (default 3)   — max concurrently open mirror BUYs
//   • LIVE_DAILY_R_STOP     (default −3R) — day loss stop → no NEW real exposure
//     (in-flight paper-managed positions close via their normal stop/target/
//      time exits, which mirror real SELLs — keeps paper↔venue 1:1, no desync)
//   • slippage guard 30bps on entry fills → alert on the mirror row
// SELL sizing uses the BUY's REAL venue fill size (spot buy fees are charged
// in base ccy — selling the paper qty would bounce). Mirror failures NEVER
// touch the paper ledger. Every order row is persisted BEFORE submission.

import { db } from "@/lib/db";
import {
  okxCreds, okxMarketOrder, okxOrderInfo, okxAccountSummary, okxSimMode, okxTargetLabel,
  engineSymbolToInstId, toClOrdId,
} from "@/lib/brokers/okx";

export type VenueMode = "paper" | "okx-demo" | "okx-live";

export function venueMode(): VenueMode {
  const v = (process.env.EXECUTION_VENUE || "paper").trim().toLowerCase();
  return v === "okx-demo" || v === "okx-live" ? (v as VenueMode) : "paper";
}

const MAX_NOTIONAL = () => {
  const n = Number(process.env.LIVE_MAX_NOTIONAL_USD);
  return Number.isFinite(n) && n > 0 ? n : 100;
};
const MAX_OPEN = () => {
  const n = Number(process.env.LIVE_MAX_OPEN);
  return Number.isFinite(n) && n > 0 ? n : 3;
};
const DAILY_R_STOP = () => {
  const n = Number(process.env.LIVE_DAILY_R_STOP);
  return Number.isFinite(n) ? n : -3;
};
const SLIP_ALERT_BPS = 30;

/** Normalize venue (OKX) states → this layer's enums. OKX reports lowercase
 *  live / partially_filled / filled / canceled; the DB queries here use
 *  FILLED / LIVE / SUBMITTED / FAILED. Without this, exit matching and the
 *  open-position rail silently see zero rows (sim audit catch #2). */
function normState(s: string | undefined): string {
  switch ((s || "live").toLowerCase()) {
    case "filled": return "FILLED";
    case "live":
    case "partially_filled": return "LIVE";
    case "canceled": return "FAILED";
    default: return "SUBMITTED";
  }
}

export interface MirrorEntryInput {
  engineOid: string; // same oid as the paper order row (E_…)
  symbol: string; // engine symbol BTCUSD
  refPrice: number; // observed market price at paper fill
  notionalUsd: number;
  openMirrorCount: number; // currently open mirrored positions (before this one)
  todayNetR: number; // paper ledger day R (same trade set)
}

export interface MirrorExitInput {
  engineOid: string; // same oid as the paper exit order row (X_…)
  symbol: string;
  refPrice: number;
  reason: "STOP" | "TARGET" | "TIME_10M" | "TIME_30M";
}

function venueTag(): string {
  if (okxSimMode()) return "okx-sim";
  return venueMode() === "okx-live" ? "okx-live" : "okx-demo";
}

async function recordBase(row: {
  clientOid: string; clOrdId: string; symbol: string; side: "BUY" | "SELL";
  kind: string; refPrice: number; sz?: number; exitFor?: string;
}) {
  try {
    await db.venueMirrorOrder.create({
      data: {
        clientOid: row.clientOid,
        clOrdId: row.clOrdId,
        venue: venueTag(),
        instId: engineSymbolToInstId(row.symbol),
        symbol: row.symbol,
        side: row.side,
        kind: row.kind,
        refPrice: row.refPrice,
        ...(row.sz !== undefined ? { sz: row.sz } : {}),
        ...(row.exitFor !== undefined ? { exitFor: row.exitFor } : {}),
      },
    });
    return true;
  } catch {
    return false; // unique-clientOid replay → already mirrored
  }
}

/** Fire the real ENTRY mirror for a paper fill. Never throws. */
export async function mirrorOnEntry(input: MirrorEntryInput): Promise<void> {
  if (venueMode() === "paper" || !okxCreds()) return;
  try {
    const clOrdId = await toClOrdId(input.engineOid);

    // ── hard risk rails on the real-money side ───────────────────────────
    if (input.openMirrorCount >= MAX_OPEN()) {
      console.log(`[venue] entry ${input.engineOid} NOT MIRRORED: max open ${MAX_OPEN()} reached — paper fill stands unmirrored`);
      return;
    }
    if (input.todayNetR <= DAILY_R_STOP()) {
      console.log(`[venue] entry ${input.engineOid} NOT MIRRORED: daily R stop (${input.todayNetR.toFixed(2)}R ≤ ${DAILY_R_STOP()}R) — paper fill stands unmirrored`);
      return;
    }
    const notional = Math.min(input.notionalUsd, MAX_NOTIONAL());
    if (input.notionalUsd > MAX_NOTIONAL()) {
      console.log(`[venue] entry ${input.engineOid} notional capped ${input.notionalUsd}→${notional} (LIVE_MAX_NOTIONAL_USD=${MAX_NOTIONAL()})`);
    }

    if (!(await recordBase({
      clientOid: input.engineOid, clOrdId, symbol: input.symbol,
      side: "BUY", kind: "ENTRY", refPrice: input.refPrice, sz: notional,
    }))) return; // replay

    const res = await okxMarketOrder({
      instId: engineSymbolToInstId(input.symbol),
      side: "buy", clOrdId, szUsdt: notional,
    });
    if (!res.ok) {
      await db.venueMirrorOrder.updateMany({
        where: { clientOid: input.engineOid },
        data: { state: "FAILED", raw: res.error?.slice(0, 200) },
      });
      console.log(`[venue] ENTRY MIRROR FAILED ${input.engineOid}: ${res.error} — paper ledger unaffected`);
      return;
    }
    // market orders fill ~instantly; one poll after a short beat
    await new Promise((r) => setTimeout(r, 400));
    const info = await okxOrderInfo(engineSymbolToInstId(input.symbol), clOrdId);
    const slipBps = info.avgPx && input.refPrice > 0
      ? ((info.avgPx / input.refPrice - 1) * 10_000) : undefined;
    const alert = slipBps !== undefined && slipBps > SLIP_ALERT_BPS
      ? `SLIPPAGE_${slipBps.toFixed(0)}bps` : null;
    await db.venueMirrorOrder.updateMany({
      where: { clientOid: input.engineOid },
      data: {
        state: normState(info.state),
        venueOrdId: res.venueOrdId,
        ...(info.avgPx !== undefined ? { fillPx: info.avgPx } : {}),
        ...(info.accFillSz !== undefined ? { fillSz: info.accFillSz } : {}),
        ...(slipBps !== undefined ? { slipBps: +slipBps.toFixed(1) } : {}),
        ...(alert ? { alert } : {}),
      },
    });
    console.log(`[venue] ENTRY MIRROR ${input.engineOid} ${venueTag()} BUY ${engineSymbolToInstId(input.symbol)} ~$${notional} state=${normState(info.state)} avgPx=${info.avgPx ?? "?"}${alert ? ` ALERT=${alert}` : ""}`);
  } catch (e) {
    console.log(`[venue] mirror entry error ${input.engineOid}: ${String(e).slice(0, 120)} — paper ledger unaffected`);
  }
}

/** Fire the real EXIT mirror for a paper close. Never throws. */
export async function mirrorOnExit(input: MirrorExitInput): Promise<void> {
  if (venueMode() === "paper" || !okxCreds()) return;
  try {
    const clOrdId = await toClOrdId(input.engineOid);

    // the venue-side position to close: oldest FILLED BUY of this symbol
    // that no SELL row has claimed yet. Real fill size or nothing — never
    // invent a qty.
    const soldOids = new Set(
      (await db.venueMirrorOrder.findMany({
        where: { side: "SELL", exitFor: { not: null } },
        select: { exitFor: true },
      })).map((s) => s.exitFor as string),
    );
    const buys = await db.venueMirrorOrder.findMany({
      where: { symbol: input.symbol, side: "BUY", state: { in: ["FILLED", "LIVE", "SUBMITTED"] } },
      orderBy: { createdAt: "asc" },
    });
    const target = buys.find((b) => !soldOids.has(b.clientOid));
    if (!target) {
      console.log(`[venue] exit ${input.engineOid}: no mirrored BUY open for ${input.symbol} — nothing to sell (paper-only close)`);
      return;
    }
    if (target.state !== "FILLED" || !target.fillSz || !(target.fillSz > 0)) {
      // buy not confirmed filled yet → record the SELL intent; reconcile
      // places it the moment the BUY reports FILLED.
      if (await recordBase({
        clientOid: input.engineOid, clOrdId, symbol: input.symbol, side: "SELL",
        kind: `EXIT_${input.reason}`, refPrice: input.refPrice, exitFor: target.clientOid,
      })) {
        console.log(`[venue] EXIT INTENT ${input.engineOid} queued — BUY ${target.clientOid} not FILLED yet (${target.state})`);
      }
      return;
    }

    if (!(await recordBase({
      clientOid: input.engineOid, clOrdId, symbol: input.symbol, side: "SELL",
      kind: `EXIT_${input.reason}`, refPrice: input.refPrice, sz: target.fillSz,
      exitFor: target.clientOid,
    }))) return; // replay

    const res = await okxMarketOrder({
      instId: engineSymbolToInstId(input.symbol),
      side: "sell", clOrdId, szBase: target.fillSz,
    });
    if (!res.ok) {
      await db.venueMirrorOrder.updateMany({
        where: { clientOid: input.engineOid },
        data: { state: "FAILED", raw: res.error?.slice(0, 200) },
      });
      console.log(`[venue] EXIT MIRROR FAILED ${input.engineOid}: ${res.error} — paper ledger unaffected`);
      return;
    }
    await new Promise((r) => setTimeout(r, 400));
    const info = await okxOrderInfo(engineSymbolToInstId(input.symbol), clOrdId);
    await db.venueMirrorOrder.updateMany({
      where: { clientOid: input.engineOid },
      data: {
        state: normState(info.state),
        venueOrdId: res.venueOrdId,
        ...(info.avgPx !== undefined ? { fillPx: info.avgPx } : {}),
        ...(info.accFillSz !== undefined ? { fillSz: info.accFillSz } : {}),
      },
    });
    console.log(`[venue] EXIT MIRROR ${input.engineOid} ${venueTag()} SELL ${engineSymbolToInstId(input.symbol)} qty=${target.fillSz.toFixed(6)} reason=${input.reason} state=${normState(info.state)} avgPx=${info.avgPx ?? "?"}`);
  } catch (e) {
    console.log(`[venue] mirror exit error ${input.engineOid}: ${String(e).slice(0, 120)} — paper ledger unaffected`);
  }
}

/**
 * Per-cycle venue maintenance: (1) reconcile in-flight rows, (2) place any
 * queued SELL intents whose BUY has since filled, (3) surface alerts.
 * Never throws; no-op in paper mode.
 */
export async function mirrorCycle(): Promise<void> {
  if (venueMode() === "paper" || !okxCreds()) return;
  try {
    // 1) reconcile in-flight rows
    const inflight = await db.venueMirrorOrder.findMany({
      where: { state: { in: ["SUBMITTED", "LIVE"] }, side: "BUY" },
      take: 20,
    });
    for (const row of inflight) {
      const info = await okxOrderInfo(row.instId, row.clOrdId);
      if (info.ok && info.state && normState(info.state) !== row.state) {
        await db.venueMirrorOrder.update({
          where: { id: row.id },
          data: {
            state: normState(info.state),
            ...(info.avgPx !== undefined ? { fillPx: info.avgPx } : {}),
            ...(info.accFillSz !== undefined ? { fillSz: info.accFillSz } : {}),
          },
        });
        console.log(`[venue] reconcile ${row.clientOid} → ${info.state}`);
      }
    }

    // 2) queued SELL intents whose BUY is now FILLED
    const intents = await db.venueMirrorOrder.findMany({
      where: { side: "SELL", state: "SUBMITTED", exitFor: { not: null } },
      take: 20,
    });
    for (const s of intents) {
      const buy = await db.venueMirrorOrder.findUnique({ where: { clientOid: s.exitFor as string } });
      if (!buy || buy.state !== "FILLED" || !buy.fillSz || !(buy.fillSz > 0)) continue;
      const res = await okxMarketOrder({
        instId: s.instId, side: "sell", clOrdId: s.clOrdId, szBase: buy.fillSz,
      });
      if (res.ok) {
        await new Promise((r) => setTimeout(r, 400));
        const info = await okxOrderInfo(s.instId, s.clOrdId);
        await db.venueMirrorOrder.update({
          where: { id: s.id },
          data: {
            state: normState(info.state),
            venueOrdId: res.venueOrdId,
            sz: buy.fillSz,
            ...(info.avgPx !== undefined ? { fillPx: info.avgPx } : {}),
          },
        });
        console.log(`[venue] queued EXIT placed ${s.clientOid} qty=${buy.fillSz.toFixed(6)} state=${normState(info.state)}`);
      } else {
        await db.venueMirrorOrder.update({
          where: { id: s.id },
          data: { state: "FAILED", raw: res.error?.slice(0, 200) },
        });
        console.log(`[venue] queued EXIT FAILED ${s.clientOid}: ${res.error}`);
      }
    }

    // 3) alerts surfacing (once per cycle, cheap read)
    const alertRows = await db.venueMirrorOrder.count({ where: { alert: { not: null } } });
    if (alertRows > 0) console.log(`[venue] ${alertRows} mirror row(s) carry alerts (slippage etc.) — see /status`);
  } catch (e) {
    console.log(`[venue] cycle error: ${String(e).slice(0, 120)}`);
  }
}

/** Open mirrored position count = FILLED/LIVE/SUBMITTED BUYs minus claimed SELLs. */
export async function openMirrorCount(): Promise<number> {
  const [buys, sells] = await Promise.all([
    db.venueMirrorOrder.count({ where: { side: "BUY", state: { in: ["FILLED", "LIVE", "SUBMITTED"] } } }),
    db.venueMirrorOrder.count({ where: { side: "SELL", state: { in: ["FILLED", "LIVE", "SUBMITTED"] } } }),
  ]);
  return Math.max(0, buys - sells);
}

/** Venue block for the status snapshot + diag. Aggregates only, never throws. */
export async function venueStatus(): Promise<Record<string, unknown>> {
  try {
    const mode = venueMode();
    const hasKeys = !!okxCreds();
    const [open, filled, failed] = await Promise.all([
      openMirrorCount(),
      db.venueMirrorOrder.count({ where: { state: "FILLED" } }),
      db.venueMirrorOrder.count({ where: { state: "FAILED" } }),
    ]);
    const acct = mode === "paper" || !hasKeys ? null : await okxAccountSummary();
    const sim = okxSimMode();
    return {
      mode,
      keys: hasKeys ? "present" : "none",
      env: mode === "paper" ? null : (okxCreds()?.demo ? (sim ? "sim (self-hosted)" : "demo") : "live"),
      verdict: mode === "paper" ? "PAPER_PRIMARY" : (acct?.verdict ?? "PENDING_KEYS"),
      ...(mode !== "paper" ? { target: okxTargetLabel(), simulator: sim } : {}),
      riskRails: {
        maxNotionalUsd: MAX_NOTIONAL(),
        maxOpen: MAX_OPEN(),
        dailyRStop: DAILY_R_STOP(),
        slippageAlertBps: SLIP_ALERT_BPS,
      },
      mirror: { open, filled, failed },
      ...(acct?.detail ? { detail: acct.detail } : {}),
    };
  } catch (e) {
    return { mode: venueMode(), verdict: "ERROR", detail: String(e).slice(0, 120) };
  }
}
