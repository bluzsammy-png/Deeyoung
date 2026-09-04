// DEEYOUNG PRO — runtime instrumentation (§60 boot diagnostics).
// Runs once when the server process starts (before serving traffic).
// The MetaApi bridge self-check proves, from the production network itself,
// whether METAAPI_TOKEN is accepted by the MetaApi provisioning endpoint.
// Logs ONE aggregate line to stdout (visible via deployment logs) — never
// echoes the token or any account detail. Never fatal: trading must boot
// even when the bridge is unreachable.

export async function register() {
  const token = process.env.OANDA_TOKEN;
  if (!token) {
    console.log("[bridge] OANDA_TOKEN not set — FX bridge dormant (PENDING_BRIDGE by design; MetaApi retired 2026-09-04)");
    return;
  }
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
      console.log(`[bridge] OANDA → TOKEN_REJECTED http=${res.status} in ${Date.now() - t0}ms — generate a fresh practice token (Manage API Access)`);
      return;
    }
    if (res.status === 404) {
      console.log(`[bridge] OANDA → ACCOUNT_NOT_FOUND http=404 in ${Date.now() - t0}ms — check OANDA_ACCOUNT_ID (practice ids look like 101-001-1234567-001)`);
      return;
    }
    if (!res.ok) {
      console.log(`[bridge] OANDA → http=${res.status} in ${Date.now() - t0}ms`);
      return;
    }
    const j = (await res.json().catch(() => null)) as { account?: { currency?: string } } | null;
    console.log(`[bridge] OANDA → TOKEN_VALID account=${acct.slice(0, 8)}… currency=${j?.account?.currency ?? "?"} in ${Date.now() - t0}ms`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`[bridge] OANDA → UNREACHABLE in ${Date.now() - t0}ms — ${msg.slice(0, 100)}`);
  }
}
