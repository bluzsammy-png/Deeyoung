// DEEYOUNG PRO — outbound production telemetry.
// Railway's edge 429s every external reader of the production app (sandbox DCs,
// GitHub runners, page fetchers — proven 2026-09-05). But OUTBOUND egress from
// the app works (Twelve Data, Binance, AgentMail all fine). So instead of pulling
// the production snapshot, the app PUSHES a compact digest to ntfy.sh on a topic
// only this build knows. The sandbox reads the topic and gets the REAL numbers:
// win rate, closed trades, feed provenance, venue ladder, build fingerprint.
//
// Honest-data rule: the digest is built by the SAME buildEngineSnapshot() that
// powers /api/engine/status — no invented numbers, ever.
//
// Env: TELEMETRY_DISABLED=1 suppresses; NTFY_TOPIC overrides the topic.

const TOPIC = process.env.NTFY_TOPIC || "deeyoung-prod-e20ade8aadf0dc1e32abe467";
const FIRST_DELAY_MS = 90_000;   // let the engine finish seeding first
const INTERVAL_MS = 15 * 60_000; // 15 min cadence
const MAX_BODY = 3_500;          // ntfy free tier message cap

function compactClosed(rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return rows.slice(0, 8).map((p) => ({
    book: p.bookKey,
    sym: p.symbol,
    entry: p.entryPrice,
    exit: p.exitPrice,
    why: p.exitReason,
    netUsd: p.netPnlUsd,
    R: p.netR,
    at: p.closedAt,
  }));
}

function digest(s: Record<string, unknown>, scan: Record<string, unknown> | null = null): string {
  const eng = s.engine as Record<string, unknown> | undefined;
  const acct = s.account as Record<string, unknown> | undefined;
  const build = s.build as Record<string, unknown> | undefined;
  const open = (s.openPositions ?? []) as Array<Record<string, unknown>>;
  const closed = (s.recentClosed ?? []) as Array<Record<string, unknown>>;
  const out = {
    ts: new Date().toISOString(),
    build: build?.sha ? String(build.sha).slice(0, 7) : "local",
    marker: build?.marker ?? null,
    engine: {
      status: eng?.status,
      elapsedH: eng?.elapsedHours,
      paused: (eng?.control as Record<string, unknown> | undefined)?.paused ?? false,
      runId: eng?.runId,
    },
    feed: {
      primary: (eng?.dataVenue as Record<string, unknown> | undefined)?.primary,
      counters: eng?.feedCounters,
    },
    account: acct ? {
      equity: acct.settledEquityUsd,
      realizedPnl: acct.realizedPnlUsd,
      fees: acct.feesUsd,
      maxDDpct: acct.maxDrawdownPct,
      open: acct.openCount,
      closed: acct.closedCount,
      winRatePct: acct.winRatePct,
      dayPnlR: acct.dayPnlR,
    } : null,
    openPositions: open.slice(0, 5).map((p) => ({ book: p.bookKey, entry: p.entryPrice, stop: p.stopPrice, tgt: p.targetPrice, at: p.openedAt })),
    recentClosed: compactClosed(closed),
    books: s.books,
    venue: s.venue,
    // Platform integrations the edge 429-wall hides from external probes — the
    // running server reports its own runtime truth here every 15 minutes.
    platform: {
      googleAuth: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      support: process.env.NEXT_PUBLIC_TAWK_PROPERTY_ID && process.env.NEXT_PUBLIC_TAWK_WIDGET_ID ? "tawk" : "inhouse",
      billing: !!(process.env.PAYMENT_LINK_PRO || process.env.PAYMENT_LINK_STARTER || process.env.PAYMENT_LINK_ELITE),
      adminList: (process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim()).filter(Boolean).length,
    },
    scan,
  };
  return JSON.stringify(out);
}

async function publish(title: string, body: string): Promise<boolean> {
  try {
    const res = await fetch(`https://ntfy.sh/${TOPIC}`, {
      method: "POST",
      headers: { "Title": title, "Tags": "chart", "Content-Type": "text/plain" },
      body: body.slice(0, MAX_BODY),
      signal: AbortSignal.timeout(15_000),
    });
    console.log(`[telemetry] ntfy ${title} → HTTP ${res.status} (${body.length}B)`);
    return res.ok;
  } catch (e) {
    console.log(`[telemetry] ntfy ${title} failed: ${String(e).slice(0, 120)}`);
    return false;
  }
}

async function tick() {
  try {
    const { buildEngineSnapshot } = await import("@/lib/engine/status-snapshot");
    const snap = (await buildEngineSnapshot()) as unknown as Record<string, unknown>;
    await publish("engine-snapshot", digest(snap, await scanSnapshot()));
  } catch (e) {
    // snapshot failure is itself the diagnosis (e.g. database unreachable)
    await publish("engine-snapshot-ERROR", JSON.stringify({
      ts: new Date().toISOString(),
      snapshotError: String(e).slice(0, 400),
    }));
  }
}

// Pull the engine's live scan counters (accumulated since the last digest),
// then reset the window. Dynamic import keeps the telemetry module loadable
// without dragging the full runner graph into every entry point.
async function scanSnapshot(): Promise<Record<string, unknown>> {
  try {
    const { scanStats } = await import("@/lib/engine/runner");
    const out = {
      windowMin: Math.round((Date.now() - scanStats.since) / 60_000),
      best: scanStats.best,
      bestSym: scanStats.bestSym || null,
      longSignals: scanStats.longSignals,
      cross55: scanStats.cross55,
      cross60: scanStats.cross60,
      denied: { ...scanStats.denied },
    };
    scanStats.since = Date.now();
    scanStats.best = 0;
    scanStats.bestSym = "";
    scanStats.longSignals = 0;
    scanStats.cross55 = 0;
    scanStats.cross60 = 0;
    scanStats.denied = {};
    return out;
  } catch {
    return null;
  }
}

export function startTelemetryLoop(): void {
  const g = globalThis as unknown as { __deetelemetry?: boolean };
  if (g.__deetelemetry) return;
  g.__deetelemetry = true;

  const bootTimer = setTimeout(() => {
    void publish("boot", JSON.stringify({ ts: new Date().toISOString(), event: "telemetry armed", topicSet: !!process.env.NTFY_TOPIC }));
  }, 10_000);
  if (typeof bootTimer.unref === "function") bootTimer.unref();

  const t = setTimeout(() => {
    void tick();
    const iv = setInterval(() => void tick(), INTERVAL_MS);
    if (typeof iv.unref === "function") iv.unref();
  }, FIRST_DELAY_MS);
  if (typeof t.unref === "function") t.unref();

  console.log(`[telemetry] outbound digest loop armed (first +90s, then every ${INTERVAL_MS / 60_000}m)`);
}
