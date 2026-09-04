// DEEYOUNG PRO — runtime instrumentation (§60 boot diagnostics).
// Runs once when the server process starts (before serving traffic).
// Self-checks the PRIMARY execution bridge (Binance SPOT TESTNET since
// 2026-09-04: GitHub-OAuth keys, engine-identical symbols) and any dormant
// fallback venues (Alpaca shelved, Bybit geo-blocked, OANDA no-NG).
// Logs ONE aggregate line per venue to stdout (visible via deployment logs) —
// never echoes keys or any account detail. Never fatal: trading must boot
// even when a bridge is down.

async function checkBinanceTestnet(): Promise<void> {
  const key = process.env.BINANCE_TESTNET_KEY;
  if (!key || !process.env.BINANCE_TESTNET_SECRET) {
    console.log("[bridge] BINANCE_TESTNET keys not set — paper bridge dormant (PENDING_BRIDGE by design; keys come from testnet.binance.vision GitHub-OAuth login, 2026-09-04)");
    return;
  }
  const t0 = Date.now();
  try {
    const { createHmac } = await import("crypto");
    const qs = `timestamp=${Date.now()}&recvWindow=10000`;
    const sig = createHmac("sha256", process.env.BINANCE_TESTNET_SECRET as string)
      .update(qs).digest("hex");
    const res = await fetch(`https://testnet.binance.vision/api/v3/account?${qs}&signature=${sig}`, {
      headers: { "X-MBX-APIKEY": key },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 401 || res.status === 403) {
      console.log(`[bridge] BINANCE_TESTNET → KEYS_REJECTED http=${res.status} in ${Date.now() - t0}ms — regenerate HMAC keys on testnet.binance.vision`);
      return;
    }
    if (!res.ok) {
      console.log(`[bridge] BINANCE_TESTNET → http=${res.status} in ${Date.now() - t0}ms`);
      return;
    }
    const j = (await res.json().catch(() => null)) as { canTrade?: boolean; accountType?: string } | null;
    console.log(`[bridge] BINANCE_TESTNET → KEYS_VALID account=${j?.accountType ?? "?"} canTrade=${String(j?.canTrade)} in ${Date.now() - t0}ms`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`[bridge] BINANCE_TESTNET → UNREACHABLE in ${Date.now() - t0}ms — ${msg.slice(0, 100)}`);
  }
}

async function checkAlpaca(): Promise<void> {
  const key = process.env.ALPACA_KEY_ID;
  if (!key || !process.env.ALPACA_SECRET_KEY) return; // dormant venue (shelved) — silent when unset
  const base = process.env.ALPACA_ENV === "live"
    ? "https://api.alpaca.markets"
    : "https://paper-api.alpaca.markets";
  const t0 = Date.now();
  try {
    const res = await fetch(`${base}/v2/account`, {
      headers: {
        "APCA-API-KEY-ID": key,
        "APCA-API-SECRET-KEY": process.env.ALPACA_SECRET_KEY as string,
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 401 || res.status === 403) {
      console.log(`[bridge] ALPACA → KEYS_REJECTED http=${res.status} in ${Date.now() - t0}ms — generate a fresh paper-account key (API Keys → Generate New Key)`);
      return;
    }
    if (!res.ok) {
      console.log(`[bridge] ALPACA → http=${res.status} in ${Date.now() - t0}ms`);
      return;
    }
    const j = (await res.json().catch(() => null)) as { status?: string; equity?: string } | null;
    console.log(`[bridge] ALPACA → KEYS_VALID account=${j?.status ?? "?"} in ${Date.now() - t0}ms`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`[bridge] ALPACA → UNREACHABLE in ${Date.now() - t0}ms — ${msg.slice(0, 100)}`);
  }
}

async function checkBybit(): Promise<void> {
  const key = process.env.BYBIT_API_KEY;
  if (!key || !process.env.BYBIT_API_SECRET) return; // dormant venue — stay silent when unset
  const base = process.env.BYBIT_ENV === "live"
    ? "https://api.bybit.com"
    : process.env.BYBIT_ENV === "testnet"
      ? "https://api-testnet.bybit.com"
      : "https://api-demo.bybit.com";
  const t0 = Date.now();
  try {
    const { createHmac } = await import("crypto");
    const ts = Date.now().toString();
    const recv = "20000";
    const sign = createHmac("sha256", process.env.BYBIT_API_SECRET as string)
      .update(`${ts}${key}${recv}`).digest("hex");
    const res = await fetch(`${base}/v5/account/wallet-balance?accountType=UNIFIED`, {
      headers: {
        "X-BAPI-API-KEY": key,
        "X-BAPI-TIMESTAMP": ts,
        "X-BAPI-RECV-WINDOW": recv,
        "X-BAPI-SIGN": sign,
        "X-BAPI-SIGN-TYPE": "2",
      },
      signal: AbortSignal.timeout(10_000),
    });
    const j = (await res.json().catch(() => null)) as { retCode?: number; retMsg?: string; result?: { list?: { accountType?: string }[] } } | null;
    if (res.status === 401 || res.status === 403 || j?.retCode === 10003 || j?.retCode === 10005) {
      console.log(`[bridge] BYBIT(dormant) → KEYS_REJECTED http=${res.status} retCode=${j?.retCode} in ${Date.now() - t0}ms`);
      return;
    }
    if (!res.ok || j?.retCode !== 0) {
      console.log(`[bridge] BYBIT(dormant) → http=${res.status} retCode=${j?.retCode} in ${Date.now() - t0}ms`);
      return;
    }
    console.log(`[bridge] BYBIT(dormant) → KEYS_VALID in ${Date.now() - t0}ms`);
  } catch {
    console.log(`[bridge] BYBIT(dormant) → UNREACHABLE in ${Date.now() - t0}ms`);
  }
}

async function checkOanda(): Promise<void> {
  const token = process.env.OANDA_TOKEN;
  if (!token) return; // dormant venue — stay silent when unset
  const base = process.env.OANDA_ENV === "live"
    ? "https://api-fxtrade.oanda.com/v3"
    : "https://api-fxpractice.oanda.com/v3";
  const acct = process.env.OANDA_ACCOUNT_ID ?? "(no account id)";
  const t0 = Date.now();
  try {
    const res = await fetch(`${base}/accounts/${acct}/summary`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 401 || res.status === 403) {
      console.log(`[bridge] OANDA(dormant) → TOKEN_REJECTED http=${res.status} in ${Date.now() - t0}ms`);
      return;
    }
    if (!res.ok) {
      console.log(`[bridge] OANDA(dormant) → http=${res.status} in ${Date.now() - t0}ms`);
      return;
    }
    console.log(`[bridge] OANDA(dormant) → TOKEN_VALID in ${Date.now() - t0}ms`);
  } catch {
    console.log(`[bridge] OANDA(dormant) → UNREACHABLE in ${Date.now() - t0}ms`);
  }
}

export async function register() {
  await checkBinanceTestnet();
  await checkAlpaca();
  await checkBybit();
  await checkOanda();
}
