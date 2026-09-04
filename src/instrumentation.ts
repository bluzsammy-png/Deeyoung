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
  // Host families, in preference order. api.metaapi.cloud is the documented base but
  // proved unreachable from some datacenter networks (2026-09-04: fetch failed from
  // Railway AND the sandbox) — the SDK's own default domain is agiliumtrade.agiliumtrade.ai.
  const bases = [
    process.env.METAAPI_API_URL,
    "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai",
    "https://api.metaapi.cloud",
  ].filter(Boolean) as string[];
  for (const base of [...new Set(bases)]) {
    const t0 = Date.now();
    try {
      const res = await fetch(`${base}/users/current/accounts`, {
        headers: { "auth-token": token, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(10_000),
      });
      if (res.status === 401 || res.status === 403) {
        console.log(`[bridge] ${base} → TOKEN_REJECTED http=${res.status} in ${Date.now() - t0}ms (regenerate from the MetaApi section, not Manager API)`);
        continue;
      }
      if (!res.ok) {
        console.log(`[bridge] ${base} → http=${res.status} in ${Date.now() - t0}ms`);
        continue;
      }
      const list = (await res.json().catch(() => null)) as unknown[] | null;
      const n = Array.isArray(list) ? list.length : -1;
      console.log(`[bridge] ${base} → TOKEN_VALID accounts=${n} in ${Date.now() - t0}ms`);
      return;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`[bridge] ${base} → UNREACHABLE in ${Date.now() - t0}ms — ${msg.slice(0, 100)}`);
    }
  }
  console.log("[bridge] no reachable host accepted the token — bridge stays PENDING_BRIDGE");
}
