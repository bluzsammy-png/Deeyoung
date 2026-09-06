// DEEYOUNG PRO — ENGINE NEWS INTEL (audit 2026-09-06).
// "Locks onto the internet, learns, improves on a minutes cadence" — the
// ENGINE-side internet feed. Every 5 minutes it pulls the verified news feed
// (Finnhub BYOK, real headlines only, NEVER fabricated) and maintains a
// per-symbol catalyst score (0-9) that the runner feeds into the engine's
// CATALYST factor (max +9 bull confirmation). Bearish news contributes 0:
// the engine's catalyst factor has no negative path, so we never let news
// invent bear conviction either. Fail-open to 0 on any error — the engine
// stays deterministic and never blocks on the news layer.

import { getNewsFeed } from "@/lib/providers/news";

const REFRESH_MS = 5 * 60_000;
const MAX_AGE_MS = 24 * 3_600_000; // news older than a day no longer counts
const MAX_SCORE = 9;

class NewsIntel {
  private scores = new Map<string, number>();
  private updatedAt = 0;
  private lastError: string | null = null;
  private running = false;
  private cursor = 0;

  scoreFor(symbol: string): number {
    return this.scores.get(symbol) ?? 0;
  }

  status(): { updatedAt: number; lastError: string | null; tracked: number; configured: boolean } {
    return {
      updatedAt: this.updatedAt,
      lastError: this.lastError,
      tracked: this.scores.size,
      configured: Boolean(process.env.FINNHUB_API_KEY),
    };
  }

  async refresh(universe: string[]): Promise<void> {
    if (this.running || !process.env.FINNHUB_API_KEY || universe.length === 0) return;
    this.running = true;
    try {
      // rotate a 12-symbol slice so a 20-symbol universe all gets coverage
      const SLICE = 12;
      const ordered = [...universe.slice(this.cursor % universe.length), ...universe.slice(0, this.cursor % universe.length)];
      this.cursor += SLICE;
      const feed = await getNewsFeed(ordered.slice(0, SLICE));
      if (feed.state !== "OK") {
        this.lastError = feed.message?.slice(0, 80) ?? feed.state;
        return;
      }
      const now = Date.now();
      const next = new Map<string, number>();
      for (const c of feed.catalysts) {
        if (now - c.publishedAt > MAX_AGE_MS) continue;
        for (const sym of c.tickers) {
          if (!universe.includes(sym)) continue;
          if (c.sentiment !== "POSITIVE") continue; // bull-confirmation only (engine contract)
          const s = (next.get(sym) ?? 0) + c.strength * 0.55;
          next.set(sym, Math.min(MAX_SCORE, s));
        }
      }
      this.scores = next;
      this.updatedAt = now;
      this.lastError = null;
    } catch (e) {
      this.lastError = String(e).slice(0, 80);
    } finally {
      this.running = false;
    }
  }
}

const g = globalThis as unknown as { __deenews?: NewsIntel };

export function newsIntel(): NewsIntel {
  if (!g.__deenews) g.__deenews = new NewsIntel();
  return g.__deenews;
}

export function startNewsIntelLoop(universe: string[]): void {
  const intel = newsIntel();
  if ((g as { __deenewsLoop?: boolean }).__deenewsLoop) return;
  (g as { __deenewsLoop?: boolean }).__deenewsLoop = true;
  void intel.refresh(universe);
  setInterval(() => { void intel.refresh(universe); }, REFRESH_MS);
}
