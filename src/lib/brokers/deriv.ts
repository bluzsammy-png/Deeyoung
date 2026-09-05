// DEEYOUNG PRO — Deriv native API connector (official websocket API).
//
// Deriv accounts that are NOT MetaTrader (DTrader synthetic/forex/crypto
// accounts) have an official websocket API. The user creates an API token in
// their Deriv account (Settings > API token, scopes: read + trade), pastes it
// here, and the server reads the account with that token to verify it before
// anything is stored. Trade execution uses multiplier contracts (MULTUP /
// MULTDOWN), the closest Deriv product to a long/short position with market
// entry and market exit.
//
// Honesty rules encoded here:
//   - every result comes from a real Deriv API response; a failure returns
//     ok=false with the API's own error message, never a locally invented fill;
//   - the account type is surfaced honestly (VRTC* login ids are demo accounts);
//   - no order is placed on any symbol that Deriv does not list for the account.
//
// Transport: Node 22+ ships a stable global WebSocket; the production image
// (Node 22) and this sandbox (Node 24) both have it, so no dependency is added.

export interface DerivCallResult<T = Record<string, unknown>> {
  ok: boolean;
  code?: number;
  detail: string;
  data?: T;
}

const DERIV_WS_DEFAULT = "wss://ws.derivws.com/websockets/v3";
function derivWsUrl(): string {
  const url = process.env.DERIV_WS_URL?.trim();
  if (url) return url;
  const appId = process.env.DERIV_APP_ID?.trim() || "1089"; // Deriv's public app id for API clients
  return `${DERIV_WS_DEFAULT}?app_id=${appId}&l=EN&brand=deriv`;
}

interface DerivErrorShape { code: string; message: string }

/** One websocket, optionally authorize first, send one payload, await its
 *  response by req_id, close. Bounded by `timeoutMs`. With `authorizeOnly`,
 *  the authorize response itself is the answer (no second call is sent). */
async function derivCall(
  payload: Record<string, unknown>,
  opts: { authorizeToken?: string; timeoutMs?: number; authorizeOnly?: boolean } = {},
): Promise<DerivCallResult> {
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const url = derivWsUrl();
  return new Promise<DerivCallResult>((resolve) => {
    let settled = false;
    const finish = (r: DerivCallResult) => {
      if (settled) return;
      settled = true;
      try { ws?.close(); } catch { /* already closed */ }
      resolve(r);
    };
    let ws: WebSocket | null = null;
    const timer = setTimeout(() => finish({ ok: false, code: 504, detail: "Deriv API did not answer in time. Retry in a moment." }), timeoutMs);
    try {
      ws = new WebSocket(url);
    } catch (e) {
      clearTimeout(timer);
      finish({ ok: false, code: 502, detail: `Could not reach the Deriv API: ${String(e).slice(0, 120)}` });
      return;
    }
    let reqId = 1;
    const authId = opts.authorizeToken ? ++reqId : 0;
    const callId = ++reqId;
    ws.onopen = () => {
      if (opts.authorizeToken) {
        ws?.send(JSON.stringify({ authorize: opts.authorizeToken, req_id: authId }));
      } else {
        ws?.send(JSON.stringify({ ...payload, req_id: callId }));
      }
    };
    ws.onmessage = (ev: MessageEvent) => {
      let msg: Record<string, unknown>;
      try { msg = JSON.parse(String(ev.data)) as Record<string, unknown>; } catch { return; }
      const rid = typeof msg.req_id === "number" ? msg.req_id : 0;
      const err = msg.error as DerivErrorShape | undefined;
      if (rid === authId) {
        if (err) {
          clearTimeout(timer);
          finish({ ok: false, code: 401, detail: `Deriv rejected the API token: ${err.message ?? err.code ?? "authorization error"}` });
          return;
        }
        if (opts.authorizeOnly) {
          clearTimeout(timer);
          finish({ ok: true, detail: "OK", data: msg });
          return;
        }
        // authorized — now send the real call
        ws?.send(JSON.stringify({ ...payload, req_id: callId }));
        return;
      }
      if (rid === callId) {
        clearTimeout(timer);
        if (err) {
          finish({ ok: false, code: 422, detail: `Deriv API error: ${err.message ?? err.code ?? "request failed"}` });
        } else {
          finish({ ok: true, detail: "OK", data: msg });
        }
      }
    };
    ws.onerror = () => {
      clearTimeout(timer);
      finish({ ok: false, code: 502, detail: "Could not reach the Deriv API websocket." });
    };
    ws.onclose = () => {
      clearTimeout(timer);
      finish({ ok: false, code: 502, detail: "The Deriv API connection closed before answering." });
    };
  });
}

export interface DerivAccount {
  loginid: string;
  currency: string;
  balance: number;
  isVirtual: boolean;
  fullname: string;
  landing: string;
}

interface AuthorizePayload {
  authorize: { loginid: string; currency: string; balance: number; is_virtual: number; fullname: string; landing_company_name: string };
}

/** Read the account with the user's own token. This is the verification. */
export async function derivAuthorize(token: string): Promise<DerivCallResult<DerivAccount>> {
  const res = await derivCall({}, { authorizeToken: token, authorizeOnly: true });
  if (!res.ok || !res.data) return { ok: res.ok, code: res.code, detail: res.detail };
  const a = (res.data as unknown as AuthorizePayload).authorize;
  if (!a?.loginid) return { ok: false, detail: "Deriv answered but returned no account snapshot." };
  return {
    ok: true,
    detail: "OK",
    data: {
      loginid: a.loginid,
      currency: a.currency ?? "USD",
      balance: typeof a.balance === "number" ? a.balance : 0,
      isVirtual: a.is_virtual === 1,
      fullname: a.fullname ?? "",
      landing: a.landing_company_name ?? "",
    },
  };
}

export interface DerivSymbol { symbol: string; display_name: string; market: string; submarket: string }

interface ActiveSymbolsPayload { active_symbols: Array<{ symbol: string; display_name: string; market: string; submarket: string }> }

/** Symbols tradable on this account (crypto market only is what the engine needs). */
export async function derivActiveSymbols(token: string): Promise<DerivCallResult<DerivSymbol[]>> {
  const res = await derivCall({ active_symbols: "brief", product_type: "basic" }, { authorizeToken: token });
  if (!res.ok || !res.data) return { ok: res.ok, code: res.code, detail: res.detail };
  const list = (res.data as unknown as ActiveSymbolsPayload).active_symbols ?? [];
  return { ok: true, detail: "OK", data: list };
}

// 10-minute cache of the crypto symbol list per token hash, so the fan-out
// does not hammer Deriv with active_symbols on every signal.
const symbolCache = new Map<string, { at: number; symbols: DerivSymbol[] }>();
const SYMBOL_CACHE_MS = 10 * 60_000;

function cacheKey(token: string): string {
  // Only a digest of the token is used as the cache key — never the token.
  let h = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) { h ^= token.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16);
}

/** Map an engine symbol (SOLUSD) to a Deriv crypto symbol (crySOLUSD...).
 *  Returns null when Deriv does not list the asset — the caller records that
 *  honestly instead of inventing a substitute. */
export async function derivCryptoSymbol(token: string, engineSymbol: string): Promise<DerivSymbol | null> {
  const base = engineSymbol.replace(/USD$/i, "").toUpperCase();
  const key = cacheKey(token);
  const hit = symbolCache.get(key);
  const fresh = hit && Date.now() - hit.at <= SYMBOL_CACHE_MS ? hit.symbols : undefined;
  let symbols: DerivSymbol[] | undefined = fresh;
  if (!symbols) {
    const res = await derivActiveSymbols(token);
    if (!res.ok || !res.data) return null;
    symbols = res.data;
    symbolCache.set(key, { at: Date.now(), symbols });
  }
  const exact = symbols.find((s) => s.symbol.toLowerCase() === `cry${base.toLowerCase()}usd`);
  if (exact) return exact;
  return symbols.find((s) =>
    s.market === "cryptocurrency" && s.symbol.toLowerCase().startsWith(`cry${base.toLowerCase()}`),
  ) ?? null;
}

export interface DerivMultiplierBuy {
  contract_id: number;
  buy_price: number;
  stake?: number;
  multiplier?: number;
}

interface BuyPayload { buy: { contract_id: number; buy_price: number; payout?: number } }

/** Open a multiplier position. side BUY = MULTUP (long), SELL = MULTDOWN (short).
 *  `stopLossUsd`/`takeProfitUsd` are monetary, in account currency, relative to
 *  the stake (Deriv semantics). 0 disables the guard. */
export async function derivBuyMultiplier(
  token: string,
  opts: {
    symbol: string; // Deriv symbol, e.g. crySOLUSD
    side: "BUY" | "SELL";
    currency: string;
    stakeUsd: number;
    multiplier: number;
    stopLossUsd?: number;
    takeProfitUsd?: number;
  },
): Promise<DerivCallResult<DerivMultiplierBuy>> {
  const params: Record<string, unknown> = {
    amount: +opts.stakeUsd.toFixed(2),
    basis: "stake",
    contract_type: opts.side === "BUY" ? "MULTUP" : "MULTDOWN",
    currency: opts.currency,
    multiplier: opts.multiplier,
    symbol: opts.symbol,
  };
  if (opts.stopLossUsd && opts.stopLossUsd > 0) params.stop_loss = +opts.stopLossUsd.toFixed(2);
  if (opts.takeProfitUsd && opts.takeProfitUsd > 0) params.take_profit = +opts.takeProfitUsd.toFixed(2);
  // buy "price" = maximum acceptable total cost (stake + commission). Allow a
  // small commission headroom so the order is not rejected on rounding.
  const maxPrice = +(opts.stakeUsd * 1.05).toFixed(2);
  const res = await derivCall({ buy: "1", price: maxPrice, parameters: params }, { authorizeToken: token });
  if (!res.ok || !res.data) return { ok: res.ok, code: res.code, detail: res.detail };
  const b = (res.data as unknown as BuyPayload).buy;
  if (!b?.contract_id) return { ok: false, detail: "Deriv accepted the request but returned no contract id." };
  return {
    ok: true,
    detail: "OK",
    data: { contract_id: b.contract_id, buy_price: b.buy_price, stake: params.amount as number, multiplier: opts.multiplier },
  };
}

export interface DerivSellResult { sold_for: number; contract_id: number }

interface SellPayload { sell: { sold_for: number; contract_id: number } }

/** Close a multiplier position at market. */
export async function derivSellContract(token: string, contractId: number): Promise<DerivCallResult<DerivSellResult>> {
  // price 0 = accept the market price (contract value positive)
  const res = await derivCall({ sell: contractId, price: 0 }, { authorizeToken: token });
  if (!res.ok || !res.data) return { ok: res.ok, code: res.code, detail: res.detail };
  const s = (res.data as unknown as SellPayload).sell;
  if (!s || typeof s.sold_for !== "number") return { ok: false, detail: "Deriv did not return a close price for the contract." };
  return { ok: true, detail: "OK", data: { sold_for: s.sold_for, contract_id: s.contract_id } };
}

export interface DerivContractState {
  entrySpot?: number;
  currentSpot?: number;
  isSold: boolean;
  profit?: number;
}

interface OpenContractPayload {
  proposal_open_contract: { contract_id: number; entry_spot?: number; current_spot?: number; is_sold?: number; profit?: number };
}

/** Read a contract's live state from Deriv (used to confirm entries/exits). */
export async function derivOpenContract(token: string, contractId: number): Promise<DerivCallResult<DerivContractState>> {
  const res = await derivCall({ proposal_open_contract: 1, contract_id: contractId }, { authorizeToken: token });
  if (!res.ok || !res.data) return { ok: res.ok, code: res.code, detail: res.detail };
  const c = (res.data as unknown as OpenContractPayload).proposal_open_contract;
  if (!c) return { ok: false, detail: "Deriv returned no contract state." };
  return {
    ok: true,
    detail: "OK",
    data: {
      entrySpot: typeof c.entry_spot === "number" ? c.entry_spot : undefined,
      currentSpot: typeof c.current_spot === "number" ? c.current_spot : undefined,
      isSold: c.is_sold === 1,
      profit: typeof c.profit === "number" ? c.profit : undefined,
    },
  };
}

/** Sizing guard rails for mirrored Deriv trades. */
export function derivStakeClamp(stake: number | null | undefined): number {
  const v = typeof stake === "number" && stake > 0 ? stake : 5;
  return Math.min(100, Math.max(1, Math.round(v * 100) / 100));
}
export const DERIV_MULTIPLIER_DEFAULT = 50;
