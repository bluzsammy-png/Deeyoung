// part2.js — Part II: item 25 + artifacts A–J
const DIAG = "/home/z/my-project/audit/diagrams/";

module.exports = function build(H) {
  const { h1, h2, p, bullets, table, tCaption, figure, note } = H;
  const out = [];

  out.push(h1("Part II - Recommended Final Architecture (Item 25, Artifacts A-J)"));
  out.push(p("Item 25's recommendation is deliberately conservative: **keep the Next.js monolith and the existing product surface, and grow it into the target architecture by adding layers rather than by rewriting**. The monolith is deployed, debuggable, and aligned with zero-cost hosting; premature decomposition would spend Phase 1 budget on infrastructure theater. What changes is what surrounds the route handlers: provider adapters in front of every external dependency; a shared analytics pipeline with caching and coalescing; a deterministic risk engine and SENTINEL orchestrator as distinct modules; per-user data in PostgreSQL behind authenticated routes; an event bus feeding a real notification service; an entitlement service separating billing from capability; and an observability and audit substrate. Figures 1 through 6 render the architecture; artifacts G through J cover security, mobile, SaaS, and cost in tabular form."));

  // ── A ──
  out.push(h2("A. System Architecture"));
  out.push(p("Figure 1 shows the two-brain system end to end. Data flows downward through six layers - clients, the API and session layer, the Analytics Brain, the Decision layer, the SENTINEL action layer, and execution - while four cross-cutting services (event bus, notification service, audit trail, observability) run alongside. Two invariants deserve restating because the whole diagram enforces them: the Analytics Brain works with SENTINEL completely disabled, and AI reasoning annotates but never decides - every candidate order passes the deterministic risk gate regardless of mode."));
  out.push(...figure(DIAG + "fig-system.png", "Target system architecture: two brains, one product, with cross-cutting services"));

  // ── B ──
  out.push(h2("B. Database and Data Model"));
  out.push(p("Figure 2 renders the core entity model grouped into six domains - identity and SaaS, market data and intelligence, signals and performance, trading and execution, risk and SENTINEL, and operations - with key fields listed per entity. Two design rules bind the whole model: every user-owned row carries a userId and queries are scoped by it at the repository layer, and the audit trail is append-only with a hash chain so tampering is detectable. The model includes the crypto-ready fields (assetClass, per-class calibration) and the strategy-versioning structure now, while they are cheap, per item 12's warning against retrofitting."));
  out.push(...figure(DIAG + "fig-datamodel.png", "Core data model: six domains, per-user isolation, append-only audit"));
  out.push(p("Migration mechanics: Phase 1 introduces PostgreSQL alongside SQLite, defines this schema with a real migration tool, backfills the derived history (trades, signals) that is worth keeping, and flips reads behind feature flags. The watchlist moves first because it is low-risk and immediately user-visible."));

  // ── C ──
  out.push(h2("C. Provider Architecture"));
  out.push(p("Figure 3 shows the eight Section 28 interfaces with their implementations and build phases. The governing rules: every external dependency sits behind an interface; every free tier's limits are measured before the feature ships; secrets stay server-side and encrypted, never returned by any API; and BYOK adapters shift variable cost to the user where user activity drives it. The interface set is also the lock-in insurance the mandate demands - Yahoo can be replaced by Stooq or Polygon without touching product code, and a live broker can appear later behind the same ExecutionProvider without a rewrite."));
  out.push(...figure(DIAG + "fig-providers.png", "Provider abstraction: interfaces, implementations, phases, and cost posture"));

  // ── D ──
  out.push(h2("D. Analytics Architecture"));
  out.push(p("Figure 4 traces the analytics pipeline from ingest through normalization, indicator computation, the three engines (regime, signal, catalyst), opportunity aggregation, and serving. The pipeline is shared infrastructure: one provider request serves every watcher of a symbol, indicator series are memoized per symbol and range, and every generated signal is persisted with its factors and later its outcome - the honesty ledger that lets the product measure its own engine. Portfolio intelligence runs as a sibling service over positions and history, producing the concentration and correlation warnings Section 15 requires."));
  out.push(...figure(DIAG + "fig-analytics.png", "Analytics pipeline: shared computation from ingest to serving"));

  // ── E ──
  out.push(h2("E. SENTINEL Architecture"));
  out.push(p("Figure 5 renders the action layer as a five-stage pipeline with its safety machinery. The deterministic risk gate sits between candidates and the mode router and checks the full Section 16 control set, including the asset-class calibration the Section 4 addendum requires. The mode router preserves today's three-mode UX with Observe as factory default; approvals become single-use, user-bound, expiring, audited artifacts; execution goes through the provider adapter with idempotent submission and realistic fills; and the position monitor enforces exits mechanically, feeding outcomes back into the signal ledger."));
  out.push(...figure(DIAG + "fig-sentinel.png", "SENTINEL pipeline: deterministic gate, mode router, execution, monitoring, kill switch"));

  // ── F ──
  out.push(h2("F. Notification Architecture"));
  out.push(p("Figure 6 shows the event-driven notification path: sources publish once to the event bus; the notification service deduplicates, applies per-user preferences, importance thresholds, and quiet hours, and tracks delivery states honestly; channels activate in the mandated order - web push and email in Phase 5, mobile push only when Phase 9 produces installable shells. Every notification carries a deep link to the exact screen it concerns, with the approval card as the canonical example."));
  out.push(...figure(DIAG + "fig-notifications.png", "Notification architecture: event sources, bus, service, channels, deep links"));

  // ── G ──
  out.push(h2("G. Security Architecture"));
  out.push(p("Security is layered so that no single failure exposes user data or money-equivalent state. The table below assigns the Section 46 control set to layers, with the Phase 1 items marked as foundational. The design principle throughout is that the server never trusts the client: entitlements, ownership, and risk limits are checked server-side on every privileged action, and the AI layer is architecturally incapable of overriding any of them."));
  out.push(tCaption("Security control layers"));
  out.push(table(
    ["Layer", "Controls"],
    [
      ["Edge", "HTTPS everywhere; secure headers (CSP, HSTS, frame options); platform WAF; per-IP throttling in front of auth and mutation routes"],
      ["Identity", "Email/password with verification; password reset; secure session cookies; optional MFA; device and session management; brute-force lockout; suspicious-login detection"],
      ["Authorization", "Per-user row scoping at the repository layer; server-side entitlement checks on every privileged route; admin roles (SUPER_ADMIN, ADMIN, SUPPORT, ANALYST) with least privilege"],
      ["Input", "Schema validation on every route; CSRF tokens on mutations; XSS-safe rendering; parameterized queries"],
      ["Secrets", "Server-side only; encrypted at rest; never logged, never returned in API responses; BYOK secrets encrypted per user"],
      ["Trading integrity", "Idempotency keys on orders and approvals; single-use approval tokens; deterministic risk gate with no AI bypass; emergency stop with cancel-pending semantics"],
      ["Audit", "Append-only, hash-chained AuditEvent log covering logins, settings, risk and SENTINEL changes, approvals, rejections, orders, fills, kill switch, and admin actions (Section 45)"],
      ["Verification", "The Section 58 test suite as a standing gate: cross-user access, broken authorization, key leakage, session attacks, injection, XSS, CSRF, rate-limit bypass, entitlement bypass, approval replay, duplicate orders"],
    ],
    [18, 82]
  ));

  // ── H ──
  out.push(h2("H. Mobile Architecture"));
  out.push(p("One brain, three surfaces. The web terminal remains the flagship; the mobile experience is a dedicated responsive layout of the same product - bottom navigation (Home, Markets, Signals, Portfolio, More), approval cards designed for one-or-two-tap decisions, charts adapted for touch - shipped as a PWA with a manifest and service worker so it installs to a home screen and survives offline starts. Native shells (wrapped or fully native) arrive only when store distribution is genuinely needed, consuming exactly the same APIs; the push sequencing addendum binds mobile push to that moment (Section 25)."));
  out.push(p("The audit recommends committing to the PWA-first path now (Part IV, decision 7) because it preserves the zero-cost posture, avoids the App Store review and in-app-purchase constraints until there is revenue to justify them, and keeps the Section 36 requirement - the same backend intelligence on every surface - structurally guaranteed rather than aspirational."));

  // ── I ──
  out.push(h2("I. SaaS Architecture"));
  out.push(p("Multi-tenancy is a single database with per-user scoping, not per-tenant databases - the scale profile (many small users) and the free-tier budget both point that way. Billing and entitlements stay separate (Section 35): Stripe checkout on the web first, StoreKit and Play Billing when native shells exist, both feeding one EntitlementService whose decisions are enforced server-side. Usage metering records provider, service, units, timestamp, and estimated cost per user (Section 31), which later becomes the pricing backbone; BYOK keys are encrypted, per-user, and never returned (Section 30)."));
  out.push(p("The admin control center (Section 47) reads from the same observability and audit substrate users never see: users and subscriptions, provider health, usage, failed notifications, background jobs, and security events, with the four-role model. The user control center (Section 48) consolidates trading, SENTINEL, notification, provider, broker, and account settings into one friendly surface - most of which exists today as scattered bot sliders and needs reorganization, not invention."));

  // ── J ──
  out.push(h2("J. Cost Model"));
  out.push(p("The table below states the operating cost posture at four scale points, using the free-first map of item 21. Figures are planning estimates in US dollars per month based on public pricing as of the audit date; Section 65 requires them re-verified against current provider pages at each phase gate. The pattern to note is that cost stays at effectively zero through the first several hundred users on free tiers, and the first meaningful line items - database beyond free capacity, news above free request limits, and email volume - arrive only with real traction, by which point the subscription under decision 3 funds them."));
  out.push(tCaption("Monthly operating cost posture (planning estimates - verify at each phase gate)"));
  out.push(table(
    ["Service", "Now (1 user)", "100 users", "1,000 users", "10,000 users", "Escalation path"],
    [
      ["Hosting (current platform)", "$0 (bundled)", "$0", "$0 - low", "Low - moderate", "Scale within platform; container hosting if needed"],
      ["Market data (Yahoo proxy)", "$0", "$0", "$0 (cache-coalesced)", "$0 + Stooq fallback", "Polygon BYOK/paid only if real-time claimed"],
      ["News (Finnhub free tier)", "$0", "$0 (cached, deduped)", "$0 - low (limits reached)", "Paid tier or BYOK", "Marketaux fallback; Benzinga via BYOK"],
      ["PostgreSQL (Supabase/Neon)", "$0", "$0", "$0 - $25", "$25 - $100", "Paid tiers; measure storage and connections"],
      ["AI (GLM + metering + BYOK)", "$0 (bundled)", "$0 - low", "Low (metered, BYOK share)", "Moderate", "BYOK shifts heavy usage to users"],
      ["Push + email", "$0", "$0", "$0 - low", "Low", "Second email provider behind interface"],
      ["Monitoring (Sentry/Uptime)", "$0", "$0", "$0", "$0 - low", "Paid tiers or self-hosted"],
      ["Total (indicative)", "About $0", "About $0", "Under ~$50", "Under ~$250", "Funded by subscription before it bites"],
    ],
    [20, 13, 13, 15, 15, 24]
  ));
  out.push(note("Reading the table: the -low and -moderate ranges are deliberate. The mandate forbids designing around fake unlimited-free assumptions, so every cell with growth is paired with a measured escalation path rather than a hopeful zero."));
  return out;
};
