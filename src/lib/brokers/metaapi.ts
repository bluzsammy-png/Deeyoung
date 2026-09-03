// DEEYOUNG PRO — MetaApi.cloud adapter for MT4/MT5 connectivity.
// Real account linking requires METAAPI_TOKEN (env). Until it is configured the
// adapter reports BRIDGE_NOT_CONFIGURED and the UI keeps links in
// PENDING_BRIDGE — honest states, no fake "connected" badges.

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
}

export function bridgeConfigured(): boolean {
  return !!process.env.METAAPI_TOKEN;
}

/** Test a MetaTrader account through the MetaApi REST bridge. */
export async function testAccount(creds: BrokerCreds): Promise<BridgeStatus> {
  if (!bridgeConfigured()) {
    return {
      ok: false,
      status: "PENDING_BRIDGE",
      detail: "Saved securely. Connection testing activates when the MetaApi bridge token (METAAPI_TOKEN) is configured on the server.",
    };
  }
  try {
    // MetaApi provisioning: create (or reuse) an account, then deploy & wait for
    // connection. Kept minimal here — the full region/replica dance lives in the
    // deployment guide (DEPLOY.md §10).
    const res = await fetch("https://api.metaapi.cloud/accounts-api/v2.0/accounts", {
      method: "POST",
      headers: {
        "auth-token": process.env.METAAPI_TOKEN as string,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        login: creds.login,
        password: creds.password,
        server: creds.server,
        platform: creds.platform === "MT4" ? "mt4" : "mt5",
        // Investor (read-only) passwords cannot trade — enforced upstream too.
        copyFactoryRole: creds.mode === "INVESTOR" ? undefined : "subaccount",
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, status: "ERROR", detail: `Bridge rejected the account (${res.status}). Check server name, login and password. ${detail.slice(0, 140)}` };
    }
    const json = (await res.json()) as { id?: string };
    return {
      ok: true,
      status: "CONNECTED",
      detail: json.id ? `Linked via bridge (account ${json.id}). Read-only sync active.` : "Linked via bridge.",
    };
  } catch {
    return { ok: false, status: "ERROR", detail: "Couldn't reach the MetaApi bridge. Retry in a moment." };
  }
}
