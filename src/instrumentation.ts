// DEEYOUNG PRO — runtime instrumentation (§60 boot diagnostics).
// 2026-09-04: PRIMARY execution path = the OWN PAPER ENGINE (Postgres-backed
// fills at observed market prices — no third-party broker dependency). Data:
// Twelve Data when a key is set, keyless Binance public feed otherwise.
// Boot self-checks log ONE aggregate line per subsystem to stdout (visible in
// deployment logs) — never echo keys or any account detail. Never fatal:
// trading must boot even when a subsystem is down.
//
// 24/7 AUTONOMOUS ENGINE: when running on Railway (RAILWAY_ENVIRONMENT is
// auto-injected by the platform) and ENGINE_DISABLED != "1", the paper
// engine loop starts ~30s after boot and runs until the process dies.
// Self-heals after fatal errors. Locally: start it explicitly via
// bun scripts/engine-run.ts --max-minutes N (sandbox reaps background jobs).

async function checkPaperEngine(): Promise<void> {
  const t0 = Date.now();
  try {
    const { db } = await import("@/lib/db");
    const [openN, closedN, orderN] = await Promise.all([
      db.paperEnginePosition.count({ where: { status: "OPEN" } }),
      db.paperEnginePosition.count({ where: { status: "CLOSED" } }),
      db.paperEngineOrder.count(),
    ]);
    console.log(`[bridge] PAPER → OPERATIONAL in ${Date.now() - t0}ms — open=${openN} closed=${closedN} orders=${orderN} (fills at observed market prices; audit at /api/engine/status)`);
  } catch (e) {
    console.log(`[bridge] PAPER → DB_ERROR in ${Date.now() - t0}ms — ${String(e).slice(0, 120)}`);
  }
}

async function checkTwelveData(): Promise<void> {
  if (!process.env.TWELVEDATA_API_KEY) {
    console.log("[bridge] TWELVEDATA → PENDING_KEY — data feed = keyless Binance public REST (proven from Railway); set TWELVEDATA_API_KEY to switch (user-directed venue; signup Turnstile-gated from datacenter IPs, verified 2026-09-04)");
    return;
  }
  const t0 = Date.now();
  try {
    const { twelvedataKlines } = await import("@/lib/market/twelvedata");
    const bars = await twelvedataKlines("BTCUSD", { limit: 3, timeoutMs: 12_000 });
    if (bars.length) {
      console.log(`[bridge] TWELVEDATA → KEY_VALID in ${Date.now() - t0}ms — ${bars.length} bars BTC/USD lastClose=${bars[bars.length - 1].c}`);
    } else {
      console.log(`[bridge] TWELVEDATA → EMPTY in ${Date.now() - t0}ms — falling back to Binance public feed`);
    }
  } catch (e) {
    console.log(`[bridge] TWELVEDATA → ERROR in ${Date.now() - t0}ms — ${String(e).slice(0, 100)} (engine falls back to Binance public feed)`);
  }
}

async function checkOkx(): Promise<void> {
  const mode = (process.env.EXECUTION_VENUE || "paper").trim().toLowerCase();
  if (!process.env.OKX_API_KEY || !process.env.OKX_API_SECRET || !process.env.OKX_API_PASSPHRASE) {
    console.log(`[bridge] OKX keys not set — live mirror dormant (EXECUTION_VENUE=${mode}); paper engine is execution-of-record. Create OKX demo API keys to arm.`);
    return;
  }
  const t0 = Date.now();
  try {
    const { okxAccountSummary, okxSimMode } = await import("@/lib/brokers/okx");
    if (okxSimMode()) {
      // Self-fetch during instrumentation deadlocks — the HTTP listener is not
      // serving yet, so probing our own /api/sim/okx here times out (prod-proven).
      // Arm verbally now; probe post-boot (engine's first cycle re-probes too).
      console.log(`[bridge] OKX → SIMULATOR armed (self-hosted OKX-wire sim; EXECUTION_VENUE=${mode}) — probe deferred 35s to post-boot; mirror exercises full signing path, no external venue`);
      const probe = setTimeout(() => {
        okxAccountSummary().then((s) => {
          console.log(`[bridge] OKX(sim) delayed probe → ${s.verdict} in ${s.latencyMs}ms${s.detail ? ` — ${s.detail.slice(0, 80)}` : ""}`);
        }).catch(() => {});
      }, 35_000);
      probe.unref?.();
      return;
    }
    const s = await okxAccountSummary();
    console.log(`[bridge] OKX → ${s.verdict} env=${s.env} in ${Date.now() - t0}ms (EXECUTION_VENUE=${mode})${s.detail ? ` — ${s.detail.slice(0, 80)}` : ""}`);
  } catch (e) {
    console.log(`[bridge] OKX → UNREACHABLE in ${Date.now() - t0}ms — ${String(e).slice(0, 100)}`);
  }
}

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
  await checkPaperEngine();
  await checkTwelveData();
  await checkOkx();
  await checkBinanceTestnet();
  await checkAlpaca();
  await checkBybit();
  await checkOanda();

  // 24/7 autonomous engine on Railway — starts once, runs forever, self-heals.
  // Sandbox/local hosts do NOT autorun (no RAILWAY_ENVIRONMENT); use the CLI.
  if (process.env.RAILWAY_ENVIRONMENT && process.env.ENGINE_DISABLED !== "1") {
    console.log("[engine] Railway detected — autonomous paper engine starts in 30s (ENGINE_DISABLED=1 to suppress)");
    const t = setTimeout(() => {
      void (async () => {
        try {
          const { startEngineLoop } = await import("@/lib/engine/runner");
          startEngineLoop({
            log: (l) => console.log(l),
          });
        } catch (e) {
          console.log(`[engine] autorun failed to start: ${String(e).slice(0, 120)}`);
        }
      })();
    }, 30_000);
    if (typeof t.unref === "function") t.unref();
  }
}
