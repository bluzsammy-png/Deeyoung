// QUANTEDGE PRO — NewsProvider abstraction (§28) with BYOK (§30) and honest failure (§11, §43)
// Free-tier providers require an API key (BYOK). Without a key, we show
// "NEWS DATA UNAVAILABLE" — we NEVER fabricate news (this was the audit's finding ①).

import type { Catalyst, NewsEnvelope } from "@/lib/types";

export interface NewsProvider {
  name: string;
  getFeed(symbols: string[]): Promise<NewsEnvelope>;
}

/**
 * Finnhub free tier (BYOK): 60 API calls/minute, company news per symbol.
 * Key comes from env FINNHUB_API_KEY (server-side only, never exposed to client §30).
 * Users can supply their own key in Settings → Data Providers; secrets stay server-side.
 */
export class FinnhubProvider implements NewsProvider {
  name = "FINNHUB";

  async getFeed(symbols: string[]): Promise<NewsEnvelope> {
    const key = process.env.FINNHUB_API_KEY;
    if (!key) return unavailable("Connect a free Finnhub API key in Settings → Data Providers to activate the catalyst feed.", false);
    try {
      const to = Math.floor(Date.now() / 1000);
      const from = to - 3 * 86400;
      const pick = symbols.slice(0, 12); // respect free tier: 12 calls per refresh
      const results = await Promise.all(pick.map(async (sym) => {
        const url = `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(sym)}&from=${new Date(from * 1000).toISOString().slice(0, 10)}&to=${new Date(to * 1000).toISOString().slice(0, 10)}&token=${key}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(7000) });
        if (!res.ok) return [] as { sym: string; item: RawFinnhubItem }[];
        const items = (await res.json()) as RawFinnhubItem[];
        return items.slice(0, 6).map((item) => ({ sym, item }));
      }));
      const flat = results.flat();
      if (flat.length === 0) return unavailable("Connected provider returned no recent company news for the tracked universe.", true);
      const catalysts: Catalyst[] = flat.map(({ sym, item }) => ({
        id: `fh-${item.id ?? `${sym}-${item.datetime}`}`,
        headline: item.headline,
        source: item.source ?? "Finnhub",
        url: item.url ?? "",
        publishedAt: (item.datetime ?? Math.floor(Date.now() / 1000)) * 1000,
        category: categorize(item.headline, item.category),
        sentiment: (item.sentiment?.bearishPercent > item.sentiment?.bullishPercent ? "NEGATIVE" : item.sentiment?.bullishPercent > item.sentiment?.bearishPercent ? "POSITIVE" : "NEUTRAL"),
        relevance: 1,
        strength: Math.min(9, Math.round(((item.sentiment?.bullishPercent ?? 0) + (item.sentiment?.bearishPercent ?? 0)) / 10)),
        tickers: [sym],
      }));
      return { state: "OK", catalysts, provider: this.name, asOf: Date.now(), byokConfigured: true };
    } catch {
      return unavailable("Finnhub is unreachable right now.", true);
    }
  }
}

interface RawFinnhubItem {
  category?: string; datetime?: number; headline: string; id?: number;
  image?: string; related?: string; source?: string; summary?: string; url?: string;
  sentiment?: { bearishPercent?: number; bullishPercent?: number };
}

function categorize(headline: string, category?: string): Catalyst["category"] {
  const h = headline.toLowerCase();
  if (h.includes("upgrade")) return "ANALYST_UPGRADE";
  if (h.includes("downgrade")) return "ANALYST_DOWNGRADE";
  if (h.includes("earnings") || h.includes("reports q") || h.includes("quarter")) return "EARNINGS";
  if (h.includes("guidance") || h.includes("forecast") || h.includes("outlook")) return "GUIDANCE";
  if (h.includes("sec ") || h.includes("filing")) return "SEC_FILING";
  if (h.includes("acquisition") || h.includes("merger") || h.includes("acquires")) return "MA";
  if (h.includes("contract") || h.includes("partnership") || h.includes("deal with")) return "CONTRACT";
  if (h.includes("launch") || h.includes("unveil") || h.includes("announce")) return "PRODUCT";
  if (h.includes("lawsuit") || h.includes("sued") || h.includes("suit")) return "LAWSUIT";
  if (h.includes("ceo") || h.includes("cfo") || h.includes("appoint")) return "MANAGEMENT";
  if (h.includes("fed ") || h.includes("cpi") || h.includes("inflation") || h.includes("jobs report")) return "MACRO";
  if (category === "merger" || category === "earning") return category === "merger" ? "MA" : "EARNINGS";
  return "NEWS";
}

function unavailable(message: string, byok: boolean): NewsEnvelope {
  return {
    state: "NEWS_DATA_UNAVAILABLE",
    catalysts: [],
    provider: "NONE",
    asOf: Date.now(),
    message,
    byokConfigured: byok,
  };
}

/** Provider resolution — single place to add Polygon/Benzinga later (§28). */
export async function getNewsFeed(symbols: string[]): Promise<NewsEnvelope> {
  if (process.env.FINNHUB_API_KEY) {
    return new FinnhubProvider().getFeed(symbols);
  }
  return unavailable(
    "The catalyst feed needs a free news API key (BYOK). Until one is connected, QuantEdge will not display or infer any news — fabricated headlines are the #1 trust killer in market tools.",
    false
  );
}
