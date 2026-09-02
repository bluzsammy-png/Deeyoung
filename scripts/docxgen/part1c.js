// part1c.js — Part I: audit items 17–24
module.exports = function build(H) {
  const { h2, p, bullets, table, tCaption } = H;
  const out = [];

  // ── 17 ──
  out.push(h2("17. UX and UI Problems"));
  out.push(p("The design language is already close to the Section 37 target of a premium quantitative intelligence terminal: one dark theme, semantic green/red/amber usage, restrained motion, tabular figures, and product-native visuals (charts, factor bars, sparklines, regime chips) instead of robot mascots and stock photos. The audit's UX findings are therefore mostly about honesty surfaces and progressive disclosure rather than aesthetics."));
  out.push(...bullets([
    "**Real-time claim vs delayed reality (verified):** the hero reads LIVE US EQUITIES with a REAL-TIME DATA badge while the only delay disclosure sits in the footer. Section 50's addendum requires moving the disclosure up before someone clicks through - it is both an honesty issue and a store-review risk.",
    "**Comparative claim (per UI):** TradingView-grade candlesticks names a third-party trademark in a superiority claim; rephrase to product-native language.",
    "**No product screenshots on the landing page (per UI):** the entire pitch is text. Section 37's addendum calls real screenshots and an example SENTINEL approval card the single highest-leverage fix for a product about to charge money.",
    "**No onboarding (Section 8) and no contextual education (Section 10):** the Manual is good but passive; the signal-confidence tap-to-explain pattern does not exist yet, and no beginner/advanced split (Section 54) hides complexity from novices.",
    "**Failure storytelling (Sections 42-43) is unmet:** technical error strings can surface, and there are no STALE DATA or provider-down banners that explain what happened, what the system is doing, and what the user should do.",
  ]));

  // ── 18 ──
  out.push(h2("18. SaaS and Account Gaps"));
  out.push(p("Every SaaS primitive from Section 32 onward is absent: no users, no profiles, no authentication (item 5), no subscriptions or entitlements, no usage metering, no bring-your-own-key handling, no billing provider, no admin control center, no user settings area, and no terms, privacy, or refund pages. The bot configuration that should be a per-user document is a global singleton; the settings that exist (risk sliders, modes, watchlist) have no owner."));
  out.push(p("Two architectural decisions from the mandate must land before the first paid subscriber. First, billing and entitlements are separate concerns (Section 35): a Subscription row records what was purchased, while an EntitlementService decides what a user may do, checked server-side on every privileged action and never trusted from the frontend. Second, the billing provider abstraction must plan for both worlds from the start (Section 35's addendum): Stripe for the web now, StoreKit and Google Play Billing for native shells later, both feeding the same entitlement service - a Stripe checkout embedded in a native app is not a permitted path for digital subscriptions on either store. The full gap closure plan is artifact I."));

  // ── 19 ──
  out.push(h2("19. Scaling Problems"));
  out.push(p("The scaling model fails between 100 and 1,000 users for arithmetic reasons. Every client polls market endpoints on a roughly 25-second cadence; at 1,000 concurrent users that is on the order of 2,400 requests per minute against the API before any fan-out, and without a shared cache each request can cascade into upstream provider calls - the precise structure Section 27 forbids. Indicator computation repeats per request rather than per symbol, so CPU cost also scales with audience instead of with market breadth. The singleton bot row is a write contention point under any concurrency, and a multi-instance deployment would run duplicate trading loops unless tick ownership moves to a single server-side scheduler."));
  out.push(p("The fixes are established and scheduled: a per-symbol TTL cache with request coalescing in front of providers; memoized indicator series keyed by symbol and range; one event bus publishing market, signal, and system events to all subscribers; server-side scheduled ticks; and, later, WebSocket or server-sent-events fan-out so real-time updates replace polling. Section 56's 1 / 100 / 1,000 / 10,000-user review is built into the Phase 7 exit criteria, and the cost consequences appear in artifact J."));

  // ── 20 ──
  out.push(h2("20. Cost Problems"));
  out.push(p("Today's run-rate is effectively zero: the platform hosts the deployment, Yahoo Finance's unofficial endpoints are free, and the AI model rides the bundled SDK - genuinely aligned with the Section 29 zero-cost principle, and the audit found no paid service lurking in the stack. The problems are prospective. The news feed is the first real recurring cost and must be priced before its UI is committed (Section 11's addendum). AI usage is unmetered: no usage events are recorded, so there is no data to price tiers, no per-user attribution, and no bring-your-own-key escape valve (Sections 30-31). If marketing ever claims real-time data, licensed feeds move from free to one of the largest line items instantly."));
  out.push(p("The audit's cost discipline, applied throughout Part II and artifact J: every external service gets a free-tier-first candidate with hard limits verified, a BYOK variant where user activity drives variable cost, and a measured estimate at 100, 1,000, and 10,000 users before the feature ships. No feature enters a roadmap phase with an unpriced provider dependency."));

  // ── 21 ──
  out.push(h2("21. Free Alternatives"));
  out.push(p("The table below maps each required capability to a free-first option, its hard limits as publicly documented (to be re-verified before commit, per Section 65 - free never means unlimited), and the fallback or paid path if the free tier proves insufficient. Quantitative figures are planning estimates from public pricing pages as of the audit date and must be confirmed at implementation time."));
  out.push(tCaption("Free-first service map (verify limits before each Phase commit)"));
  out.push(table(
    ["Need", "Free-first choice", "Hard limits (verify)", "Fallback / escalation"],
    [
      ["Market data", "Yahoo Finance (existing proxy)", "Unofficial; undocumented rate limits; delayed", "Stooq fallback; Polygon/BYOK if real-time is marketed"],
      ["News / catalysts", "Finnhub company news", "About 60 requests/min on free tier (verify)", "Marketaux free tier; paid Benzinga via BYOK"],
      ["Database", "Supabase or Neon PostgreSQL", "About 0.5 GB / per-project free tiers (verify)", "Paid tiers scale past 1,000 users; measure in artifact J"],
      ["Web push", "VAPID Web Push", "Browser-quirk limited, effectively unlimited", "None needed"],
      ["Mobile push", "FCM", "Free with app shell (Phase 9)", "APNs free with developer account"],
      ["Email", "Resend or Brevo", "About 3,000/month or about 300/day (verify)", "Second provider behind EmailProvider interface"],
      ["AI", "GLM via bundled SDK + BYOK", "SDK quota; BYOK shifts cost to user", "OpenAI-compatible adapter for user keys"],
      ["Error tracking", "Sentry free tier", "About 5,000 errors/month (verify)", "Self-hosted GlitchTip"],
      ["Uptime", "UptimeRobot free tier", "50 monitors / 5-min intervals", "Healthchecks.io"],
    ],
    [16, 26, 30, 28]
  ));

  // ── 22 ──
  out.push(h2("22. What Should Be Preserved"));
  out.push(p("Section 61's instruction to identify and keep good existing work yields a long list, and preserving it is the difference between an upgrade and an unnecessary rewrite. The product philosophy is already correct: one externally unified product, analytics as the primary brain, SENTINEL as the optional action layer, observe mode as the default, and automation that cannot bypass deterministic risk limits. The implementation artifacts worth carrying forward largely intact are the following."));
  out.push(...bullets([
    "The five-screen information architecture and the dark terminal design language, including semantic colors and factor-transparency patterns.",
    "The 7-factor signal engine, its factor-contribution display, and the ATR-based trade plan construction.",
    "The session intelligence layer: ET session states, graded trading windows, and the daily playbook.",
    "The AI briefing and per-symbol analysis as product features (with the grounding fix from item 3).",
    "The server-side provider proxy pattern that keeps all secrets off the client.",
    "The honest marketing posture: the Reality Check section, the not-investment-advice framing, and the no-profit-claims discipline.",
    "The in-app Manual plus PDF, which becomes the seed of the Section 9 Help Center rather than a rewrite.",
  ]));

  // ── 23 ──
  out.push(h2("23. What Should Be Refactored"));
  out.push(p("Refactor targets are components whose concept survives but whose implementation must change shape to serve multiple users safely. The bot and its state move from one global singleton record to per-user rows with authenticated, validated, ownership-checked routes. Authentication middleware wraps every mutation endpoint, with CSRF and rate limiting added at the same seam. The Yahoo and GLM integrations move behind the Section 28 provider interfaces so fallbacks, health checks, and BYOK variants can appear without touching call sites."));
  out.push(p("The analytics pipeline gains its shared-cache and coalescing layer so one provider request serves all watchers, and indicator computation is memoized per symbol and range. The AI briefing gains a grounding pass - every generated level must trace to data passed in the prompt, with timestamps. The tick loop moves from client-forceable HTTP to an owned server scheduler. Error responses converge on one envelope so the friendly-error layer can be systematic. The watchlist becomes server-authoritative with localStorage demoted to cache. None of these changes the product's face; all of them are prerequisites for the phases that follow."));

  // ── 24 ──
  out.push(h2("24. What Should Be Replaced"));
  out.push(p("Four replacements are justified rather than refactors. The SQLite file database is replaced by managed PostgreSQL in Phase 1 - not because SQLite is bad, but because per-user row scoping, concurrent writers, and managed backups are table stakes for a SaaS and free tiers of Supabase or Neon provide them at zero cost. The client-driven tick is replaced by a server-side scheduler with single-owner semantics. The hero's LIVE and REAL-TIME DATA claims are replaced by an accurate delayed-data badge surfaced before the click-through, per Section 50's addendum - this is a copy change with legal weight, not a cosmetic one."));
  out.push(p("Finally, the localStorage-authoritative watchlist is replaced by server-side per-user watchlists (localStorage remains as an offline cache only). Everything else the audit examined - the framework, the hosting model, the design system, the component patterns, the manual, the signal and risk logic - is retained or refactored, consistent with the mandate's warning against deleting good existing work."));

  return out;
};
