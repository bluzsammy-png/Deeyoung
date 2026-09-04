// DEEYOUNG PRO — OKX REST adapter (demo-first, live-capable).
// 2026-09-04 "go" build: user approved live-mode venue work with OKX demo as
// the recommended ramp (their residential IP passes signup; keys are the ONLY
// human step). Adapter is fully key-ready: with no keys it reports
// PENDING_KEYS and every call short-circuits — nothing is faked.
//
// Signing (OKX API v5): OKX-ACCESS-SIGN = Base64(HMAC-SHA256(
//   timestamp + method + requestPath(+query) + body, secret))
// Headers: OKX-ACCESS-KEY / OKX-ACCESS-SIGN / OKX-ACCESS-TIMESTAMP (ISO) /
//   OKX-ACCESS-PASSPHRASE / x-simulated-trading: 1 (demo env only).
// Spot market BUY: sz is in QUOTE ccy (USDT) — perfect for notional entries.
// Spot market SELL: sz is in BASE ccy — the exact qty the buy filled.
// clOrdId: alphanumeric ≤32 — engine oids contain "_", so we derive a safe
//   deterministic id: "DY" + sha256(oid).hex.slice(0,14) (16 chars).

const BASE = process.env.OKX_BASE_URL || "https://www.okx.com";
const TIMEOUT_MS = 12_000;

/** True when the adapter targets the SELF-HOSTED OKX-wire simulator
 *  (/api/sim/okx route in this same app) instead of real OKX. Used purely
 *  for honest labeling — behavior is identical either way. */
export function okxSimMode(): boolean {
  return BASE.includes("/api/sim/okx");
}
export function okxTargetLabel(): string {
  return okxSimMode() ? "okx-sim (self-hosted simulator)" : (process.env.OKX_BASE_URL || "okx.com");
}

export interface OkxCreds {
  key: string;
  secret: string;
  passphrase: string;
  demo: boolean;
}

export function okxCreds(): OkxCreds | null {
  const key = process.env.OKX_API_KEY;
  const secret = process.env.OKX_API_SECRET;
  const passphrase = process.env.OKX_API_PASSPHRASE;
  if (!key || !secret || !passphrase) return null;
  return { key, secret, passphrase, demo: (process.env.OKX_ENV || "demo") !== "live" };
}

export function okxConfigured(): boolean {
  return okxCreds() !== null;
}

export function okxEnvLabel(): string {
  if (okxSimMode()) return "sim (self-hosted)";
  const c = okxCreds();
  if (!c) return "unset";
  return c.demo ? "demo (x-simulated-trading)" : "LIVE";
}

/** Engine order id → OKX-safe clOrdId (deterministic, 16 chars, alphanumeric). */
export async function toClOrdId(engineOid: string): Promise<string> {
  const { createHash } = await import("crypto");
  return "DY" + createHash("sha256").update(engineOid).digest("hex").slice(0, 14);
}

/** BTCUSD → BTC-USDT */
export function engineSymbolToInstId(sym: string): string {
  return sym.replace(/USD$/, "") + "-USDT";
}

/** OKX-ACCESS-SIGN = Base64(HMAC-SHA256(ts+method+requestPath+body, secret)). */
export async function okxAccessSign(
  ts: string, method: "GET" | "POST", requestPath: string, body: string, secret: string,
): Promise<string> {
  const { createHmac } = await import("crypto");
  return createHmac("sha256", secret).update(`${ts}${method}${requestPath}${body}`).digest("base64");
}

async function signedFetch<T>(
  path: string,
  method: "GET" | "POST",
  body?: Record<string, unknown>,
): Promise<T> {
  const creds = okxCreds();
  if (!creds) throw new Error("OKX keys not set");

  const requestPath = path; // includes ?query for GETs
  const bodyStr = body ? JSON.stringify(body) : "";
  const ts = new Date().toISOString();
  const sign = await okxAccessSign(ts, method, requestPath, bodyStr, creds.secret);

  const res = await fetch(`${BASE}${requestPath}`, {
    method,
    // AUDIT FIX (sim-caught, 2026-09-04): the signed body was never attached
    // to the request — POSTs went out bodyless, so every market order would
    // have been rejected (bad-signature/params) on real OKX too.
    ...(method === "POST" && bodyStr ? { body: bodyStr } : {}),
    headers: {
      "OKX-ACCESS-KEY": creds.key,
      "OKX-ACCESS-SIGN": sign,
      "OKX-ACCESS-TIMESTAMP": ts,
      "OKX-ACCESS-PASSPHRASE": creds.passphrase,
      "Content-Type": "application/json",
      ...(creds.demo ? { "x-simulated-trading": "1" } : {}),
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const j = (await res.json().catch(() => null)) as
    | { code?: string; msg?: string; data?: T }
    | null;
  if (!res.ok || !j || (j.code !== "0")) {
    throw new Error(`okx ${res.status} code=${j?.code ?? "?"} msg=${(j?.msg ?? "no body").slice(0, 80)}`);
  }
  return j.data as T;
}

export interface OkxAccountSummary {
  verdict: "KEYS_VALID" | "PENDING_KEYS" | "ERROR";
  latencyMs?: number;
  env?: string;
  usdtCashBal?: string;
  detail?: string;
}

/** GET /api/v5/account/balance (ccy=USDT) — key validity probe, aggregates only. */
export async function okxAccountSummary(): Promise<OkxAccountSummary> {
  if (!okxConfigured()) return { verdict: "PENDING_KEYS", env: "unset" };
  const t0 = Date.now();
  try {
    const data = await signedFetch<Array<{ details?: Array<{ ccy?: string; cashBal?: string }> }>>(
      "/api/v5/account/balance?ccy=USDT",
      "GET",
    );
    const bal = data?.[0]?.details?.[0]?.cashBal;
    return {
      verdict: "KEYS_VALID",
      latencyMs: Date.now() - t0,
      env: okxEnvLabel(),
      ...(bal !== undefined ? { usdtCashBal: bal } : {}),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { verdict: "ERROR", latencyMs: Date.now() - t0, env: okxEnvLabel(), detail: msg.slice(0, 120) };
  }
}

export interface OkxOrderResult {
  ok: boolean;
  clOrdId: string;
  venueOrdId?: string;
  state?: string; // live | partially_filled | filled | canceled
  avgPx?: number;
  accFillSz?: number;
  fee?: number;
  raw?: string;
  error?: string;
}

/** POST /api/v5/trade/order — spot MARKET order.
 *  side=buy:  szUsdt = notional in USDT (quote ccy).
 *  side=sell: szBase = qty in base ccy. */
export async function okxMarketOrder(opts: {
  instId: string;
  side: "buy" | "sell";
  clOrdId: string;
  szUsdt?: number;
  szBase?: number;
}): Promise<OkxOrderResult> {
  const sz = opts.side === "buy" ? opts.szUsdt : opts.szBase;
  if (!(sz && sz > 0)) return { ok: false, clOrdId: opts.clOrdId, error: "BAD_SIZE" };
  try {
    const data = await signedFetch<Array<{ ordId?: string; sCode?: string; sMsg?: string }>>(
      "/api/v5/trade/order",
      "POST",
      {
        instId: opts.instId,
        tdMode: "cash",
        side: opts.side,
        ordType: "market",
        sz: String(sz),
        clOrdId: opts.clOrdId,
        ...(opts.side === "buy" ? { tgtCcy: "quote_ccy" } : {}),
      },
    );
    const row = data?.[0];
    if (row?.sCode && row.sCode !== "0") {
      return { ok: false, clOrdId: opts.clOrdId, error: `sCode=${row.sCode} ${row.sMsg ?? ""}`.slice(0, 100) };
    }
    return { ok: true, clOrdId: opts.clOrdId, venueOrdId: row?.ordId };
  } catch (e) {
    return { ok: false, clOrdId: opts.clOrdId, error: (e instanceof Error ? e.message : String(e)).slice(0, 120) };
  }
}

/** GET /api/v5/trade/order — poll fill state by clOrdId. */
export async function okxOrderInfo(instId: string, clOrdId: string): Promise<OkxOrderResult> {
  try {
    const data = await signedFetch<
      Array<{ ordId?: string; clOrdId?: string; state?: string; avgPx?: string; accFillSz?: string; fee?: string }>
    >(`/api/v5/trade/order?instId=${encodeURIComponent(instId)}&clOrdId=${encodeURIComponent(clOrdId)}`, "GET");
    const row = data?.[0];
    if (!row) return { ok: false, clOrdId, error: "NO_SUCH_ORDER" };
    return {
      ok: true,
      clOrdId,
      venueOrdId: row.ordId,
      state: row.state,
      avgPx: row.avgPx ? Number(row.avgPx) : undefined,
      accFillSz: row.accFillSz ? Number(row.accFillSz) : undefined,
      fee: row.fee ? Number(row.fee) : undefined,
    };
  } catch (e) {
    return { ok: false, clOrdId, error: (e instanceof Error ? e.message : String(e)).slice(0, 120) };
  }
}
