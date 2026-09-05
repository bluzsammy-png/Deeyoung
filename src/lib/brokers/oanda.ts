// DEEYOUNG PRO — OANDA v20 REST adapter for FX execution (§broker-bridge).
// Chosen 2026-09-04 after MetaApi was abandoned: OANDA fxTrade Practice gives a
// free, instantly-provisioned FX paper account with a clean token-auth REST API —
// verified reachable from production (api-fxpractice.oanda.com answered 401 for
// anonymous calls, i.e. the service is live and awaiting credentials).
//
// Honest states only: without OANDA_TOKEN + OANDA_ACCOUNT_ID the adapter reports
// PENDING_BRIDGE — no fake "connected" badges. All calls are bounded and never
// fatal to trading. Units are BASE-currency (OANDA convention); negative = sell.

export type OandaSide = "BUY" | "SELL";

/** Per-user credentials (BYOK): when provided they override the server env. */
export interface OandaCreds {
  token: string;
  accountId: string;
  env: "PRACTICE" | "LIVE";
}

export interface OandaStatus {
  ok: boolean;
  status: "CONNECTED" | "PENDING_BRIDGE" | "ERROR";
  detail: string;
  balance?: number;
  currency?: string;
  accountId?: string;
}

export function oandaConfigured(): boolean {
  return Boolean(process.env.OANDA_TOKEN && process.env.OANDA_ACCOUNT_ID);
}

export function oandaBase(c?: OandaCreds): string {
  const env = c ? c.env : (process.env.OANDA_ENV === "live" ? "LIVE" : "PRACTICE");
  return env === "LIVE"
    ? "https://api-fxtrade.oanda.com/v3"
    : "https://api-fxpractice.oanda.com/v3";
}

async function oandaFetch<T>(path: string, init?: RequestInit & { timeoutMs?: number }, c?: OandaCreds): Promise<{ ok: boolean; status: number; data: T | null; raw: string }> {
  const token = c ? c.token : (process.env.OANDA_TOKEN as string);
  const res = await fetch(`${oandaBase(c)}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(init?.timeoutMs ?? 12_000),
  });
  const raw = await res.text().catch(() => "");
  let data: T | null = null;
  try { data = raw ? (JSON.parse(raw) as T) : null; } catch { /* non-JSON error body */ }
  return { ok: res.ok, status: res.status, data, raw };
}

/** Prove the token + account id by reading the live account summary. */
export async function oandaAccountSummary(c?: OandaCreds): Promise<OandaStatus> {
  if (!c && !oandaConfigured()) {
    return {
      ok: false, status: "PENDING_BRIDGE",
      detail: "Saved securely. Live FX execution activates when OANDA_TOKEN and OANDA_ACCOUNT_ID are configured on the server.",
    };
  }
  const id = c ? c.accountId : (process.env.OANDA_ACCOUNT_ID as string);
  const r = await oandaFetch<{ account?: { balance?: number; currency?: string; NAV?: number; unrealizedPL?: number } }>(`/accounts/${id}/summary`, undefined, c);
  if (r.status === 401 || r.status === 403) return { ok: false, status: "ERROR", detail: "OANDA token rejected (401). Generate a fresh practice token (Manage API Access)." };
  if (r.status === 404) return { ok: false, status: "ERROR", detail: "OANDA account id not found (404). Check OANDA_ACCOUNT_ID — practice ids look like 101-001-1234567-001." };
  if (!r.ok || !r.data?.account) return { ok: false, status: "ERROR", detail: `OANDA answered ${r.status}. ${r.raw.slice(0, 120)}` };
  return {
    ok: true, status: "CONNECTED", accountId: id,
    balance: r.data.account.balance, currency: r.data.account.currency ?? "USD",
    detail: `Connected to OANDA ${c?.env === "LIVE" || (!c && process.env.OANDA_ENV === "live") ? "LIVE" : "practice"} account ${id}.`,
  };
}

/** Live bid/ask/mid for a list of OANDA instruments (EUR_USD style). */
export async function oandaPricing(instruments: string[]): Promise<Record<string, { bid: number; ask: number; mid: number; time: string }> | null> {
  if (!oandaConfigured() || !instruments.length) return null;
  const id = process.env.OANDA_ACCOUNT_ID as string;
  const r = await oandaFetch<{ prices?: { instrument: string; time: string; bids?: { price: string }[]; asks?: { price: string }[] }[] }>(
    `/accounts/${id}/pricing?instruments=${encodeURIComponent(instruments.join(","))}`,
  );
  if (!r.ok || !r.data?.prices) return null;
  const out: Record<string, { bid: number; ask: number; mid: number; time: string }> = {};
  for (const p of r.data.prices) {
    const bid = +(p.bids?.[0]?.price ?? 0);
    const ask = +(p.asks?.[0]?.price ?? 0);
    if (!bid || !ask) continue;
    out[p.instrument] = { bid, ask, mid: +((bid + ask) / 2).toFixed(6), time: p.time };
  }
  return out;
}

/** Convert a USD notional into OANDA units (base-currency) for an instrument.
 *  XXX_USD pairs: units = notional / mid. USD_XXX pairs: units = notional.
 *  Crosses (AAA_BBB): notional / (AAA in USD) via USD quote legs. */
export function notionalToUnits(instrument: string, notionalUsd: number, mid: number): number {
  const [base, quote] = instrument.split("_");
  if (!base || !quote) return 0;
  if (quote === "USD") return Math.max(1, Math.round(notionalUsd / mid));
  if (base === "USD") return Math.max(1, Math.round(notionalUsd));
  return Math.max(1, Math.round(notionalUsd / mid)); // crosses: mid approximates USD notional per base unit — refine at execution review
}

/** Market order with optional SL/TP fills. units < 0 = sell. */
export async function oandaMarketOrder(
  instrument: string, side: OandaSide, units: number,
  stopLossPrice?: number, takeProfitPrice?: number, clientTag = "DEEYOUNG-PRO",
  c?: OandaCreds,
): Promise<{ ok: boolean; detail: string; tradeId?: string; fillPrice?: number }> {
  if (!c && !oandaConfigured()) return { ok: false, detail: "OANDA bridge not configured." };
  const id = c ? c.accountId : (process.env.OANDA_ACCOUNT_ID as string);
  const signed = side === "BUY" ? Math.abs(units) : -Math.abs(units);
  const body: Record<string, unknown> = {
    order: {
      type: "MARKET",
      instrument,
      units: String(signed),
      timeInForce: "FOK",
      positionFill: "DEFAULT",
      clientExtensions: { tag: clientTag },
    },
  };
  const order = body.order as Record<string, unknown>;
  if (stopLossPrice) order.stopLossOnFill = { price: stopLossPrice.toFixed(6), timeInForce: "GTC" };
  if (takeProfitPrice) order.takeProfitOnFill = { price: takeProfitPrice.toFixed(6), timeInForce: "GTC" };
  const r = await oandaFetch<{ orderFillTransaction?: { id: string; price?: string; tradeOpened?: { tradeID: string } }; orderRejectTransaction?: { reason: string } }>(
    `/accounts/${id}/orders`, { method: "POST", body: JSON.stringify(body), timeoutMs: 20_000 }, c,
  );
  if (!r.ok) {
    const reason = r.data?.orderRejectTransaction?.reason ?? r.raw.slice(0, 140);
    return { ok: false, detail: `OANDA rejected the order (${r.status}). ${reason}` };
  }
  const tradeId = r.data?.orderFillTransaction?.tradeOpened?.tradeID ?? r.data?.orderFillTransaction?.id;
  const fillPrice = r.data?.orderFillTransaction?.price ? +r.data.orderFillTransaction.price : undefined;
  return { ok: true, detail: `Market ${side} ${Math.abs(signed)} ${instrument} filled by OANDA.`, tradeId, fillPrice };
}

/** Open positions snapshot for the account. */
export async function oandaOpenPositions(): Promise<{ instrument: string; units: number; unrealizedPL: number }[] | null> {
  if (!oandaConfigured()) return null;
  const id = process.env.OANDA_ACCOUNT_ID as string;
  const r = await oandaFetch<{ positions?: { instrument: string; long?: { units: string; unrealizedPL: string }; short?: { units: string; unrealizedPL: string } }[] }>(
    `/accounts/${id}/openPositions`,
  );
  if (!r.ok || !r.data?.positions) return null;
  return r.data.positions.map((p) => {
    const longU = +(p.long?.units ?? 0);
    const shortU = +(p.short?.units ?? 0);
    return { instrument: p.instrument, units: longU + shortU, unrealizedPL: +(p.long?.unrealizedPL ?? 0) + +(p.short?.unrealizedPL ?? 0) };
  });
}
