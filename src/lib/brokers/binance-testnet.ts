/**
 * Binance SPOT TESTNET adapter — paper venue (PRIMARY after Alpaca shelved).
 *
 * Base: https://testnet.binance.vision  (login via GitHub OAuth on the site,
 * "Generate HMAC Keys" → instant API key + secret; virtual funds, resettable).
 * API mirrors production Binance spot 1:1 → symbols are IDENTICAL to the
 * engine's feed symbols (BTCUSDT etc.) — zero symbol mapping needed.
 *
 * Auth: HMAC-SHA256 over the signed query string, header X-MBX-APIKEY.
 * No keys configured → honest PENDING_BRIDGE (never fabricate).
 */

const BASE = "https://testnet.binance.vision";

function creds() {
  const key = process.env.BINANCE_TESTNET_KEY || "";
  const secret = process.env.BINANCE_TESTNET_SECRET || "";
  return { key, secret, hasKeys: key.length > 0 && secret.length > 0 };
}

async function signedFetch(
  path: string,
  params: Record<string, string | number>,
  method: "GET" | "POST" | "DELETE" = "GET"
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const { key, secret, hasKeys } = creds();
  if (!hasKeys) return { ok: false, status: 0, data: { verdict: "PENDING_BRIDGE" } };

  const merged: Record<string, string> = {
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
    timestamp: String(Date.now()),
    recvWindow: "10000",
  };
  const qs = new URLSearchParams(merged).toString();
  const sig = await hmacHex(secret, qs);
  const url = `${BASE}${path}?${qs}&signature=${sig}`;

  const res = await fetch(url, {
    method,
    headers: { "X-MBX-APIKEY": key },
    signal: AbortSignal.timeout(12_000),
  });
  const data = await res.json().catch(() => ({ raw: "unparseable" }));
  return { ok: res.ok, status: res.status, data };
}

async function hmacHex(secret: string, payload: string): Promise<string> {
  const enc = new TextEncoder();
  const keyBytes = enc.encode(secret);
  const msgBytes = enc.encode(payload);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuf = await crypto.subtle.sign("HMAC", cryptoKey, msgBytes);
  return [...new Uint8Array(sigBuf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Account summary for diagnostics — aggregated facts only, never echoes keys. */
export async function binanceTestnetAccountSummary(): Promise<{
  verdict: "KEYS_VALID" | "PENDING_BRIDGE" | "ERROR";
  accountType?: string;
  canTrade?: boolean;
  balancesOverZero?: number;
  latencyMs?: number;
  errorDetail?: string;
}> {
  const t0 = Date.now();
  try {
    const r = await signedFetch("/api/v3/account", {});
    if (!r.ok && r.status === 0) return { verdict: "PENDING_BRIDGE" };
    if (!r.ok) {
      const d = r.data as { msg?: string; code?: number };
      return {
        verdict: "ERROR",
        errorDetail: `HTTP ${r.status} code=${d?.code ?? "?"} ${String(d?.msg ?? "").slice(0, 120)}`,
      };
    }
    const d = r.data as {
      accountType?: string;
      canTrade?: boolean;
      balances?: Array<{ asset: string; free: string; locked: string }>;
    };
    const overZero = (d.balances ?? []).filter(
      (b) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0
    ).length;
    return {
      verdict: "KEYS_VALID",
      accountType: d.accountType,
      canTrade: d.canTrade,
      balancesOverZero: overZero,
      latencyMs: Date.now() - t0,
    };
  } catch (e) {
    return { verdict: "ERROR", errorDetail: String(e).slice(0, 160) };
  }
}

/** Testnet klines (identical shape to production feed the brain trains on). */
export async function binanceTestnetKlines(
  symbol: string,
  interval: string,
  limit = 60
): Promise<Array<{ openTime: number; open: number; high: number; low: number; close: number; volume: number }> | null> {
  try {
    const url = `${BASE}/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=${limit}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const rows = (await res.json()) as unknown[][];
    return rows.map((r) => ({
      openTime: Number(r[0]),
      open: parseFloat(String(r[1])),
      high: parseFloat(String(r[2])),
      low: parseFloat(String(r[3])),
      close: parseFloat(String(r[4])),
      volume: parseFloat(String(r[5])),
    }));
  } catch {
    return null;
  }
}

/**
 * Market order on testnet spot. `quoteQty` spent via quoteOrderQty (market buy)
 * or quantity (market sell). Returns aggregated facts only.
 */
export async function binanceTestnetMarketOrder(opts: {
  symbol: string;
  side: "BUY" | "SELL";
  quoteQty?: number; // for BUY: spend this much USDT
  quantity?: number; // for SELL: sell this much base asset
  clientOrderId?: string;
}): Promise<{
  verdict: "FILLED" | "REJECTED" | "PENDING_BRIDGE" | "ERROR";
  orderId?: number;
  executedQty?: number;
  cummulativeQuoteQty?: number;
  status?: string;
  errorDetail?: string;
}> {
  const params: Record<string, string | number> = {
    symbol: opts.symbol,
    side: opts.side,
    type: "MARKET",
    newOrderRespType: "FULL",
  };
  if (opts.quoteQty != null) params.quoteOrderQty = opts.quoteQty;
  if (opts.quantity != null) params.quantity = opts.quantity;
  if (opts.clientOrderId) params.newClientOrderId = opts.clientOrderId.slice(0, 36);

  const r = await signedFetch("/api/v3/order", params, "POST");
  if (!r.ok && r.status === 0) return { verdict: "PENDING_BRIDGE" };
  if (!r.ok) {
    const d = r.data as { msg?: string; code?: number };
    return {
      verdict: "REJECTED",
      errorDetail: `HTTP ${r.status} code=${d?.code ?? "?"} ${String(d?.msg ?? "").slice(0, 160)}`,
    };
  }
  const d = r.data as {
    orderId: number;
    status: string;
    executedQty: string;
    cummulativeQuoteQty: string;
  };
  return {
    verdict: d.status === "FILLED" ? "FILLED" : "REJECTED",
    orderId: d.orderId,
    executedQty: parseFloat(d.executedQty),
    cummulativeQuoteQty: parseFloat(d.cummulativeQuoteQty),
    status: d.status,
  };
}

/** All open orders on testnet (spot has no "positions"; open orders = exposure). */
export async function binanceTestnetOpenOrders(): Promise<{
  verdict: "KEYS_VALID" | "PENDING_BRIDGE" | "ERROR";
  count?: number;
  errorDetail?: string;
}> {
  const r = await signedFetch("/api/v3/openOrders", {});
  if (!r.ok && r.status === 0) return { verdict: "PENDING_BRIDGE" };
  if (!r.ok) {
    const d = r.data as { msg?: string };
    return { verdict: "ERROR", errorDetail: String(d?.msg ?? "").slice(0, 160) };
  }
  return { verdict: "KEYS_VALID", count: Array.isArray(r.data) ? r.data.length : 0 };
}
