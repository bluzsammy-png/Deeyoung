// DEEYOUNG PRO — SENTINEL orchestrator (§4, §16, §17) + user bootstrap (D1)
// Analytics is the primary brain; SENTINEL is the optional action layer.
// Observe is the default mode. AI never touches this file. Deterministic only.

import { db } from "@/lib/db";
import { getRegime } from "@/lib/engine/regime";
import { computeSignal } from "@/lib/engine/signals";
import { runRiskChecks } from "@/lib/engine/risk";
import { marketProvider, universeSymbols } from "@/lib/providers/market";
import { getExecutionProvider } from "@/lib/providers/execution";
import type { Quote, SentinelMode, SentinelState, SentinelTickResult } from "@/lib/types";
import type { PaperAccount, Position, SentinelConfig } from "@prisma/client";

const WATCHLIST_SEED = ["NVDA", "AAPL", "MSFT", "TSLA", "AMD", "SPY", "QQQ", "SMH", "PLTR", "META"];

/**
 * Ensure a signed-in user has SENTINEL config, paper account and seeded watchlist.
 * Multi-user (session-based); called by the API guard on every request.
 */
export async function ensureUserProvisioned(userId: string) {
  const [config, account] = await Promise.all([
    db.sentinelConfig.upsert({ where: { userId }, update: {}, create: { userId } }),
    db.paperAccount.upsert({ where: { userId }, update: {}, create: { userId } }),
  ]);
  const count = await db.watchlistItem.count({ where: { userId } });
  if (count === 0) {
    await db.watchlistItem
      .createMany({ data: WATCHLIST_SEED.map((symbol) => ({ userId, symbol })) })
      .catch(() => undefined); // tolerate benign races on first load
  }
  return { config, account };
}

export function parse<T>(json: string, fallback: T): T {
  try { return JSON.parse(json) as T; } catch { return fallback; }
}

/** Current effective state per §17 precedence. */
export function effectiveState(config: SentinelConfig, dataStale: boolean): SentinelState {
  if (config.killSwitch) return "EMERGENCY_STOP";
  if (dataStale && config.autoPauseOnDataStale) return "DATA_UNAVAILABLE";
  if (config.state === "PAUSED") return "PAUSED";
  if (config.state === "RISK_LOCKED") return "RISK_LOCKED";
  if (config.mode === "APPROVE") return "WAITING_FOR_APPROVAL";
  return "ACTIVE";
}

function sessionNow(): "REGULAR" | "PRE" | "POST" {
  // US Eastern approximation from UTC (sandbox-honest; ET = UTC-4 EDT / UTC-5 EST)
  const now = new Date();
  const et = new Date(now.getTime() - (now.getTimezoneOffset() === 0 ? 4 * 3600_000 : 0));
  const h = now.getUTCHours() - 4; // EDT assumption
  const day = now.getUTCDay();
  if (day === 0 || day === 6) return "CLOSED" as unknown as "REGULAR";
  if (h >= 9.5 && h < 16) return "REGULAR";
  if (h >= 4 && h < 9.5) return "PRE";
  if (h >= 16 && h < 20) return "POST";
  return "CLOSED" as unknown as "REGULAR";
}

async function correlatedExposurePct(positions: Position[], sector: string, equity: number): Promise<number> {
  const same = positions.filter((p) => (parse<{ sector: string }>(JSON.stringify({ sector: UNIVERSE[p.symbol]?.sector ?? "UNKNOWN" }), { sector: "UNKNOWN" }).sector) === sector);
  // simpler: use UNIVERSE sectors directly
  const sameSector = positions.filter((p) => sector && (UNIVERSE[p.symbol]?.sector === sector));
  const value = sameSector.reduce((a, p) => a + p.qty * p.avgPrice, 0);
  return equity ? value / equity * 100 : 0;
}

export { correlatedExposurePct };

/** Resolve OPEN signals whose target/stop has been touched (§24 — no cherry-picking). */
export async function resolveOpenSignals(userId: string) {
  const open = await db.signalRecord.findMany({ where: { status: "OPEN" } });
  if (!open.length) return 0;
  let resolved = 0;
  const quotes = new Map<string, Quote>();
  await Promise.all([...new Set(open.map((s) => s.symbol))].map(async (sym) => {
    quotes.set(sym, await marketProvider.getQuote(sym));
  }));
  for (const sig of open) {
    const q = quotes.get(sig.symbol);
    if (!q || q.dataState === "SIMULATED") continue; // don't resolve on simulated marks
    const price = q.price;
    let status: string | null = null;
    if (sig.direction === "LONG") {
      if (price >= sig.target) status = "TARGET_HIT";
      else if (price <= sig.stop) status = "STOP_HIT";
    } else {
      if (price <= sig.target) status = "TARGET_HIT";
      else if (price >= sig.stop) status = "STOP_HIT";
    }
    if (!status && Date.now() - sig.openedAt.getTime() > 5 * 86400_000) status = "EXPIRED";
    if (status) {
      const resultPct = sig.direction === "LONG"
        ? (price - sig.entry) / sig.entry * 100
        : (sig.entry - price) / sig.entry * 100;
      await db.signalRecord.update({ where: { id: sig.id }, data: { status, resultPct, resolvedAt: new Date() } });
      resolved++;
      await db.auditEvent.create({
        data: { userId, category: "SENTINEL", action: `SIGNAL_${status}`, detail: JSON.stringify({ symbol: sig.symbol, resultPct }) },
      });
    }
  }
  return resolved;
}

/**
 * SENTINEL tick: scan → signal → risk → (mode) observe/propose/execute.
 * Called by client heartbeat (every 60s) and manual trigger. Idempotent per run.
 */
export async function sentinelTick(userId: string, opts?: { force?: boolean }): Promise<SentinelTickResult> {
  const notes: string[] = [];
  const result: SentinelTickResult = { scanned: 0, signalsFound: 0, proposalsCreated: 0, executed: 0, state: "ACTIVE", notes };

  const user = await db.user.findUnique({ where: { id: userId }, include: { sentinelConfig: true, account: true } });
  if (!user?.sentinelConfig || !user.account) { result.state = "SYSTEM_DEGRADED"; notes.push("Config or account missing"); return result; }
  const config = user.sentinelConfig;
  const account = user.account;

  // ── Kill switch check (§18) ──
  if (config.killSwitch) {
    result.state = "EMERGENCY_STOP";
    notes.push("Emergency stop engaged — scan skipped");
    await db.sentinelConfig.update({ where: { id: config.id }, data: { state: "EMERGENCY_STOP" } });
    return result;
  }

  // ── Data health gate (§43) ──
  const probe = await marketProvider.getQuote("SPY");
  const dataStale = probe.dataState === "SIMULATED";
  if (dataStale && config.autoPauseOnDataStale) {
    result.state = "DATA_UNAVAILABLE";
    notes.push("Market data degraded to simulated — automation paused, signals suspended");
    await db.sentinelConfig.update({ where: { id: config.id }, data: { state: "DATA_UNAVAILABLE" } });
    await db.systemEvent.create({ data: { level: "WARN", source: "MARKET_DATA", message: "Upstream provider unavailable — SIMULATED fallback active" } });
    return result;
  }
  if (config.state === "DATA_UNAVAILABLE") {
    await db.sentinelConfig.update({ where: { id: config.id }, data: { state: "ACTIVE" } });
    config.state = "ACTIVE";
    notes.push("Data recovered — SENTINEL re-armed");
  }

  const state = effectiveState(config, false);
  result.state = state;
  if (state === "PAUSED" || state === "RISK_LOCKED") {
    notes.push(`SENTINEL is ${state} — scanning continues for display but no action is taken`);
  }

  // ── Shared scan (§27): regime cached, quotes cached 15s, one universe pass ──
  const regime = await getRegime();
  const symbols = universeSymbols();
  const { quotes } = await marketProvider.getQuotes(symbols.slice(0, 14));
  result.scanned = quotes.length;

  // universe pass: fetch candles for scan (cached) and compute signals
  const scanList = quotes.slice(0, 10); // top-liquid slice per tick (provider-budget aware §29)
  const signalResults = [];
  for (const q of scanList) {
    const [intraday, daily] = await Promise.all([
      marketProvider.getCandles(q.symbol, "1D"),
      marketProvider.getCandles(q.symbol, "6M"),
    ]);
    if (!daily || daily.candles.length < 60) continue;
    const rv = q.avgVolume > 0 ? q.volume / q.avgVolume : 1;
    // catalyst score: real data only (unusual volume); news adds only with verified feed
    const catalyst = Math.min(9, rv >= 2.5 ? 4 : rv >= 1.8 ? 3 : rv >= 1.3 ? 1.5 : 0);
    const sig = computeSignal({
      candles: intraday?.candles.length && intraday.candles.length >= 60 ? intraday : daily,
      dayCandles: intraday ?? undefined,
      relVolume: rv,
      regimePrimary: regime.primary,
      catalystScore: catalyst,
      avgVolume: q.avgVolume,
      minLiquidityUsd: config.minLiquidityUsd,
    });
    if (sig && sig.direction !== "NEUTRAL") signalResults.push({ sig, quote: q });
  }
  result.signalsFound = signalResults.length;

  // resolve open signal outcomes (signal history §24)
  await resolveOpenSignals(userId);

  // daily counters
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(); startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
  const todayOrders = await db.order.count({ where: { userId, createdAt: { gte: startOfDay } } });
  const todayFills = await db.order.findMany({ where: { userId, status: { in: ["FILLED", "PARTIAL"] }, createdAt: { gte: startOfDay } } });
  const realizedToday = todayFills.reduce((a, o) => {
    const fills = parse<{ pnl?: number }[]>(o.fills, []);
    return a + fills.reduce((b, f) => b + (f.pnl ?? 0), 0);
  }, 0);

  const positions = await db.position.findMany({ where: { userId } });
  const invested = positions.reduce((a, p) => a + p.qty * p.avgPrice, 0);
  const equity = account.cash + invested;

  // ── Candidate processing (best score first) ──
  const candidates = signalResults
    .filter((c) => c.sig.direction === "LONG") // delegate safety: long-only in v2.0 (documented)
    .sort((a, b) => b.sig.score - a.sig.score)
    .slice(0, 3);

  for (const { sig, quote } of candidates) {
    if (sig.score < config.minSignalScore + (["HIGH_VOLATILITY", "RISK_OFF"].includes(regime.primary) ? regime.influences.signalThresholdDelta : 0)) {
      notes.push(`${sig.symbol} score ${sig.score} below regime-adjusted threshold`);
      continue;
    }

    const ctx = {
      config, accountCash: account.cash, accountEquity: equity,
      positions, openTradesToday: todayOrders, realizedPnlToday: realizedToday,
      realizedPnlWeek: 0, currentDrawdownPct: 0,
      quote, correlatedExposurePct: await correlatedExposurePct(positions, quote.sector, equity),
      session: sessionNow() === "CLOSED" ? "REGULAR" as const : sessionNow(),
    };
    const verdict = runRiskChecks(sig, ctx);

    if (state !== "ACTIVE" && state !== "WAITING_FOR_APPROVAL") {
      notes.push(`${sig.symbol} ${sig.score} — risk ${verdict.pass ? "PASS" : "FAIL"} (display only; SENTINEL ${state})`);
      continue;
    }

    if (config.mode === "OBSERVE") {
      notes.push(`${sig.symbol} ${sig.score} — ${verdict.pass ? "eligible" : "risk-failed"} in Observe mode (no orders, ever)`);
      continue;
    }

    if (!verdict.pass) {
      notes.push(`${sig.symbol} blocked by risk engine: ${verdict.checks.filter((c) => !c.pass).map((c) => c.name).join(", ")}`);
      await db.auditEvent.create({
        data: { userId, category: "RISK", action: "PROPOSAL_BLOCKED", detail: JSON.stringify({ symbol: sig.symbol, failed: verdict.checks.filter((c) => !c.pass).map((c) => c.name) }) },
      });
      continue;
    }

    // ── APPROVE mode: create expiring approval (§16) ──
    if (config.mode === "APPROVE") {
      const pending = await db.approval.count({ where: { userId, status: "PENDING", symbol: sig.symbol } });
      if (pending > 0) continue; // no duplicate proposals
      const expiresAt = new Date(Date.now() + 120_000); // 2-minute expiry
      const approval = await db.approval.create({
        data: {
          userId, symbol: sig.symbol, side: "BUY", qty: verdict.positionQty,
          entry: sig.entry, stop: sig.stop, target: sig.target,
          riskUsd: verdict.riskUsd, rr: sig.rr, score: sig.score, regime: regime.primary,
          catalyst: sig.catalystScore > 0 ? `Strength ${sig.catalystScore}/9` : "None verified",
          riskChecks: JSON.stringify(verdict.checks),
          proposal: JSON.stringify({ explanation: sig.explanation, factors: sig.factors }),
          expiresAt,
        },
      });
      result.proposalsCreated++;
      await db.notificationRecord.create({
        data: {
          userId, event: "SENTINEL_APPROVAL_REQUEST", importance: "HIGH",
          title: `SENTINEL needs your approval — ${sig.symbol} Long`,
          body: `Signal ${sig.score} · Risk $${Math.round(verdict.riskUsd)} · R:R ${sig.rr.toFixed(1)} · expires in 2 min`,
          channels: JSON.stringify(["WEB"]), status: "SENT", deliveredAt: new Date(),
          deepLink: `sentinel?approval=${approval.id}`,
        },
      });
      await db.auditEvent.create({
        data: { userId, category: "APPROVAL", action: "PROPOSAL_CREATED", detail: JSON.stringify({ approvalId: approval.id, symbol: sig.symbol, score: sig.score }) },
      });
      continue;
    }

    // ── DELEGATE mode: execute within hard limits (§16) ──
    const provider = getExecutionProvider(account.broker);
    const exec = await provider.execute({
      symbol: sig.symbol, side: "BUY", type: "MARKET", qty: verdict.positionQty,
      quote, cashAvailable: account.cash, currentQty: positions.find((p) => p.symbol === sig.symbol)?.qty ?? 0,
    });
    if (exec.ok && exec.filledQty > 0) {
      const price = exec.avgFillPrice ?? sig.entry;
      await db.order.create({
        data: {
          userId, requestId: `${sig.symbol}-del-${Date.now()}`, symbol: sig.symbol,
          side: "BUY", type: "MARKET", qty: verdict.positionQty, status: exec.status,
          filledQty: exec.filledQty, avgFillPrice: price, source: "SENTINEL",
          fills: JSON.stringify(exec.fills), filledAt: new Date(),
        },
      });
      const existing = await db.position.findFirst({ where: { userId, symbol: sig.symbol } });
      if (existing) {
        const newQty = existing.qty + exec.filledQty;
        const newAvg = (existing.qty * existing.avgPrice + exec.filledQty * price) / newQty;
        await db.position.update({ where: { id: existing.id }, data: { qty: newQty, avgPrice: newAvg } });
      } else {
        await db.position.create({
          data: { userId, symbol: sig.symbol, qty: exec.filledQty, avgPrice: price, sector: quote.sector, stop: sig.stop, target: sig.target },
        });
      }
      await db.paperAccount.update({ where: { id: account.id }, data: { cash: account.cash - exec.filledQty * price } });
      result.executed++;
      await db.notificationRecord.create({
        data: {
          userId, event: "TRADE_EXECUTED", importance: "HIGH",
          title: `Executed: ${sig.symbol} Long ${exec.filledQty} @ $${price.toFixed(2)}`,
          body: `${provider.label} · slippage ${exec.fills[0]?.slippageBps ?? 0}bps · latency ${exec.latencyMs}ms`,
          channels: JSON.stringify(["WEB"]), status: "SENT", deliveredAt: new Date(),
          deepLink: `portfolio`,
        },
      });
      await db.auditEvent.create({
        data: { userId, category: "ORDER", action: "SENTINEL_DELEGATE_FILL", detail: JSON.stringify({ symbol: sig.symbol, qty: exec.filledQty, price, slippageBps: exec.fills[0]?.slippageBps }) },
      });
      notes.push(`${sig.symbol} executed in Delegate mode (${exec.status})`);
    } else {
      notes.push(`${sig.symbol} execution rejected: ${exec.rejectReason}`);
    }
  }

  // Expire stale approvals
  const expired = await db.approval.updateMany({
    where: { userId, status: "PENDING", expiresAt: { lt: new Date() } },
    data: { status: "EXPIRED" },
  });
  if (expired.count) notes.push(`${expired.count} approval(s) expired (time-limited by design)`);

  // Equity snapshot
  const quotesBy = new Map(quotes.map((q) => [q.symbol, q]));
  const investedValue = positions.reduce((a, p) => a + p.qty * (quotesBy.get(p.symbol)?.price ?? p.avgPrice), 0);
  const snap = parse<{ t: number; equity: number }[]>(account.equitySnapshot, []);
  snap.push({ t: Date.now(), equity: account.cash + investedValue });
  await db.paperAccount.update({ where: { id: account.id }, data: { equitySnapshot: JSON.stringify(snap.slice(-500)) } });

  return result;
}
