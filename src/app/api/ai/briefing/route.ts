import { NextRequest, NextResponse } from "next/server";
import { withGuard } from "@/lib/guard";
import { getRegime } from "@/lib/engine/regime";
import { marketProvider } from "@/lib/providers/market";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/ai/briefing — grounded AI market briefing (z-ai-web-dev-sdk, server-only)
 * ANTI-FABRICATION CONTRACT (audit finding ①):
 *   - The model receives ONLY real retrieved numbers.
 *   - It must cite exclusively those numbers, or decline the section.
 *   - If market data is simulated/unavailable, the endpoint refuses and returns an
 *     honest status instead of letting the model invent a briefing.
 * The AI can NEVER change risk limits or bypass the risk engine — output is prose only (§5).
 */
export const POST = withGuard(async (_req, { user, config, account }) => {

  const regime = await getRegime();
  const { quotes } = await marketProvider.getQuotes(["SPY", "QQQ", "NVDA", "AAPL", "MSFT", "TSLA", "AMD"]);
  const simulated = quotes.some((q) => q.dataState === "SIMULATED");
  if (simulated) {
    return NextResponse.json({
      ok: false,
      message: "AI briefing skipped: market data is degraded to simulated marks. DeeYoung will not generate commentary from numbers it cannot verify. Briefings resume automatically when live data returns.",
    });
  }

  const snapshot = {
    regime: { label: regime.label, explanation: regime.explanation },
    indices: quotes.filter((q) => ["SPY", "QQQ"].includes(q.symbol)).map((q) => ({ symbol: q.symbol, price: q.price, changePct: +q.changePct.toFixed(2) })),
    names: quotes.filter((q) => !["SPY", "QQQ"].includes(q.symbol)).map((q) => ({ symbol: q.symbol, price: q.price, changePct: +q.changePct.toFixed(2), relVol: +(q.volume / Math.max(1, q.avgVolume)).toFixed(2) })),
    portfolio: { mode: config.mode, openRiskPct: config.riskPerTradePct, cash: Math.round(account.cash) },
  };

  try {
    const ZAI = (await import("z-ai-web-dev-sdk")).default;
    const zai = await ZAI.create();
    const completion = await Promise.race([
      zai.chat.completions.create({
        messages: [
          {
            role: "system",
            content: `You are DeeYoung Pro's market briefing writer. STRICT RULES:
1. Use ONLY the numbers in the provided JSON snapshot. Never cite any price, percentage, or event not present in it.
2. If you lack data for a claim, omit the claim. Do not invent news, catalysts, or levels.
3. No profit guarantees, no "will win" language. Analysis, not advice.
4. Max 140 words. Tone: precise, calm, institutional. Reference the regime and what it means for risk.
5. Structure: one short paragraph on regime/context, one on notable names from the snapshot (with their real numbers), one on what to watch. Plain text, no markdown headers.`,
          },
          { role: "user", content: JSON.stringify(snapshot) },
        ],
        temperature: 0.3,
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("AI_TIMEOUT")), 40_000)),
    ]);
    const text = completion.choices[0]?.message?.content ?? "";
    if (!text) throw new Error("Empty completion");

    await db.usageEvent.create({ data: { userId: user.id, provider: "ZAI_AI", service: "AI_CALL", units: 1, estCostUsd: 0 } });
    return NextResponse.json({ ok: true, briefing: text.trim(), groundedOn: snapshot, asOf: Date.now() });
  } catch {
    return NextResponse.json({
      ok: false,
      message: "AI briefing is temporarily unavailable. Market data and signals continue to work — the briefing writer will return shortly.",
    });
  }
}, { minPlan: "PRO" });
