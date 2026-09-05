// DEEYOUNG PRO — Portfolio Intelligence (§15) + Risk analytics
// Beyond P&L: allocation, concentration, correlation, volatility, scenarios, warnings.

import { correlation, realizedVolPct } from "@/lib/engine/indicators";
import { marketProvider, UNIVERSE } from "@/lib/providers/market";
import type { PortfolioIntelligence, PortfolioPositionView, Quote } from "@/lib/types";
import type { PaperAccount, Position } from "@prisma/client";

export async function buildPortfolioIntelligence(
  positions: Position[],
  account: PaperAccount
): Promise<PortfolioIntelligence> {
  const quotes: Quote[] = await Promise.all(
    positions.map((p) => marketProvider.getQuote(p.symbol))
  );
  const quoteBy = new Map(quotes.map((q) => [q.symbol, q]));

  const views: PortfolioPositionView[] = positions.map((p) => {
    const q = quoteBy.get(p.symbol);
    const lastPrice = q?.price ?? p.avgPrice;
    const mv = lastPrice * p.qty;
    const cost = p.avgPrice * p.qty;
    return {
      symbol: p.symbol,
      name: UNIVERSE[p.symbol]?.name ?? p.symbol,
      sector: UNIVERSE[p.symbol]?.sector ?? p.sector ?? "UNKNOWN",
      qty: p.qty,
      avgPrice: p.avgPrice,
      lastPrice,
      marketValue: mv,
      unrealizedPnl: mv - cost,
      unrealizedPct: cost ? (mv - cost) / cost * 100 : 0,
      weightPct: 0, // filled below
      riskUsd: 0,   // filled below (no stop on manual positions → ATR proxy applied upstream)
      dataState: q?.dataState ?? "SIMULATED",
    };
  });

  const investedValue = views.reduce((a, v) => a + v.marketValue, 0);
  const equity = account.cash + investedValue;
  for (const v of views) {
    v.weightPct = equity ? (v.marketValue / equity) * 100 : 0;
    v.riskUsd = v.weightPct / 100 * equity * 0.5; // rough mark-to-ATR risk when no stop set
  }

  const totalPnl = views.reduce((a, v) => a + v.unrealizedPnl, 0);
  const dayPnl = views.reduce((a, v) => a + (v.lastPrice - (quoteBy.get(v.symbol)?.prevClose ?? v.lastPrice)) * v.qty, 0);

  // Sector allocation
  const sectorMap = new Map<string, number>();
  for (const v of views) sectorMap.set(v.sector, (sectorMap.get(v.sector) ?? 0) + v.marketValue);
  const allocation = [...sectorMap.entries()]
    .map(([sector, value]) => ({ sector, value, pct: investedValue ? value / investedValue * 100 : 0 }))
    .sort((a, b) => b.value - a.value);

  // Concentration HHI (sum of squared weights, 0–10,000)
  const concentrationHHI = views.reduce((a, v) => a + (v.weightPct / 100) ** 2, 0) * 10_000;

  // Correlation matrix from daily closes
  const symbols = views.map((v) => v.symbol);
  const closesBy = new Map<string, number[]>();
  await Promise.all(symbols.map(async (s) => {
    const c = await marketProvider.getCandles(s, "1M");
    if (c) closesBy.set(s, c.candles.map((k) => k.c));
  }));
  const returns = symbols.map((s) => {
    const cl = closesBy.get(s) ?? [];
    const r: number[] = [];
    for (let i = 1; i < cl.length; i++) r.push(cl[i] / cl[i - 1] - 1);
    return r;
  });
  const matrix = returns.map((a) => returns.map((b) => Math.round(correlation(a, b) * 100) / 100));

  // Portfolio volatility (weighted, with average pairwise correlation adjustment)
  const wVols = await Promise.all(symbols.map(async (s) => {
    const cl = closesBy.get(s);
    return cl ? (realizedVolPct(cl, 21) ?? 25) : 25;
  }));
  const avgWeightVol = wVols.reduce((a, v, i) => a + (views[i].weightPct / 100) * v, 0);
  const avgCorr = matrix.length > 1
    ? matrix.flatMap((row, i) => row.filter((_, j) => j !== i)).reduce((a, b) => a + b, 0) / (matrix.length * (matrix.length - 1))
    : 0;
  const portfolioVolatilityPct = avgWeightVol * Math.sqrt(Math.max(0.15, avgCorr + 0.35));

  // Equity curve from account snapshots for drawdown
  let maxDrawdownPct = 0;
  try {
    const snap = JSON.parse(account.equitySnapshot) as { t: number; equity: number }[];
    let peak = snap.length ? snap[0].equity : equity;
    for (const s of snap) {
      peak = Math.max(peak, s.equity);
      maxDrawdownPct = Math.max(maxDrawdownPct, (peak - s.equity) / peak * 100);
    }
  } catch { /* first run */ }

  const sorted = [...views].sort((a, b) => b.unrealizedPnl - a.unrealizedPnl);
  const warnings: string[] = [];
  for (const a of allocation) {
    if (a.pct > 35) {
      const inSector = views.filter((v) => v.sector === a.sector).map((v) => v.symbol);
      if (inSector.length > 1) {
        warnings.push(`Your ${inSector.join(", ")} exposure creates elevated ${a.sector.toLowerCase()} concentration (${a.pct.toFixed(0)}% of invested value). These positions can behave as one trade.`);
      } else {
        warnings.push(`${inSector[0]} alone is ${a.pct.toFixed(0)}% of invested value: single-name concentration is above the 35% guideline.`);
      }
    }
  }
  const highCorrPairs: string[] = [];
  for (let i = 0; i < symbols.length; i++) {
    for (let j = i + 1; j < symbols.length; j++) {
      if (matrix[i][j] > 0.85) highCorrPairs.push(`${symbols[i]}–${symbols[j]} (${matrix[i][j].toFixed(2)})`);
    }
  }
  if (highCorrPairs.length) warnings.push(`Highly correlated pairs detected: ${highCorrPairs.join(", ")}. In a drawdown they will likely fall together.`);

  // Scenario analysis (§15)
  const scenarios = [
    { name: "Market −5%", betaShock: -0.05 },
    { name: "Market −10%", betaShock: -0.10 },
    { name: "Vol spike (×1.5)", betaShock: -0.075 },
  ].map((s) => {
    const impactUsd = investedValue * s.betaShock;
    return { name: s.name, impactUsd, impactPct: equity ? impactUsd / equity * 100 : 0 };
  });

  return {
    equity,
    cash: account.cash,
    investedValue,
    totalPnl,
    totalPnlPct: equity ? totalPnl / equity * 100 : 0,
    dayPnl,
    dayPnlPct: equity ? dayPnl / equity * 100 : 0,
    positions: views.sort((a, b) => b.marketValue - a.marketValue),
    allocation,
    longExposurePct: equity ? investedValue / equity * 100 : 0,
    concentrationHHI,
    portfolioVolatilityPct,
    maxDrawdownPct,
    topContributors: sorted.slice(0, 3).map((v) => ({ symbol: v.symbol, pnl: v.unrealizedPnl })),
    topDetractors: sorted.slice(-3).reverse().map((v) => ({ symbol: v.symbol, pnl: v.unrealizedPnl })),
    warnings,
    scenarios,
    correlation: symbols.length > 1 ? { symbols, matrix } : undefined,
  };
}
