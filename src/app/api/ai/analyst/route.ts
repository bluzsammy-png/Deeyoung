import { NextResponse } from "next/server";
import { withGuard } from "@/lib/guard";
import { getRegime } from "@/lib/engine/regime";
import { computeSignal } from "@/lib/engine/signals";
import { bollinger, ema, lastDefined, macd, rsi, type Bar } from "@/lib/engine/indicators";
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

// ── Multi-playbook audit battery ─────────────────────────────────────────────
// Six deterministic playbooks, all computed from the SAME real candles. Each
// returns an independent read so the analyst (and the user) can see where the
// angles agree and where they fight. Zero fabrication: every note cites the
// exact computed numbers.
export interface PlaybookRead {
  playbook: string;
  read: "BULLISH" | "BEARISH" | "NEUTRAL";
  note: string;
}

function swingPoints(bars: Bar[], k = 3): { highs: number[]; lows: number[] } {
  const highs: number[] = [];
  const lows: number[] = [];
  for (let i = k; i < bars.length - k; i++) {
    let isH = true, isL = true;
    for (let j = i - k; j <= i + k; j++) {
      if (j === i) continue;
      if (bars[j].h >= bars[i].h) isH = false;
      if (bars[j].l <= bars[i].l) isL = false;
    }
    if (isH) highs.push(bars[i].h);
    if (isL) lows.push(bars[i].l);
  }
  return { highs, lows };
}

function playbookBattery(bars: Bar[], relVol: number): PlaybookRead[] {
  const closes = bars.map((b) => b.c);
  const price = closes[closes.length - 1];
  const reads: PlaybookRead[] = [];

  // 1. Trend playbook: EMA stack + slope
  const e20 = lastDefined(ema(closes, 20));
  const e50 = lastDefined(ema(closes, 50));
  const e20s = ema(closes, 20).filter((v): v is number => v != null);
  const slope = e20s.length >= 6 ? e20s[e20s.length - 1] - e20s[e20s.length - 6] : 0;
  if (e20 != null && e50 != null) {
    const up = price > e20 && e20 > e50;
    const down = price < e20 && e20 < e50;
    reads.push({
      playbook: "Trend",
      read: up ? "BULLISH" : down ? "BEARISH" : "NEUTRAL",
      note: `price ${price > e20 ? "above" : "below"} EMA20 ${e20.toPrecision(6)}, EMA20/50 stack ${up ? "aligned up" : down ? "aligned down" : "compressed"}, EMA20 slope ${slope >= 0 ? "+" : ""}${slope.toPrecision(3)}`,
    });
  }

  // 2. Momentum playbook: RSI + MACD histogram state
  const rsiV = lastDefined(rsi(closes, 14)) ?? 50;
  const m = macd(closes);
  const hist = lastDefined(m.histogram) ?? 0;
  const histPrev = m.histogram.length >= 2 ? (m.histogram[m.histogram.length - 2] ?? 0) : 0;
  reads.push({
    playbook: "Momentum",
    read: hist > 0 && rsiV >= 50 ? "BULLISH" : hist < 0 && rsiV <= 50 ? "BEARISH" : "NEUTRAL",
    note: `RSI ${rsiV.toFixed(0)}, MACD histogram ${hist >= 0 ? "+" : ""}${hist.toPrecision(3)} and ${Math.abs(hist) > Math.abs(histPrev) ? "expanding" : "fading"}`,
  });

  // 3. Mean-reversion playbook: Bollinger band position
  const bb = bollinger(closes);
  const bbU = lastDefined(bb.upper);
  const bbL = lastDefined(bb.lower);
  if (bbU != null && bbL != null && bbU > bbL) {
    const pos = (price - bbL) / (bbU - bbL);
    reads.push({
      playbook: "Mean reversion",
      read: pos > 0.9 ? "BEARISH" : pos < 0.1 ? "BULLISH" : "NEUTRAL",
      note: `band position ${(pos * 100).toFixed(0)}%: ${pos > 0.9 ? "stretched upper band, fade risk" : pos < 0.1 ? "stretched lower band, bounce watch" : "mid-band, no reversion edge"}`,
    });
  }

  // 4. Breakout playbook: 20-bar range + squeeze state
  const win20 = bars.slice(-20);
  const hi20 = Math.max(...win20.map((b) => b.h));
  const lo20 = Math.min(...win20.map((b) => b.l));
  const rangePos = hi20 > lo20 ? (price - lo20) / (hi20 - lo20) : 0.5;
  const widths = bb.widthPct.filter((v): v is number => v != null).slice(-60);
  const widthNow = lastDefined(bb.widthPct) ?? 0;
  const widthAvg = widths.length ? widths.reduce((a, b) => a + b, 0) / widths.length : widthNow;
  const squeeze = widthNow < widthAvg * 0.75;
  reads.push({
    playbook: "Breakout",
    read: rangePos > 0.85 ? "BULLISH" : rangePos < 0.15 ? "BEARISH" : "NEUTRAL",
    note: `${(rangePos * 100).toFixed(0)}% of the 20-bar range (${lo20.toPrecision(6)} to ${hi20.toPrecision(6)})${squeeze ? ", volatility squeeze: coil before expansion" : ""}`,
  });

  // 5. Liquidity playbook: participation + prior-high sweep behavior
  const prior = bars.slice(-21, -1);
  const priorHi = Math.max(...prior.map((b) => b.h));
  const priorLo = Math.min(...prior.map((b) => b.l));
  const sweptLowAndReclaimed = price < priorHi && bars[bars.length - 1].l < priorLo && price > priorLo;
  const liquidityRead: PlaybookRead["read"] =
    relVol >= 1.3 && price > priorHi ? "BULLISH"
    : sweptLowAndReclaimed && relVol >= 1.1 ? "BULLISH"
    : relVol >= 1.3 && price < priorLo ? "BEARISH"
    : "NEUTRAL";
  reads.push({
    playbook: "Liquidity",
    read: liquidityRead,
    note: `relative volume ${relVol.toFixed(2)}x, close ${price > priorHi ? "above" : price < priorLo ? "below" : "inside"} the prior 20-bar extremes${sweptLowAndReclaimed ? " after a stop-run under the old low that was reclaimed (sweep reversal)" : ""}`,
  });

  // 6. Structure playbook: swing highs/lows, HH-HL vs LH-LL
  const sw = swingPoints(bars.slice(-70));
  const h2 = sw.highs.slice(-2);
  const l2 = sw.lows.slice(-2);
  if (h2.length === 2 && l2.length === 2) {
    const hh = h2[1] > h2[0];
    const hl = l2[1] > l2[0];
    reads.push({
      playbook: "Structure",
      read: hh && hl ? "BULLISH" : !hh && !hl ? "BEARISH" : "NEUTRAL",
      note: `last swings: ${hh ? "higher high" : "lower high"} ${h2[1].toPrecision(6)}, ${hl ? "higher low" : "lower low"} ${l2[1].toPrecision(6)}`,
    });
  }

  return reads;
}

// ── Live web verification ────────────────────────────────────────────────────
// Real internet search for the symbol's current news drivers. Fail-open: if
// the search layer is down or slow, the snapshot simply notes no web context
// and the analysis proceeds on candles alone. The model may cite these
// headlines ONLY by host, so every claim stays traceable.
interface WebIntelItem { title: string; host: string; snippet: string; date: string }

async function webIntel(symbol: string): Promise<WebIntelItem[]> {
  try {
    const ZAI = (await import("z-ai-web-dev-sdk")).default;
    const zai = await ZAI.create();
    const results = await Promise.race([
      zai.functions.invoke("web_search", {
        query: `${symbol} market news this week what moved the price`,
        num: 6,
        recency_days: 7,
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("WEB_TIMEOUT")), 12_000)),
    ]) as Array<{ name?: string; url?: string; snippet?: string; host_name?: string; date?: string }>;
    if (!Array.isArray(results)) return [];
    return results
      .slice(0, 5)
      .map((r) => ({
        title: String(r.name ?? "").slice(0, 140),
        host: String(r.host_name ?? "").replace(/^www\./, "").slice(0, 80),
        snippet: String(r.snippet ?? "").slice(0, 200),
        date: String(r.date ?? "").slice(0, 40),
      }))
      .filter((r) => r.title);
  } catch {
    return [];
  }
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

  const [intraday, daily, intel] = await Promise.all([
    marketProvider.getCandles(symbol, "1D"),
    marketProvider.getCandles(symbol, "6M"),
    webIntel(symbol),
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

  // Multi-angle audit: six playbooks read the same candles independently, so
  // the analysis must reconcile them instead of cherry-picking one.
  const playbooks = playbookBattery(series.candles as unknown as Bar[], volumeBlind ? 1 : rv);

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
    playbooks,
    webIntel: intel.length ? intel : undefined,
    webIntelNote: intel.length ? undefined : "No web context was reachable for this request. Analyze candles only and say so.",
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
            content: `You are DeeYoung Pro's Trade Desk analyst. You produce SHORT, disciplined trade plans the way a senior desk would: audit EVERY angle before committing an opinion. HARD RULES:
1. Use ONLY the numbers in the JSON snapshot (livePrice, day stats, engine levels, playbooks, webIntel). Every price level you output MUST be within 2.5% of livePrice. Never cite levels, companies, numbers, news or events not present in the snapshot.
2. The snapshot carries a playbook battery: Trend, Momentum, Mean reversion, Breakout, Liquidity, Structure. Your rationale MUST state which playbooks agree, which conflict, and how the conflict resolves. If 3 or more playbooks conflict, output bias NEUTRAL with conviction below 40 even when the engine direction is not NEUTRAL.
3. webIntel holds real web headlines with source hosts. You may reference a headline ONLY by naming its host in parentheses, for example (source: reuters.com). If webIntel is absent, state that no web context was reachable and analyze candles alone. NEVER invent headlines, events or numbers.
4. Answer the user's question directly if one is asked; otherwise produce the best plan the data supports.
5. No profit guarantees. No "guaranteed" language. This is analysis, not financial advice.
6. Respond with STRICT JSON only, no markdown, matching exactly:
{"bias":"LONG"|"SHORT"|"NEUTRAL","conviction":<0-100 integer>,"timeframe":"<e.g. intraday / 1-3 days / 1-2 weeks>","entry":<number>,"stop":<number>,"target1":<number>,"target2":<number>,"rr":<number>,"rationale":"<max 80 words: cite playbook agreement/conflicts and snapshot numbers>","risks":["<max 3 short strings>"],"invalidation":"<one sentence, cite a level>"}
7. If the snapshot's engine direction is NEUTRAL or data conflicts, output bias NEUTRAL with conviction below 40.`,
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
    playbooks,
    webIntel: intel,
    groundedOn: snapshot,
    asOf: Date.now(),
    disclaimer: "Paper analysis only: not financial advice. DeeYoung never routes live orders and levels shift with delayed data.",
  });
}, { minPlan: "TRIAL" });
