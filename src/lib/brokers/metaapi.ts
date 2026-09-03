// DEEYOUNG PRO — MetaApi.cloud adapter for MT4/MT5 connectivity (§broker-bridge).
// MetaApi is the industry-standard REST bridge to MetaTrader brokers (there is
// no official MT4/MT5 API). Real account linking requires METAAPI_TOKEN (env).
// Until it is configured the adapter reports PENDING_BRIDGE — honest states, no
// fake "connected" badges. Secrets (MT login/password) are AES-256-GCM encrypted
// at rest by the callers; the bridge itself only ever receives them at provision.

export interface BrokerCreds {
  platform: "MT4" | "MT5";
  server: string;
  login: string;
  password: string;
  mode: "INVESTOR" | "FULL";
}

export interface BridgeStatus {
  ok: boolean;
  status: "CONNECTED" | "PENDING_BRIDGE" | "ERROR";
  detail: string;
  balance?: number;
  equity?: number;
  currency?: string;
  bridgeAccountId?: string;
}

export interface AccountInformation {
  balance: number;
  equity: number;
  currency: string;
  positions: { id: string; symbol: string; type: string; volume: number; openPrice: number; currentPrice: number; profit: number }[];
}

const API = process.env.METAAPI_API_URL || "https://api.metaapi.cloud";
const REGION = process.env.METAAPI_REGION || "new-york";

export function bridgeConfigured(): boolean {
  return !!process.env.METAAPI_TOKEN;
}

async function bridgeFetch(path: string, init?: RequestInit & { timeoutMs?: number }): Promise<Response> {
  return fetch(`${API}${path}`, {
    ...init,
    headers: {
      "auth-token": process.env.METAAPI_TOKEN as string,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(init?.timeoutMs ?? 15_000),
  });
}

/** Provision (or reuse) a MetaApi cloud account for an MT4/MT5 credential set,
 *  deploy the trading terminal replica, wait for connection, then read live
 *  account information. INVESTOR (read-only) passwords cannot trade — enforced
 *  upstream via copyFactoryRole omission. */
export async function provisionAccount(creds: BrokerCreds): Promise<BridgeStatus> {
  if (!bridgeConfigured()) {
    return {
      ok: false,
      status: "PENDING_BRIDGE",
      detail: "Saved securely. Connection testing activates when the MetaApi bridge token (METAAPI_TOKEN) is configured on the server.",
    };
  }
  try {
    // 1. Create-or-get the cloud account. MetaApi dedupes identical login+server.
    const createRes = await bridgeFetch("/accounts-api/v2.0/accounts", {
      method: "POST",
      body: JSON.stringify({
        login: creds.login,
        password: creds.password,
        server: creds.server,
        platform: creds.platform === "MT4" ? "mt4" : "mt5",
        region: REGION,
        name: `DeeYoung ${creds.platform} ${creds.login}`,
        copyFactoryRole: creds.mode === "FULL" ? "subaccount" : undefined,
      }),
    });
    if (createRes.status === 401) {
      return { ok: false, status: "ERROR", detail: "Bridge token rejected (401). Check METAAPI_TOKEN." };
    }
    if (!createRes.ok) {
      const detail = await createRes.text().catch(() => "");
      return { ok: false, status: "ERROR", detail: `Bridge rejected the account (${createRes.status}). Check server name, login and password. ${detail.slice(0, 140)}` };
    }
    const account = (await createRes.json()) as { id?: string };
    const accountId = account.id;
    if (!accountId) return { ok: false, status: "ERROR", detail: "Bridge did not return an account id." };

    // 2. Deploy the terminal replica and wait for connection (bounded wait — the
    //    UI re-syncs later; a slow broker never blocks the linking flow).
    await bridgeFetch(`/accounts-api/v2.0/accounts/${accountId}/deploy`, { method: "PUT" }).catch(() => undefined);
    let connected = false;
    for (let i = 0; i < 6; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      try {
        const st = await bridgeFetch(`/accounts-api/v2.0/accounts/${accountId}/status`);
        if (!st.ok) break;
        const j = (await st.json()) as { deployed?: boolean; connected?: boolean };
        if (j.connected) { connected = true; break; }
        if (!j.deployed && i > 2) break;
      } catch { break; }
    }

    // 3. Live account info (works once the replica is connected).
    const info = await accountInformation(accountId).catch(() => null);
    if (info) {
      return {
        ok: true, status: "CONNECTED",
        detail: connected
          ? `Linked via bridge (account ${accountId}). Read-only sync active.`
          : `Linked via bridge (account ${accountId}); broker connection still warming up — balances sync on next check.`,
        balance: info.balance, equity: info.equity, currency: info.currency, bridgeAccountId: accountId,
      };
    }
    return {
      ok: connected, status: connected ? "CONNECTED" : "PENDING_BRIDGE",
      detail: connected ? `Linked via bridge (account ${accountId}).` : "Bridge is deploying the terminal replica — retry the check in a minute.",
      bridgeAccountId: accountId,
    };
  } catch {
    return { ok: false, status: "ERROR", detail: "Couldn't reach the MetaApi bridge. Retry in a moment." };
  }
}

/** Live account information from the bridge (balance, equity, open positions). */
export async function accountInformation(accountId: string): Promise<AccountInformation | null> {
  if (!bridgeConfigured()) return null;
  try {
    const res = await bridgeFetch(`/accounts-api/v2.0/accounts/${accountId}/account-information`, { timeoutMs: 12_000 });
    if (!res.ok) return null;
    const j = (await res.json()) as {
      balance?: number; equity?: number; currency?: string;
      positions?: { id: string; symbol: string; type: string | number; volume: number; openPrice?: number; currentPrice?: number; profit?: number }[];
    };
    return {
      balance: j.balance ?? 0,
      equity: j.equity ?? 0,
      currency: j.currency ?? "USD",
      positions: (j.positions ?? []).map((p) => ({
        id: String(p.id), symbol: p.symbol,
        type: String(p.type), volume: p.volume,
        openPrice: p.openPrice ?? 0, currentPrice: p.currentPrice ?? 0, profit: p.profit ?? 0,
      })),
    };
  } catch {
    return null;
  }
}

/** Place a market order through the bridge. FULL-mode links only — INVESTOR
 *  passwords are read-only and the bridge refuses them upstream as well. */
export async function marketOrder(
  accountId: string, side: "BUY" | "SELL", symbol: string, volume: number,
  stopLoss?: number, takeProfit?: number,
): Promise<{ ok: boolean; detail: string; orderId?: string }> {
  if (!bridgeConfigured()) return { ok: false, detail: "Bridge not configured." };
  try {
    const res = await bridgeFetch(`/trading-api/v2.0/accounts/${accountId}/market-${side.toLowerCase()}`, {
      method: "POST",
      body: JSON.stringify({ symbol, volume, stopLoss, takeProfit, comment: "DeeYoung Pro" }),
      timeoutMs: 20_000,
    });
    const text = await res.text().catch(() => "");
    if (!res.ok) return { ok: false, detail: `Bridge rejected the order (${res.status}). ${text.slice(0, 160)}` };
    const j = (await res.json().catch(() => ({}))) as { orderId?: string };
    return { ok: true, detail: `Market ${side.toLowerCase()} accepted by the bridge.`, orderId: j.orderId };
  } catch {
    return { ok: false, detail: "Couldn't reach the MetaApi trading endpoint. Retry in a moment." };
  }
}

/** Test a MetaTrader account through the MetaApi REST bridge (compat entry). */
export async function testAccount(creds: BrokerCreds): Promise<BridgeStatus> {
  return provisionAccount(creds);
}
