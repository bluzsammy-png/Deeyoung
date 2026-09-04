// DEEYOUNG PRO — runtime instrumentation (§60 boot diagnostics).
// Runs once when the server process starts (before serving traffic).
// The MetaApi bridge self-check proves, from the production network itself,
// whether METAAPI_TOKEN is accepted by the MetaApi provisioning endpoint.
// Logs ONE aggregate line to stdout (visible via deployment logs) — never
// echoes the token or any account detail. Never fatal: trading must boot
// even when the bridge is unreachable.

export async function register() {
  const token = process.env.METAAPI_TOKEN;
  if (!token) {
    console.log("[bridge] METAAPI_TOKEN not set — MT4/MT5 bridge dormant (PENDING_BRIDGE by design)");
    return;
  }
  const api = process.env.METAAPI_API_URL || "https://api.metaapi.cloud";
  const t0 = Date.now();
  try {
    const res = await fetch(`${api}/accounts-api/v2.0/accounts`, {
      headers: { "auth-token": token, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 401 || res.status === 403) {
      console.log(`[bridge] TOKEN_REJECTED http=${res.status} in ${Date.now() - t0}ms — generate a fresh token from the MetaApi section (not Manager API) of the dashboard`);
      return;
    }
    if (!res.ok) {
      console.log(`[bridge] BRIDGE_ERROR http=${res.status} in ${Date.now() - t0}ms`);
      return;
    }
    const list = (await res.json().catch(() => null)) as unknown[] | null;
    const n = Array.isArray(list) ? list.length : -1;
    console.log(`[bridge] TOKEN_VALID http=200 accounts=${n} in ${Date.now() - t0}ms`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`[bridge] BRIDGE_UNREACHABLE in ${Date.now() - t0}ms — ${msg.slice(0, 120)}`);
  }
}
