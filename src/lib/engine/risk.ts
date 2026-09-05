// DEEYOUNG PRO — Deterministic Risk Engine (§4, §16)
// HARD GATES. The AI may explain and rank but can NEVER bypass these checks. (§5)
// Every proposal must PASS here before an approval is created or a delegate order executes.

import type { Position, SentinelConfig } from "@prisma/client";
import type { RiskCheck, RiskVerdict, SignalResult } from "@/lib/types";
import type { Quote } from "@/lib/types";

export interface RiskContext {
  config: SentinelConfig;
  accountCash: number;
  accountEquity: number;
  positions: Position[];
  openTradesToday: number;
  realizedPnlToday: number;
  realizedPnlWeek: number;
  currentDrawdownPct: number;
  quote: Quote;
  correlatedExposurePct: number; // same-sector exposure incl. proposed trade
  session: "REGULAR" | "PRE" | "POST";
}

function parse<T>(json: string, fallback: T): T {
  try { return JSON.parse(json) as T; } catch { return fallback; }
}

export function runRiskChecks(signal: SignalResult, ctx: RiskContext): RiskVerdict {
  const cfg = ctx.config;
  const checks: RiskCheck[] = [];
  const add = (name: string, pass: boolean, detail: string) => checks.push({ name, pass, detail });

  // Kill switch (§18) — absolute
  add("Kill switch", !cfg.killSwitch, cfg.killSwitch ? "EMERGENCY STOP is engaged. All SENTINEL actions blocked" : "Emergency stop not engaged");

  // Mode gates
  const modeOk = cfg.mode === "APPROVE" || cfg.mode === "DELEGATE";
  add("SENTINEL mode", modeOk, cfg.mode === "OBSERVE" ? "Observe mode. Signals only, no orders" : `${cfg.mode} mode active`);

  // State gate (§17)
  const stateOk = cfg.state === "ACTIVE" || cfg.state === "WAITING_FOR_APPROVAL";
  add("System state", stateOk, stateOk ? `SENTINEL is ${cfg.state}` : `SENTINEL is ${cfg.state}. Action layer paused`);

  // Asset restrictions
  const allowedAssets = parse<string[]>(cfg.allowedAssets, ["EQUITY", "ETF"]);
  add("Asset class", allowedAssets.includes(ctx.quote.assetClass), `${ctx.quote.assetClass} ${allowedAssets.includes(ctx.quote.assetClass) ? "allowed" : "not in allowed assets"}`);

  // Session restrictions
  const allowedSessions = parse<string[]>(cfg.allowedSessions, ["REGULAR"]);
  add("Trading session", allowedSessions.includes(ctx.session), `${ctx.session} session ${allowedSessions.includes(ctx.session) ? "allowed" : "restricted"}`);

  // Signal score (regime-adjusted threshold)
  const threshold = cfg.minSignalScore; // regime delta applied upstream in tick
  add("Signal score", signal.score >= threshold, `Score ${signal.score} vs required ${threshold}`);

  // R:R floor (epsilon guard against float representation of e.g. 2.4/1.6)
  add("Risk:Reward", signal.rr >= cfg.minRR - 1e-9, `R:R ${signal.rr.toFixed(2)} vs minimum ${cfg.minRR.toFixed(2)}`);

  // Liquidity floor
  const dollarVolume = ctx.quote.avgVolume * ctx.quote.price;
  add("Liquidity", dollarVolume >= cfg.minLiquidityUsd, `$${Math.round(dollarVolume / 1e6)}M avg dollar volume vs $${(cfg.minLiquidityUsd / 1e6).toFixed(0)}M minimum`);

  // Spread ceiling
  add("Spread", signal.spreadBps <= cfg.maxSpreadBps, `Est. spread ${signal.spreadBps}bps vs max ${cfg.maxSpreadBps}bps`);

  // Volatility restriction — skip extreme-vol names
  const atrPct = (signal.atr / signal.entry) * 100;
  add("Volatility band", atrPct <= 8, `Daily ATR ${atrPct.toFixed(2)}% (cap 8%)`);

  // Position sizing (risk-based)
  const riskUsd = ctx.accountEquity * (cfg.riskPerTradePct / 100);
  const stopDistance = Math.abs(signal.entry - signal.stop);
  const qtyByRisk = stopDistance > 0 ? riskUsd / stopDistance : 0;
  const maxByPositionPct = ctx.accountEquity * (cfg.maxPositionPct / 100) / signal.entry;
  const maxByNotional = cfg.maxNotionalUsd / signal.entry;
  const qty = Math.max(0, Math.floor(Math.min(qtyByRisk, maxByPositionPct, maxByNotional)));
  const notional = qty * signal.entry;
  add("Position size", qty >= 1, qty >= 1
    ? `${qty} shares ($${Math.round(notional).toLocaleString()} notional, $${Math.round(Math.min(riskUsd, qty * stopDistance))} risk)`
    : `Sizing produced 0 shares (risk budget $${riskUsd.toFixed(0)}, stop distance $${stopDistance.toFixed(2)})`);

  // Max open positions
  add("Open positions", ctx.positions.length < cfg.maxOpenPositions, `${ctx.positions.length}/${cfg.maxOpenPositions} open`);

  // Max notional
  add("Max notional", notional <= cfg.maxNotionalUsd, `$${Math.round(notional).toLocaleString()} vs $${cfg.maxNotionalUsd.toLocaleString()} cap`);

  // Max daily loss circuit breaker
  const dailyLossPct = ctx.realizedPnlToday < 0 ? Math.abs(ctx.realizedPnlToday) / ctx.accountEquity * 100 : 0;
  add("Daily loss breaker", dailyLossPct < cfg.maxDailyLossPct, `Today's realized loss ${dailyLossPct.toFixed(2)}% vs ${cfg.maxDailyLossPct}% breaker`);

  // Weekly loss breaker
  const weeklyLossPct = ctx.realizedPnlWeek < 0 ? Math.abs(ctx.realizedPnlWeek) / ctx.accountEquity * 100 : 0;
  add("Weekly loss breaker", weeklyLossPct < cfg.maxWeeklyLossPct, `This week's realized loss ${weeklyLossPct.toFixed(2)}% vs ${cfg.maxWeeklyLossPct}% breaker`);

  // Max daily trades
  add("Daily trade cap", ctx.openTradesToday < cfg.maxDailyTrades, `${ctx.openTradesToday}/${cfg.maxDailyTrades} trades today`);

  // Portfolio drawdown breaker
  add("Portfolio drawdown", ctx.currentDrawdownPct < cfg.maxPortfolioDrawdownPct, `Drawdown ${ctx.currentDrawdownPct.toFixed(2)}% vs ${cfg.maxPortfolioDrawdownPct}% limit`);

  // Correlated exposure (§15 — several positions ≠ diversification)
  add("Correlated exposure", ctx.correlatedExposurePct <= cfg.maxCorrelatedExposurePct, `Same-sector exposure ${ctx.correlatedExposurePct.toFixed(1)}% vs ${cfg.maxCorrelatedExposurePct}% cap`);

  // Cash check
  add("Cash available", notional <= ctx.accountCash, `$${Math.round(ctx.accountCash).toLocaleString()} cash vs $${Math.round(notional).toLocaleString()} required`);

  // Existing position — no pyramiding beyond limit
  const existing = ctx.positions.find((p) => p.symbol === signal.symbol);
  add("Duplicate position", !existing, existing ? `Already holding ${existing.qty} ${signal.symbol}. No pyramiding` : "No existing position");

  const pass = checks.every((c) => c.pass);
  return { pass, checks, positionQty: qty, riskUsd: qty * stopDistance, notionalUsd: notional };
}
