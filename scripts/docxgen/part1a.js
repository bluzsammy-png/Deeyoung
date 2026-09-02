// part1a.js — Part I: audit items 1–8
module.exports = function build(H) {
  const { h1, h2, p, bullets, table, tCaption, note } = H;
  const out = [];

  out.push(h1("Part I - Production Audit (Items 1-24)"));
  out.push(p("This part follows the 29-item structure mandated by Section 71 of the upgrade prompt, in the exact order given. Items 1 through 4 establish the true state of the current system; items 5 through 8 cover security, architecture, database, and provider weaknesses; items 9 through 20 map functional and business gaps against the target specification; item 21 maps free alternatives; and items 22 through 24 give the preserve, refactor, and replace verdicts that feed the Phase plan in Part III."));

  // ── 1 ──
  out.push(h2("1. What Already Works"));
  out.push(p("The strongest finding of this audit is that the core product concept is already standing. The five screens form one coherent product rather than stitched-together tools: the Dashboard carries the AI desk briefing with regime, focus list, and avoid list; Charts & Signals renders candlesticks with EMA 9/21/50, VWAP, and Bollinger overlays plus a signal panel that shows the full factor breakdown (at audit time on NVDA: RSI(14) 79.5, MACD histogram -0.049, Bollinger position 79%, relative volume 0.37x, ROC 1.13%) alongside an ATR-based plan with entry, stop, target, and a 1.47 R:R; Universe lists 130+ tickers across all eleven GICS sectors with sparklines and a six-item watchlist; the AI Bot screen exposes the three autonomy modes and the risk governor sliders; and the Manual is a genuine in-app handbook with a downloadable PDF."));
  out.push(p("The bot's safety posture is verified, not just claimed. The configuration API returns a bot that is disabled by default in SIGNAL_ONLY mode with a 1% risk per trade, a five-position cap, a 3% daily-loss circuit breaker with day-key tracking, a 0.60 minimum confidence, a 600-second pending-approval expiry, and a halted-reason field. The session intelligence endpoint grades intraday windows (opening range PRIME, lunch CAUTION) and the AI briefing composes a regime call with focus and avoid lists from live index, sector, and volatility data. Footer disclaimers correctly identify Yahoo Finance delayed data and paper-only trading."));
  out.push(...bullets([
    "**Verified:** permission-gated bot, off by default, with deterministic hard limits (per /api/bot/config).",
    "**Verified:** 7-factor signal engine with per-factor contribution bars and ATR trade plan (per Charts & Signals screen).",
    "**Per UI:** coherent one-product experience across five screens; honest Reality Check section on the landing page.",
    "**Verified:** server-side data proxying - no provider keys or secrets are exposed to any client bundle.",
  ]));

  // ── 2 ──
  out.push(h2("2. What Is Simulated"));
  out.push(p("Everything monetary in the product is paper, and that is by design, but the simulation itself is currently too perfect to be honest. The internal paper engine fills orders at the observed price with no evidence of slippage, spread crossing, latency, partial fills, or rejected orders - the exact failure modes Section 20 of the mandate requires modeled. A stop or target that would in reality trigger on a gap fill at a very different price here fills as if the market waited for the engine. This matters beyond realism: signal outcome statistics produced by ideal fills will flatter the engine, and users who later connect Alpaca Paper will experience worse results than the internal engine trained them to expect."));
  out.push(p("The $100,000 paper equity is simulated capital, which is correct and clearly disclosed. What is missing is the labeling discipline of Section 20: there is currently one execution engine, so nothing needs to distinguish QuantEdge Simulated from Alpaca Paper yet, but the moment the second provider lands the UI, notification copy, and trade log must carry explicit engine labels. Finally, the AI briefing and analysis simulate an analyst's judgment; that is legitimate AI output on real data, but as item 3 records, the grounding of that judgment needs work."));

  // ── 3 ──
  out.push(h2("3. What Is Fake or Hard-Coded"));
  out.push(p("No fabricated market data was found: quotes, candles, movers, and sparklines all trace to the server-side Yahoo Finance proxy, and the audit found no client-side number generation. This is an important positive finding given mandate rule 69-7 (never fabricate market data). The fakes that do exist are of a second kind - hard-coded product constants and one instance of AI narrative drift."));
  out.push(p("The verified AI grounding failure: during the audit, the briefing endpoint described NVDA as breaking $420 resistance while NVDA was trading at $227.24 with a session high of $227.88. The model composed a plausible-sounding level that no supplied data supported, which is precisely the failure mode Section 55 (fail safely, never invent) targets at the narrative layer. The fix is mechanical - every AI-generated level must be grounded in values passed to the prompt, with a data timestamp cited - and it is scheduled in Phase 2. Hard-coded items include the default 24-symbol watchlist, the static 130+ ticker universe list, the fixed session-window schedule, and the single global bot configuration record whose consequences item 4 details."));

  // ── 4 ──
  out.push(h2("4. What Is Broken"));
  out.push(p("The multi-user state model is not merely missing, it is actively wrong. The bot configuration endpoint returns an id of singleton, and every visitor observes and drives the same paper book. Two consequences follow immediately. First, if any visitor enables the bot, it trades the shared account for everyone; the audit deliberately did not do this on the live deployment, but the tick endpoint confirmed the engine responds to any visitor. Second, concurrent configuration changes race with last-write-wins semantics, and there is no identity to attribute any change to."));
  out.push(p("Beyond the state model, the audit verified that a client can force the trading engine to run (POST /api/bot/tick?force=1 returned ran: true), which means bot execution is partially client-driven rather than owned by a server-side scheduler - an availability and integrity hazard detailed in item 6. Smaller verified defects: the briefing narrative can drift from quote data (item 3); the watchlist lives only in localStorage so it does not follow a user across devices; and HEAD requests to API routes return 403 from the serving platform, which will confuse any uptime monitor pointed at API endpoints rather than the root page."));

  // ── 5 ──
  out.push(h2("5. Security Vulnerabilities"));
  out.push(p("Security is the audit's most serious chapter. Because the product was built as a no-signup demo, it ships with no authentication, no sessions, no CSRF protection, and no rate limiting - and its mutation endpoints are reachable by anyone on the internet. The table below lists findings verified during the audit, ordered by severity. None of these is theoretical: each was reproduced or directly observed against the live deployment."));
  out.push(tCaption("Security findings (verified against the live deployment)"));
  out.push(table(
    ["#", "Finding", "Severity", "Evidence", "Required fix (phase)"],
    [
      ["S1", "No authentication on any endpoint; no auth routes, sessions, or cookies exist", "CRITICAL", "Probes to /api/auth, /api/session, /api/login, /api/user returned 404; no Set-Cookie on any response", "Auth + sessions (Phase 1, §33)"],
      ["S2", "Unauthenticated mutation: bot engine ran on a forged request", "CRITICAL", "POST /api/bot/tick?force=1 returned ran:true with HTTP 200", "Auth middleware on all mutations (Phase 1)"],
      ["S3", "Unauthenticated mutation: trade action endpoint processes attacker input", "CRITICAL", "POST /api/trades/action with fabricated payload reached business logic (409, order-state message)", "Auth + ownership checks (Phase 1)"],
      ["S4", "Global shared financial state: one paper book for all visitors", "CRITICAL", "Bot config id = singleton; identical state returned to all clients", "Per-user rows and scoping (Phase 1, §32)"],
      ["S5", "No CSRF protection on state-changing endpoints", "HIGH", "Cross-site POSTs accepted with JSON bodies, no token checks", "CSRF tokens / SameSite+Origin checks (Phase 1)"],
      ["S6", "No rate limiting observed on API endpoints", "HIGH", "Repeated probe calls unthrottled", "Per-IP and per-user throttles (Phase 1/7)"],
      ["S7", "No audit trail: actions cannot be attributed to an actor", "HIGH", "No identity exists; no audit event store found", "Immutable AuditEvent log (Phase 7, §45)"],
      ["S8", "No input validation evidence on mutation parameters", "MEDIUM", "Arbitrary force and action values accepted by endpoints", "Schema validation on every route (Phase 1)"],
      ["S9", "Secrets exposure", "OK", "No provider keys in any served bundle; data proxied server-side", "Preserve pattern; add BYOK encryption (Phase 6, §30)"],
    ],
    [6, 34, 10, 28, 22]
  ));
  out.push(p("The positive finding deserves emphasis: the server-side proxy pattern means broker and provider secrets never appear in frontend code, which is the pattern Section 46 demands and which many early-stage products get wrong. The critical findings S1 through S4 are expected for a demo and are fully repairable in Phase 1 without discarding any product code; they are, however, absolute blockers for charging money, and the audit recommends they be treated as the first work items of the entire program."));

  // ── 6 ──
  out.push(h2("6. Architecture Problems"));
  out.push(p("The application is a well-organized Next.js monolith with route handlers, which is the right skeleton; the architectural debts are what the monolith does not yet contain. There is no provider abstraction: the Yahoo Finance and GLM integrations are wired directly into route handlers, so no interface exists behind which a fallback market feed, a news provider, or a second AI vendor could appear (Section 28 requires eight such interfaces). There is no event bus and no shared computation layer: every client independently polls market endpoints on a roughly 25-second cadence, so request volume scales linearly with audience instead of with market activity - the exact anti-pattern Section 27 calls out for one thousand users watching one ticker."));
  out.push(p("Execution architecture has two specific hazards. Bot ticks can be forced by any client (verified, item 4), meaning the trading loop is partly driven from the browser rather than owned by a server-side worker; in a multi-instance deployment this both duplicates and starves ticks. And there are no idempotency keys on order or approval submission, so a retried request can double-fire - Section 59 makes idempotency non-negotiable before any second execution provider arrives. Finally, analytics are computed per request with no memoization evidence: each chart poll recomputes indicator series that a per-symbol, per-range cache could serve to all watchers."));

  // ── 7 ──
  out.push(h2("7. Database Problems"));
  out.push(p("The deployment environment configures a SQLite file database through a DATABASE_URL of the form file:custom.db, and nothing observed contradicts that this is the authoritative store. SQLite is an excellent development database and the audit does not recommend ripping it out mid-Phase-0; but it is single-writer, has no row-level security, and cannot serve concurrent multi-tenant traffic, so migration to managed PostgreSQL is a Phase 1 precondition for any multi-user work (Section 49 evaluates free-tier candidates; the recommendation is in Part IV)."));
  out.push(p("The deeper problem is schema shape. Bot state, configuration, trades, and signals are persisted as opaque JSON blobs attached to a single record, rather than the normalized entity set Section 32 enumerates (users, subscriptions, entitlements, strategies, strategy versions, signals, signal factors, positions, orders, fills, risk profiles, broker connections, notifications, preferences, catalysts, regimes, backtests, usage events, audit events, system events). Blobs cannot be scoped per user, indexed for queries, or hash-chained for audit; every one of them must be decomposed into typed tables with a userId column before the first entitlement check is written. localStorage currently holds only the watchlist (capped at 30 items, verified in the bundle), which is acceptable as a cache but not as authority - Section 34 draws exactly this line."));

  // ── 8 ──
  out.push(h2("8. API and Provider Problems"));
  out.push(p("The API surface is small, coherent, and entirely public. The table below lists every endpoint discovered in bundle analysis, all of which the audit then probed live. The surface itself is a good specification of the domain; the problems are authentication (item 5), contract hygiene, and provider risk."));
  out.push(tCaption("Verified API surface (all endpoints publicly reachable at audit time)"));
  out.push(table(
    ["Endpoint", "Verified behavior"],
    [
      ["GET /api/market/status", "Session state, ET clock, and the day's trading windows graded PRIME / GOOD / CAUTION with guidance notes"],
      ["GET /api/market/quote?symbols=", "Batch quotes with price, change, and a 30-point sparkline; errors cleanly when the parameter is missing"],
      ["GET /api/market/chart?symbol=&range=", "Candles plus metadata (exchange, 52-week range, volume) for the chart workspace"],
      ["GET /api/market/movers", "Gainers and losers with sparklines; embeds the session payload"],
      ["GET /api/ai/briefing", "AI desk note: regime, headline, narrative, focus list, avoid list, session guidance, risk notes"],
      ["GET /api/ai/analysis?symbol=", "Per-symbol AI thesis with bias, headline, and key levels"],
      ["GET /api/bot/state", "Bot configuration, trades, pending approvals, signals, equity curve, performance"],
      ["GET /api/bot/config", "Singleton bot configuration record (id: singleton)"],
      ["POST /api/bot/tick?force=1", "Runs the trading engine; returned ran:true to an unauthenticated caller"],
      ["POST /api/trades/action", "Approve/reject processing; processed an unauthenticated fabricated payload"],
    ],
    [34, 66]
  ));
  out.push(p("Provider risk concentrates on Yahoo Finance. The v8 endpoints consumed are unofficial: there is no service-level agreement, the terms of service are ambiguous for commercial reuse, rate limits are undocumented, and the data is delayed - a fact the site discloses only in its footer while the hero claims real-time (item 17 and Section 50's addendum). No provider health tracking, staleness flags, or failover path exists; the Section 42/43 duty to surface LIVE, DELAYED, STALE, and UNAVAILABLE states is unmet. The AI provider is similarly single-threaded onto one vendor with no metering and no bring-your-own-key path. Error responses are inconsistent (some routes return error objects, others ok:false), which complicates the friendly-error layer Section 42 requires."));

  return out;
};
