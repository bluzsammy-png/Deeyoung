// DEEYOUNG PRO — MetaApi.cloud REST bridge for MetaTrader 4/5 accounts.
//
// MT4/MT5 brokers (Deriv, IC Markets, FTMO, Pepperstone, ...) expose no
// official HTTP API. MetaApi cloud is the industry-standard bridge: it
// provisions a terminal replica for the user's MT login and serves REST +
// RPC for it. The USER supplies their own MetaApi API token (created at
// app.metaapi.cloud, "API access tokens"); a server-wide METAAPI_TOKEN env
// is an optional fallback. Nothing here invents states: if the broker has
// not answered, the link is not marked connected and nothing is stored.
//
// Documented surface used here (classic REST API, auth-token header):
//   provisioning  POST/GET /users/current/accounts          (api-v1.metaapi.cloud)
//                 PUT /users/current/accounts/{id}/deploy
//   client        GET  /users/current/accounts/{id}/account-information
//                 GET  /users/current/accounts/{id}/positions
//                 POST /users/current/accounts/{id}/trade
//                 POST /users/current/accounts/{id}/close-position
//                 POST /users/current/accounts/{id}/rpc  (get_symbols,
//                                                         get_symbol_specification)
// Numeric values from RPC arrive stringified ("numerictypes") — every number
// is coerced through num() before use.

export interface MetaApiCreds {
  platform: "MT4" | "MT5";
  server: string;
  login: string;
  password: string;
  mode: "INVESTOR" | "FULL";
  region: string;
  token: string;
}

export interface BridgeStatus {
  ok: boolean;
  status: "CONNECTED" | "ERROR";
  detail: string;
  balance?: number;
  equity?: number;
  currency?: string;
  bridgeAccountId?: string;
}

export interface BridgePosition {
  id: string;
  symbol: string;
  type: string;
  volume: number;
  openPrice: number;
  currentPrice: number;
  profit: number;
}

export interface AccountInformation {
  balance: number;
  equity: number;
  currency: string;
  positions: BridgePosition[];
}

export interface SymbolSpec {
  contractSize: number;
  volumeMin: number;
  volumeMax: number;
  volumeStep: number;
}

export const REGIONS = ["new-york", "london", "singapore", "sydney"] as const;

const PROVISIONING_HOSTS = [
  process.env.METAAPI_PROVISIONING_URL || "https://api-v1.metaapi.cloud",
  "https://mt-provisioning-api-v1.agiliumtrade.ai",
];
const CLIENT_HOSTS = [
  process.env.METAAPI_CLIENT_URL || "https://mt-client-api-v1.agiliumtrade.ai",
  "https://api-v1.metaapi.cloud",
];

export function bridgeConfigured(): boolean {
  return !!(process.env.METAAPI_TOKEN || "").trim();
}

/** The token that authorizes the bridge call: the link's own MetaApi token
 *  first, server env fallback second. Returns null when neither exists. */
export function bridgeToken(userToken?: string): string | null {
  const t = (userToken ?? "").trim() || (process.env.METAAPI_TOKEN ?? "").trim();
  return t ? t : null;
}

function num(x: unknown, fallback = 0): number {
  const n = typeof x === "number" ? x : typeof x === "string" ? parseFloat(x) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

async function bridgeFetch(
  hosts: string[],
  path: string,
  token: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<Response> {
  let lastErr: unknown = null;
  for (const host of hosts) {
    try {
      return await fetch(`${host}${path}`, {
        ...init,
        headers: {
          "auth-token": token,
          "Content-Type": "application/json",
          ...(init?.headers ?? {}),
        },
        signal: AbortSignal.timeout(init?.timeoutMs ?? 20_000),
      });
    } catch (e) {
      lastErr = e; // host unreachable — try the next documented host
    }
  }
  throw lastErr ?? new Error("bridge unreachable");
}

// ── Provisioning ─────────────────────────────────────────────────────────────

interface AccountEntity {
  _id?: string;
  login?: string;
  server?: string;
  platform?: string;
  region?: string;
  deployed?: boolean;
  connectionStatus?: string;
}

export async function listAccounts(token: string): Promise<{ ok: boolean; code: number; accounts?: AccountEntity[]; detail?: string }> {
  try {
    const res = await bridgeFetch(PROVISIONING_HOSTS, "/users/current/accounts", token, { timeoutMs: 15_000 });
    if (res.status === 401) return { ok: false, code: 401, detail: "MetaApi rejected the token (401). Create a fresh one at app.metaapi.cloud under API access tokens." };
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, code: res.status, detail: `Bridge answered ${res.status}. ${body.slice(0, 140)}` };
    }
    const j = await res.json().catch(() => null);
    return { ok: true, code: 200, accounts: Array.isArray(j) ? (j as AccountEntity[]) : [] };
  } catch {
    return { ok: false, code: 0, detail: "The MetaApi bridge is unreachable from this server right now. Retry in a moment." };
  }
}

/** Create (or reuse) the cloud replica of the user's MT account, deploy it,
 *  and wait for the broker to answer a real account read. Bounded wait: a
 *  slow or wrong-credential account fails honestly instead of blocking. */
export async function provisionAccount(creds: MetaApiCreds): Promise<BridgeStatus> {
  const listed = await listAccounts(creds.token);
  if (!listed.ok) {
    return { ok: false, status: "ERROR", detail: listed.detail ?? "Bridge rejected the token." };
  }

  const match = (listed.accounts ?? []).find(
    (a) => a.login === creds.login && a.server === creds.server && (a.platform ?? "").toLowerCase() === creds.platform.toLowerCase(),
  );

  let accountId = match?._id;
  if (accountId) {
    // Reuse: refresh stored credentials so a corrected password takes effect.
    await bridgeFetch(
      PROVISIONING_HOSTS,
      `/users/current/accounts/${accountId}`,
      creds.token,
      {
        method: "PUT",
        body: JSON.stringify({
          login: creds.login,
          password: creds.password,
          server: creds.server,
          platform: creds.platform.toLowerCase(),
          region: creds.region,
          name: `DeeYoung ${creds.platform} ${creds.login}`,
        }),
        timeoutMs: 15_000,
      },
    ).catch(() => undefined);
  } else {
    try {
      const res = await bridgeFetch(PROVISIONING_HOSTS, "/users/current/accounts", creds.token, {
        method: "POST",
        body: JSON.stringify({
          login: creds.login,
          password: creds.password,
          server: creds.server,
          platform: creds.platform.toLowerCase(),
          region: creds.region,
          name: `DeeYoung ${creds.platform} ${creds.login}`,
          copyFactoryRole: creds.mode === "FULL" ? "subaccount" : undefined,
        }),
        timeoutMs: 20_000,
      });
      if (res.status === 401) return { ok: false, status: "ERROR", detail: "MetaApi rejected the token (401). Check the token you pasted." };
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return {
          ok: false,
          status: "ERROR",
          detail: `The bridge refused this account (HTTP ${res.status}). Check the server name, login and password. ${body.slice(0, 160)}`,
        };
      }
      const j = (await res.json().catch(() => ({}))) as AccountEntity;
      accountId = j._id;
    } catch {
      return { ok: false, status: "ERROR", detail: "The MetaApi bridge is unreachable from this server right now. Retry in a moment." };
    }
  }
  if (!accountId) return { ok: false, status: "ERROR", detail: "The bridge did not return an account id." };

  // Deploy (idempotent) and wait for the broker to answer a real read.
  await bridgeFetch(PROVISIONING_HOSTS, `/users/current/accounts/${accountId}/deploy`, creds.token, { method: "PUT", timeoutMs: 15_000 }).catch(() => undefined);

  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const info = await accountInformation(accountId, creds.token);
    if (info.ok && info.info) {
      return {
        ok: true,
        status: "CONNECTED",
        detail: `Verified through the MetaApi bridge: your ${creds.platform} account answered with a live balance snapshot.`,
        balance: info.info.balance,
        equity: info.info.equity,
        currency: info.info.currency,
        bridgeAccountId: accountId,
      };
    }
  }

  return {
    ok: false,
    status: "ERROR",
    detail:
      `The bridge provisioned the account but your broker did not answer a verified read within 60s. ` +
      `Check the server name (copy it exactly from your terminal login dialog), login and password, then connect again — ` +
      `the same bridge account is reused. Nothing was stored here.`,
  };
}

// ── Client (trading) reads ───────────────────────────────────────────────────

export async function accountInformation(accountId: string, token: string): Promise<{ ok: boolean; code: number; info?: AccountInformation; detail?: string }> {
  try {
    const res = await bridgeFetch(CLIENT_HOSTS, `/users/current/accounts/${accountId}/account-information`, token, { timeoutMs: 15_000 });
    if (res.status === 401) return { ok: false, code: 401, detail: "MetaApi rejected the token (401)." };
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, code: res.status, detail: `account-information answered ${res.status}. ${body.slice(0, 120)}` };
    }
    const j = (await res.json()) as {
      balance?: number | string;
      equity?: number | string;
      currency?: string;
      positions?: { id: string | number; symbol: string; type: string | number; volume: number | string; openPrice?: number | string; currentPrice?: number | string; profit?: number | string }[];
    };
    return {
      ok: true,
      code: 200,
      info: {
        balance: num(j.balance),
        equity: num(j.equity),
        currency: j.currency ?? "USD",
        positions: (j.positions ?? []).map((p) => ({
          id: String(p.id),
          symbol: p.symbol,
          type: String(p.type),
          volume: num(p.volume),
          openPrice: num(p.openPrice),
          currentPrice: num(p.currentPrice),
          profit: num(p.profit),
        })),
      },
    };
  } catch {
    return { ok: false, code: 0, detail: "bridge unreachable" };
  }
}

export async function positions(accountId: string, token: string): Promise<BridgePosition[] | null> {
  try {
    const res = await bridgeFetch(CLIENT_HOSTS, `/users/current/accounts/${accountId}/positions`, token, { timeoutMs: 15_000 });
    if (!res.ok) return null;
    const j = await res.json().catch(() => null);
    if (!Array.isArray(j)) return null;
    return (j as AccountInformation["positions"]).map((p) => ({
      id: String(p.id),
      symbol: p.symbol,
      type: String(p.type),
      volume: num(p.volume),
      openPrice: num(p.openPrice),
      currentPrice: num(p.currentPrice),
      profit: num(p.profit),
    }));
  } catch {
    return null;
  }
}

// ── Symbol resolution + specifications ───────────────────────────────────────

const symbolListCache = new Map<string, { names: string[]; at: number }>();
const SYMBOL_CACHE_MS = 10 * 60 * 1000;

async function rpc<T>(accountId: string, token: string, methodName: string, args: unknown[]): Promise<{ ok: boolean; data?: T; detail?: string }> {
  try {
    const res = await bridgeFetch(CLIENT_HOSTS, `/users/current/accounts/${accountId}/rpc`, token, {
      method: "POST",
      body: JSON.stringify({ type: "execute", methodName, arguments: args }),
      timeoutMs: 20_000,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, detail: `rpc ${methodName} answered ${res.status}. ${body.slice(0, 120)}` };
    }
    const j = (await res.json().catch(() => null)) as { data?: T } | null;
    if (!j) return { ok: false, detail: `rpc ${methodName} returned no payload.` };
    return { ok: true, data: (j.data !== undefined ? j.data : (j as unknown as T)) };
  } catch {
    return { ok: false, detail: "bridge unreachable" };
  }
}

export async function symbolList(accountId: string, token: string): Promise<string[] | null> {
  const cached = symbolListCache.get(accountId);
  if (cached && Date.now() - cached.at < SYMBOL_CACHE_MS) return cached.names;
  const r = await rpc<string[]>(accountId, token, "get_symbols", []);
  if (!r.ok || !Array.isArray(r.data)) return null;
  const names = r.data.map((s) => String(s).toUpperCase());
  symbolListCache.set(accountId, { names, at: Date.now() });
  return names;
}

/** Map an engine/universe symbol (SOLUSD, EURUSD, NVDA) to the broker's own
 *  symbol spelling. Exact match first, then prefixes with suffixes (SOLUSD.r,
 *  SOLUSDm), then containment; shortest name wins. Null = broker does not
 *  list it, and the caller must reject honestly. */
export async function resolveBrokerSymbol(accountId: string, token: string, wanted: string): Promise<string | null> {
  const names = await symbolList(accountId, token);
  if (!names || names.length === 0) return null;
  const w = wanted.toUpperCase().replace("/", "");
  if (names.includes(w)) return w;
  const prefixed = names.filter((n) => n.startsWith(w)).sort((a, b) => a.length - b.length);
  if (prefixed.length > 0) return prefixed[0];
  const containing = names.filter((n) => n.includes(w)).sort((a, b) => a.length - b.length);
  if (containing.length > 0) return containing[0];
  return null;
}

export async function symbolSpecification(accountId: string, token: string, brokerSymbol: string): Promise<SymbolSpec | null> {
  const r = await rpc<Record<string, unknown>>(accountId, token, "get_symbol_specification", [brokerSymbol]);
  if (!r.ok || typeof r.data !== "object" || r.data === null) return null;
  const d = r.data as Record<string, unknown>;
  const contractSize = num(d.contractSize);
  if (contractSize <= 0) return null; // no honest sizing without the contract size
  return {
    contractSize,
    volumeMin: num(d.volumeMin, 0.01) || 0.01,
    volumeMax: num(d.volumeMax, 100) || 100,
    volumeStep: num(d.volumeStep, 0.01) || 0.01,
  };
}

// ── Order placement ──────────────────────────────────────────────────────────

/** Market order through the bridge. Returns the broker's own trade result;
 *  fill confirmation is the caller's job (positions poll) — nothing is
 *  reported filled that the broker did not confirm. */
export async function marketOrder(
  accountId: string,
  token: string,
  side: "BUY" | "SELL",
  symbol: string,
  volume: number,
  stopLoss?: number,
  takeProfit?: number,
  clientId?: string,
): Promise<{ ok: boolean; detail: string; orderId?: string; positionId?: string; acceptedPending?: boolean }> {
  try {
    const res = await bridgeFetch(CLIENT_HOSTS, `/users/current/accounts/${accountId}/trade`, token, {
      method: "POST",
      body: JSON.stringify({
        actionType: side === "BUY" ? "ORDER_TYPE_BUY" : "ORDER_TYPE_SELL",
        symbol,
        volume,
        stopLoss: stopLoss && stopLoss > 0 ? stopLoss : undefined,
        takeProfit: takeProfit && takeProfit > 0 ? takeProfit : undefined,
        comment: "DeeYoung Pro",
        clientId: clientId ?? "deeyoung-pro",
      }),
      timeoutMs: 25_000,
    });
    const body = await res.text().catch(() => "");
    if (!res.ok) return { ok: false, detail: `The bridge rejected the order (HTTP ${res.status}). ${body.slice(0, 160)}` };
    const j = JSON.parse(body || "{}") as { numericCode?: number | string; message?: string; orderId?: string | number; positionId?: string | number };
    const code = num(j.numericCode, -1);
    const accepted = code === 10009 || code === 10008 || code === 10010 || code === 0;
    if (!accepted) {
      return { ok: false, detail: `Your broker refused the order (${j.message ?? `retcode ${j.numericCode ?? "?"}`}). See your terminal for details.` };
    }
    return {
      ok: true,
      detail: `Market ${side.toLowerCase()} accepted by your broker.`,
      orderId: j.orderId != null ? String(j.orderId) : undefined,
      positionId: j.positionId != null ? String(j.positionId) : undefined,
      acceptedPending: code === 10008,
    };
  } catch {
    return { ok: false, detail: "Couldn't reach the MetaApi trading endpoint. Retry in a moment." };
  }
}

export async function closePosition(accountId: string, token: string, positionId: string): Promise<{ ok: boolean; detail: string }> {
  try {
    const res = await bridgeFetch(CLIENT_HOSTS, `/users/current/accounts/${accountId}/close-position`, token, {
      method: "POST",
      body: JSON.stringify({ positionId }),
      timeoutMs: 25_000,
    });
    const body = await res.text().catch(() => "");
    if (!res.ok) return { ok: false, detail: `Close rejected (HTTP ${res.status}). ${body.slice(0, 160)}` };
    const j = JSON.parse(body || "{}") as { numericCode?: number | string; message?: string };
    const code = num(j.numericCode, -1);
    if (!(code === 10009 || code === 10010 || code === 0)) {
      return { ok: false, detail: `Your broker refused the close (${j.message ?? `retcode ${j.numericCode ?? "?"}`}).` };
    }
    return { ok: true, detail: "Close accepted by your broker." };
  } catch {
    return { ok: false, detail: "Couldn't reach the MetaApi trading endpoint. Retry in a moment." };
  }
}
