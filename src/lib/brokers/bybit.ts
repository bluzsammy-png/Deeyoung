// DEEYOUNG PRO — Bybit v5 adapter for DEMO-TRADING execution (§broker-bridge).
// Chosen 2026-09-04 after OANDA proved unavailable to Nigerian residents: the
// user already holds a KYC-verified Bybit account, and Bybit's official Demo
// Trading environment (api-demo.bybit.com) issues real production market data
// with simulated funds — no deposit needed ($0 balance is fine).
//
// Venue notes (verified 2026-09-04):
//   - api-demo.bybit.com reachable from terminal AND serves live klines.
//   - Nigeria is NOT on Bybit's restricted-countries list (US/CN/HK/SG/CA are).
//   - Demo API keys are generated while the web session is in Demo Trading mode.
//
// Honest states only: without BYBIT_API_KEY + BYBIT_API_SECRET the adapter
// reports PENDING_BRIDGE — no fake "connected" badges, no simulated fills
// pretending to be broker fills. All calls bounded, never fatal to trading.
// Signed-request scheme (v5): HMAC-SHA256 over timestamp+key+recvWindow+payload.

import { createHmac } from "crypto";

export type BybitSide = "Buy" | "Sell";

/** Per-user credentials (BYOK): when provided they override the server env keys. */
export interface BybitCreds {
  key: string;
  secret: string;
  env: "DEMO" | "LIVE";
}

export interface BybitStatus {
  ok: boolean;
  status: "CONNECTED" | "PENDING_BRIDGE" | "ERROR";
  detail: string;
  equity?: number;
  available?: number;
  accountType?: string;
}

export function bybitConfigured(): boolean {
  return Boolean(process.env.BYBIT_API_KEY && process.env.BYBIT_API_SECRET);
}

/** Demo trading by default (simulated funds, production data). */
export function bybitBase(): string {
  switch (process.env.BYBIT_ENV) {
    case "live": return "https://api.bybit.com";
    case "testnet": return "https://api-testnet.bybit.com";
    default: return "https://api-demo.bybit.com";
  }
}

export function bybitEnvLabel(): string {
  switch (process.env.BYBIT_ENV) {
    case "live": return "LIVE (REAL FUNDS)";
    case "testnet": return "TESTNET";
    default: return "DEMO (simulated funds, production data)";
  }
}

interface BybitEnvelope<T> { retCode: number; retMsg: string; result: T; }

/** Signed v5 fetch. GET: payload = raw query string (no '?'). POST: raw JSON body. */
async function bybitSigned<T>(
  method: "GET" | "POST",
  path: string,
  opts?: { query?: string; body?: Record<string, unknown>; timeoutMs?: number },
  c?: BybitCreds,
): Promise<{ ok: boolean; httpStatus: number; retCode: number; retMsg: string; data: T | null; raw: string }> {
  const key = c ? c.key : (process.env.BYBIT_API_KEY as string);
  const secret = c ? c.secret : (process.env.BYBIT_API_SECRET as string);
  const ts = Date.now().toString();
  const recv = "20000";
  const payload = method === "GET" ? (opts?.query ?? "") : JSON.stringify(opts?.body ?? {});
  const sign = createHmac("sha256", secret).update(`${ts}${key}${recv}${payload}`).digest("hex");
  const base = c ? (c.env === "LIVE" ? "https://api.bybit.com" : "https://api-demo.bybit.com") : bybitBase();
  const url = method === "GET"
    ? `${base}${path}${opts?.query ? `?${opts.query}` : ""}`
    : `${base}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        "X-BAPI-API-KEY": key,
        "X-BAPI-TIMESTAMP": ts,
        "X-BAPI-RECV-WINDOW": recv,
        "X-BAPI-SIGN": sign,
        "X-BAPI-SIGN-TYPE": "2",
        "Content-Type": "application/json",
      },
      body: method === "POST" ? payload : undefined,
      signal: AbortSignal.timeout(opts?.timeoutMs ?? 12_000),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, httpStatus: 0, retCode: -1, retMsg: `NETWORK: ${msg.slice(0, 100)}`, data: null, raw: "" };
  }
  const raw = await res.text().catch(() => "");
  let env: BybitEnvelope<T> | null = null;
  try { env = raw ? (JSON.parse(raw) as BybitEnvelope<T>) : null; } catch { /* non-JSON */ }
  return {
    ok: res.ok && !!env && env.retCode === 0,
    httpStatus: res.status,
    retCode: env?.retCode ?? -1,
    retMsg: env?.retMsg ?? raw.slice(0, 120),
    data: env?.result ?? null,
    raw,
  };
}

/** Prove the demo keys by reading the unified wallet balance. */
export async function bybitAccountSummary(c?: BybitCreds): Promise<BybitStatus> {
  if (!c && !bybitConfigured()) {
    return {
      ok: false, status: "PENDING_BRIDGE",
      detail: "Saved securely. Live demo execution activates when BYBIT_API_KEY and BYBIT_API_SECRET are configured on the server.",
    };
  }
  const r = await bybitSigned<{ list?: { totalEquity?: string; totalAvailableBalance?: string; accountType?: string }[] }>(
    "GET", "/v5/account/wallet-balance", { query: "accountType=UNIFIED" }, c,
  );
  if (r.retCode === 10003 || r.retCode === 10005 || r.httpStatus === 401 || r.httpStatus === 403) {
    return { ok: false, status: "ERROR", detail: "Bybit keys rejected (auth/permissions). Regenerate the key while in Demo Trading mode with Read + Contract permissions." };
  }
  if (r.retCode === 10004) return { ok: false, status: "ERROR", detail: "Bybit clock/sign error (10004) — server time drift; retry in a minute." };
  if (!r.ok || !r.data?.list?.length) return { ok: false, status: "ERROR", detail: `Bybit answered retCode=${r.retCode} ${r.retMsg.slice(0, 100)}` };
  const acct = r.data.list[0];
  return {
    ok: true, status: "CONNECTED", accountType: acct.accountType ?? "UNIFIED",
    equity: +((acct.totalEquity as string) ?? 0) || 0,
    available: +((acct.totalAvailableBalance as string) ?? 0) || 0,
    detail: `Connected to Bybit ${c ? (c.env === "LIVE" ? "LIVE" : "demo") : bybitEnvLabel()} — unified account answering.`,
  };
}

/** 1-minute USDT-perp klines, OLDEST-first (converted from Bybit's newest-first). */
export interface Kline { t: number; o: number; h: number; l: number; c: number; v: number }

export async function bybitKlines(symbol: string, intervalMin: 1 | 5 | 15, limit = 200): Promise<Kline[] | null> {
  const q = `category=linear&symbol=${symbol}&interval=${intervalMin}&limit=${Math.min(limit, 1000)}`;
  const r = await bybitSigned<{ list?: string[][] }>("GET", "/v5/market/kline", { query: q, timeoutMs: 10_000 });
  if (!r.ok || !r.data?.list) return null;
  return r.data.list
    .map((k) => ({ t: +k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] }))
    .sort((a, b) => a.t - b.t);
}

/** Instrument filters (qtyStep / minOrderQty / minNotionalValue) for safe rounding. */
export interface InstrumentSpec { qtyStep: number; minQty: number; minNotional: number }

export async function bybitInstrumentSpec(symbol: string): Promise<InstrumentSpec | null> {
  const q = `category=linear&symbol=${symbol}`;
  const r = await bybitSigned<{ list?: { lotSizeFilter?: { qtyStep?: string; minOrderQty?: string; minNotionalValue?: string } }[] }>(
    "GET", "/v5/market/instruments-info", { query: q, timeoutMs: 10_000 },
  );
  const f = r.data?.list?.[0]?.lotSizeFilter;
  if (!f) return null;
  return { qtyStep: +(f.qtyStep ?? 0.001), minQty: +(f.minOrderQty ?? 0.001), minNotional: +(f.minNotionalValue ?? 5) };
}

export function roundToStep(qty: number, step: number): string {
  if (!step || step <= 0) return qty.toFixed(6);
  const stepped = Math.floor(qty / step) * step;
  const decimals = Math.max(0, Math.round(-Math.log10(step)));
  return stepped.toFixed(Math.min(decimals, 8));
}

/** Market order on USDT perps with attach TP/SL. qty is in BASE coin (marketUnit=baseCoin).
 *  Accepts per-user credentials; returns the broker-confirmed fill when available. */
export async function bybitMarketOrder(
  symbol: string, side: BybitSide, qty: number,
  stopLossPrice?: number, takeProfitPrice?: number, clientTag = "DEEYOUNG-PRO",
  c?: BybitCreds,
): Promise<{ ok: boolean; detail: string; orderId?: string; avgFillPrice?: number; filledQty?: number }> {
  if (!c && !bybitConfigured()) return { ok: false, detail: "Bybit bridge not configured." };
  const spec = await bybitInstrumentSpec(symbol);
  const step = spec?.qtyStep ?? 0.001;
  const qtyStr = roundToStep(qty, step);
  if (+qtyStr <= 0) return { ok: false, detail: `Quantity rounds to zero for ${symbol} (step ${step}).` };
  const body: Record<string, unknown> = {
    category: "linear",
    symbol,
    side,
    orderType: "Market",
    qty: qtyStr,
    marketUnit: "baseCoin",
    tpslMode: "Full",
    orderFilter: "Order",
    orderLinkId: `${clientTag}-${Date.now().toString(36)}`,
  };
  if (stopLossPrice) body.stopLoss = stopLossPrice.toPrecision(10);
  if (takeProfitPrice) body.takeProfit = takeProfitPrice.toPrecision(10);
  const r = await bybitSigned<{ orderId?: string; orderLinkId?: string }>("POST", "/v5/order/create", { body, timeoutMs: 20_000 }, c);
  if (!r.ok) return { ok: false, detail: `Bybit rejected the order (retCode=${r.retCode}). ${r.retMsg.slice(0, 140)}` };
  // Bounded fill confirmation (market orders on linear usually fill at once).
  const q = `category=linear&symbol=${symbol}${r.data?.orderId ? `&orderId=${r.data.orderId}` : ""}`;
  const st = await bybitSigned<{ list?: { orderId: string; avgPrice?: string; cumExecQty?: string }[] }>(
    "GET", "/v5/order/realtime", { query: q, timeoutMs: 10_000 }, c,
  );
  const row = st.data?.list?.find((x) => x.orderId === r.data?.orderId);
  const avg = row?.avgPrice ? +row.avgPrice : undefined;
  const filled = row?.cumExecQty ? +row.cumExecQty : undefined;
  return {
    ok: true,
    detail: `Market ${side} ${qtyStr} ${symbol} accepted by Bybit ${c ? (c.env === "LIVE" ? "LIVE" : "demo") : bybitEnvLabel()}.`,
    orderId: r.data?.orderId,
    avgFillPrice: avg && avg > 0 ? avg : undefined,
    filledQty: filled && filled > 0 ? filled : undefined,
  };
}

/** Open USDT-perp positions snapshot. */
export async function bybitOpenPositions(): Promise<{ symbol: string; side: BybitSide; size: number; avgPrice: number; unrealisedPnl: number; leverage: number }[] | null> {
  if (!bybitConfigured()) return null;
  const r = await bybitSigned<{ list?: { symbol: string; side: string; size: string; avgPrice: string; unrealisedPnl: string; leverage: string }[] }>(
    "GET", "/v5/position/list", { query: "category=linear&settleCoin=USDT" },
  );
  if (!r.ok || !r.data?.list) return null;
  return r.data.list.map((p) => ({
    symbol: p.symbol, side: p.side as BybitSide, size: +p.size, avgPrice: +p.avgPrice,
    unrealisedPnl: +p.unrealisedPnl, leverage: +p.leverage,
  }));
}

/** Set 1x-style leverage hint (demo accounts default fine; call once per symbol, best-effort). */
export async function bybitSetLeverage(symbol: string, leverage: string = "1"): Promise<boolean> {
  const r = await bybitSigned<{ }>("POST", "/v5/position/set-leverage", {
    body: { category: "linear", symbol, buyLeverage: leverage, sellLeverage: leverage }, timeoutMs: 10_000,
  });
  return r.ok || r.retCode === 110043; // 110043 = leverage not modified — counts as success
}
