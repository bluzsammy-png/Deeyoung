import { NextResponse } from "next/server";
import { withGuard } from "@/lib/guard";
import { getRegime } from "@/lib/engine/regime";
import { computeSignal } from "@/lib/engine/signals";
import { isVolumeBlind, marketProvider } from "@/lib/providers/market";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface TradePlan {
  bias: "LONG" | "SHORT" | "NEUTRAL";
  conviction: number; // 0-100
  timeframe: string;
  entry: number;
  stop: number;
  target1: number;
  target2: number;
  rr: number;
  rationale: string;
  risks: string[];
  invalidation: string;
}

function deterministicPlan(
  symbol: string,
  price: number,
  engine: { direction: string; score: number; entry: number; stop: number; target: number; rr: number; summary: string },
  regimeLabel: string,
): TradePlan {
  const direction = engine.direction === "LONG" ? "LONG" : engine.direction === "SHORT" ? "SHORT" : "NEUTRAL";
  const risk = Math.abs(engine.entry - engine.stop);
  const t2 = direction === "SHORT" ? engine.entry - risk * 3.2 : engine.entry + risk * 3.2;
  return {
    bias: direction as TradePlan["bias"],
    conviction: engine.direction === "NEUTRAL" ? 35 : engine.score,
    timeframe: "swing (1–5 sessions)",
    entry: engine.entry,
    stop: engine.stop,
    target1: engine.target,
    target2: t2,
    rr: engine.rr,
    rationale: `Engine read: ${engine.summary} Regime: ${regimeLabel}. Factors are computed from live candles. This plan is the raw engine output, no narrative layer.`,
    risks: [
      "Data is delayed per exchange terms. Levels shift between refreshes",
      "Paper plan only; no position was opened",
      "Regime can flip intraday and invalidate the setup",
    ],
    invalidation: direction === "NEUTRAL"
      ? "Factors conflict. Stand aside until they align."
      : `Setup dies if price closes beyond ${engine.stop} on rising volatility, or if the regime flips.`,
  };
}

function clampNear(v: number, anchor: number, maxPctAway: number): number | null {
  if (!Number.isFinite(v)) return null;
  const lo = anchor * (1 - maxPctAway);
  const hi = anchor * (1 + maxPctAway);
  if (v < lo || v > hi) return null;
  return v;
}

/**
 * POST /api/ai/analyst — the Trade Desk bot. Grounded trade-plan advice for any
 * covered instrument (gold, FX majors, equities).
 * ANTI-FABRICATION CONTRACT (same as the briefing):
 *   - The model receives ONLY real numbers pulled from the live data pipeline
 *     plus the deterministic signal engine's output.
 *   - Every number it returns must sit within tolerance of the live price or the
 *     plan is discarded and the raw engine plan is served instead.
 *   - Paper context always: the bot never routes orders and cannot touch risk limits.
 */
export const POST = withGuard(async (req: Request, { user, config }) => {
  const body = await req.json().catch(() => null);
  const symbol = String(body?.symbol ?? "").trim().toUpperCase();
  const question = String(body?.question ?? "").trim().slice(0, 240);
  if (!symbol) return NextResponse.json({ error: "SYMBOL_REQUIRED", message: "Pick a market to ask about." }, { status: 400 });

  const regime = await getRegime();
  const { quotes } = await marketProvider.getQuotes([symbol]);
  const quote = quotes[0];
  if (!quote) {
    return NextResponse.json({ ok: false, message: "No live data for that market right now. Try again shortly." });
  }

  const [intraday, daily] = await Promise.all([
    marketProvider.getCandles(symbol, "1D"),
    marketProvider.getCandles(symbol, "6M"),
  ]);
  const series = intraday && intraday.candles.length >= 60 ? intraday : daily;
  if (!series || series.candles.length < 60) {
    return NextResponse.json({ ok: false, message: "Not enough candle history to advise on that market yet." });
  }

  const volumeBlind = isVolumeBlind(symbol);
  const rv = volumeBlind ? 1 : quote.avgVolume > 0 ? quote.volume / quote.avgVolume : 1;
  const sig = computeSignal({
    candles: series,
    dayCandles: intraday ?? undefined,
    relVolume: rv,
    regimePrimary: regime.primary,
    catalystScore: 0,
    avgVolume: volumeBlind ? Math.ceil(config.minLiquidityUsd / Math.max(0.0001, quote.price)) : quote.avgVolume,
    minLiquidityUsd: config.minLiquidityUsd,
  });
  if (!sig) return NextResponse.json({ ok: false, message: "The signal engine could not evaluate that market." });

  const engineFallback = deterministicPlan(symbol, quote.price, {
    direction: sig.direction, score: sig.score, entry: sig.entry, stop: sig.stop, target: sig.target,
    rr: sig.rr, summary: sig.explanation || `${sig.direction} · score ${sig.score}`,
  }, regime.label);

  // Data-coherence anchor: engine levels are derived from candle closes, the
  // quote is the freshest mark. If they disagree materially (stale candles can
  // sneak through during upstream turbulence), shift every level by the gap so
  // the plan is always anchored to the live price. Distances are preserved.
  const drift = (quote.price - sig.entry) / Math.max(0.0001, sig.entry);
  if (Math.abs(drift) > 0.015) {
    const shift = quote.price - sig.entry;
    const moved = { ...engineFallback, entry: quote.price, stop: engineFallback.stop + shift, target1: engineFallback.target1 + shift, target2: engineFallback.target2 + shift };
    moved.rationale = `[levels re-anchored to the live quote after a stale-candle gap of ${(drift * 100).toFixed(1)}%] ` + moved.rationale;
    engineFallback.entry = moved.entry;
    engineFallback.stop = moved.stop;
    engineFallback.target1 = moved.target1;
    engineFallback.target2 = moved.target2;
    engineFallback.rationale = moved.rationale;
  }

  const snapshot = {
    symbol,
    instrument: quote.name,
    assetClass: quote.assetClass,
    note: volumeBlind ? "Volume is not meaningful for this asset class (spot FX / metals proxy). Ignore volume in reasoning." : undefined,
    livePrice: quote.price,
    dayChangePct: +quote.changePct.toFixed(2),
    dayRange: { low: quote.dayLow, high: quote.dayHigh },
    dataState: quote.dataState,
    regime: { label: regime.label, primary: regime.primary },
    engine: {
      direction: sig.direction, score: sig.score, entry: +sig.entry.toPrecision(6),
      stop: +sig.stop.toPrecision(6), target: +sig.target.toPrecision(6), rr: sig.rr,
      topFactors: sig.factors.slice(0, 5), summary: sig.explanation,
    },
    userQuestion: question || undefined,
  };

  let plan: TradePlan = engineFallback;
  let source: "LLM_GROUNDED" | "ENGINE_FALLBACK" = "ENGINE_FALLBACK";

  try {
    const ZAI = (await import("z-ai-web-dev-sdk")).default;
    const zai = await ZAI.create();
    const completion = await Promise.race([
      zai.chat.completions.create({
        messages: [
          {
            role: "system",
            content: `You are DeeYoung Pro's Trade Desk analyst. You produce SHORT, disciplined trade plans. HARD RULES:
1. Use ONLY the numbers in the JSON snapshot. Every price level you output MUST be within 2.5% of livePrice. Never cite levels, news, or events not present in the snapshot.
2. Answer the user's question directly if one is asked; otherwise produce the best plan the engine data supports.
3. No profit guarantees. No "guaranteed" language. This is analysis, not financial advice.
4. Respond with STRICT JSON only, no markdown, matching exactly:
{"bias":"LONG"|"SHORT"|"NEUTRAL","conviction":<0-100 integer>,"timeframe":"<e.g. intraday / 1-3 days / 1-2 weeks>","entry":<number>,"stop":<number>,"target1":<number>,"target2":<number>,"rr":<number>,"rationale":"<max 70 words, cite snapshot numbers>","risks":["<max 3 short strings>"],"invalidation":"<one sentence, cite a level>"}
5. If the snapshot's engine direction is NEUTRAL or data conflicts, output bias NEUTRAL with conviction below 40.`,
          },
          { role: "user", content: JSON.stringify(snapshot) },
        ],
        temperature: 0.25,
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("AI_TIMEOUT")), 40_000)),
    ]);
    const text = completion.choices[0]?.message?.content ?? "";
    const json = JSON.parse(text.replace(/```json|```/g, "").trim()) as TradePlan;
    const levelTol = symbol === "USDJPY" ? 0.03 : 0.025;
    const entry = clampNear(Number(json.entry), quote.price, levelTol);
    const stop = clampNear(Number(json.stop), quote.price, levelTol * 2);
    const t1 = clampNear(Number(json.target1), quote.price, levelTol * 2.5);
    const t2 = clampNear(Number(json.target2), quote.price, levelTol * 3);
    const bias = ["LONG", "SHORT", "NEUTRAL"].includes(json.bias) ? json.bias : null;
    if (bias && entry != null && stop != null && t1 != null && Number.isFinite(Number(json.rr))) {
      plan = {
        bias: bias as TradePlan["bias"],
        conviction: Math.max(0, Math.min(100, Math.round(Number(json.conviction) || 0))),
        timeframe: String(json.timeframe ?? "swing").slice(0, 40),
        entry, stop, target1: t1, target2: t2 ?? t1,
        rr: +Number(json.rr).toFixed(2),
        rationale: String(json.rationale ?? "").slice(0, 420) || engineFallback.rationale,
        risks: Array.isArray(json.risks) ? json.risks.slice(0, 3).map((r) => String(r).slice(0, 140)) : engineFallback.risks,
        invalidation: String(json.invalidation ?? "").slice(0, 220) || engineFallback.invalidation,
      };
      source = "LLM_GROUNDED";
      void db.usageEvent.create({ data: { userId: user.id, provider: "ZAI_AI", service: "AI_CALL", units: 1, estCostUsd: 0 } }).catch(() => undefined);
    }
  } catch {
    // fall through to the deterministic engine plan — the user still gets advice
  }

  return NextResponse.json({
    ok: true,
    symbol,
    instrument: quote.name,
    livePrice: quote.price,
    dataState: quote.dataState,
    regimeLabel: regime.label,
    source,
    plan,
    groundedOn: snapshot,
    asOf: Date.now(),
    disclaimer: "Paper analysis only: not financial advice. DeeYoung never routes live orders and levels shift with delayed data.",
  });
}, { minPlan: "TRIAL" });
