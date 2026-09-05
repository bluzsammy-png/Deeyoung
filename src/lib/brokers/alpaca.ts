// DEEYOUNG PRO — Alpaca Paper REST adapter (§broker-bridge).
// Chosen 2026-09-04 as PRIMARY venue: Bybit website is unreachable from the
// user's location (Nigeria), OANDA does not onboard Nigerian residents — but
// Alpaca's paper trading is open internationally, free, no deposit, no KYC,
// and paper-api.alpaca.markets is verified reachable from production (401 for
// anonymous = live and awaiting keys).
//
// Auth model (v2): plain headers APCA-API-KEY-ID / APCA-API-SECRET-KEY — no OAuth.
//   Paper base: https://paper-api.alpaca.markets   (default)
//   Live base:  https://api.alpaca.markets         (only when ALPACA_ENV=live)
//
// Honest states only: without ALPACA_KEY_ID + ALPACA_SECRET_KEY the adapter
// reports PENDING_BRIDGE — no fake "connected" badges, no simulated fills
// posing as broker fills. Bounded calls, never fatal to trading.
//
// Venue nuances encoded here:
//   - Equities (e.g. "AAPL"): bracket orders supported → attach TP/SL at broker.
//   - Crypto (e.g. "BTC/USD"): Alpaca does NOT support bracket/OCO/OTO for
//     crypto → plain market order (gtc), exits managed by the engine playbook.
//   - qty is always a string; crypto accepts fractional quantities.

export type AlpacaSide = "buy" | "sell";

/** Per-user credentials (BYOK): when provided they override the server env keys. */
export interface AlpacaCreds {
  keyId: string;
  secretKey: string;
  env: "PAPER" | "LIVE";
}

export interface AlpacaStatus {
  ok: boolean;
  status: "CONNECTED" | "PENDING_BRIDGE" | "ERROR";
  detail: string;
  equity?: number;
  cash?: number;
  buyingPower?: number;
  accountStatus?: string;
}

export function alpacaConfigured(): boolean {
  return Boolean(process.env.ALPACA_KEY_ID && process.env.ALPACA_SECRET_KEY);
}

export function alpacaBase(c?: AlpacaCreds): string {
  const env = c ? c.env : (process.env.ALPACA_ENV === "live" ? "LIVE" : "PAPER");
  return env === "LIVE" ? "https://api.alpaca.markets" : "https://paper-api.alpaca.markets";
}

export function alpacaEnvLabel(c?: AlpacaCreds): string {
  const env = c ? c.env : (process.env.ALPACA_ENV === "live" ? "LIVE" : "PAPER");
  return env === "LIVE" ? "LIVE (REAL FUNDS)" : "PAPER (simulated funds, real market data)";
}

/** Crypto pair detection: "BTC/USD", "ETH/USD" style symbols. */
export function isCryptoSymbol(symbol: string): boolean {
  return symbol.includes("/");
}

async function alpacaFetch<T>(
  path: string,
  init?: RequestInit & { timeoutMs?: number },
  c?: AlpacaCreds,
): Promise<{ ok: boolean; status: number; data: T | null; raw: string }> {
  const keyId = c ? c.keyId : (process.env.ALPACA_KEY_ID as string);
  const secretKey = c ? c.secretKey : (process.env.ALPACA_SECRET_KEY as string);
  const res = await fetch(`${alpacaBase(c)}${path}`, {
    ...init,
    headers: {
      "APCA-API-KEY-ID": keyId,
      "APCA-API-SECRET-KEY": secretKey,
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

/** Prove the keys by reading the live account. */
export async function alpacaAccountSummary(c?: AlpacaCreds): Promise<AlpacaStatus> {
  if (!c && !alpacaConfigured()) {
    return {
      ok: false, status: "PENDING_BRIDGE",
      detail: "Saved securely. Paper execution activates when ALPACA_KEY_ID and ALPACA_SECRET_KEY are configured on the server.",
    };
  }
  const r = await alpacaFetch<{ status?: string; equity?: string; cash?: string; buying_power?: string }>(
    "/v2/account", { timeoutMs: 10_000 }, c,
  );
  if (r.status === 401 || r.status === 403) {
    return { ok: false, status: "ERROR", detail: "Alpaca keys rejected (401). Generate a fresh key in the dashboard (API Keys → Generate New Key) and use the PAPER account's keys." };
  }
  if (!r.ok || !r.data) return { ok: false, status: "ERROR", detail: `Alpaca answered ${r.status}. ${r.raw.slice(0, 120)}` };
  return {
    ok: true, status: "CONNECTED",
    accountStatus: r.data.status,
    equity: +(r.data.equity ?? 0) || 0,
    cash: +(r.data.cash ?? 0) || 0,
    buyingPower: +(r.data.buying_power ?? 0) || 0,
    detail: `Connected to Alpaca ${alpacaEnvLabel(c)} — account ${r.data.status ?? "ACTIVE"}.`,
  };
}

/** Market session info (US equities). Crypto trades 24/7 regardless. */
export async function alpacaClock(): Promise<{ isOpen: boolean; nextOpen?: string; nextClose?: string } | null> {
  if (!alpacaConfigured()) return null;
  const r = await alpacaFetch<{ is_open?: boolean; next_open?: string; next_close?: string }>("/v2/clock", { timeoutMs: 10_000 });
  if (!r.ok || !r.data) return null;
  return { isOpen: !!r.data.is_open, nextOpen: r.data.next_open, nextClose: r.data.next_close };
}

/** Market order; attaches broker-side TP/SL bracket for EQUITIES only.
 *  Crypto exits are engine-managed (Alpaca has no crypto brackets). */
export async function alpacaMarketOrder(
  symbol: string, side: AlpacaSide, qty: number,
  takeProfitPrice?: number, stopLossPrice?: number, clientTag = "deeyoung-pro",
  c?: AlpacaCreds,
): Promise<{ ok: boolean; detail: string; orderId?: string }> {
  if (!c && !alpacaConfigured()) return { ok: false, detail: "Alpaca bridge not configured." };
  if (!(qty > 0)) return { ok: false, detail: `Quantity must be positive for ${symbol}.` };
  const crypto = isCryptoSymbol(symbol);
  const body: Record<string, unknown> = {
    symbol,
    qty: crypto ? qty.toFixed(8).replace(/0+$/, "").replace(/\.$/, "") : String(Math.max(1, Math.round(qty))),
    side,
    type: "market",
    time_in_force: crypto ? "gtc" : "day",
    client_order_id: `${clientTag}-${Date.now().toString(36)}`.slice(0, 48),
  };
  if (!crypto && (takeProfitPrice || stopLossPrice)) {
    body.order_class = "bracket";
    if (takeProfitPrice) body.take_profit = { limit_price: takeProfitPrice.toFixed(2) };
    if (stopLossPrice) body.stop_loss = { stop_price: stopLossPrice.toFixed(2) };
  }
  const r = await alpacaFetch<{ id?: string; filled_avg_price?: string; filled_qty?: string; status?: string } | { message?: string; code?: number }>(
    "/v2/orders", { method: "POST", body: JSON.stringify(body), timeoutMs: 20_000 }, c,
  );
  if (!r.ok) {
    const err = r.data as { message?: string } | null;
    return { ok: false, detail: `Alpaca rejected the order (${r.status}). ${err?.message ?? r.raw.slice(0, 140)}` };
  }
  const kind = crypto ? "crypto market" : "equity market" + (body.order_class ? " bracket" : "");
  const d = r.data as { id?: string; filled_avg_price?: string; filled_qty?: string; status?: string };
  return {
    ok: true,
    detail: `Market ${side} ${body.qty} ${symbol} (${kind}) accepted by Alpaca ${alpacaEnvLabel(c)}.`,
    orderId: d.id,
  };
}

/** Fetch one order by id (fill confirmation for live routing). */
export async function alpacaGetOrder(
  orderId: string,
  c?: AlpacaCreds,
): Promise<{ id?: string; status?: string; filled_avg_price?: string; filled_qty?: string } | null> {
  if (!orderId) return null;
  const r = await alpacaFetch<{ id?: string; status?: string; filled_avg_price?: string; filled_qty?: string }>(
    `/v2/orders/${encodeURIComponent(orderId)}`, { timeoutMs: 10_000 }, c,
  );
  return r.ok ? (r.data as { id?: string; status?: string; filled_avg_price?: string; filled_qty?: string }) : null;
}

/** Open positions snapshot. */
export async function alpacaOpenPositions(): Promise<{ symbol: string; qty: number; avgEntry: number; unrealizedPl: number; side: "long" | "short" }[] | null> {
  if (!alpacaConfigured()) return null;
  const r = await alpacaFetch<{ symbol: string; qty: string; avg_entry_price: string; unrealized_pl: string; side: string }[]>("/v2/positions");
  if (!r.ok || !r.data) return null;
  return r.data.map((p) => ({
    symbol: p.symbol, qty: Math.abs(+p.qty), avgEntry: +p.avg_entry_price,
    unrealizedPl: +p.unrealized_pl, side: p.side === "short" ? "short" : "long",
  }));
}

/** Close a position fully (market). Used by the kill-switch and rebalancer. */
export async function alpacaClosePosition(symbol: string): Promise<{ ok: boolean; detail: string }> {
  if (!alpacaConfigured()) return { ok: false, detail: "Alpaca bridge not configured." };
  const r = await alpacaFetch<unknown>(`/v2/positions/${encodeURIComponent(symbol)}`, { method: "DELETE", timeoutMs: 20_000 });
  if (!r.ok && r.status !== 204) return { ok: false, detail: `Alpaca close failed (${r.status}). ${r.raw.slice(0, 120)}` };
  return { ok: true, detail: `Close order sent for ${symbol}.` };
}
