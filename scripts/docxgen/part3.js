// part3.js — Part III (items 26–29) + Part IV (decisions)
module.exports = function build(H) {
  const { h1, h2, p, bullets, table, tCaption, note } = H;
  const out = [];

  out.push(h1("Part III - Implementation Sequence and Readiness (Items 26-29)"));

  // ── 26 ──
  out.push(h2("26. Exact Implementation Sequence"));
  out.push(p("The sequence below follows Section 63's phase order exactly, with two audit-driven adjustments that do not change the order: security hardening is pulled to the front of Phase 1 (items S1-S4 of item 5 are prerequisites for everything else, including honest testing), and each phase carries an explicit exit criterion so progress is verifiable rather than narrative. No phase begins until its predecessor's exit criteria are met and any Part IV decisions it depends on are answered."));
  out.push(tCaption("Phase plan with focus, key deliverables, and exit criteria"));
  out.push(table(
    ["Phase", "Focus", "Key deliverables", "Exit criteria"],
    [
      ["0 (done)", "Audit", "This document; evidence inventory; decision list", "Owner approves audit and answers Part IV"],
      ["1 - Foundation", "Security + data", "Auth, sessions, MFA-optional; PostgreSQL + migrations; per-user schema; provider interfaces; S1-S8 closed; admin bootstrap", "All mutations authenticated; per-user isolation verified; provider interfaces merged"],
      ["2 - Analytics brain", "Market + news", "Cached/coalesced pipeline; staleness states; news provider + catalyst entities; regime explanations; portfolio intelligence; AI grounding fix", "One provider request serves N watchers; catalysts carry source+time; briefing levels all grounded"],
      ["3 - Research", "Proof", "Signal ledger with outcomes; backtester with bias controls; walk-forward; Strategy Lab with versions", "Backtest metrics suite complete; live and backtest fill models identical"],
      ["4 - SENTINEL", "Action", "Per-user modes; full risk-gate control set; single-use approvals; ExecutionProvider + realistic fills; Alpaca Paper; kill switch + safety states", "Gate blocks every violation class in tests; approval replay impossible; kill switch drilled"],
      ["5 - Realtime", "Delivery", "Event bus fan-out; SSE/WebSocket updates; web push; email; notification center + deep links; delivery states", "Approval notification to action under 5 s; zero pretend-delivered states"],
      ["6 - SaaS", "Revenue", "Subscriptions (Stripe web); entitlements server-side; usage metering; BYOK; user + admin control centers", "Entitlement bypass tests pass; metering reconciles with provider dashboards"],
      ["7 - Security + reliability", "Hardening", "Audit trail (hash-chained); observability; idempotency everywhere; rate limits; Section 57/58 test suites; scale review at 1/100/1k/10k", "Security suite green; failure-mode drills pass; scale report accepted"],
      ["8 - UX/UI", "One product", "Unified dashboard polish; onboarding; contextual education; beginner/advanced split; friendly errors; marketing screenshots", "Onboarding completes unaided in tests; every complex concept has its explainer"],
      ["9 - Mobile", "Reach", "Responsive + PWA; mobile approval flow; native shells if decided; mobile push activation", "Approval in 1-2 taps on phones; store checklist clear if shells ship"],
      ["10 - Launch", "Trust", "Legal pages; disclaimers; status page; backups/recovery; monitoring; store compliance; final QA", "Launch checklist (item 28) fully green"],
    ],
    [11, 12, 45, 32]
  ));

  // ── 27 ──
  out.push(h2("27. Testing Strategy"));
  out.push(p("Testing follows Section 57's three tiers plus the security and performance suites, with one QuantEdge-specific rule: financial logic is tested by property, not just by example. Risk sizing, regime classification, and backtest metrics get property-based tests (for example, no sequence of inputs lets position risk exceed the cap), because example tests alone cannot cover the input space that decides whether a user's paper account behaves sanely."));
  out.push(...bullets([
    "**Unit:** every indicator (EMA, VWAP, RSI, MACD, Bollinger, ATR, relative volume, ROC) against known series; signal scoring with factor weights; position sizing from stop distance; regime classification edges; backtest metric math.",
    "**Integration:** market and news providers against recorded fixtures (no live calls in CI); auth and session flows; database scoping (user A can never read user B); broker adapter lifecycle; notification provider contracts.",
    "**End-to-end:** the full happy path signal, risk, SENTINEL, approval, execution, fill, notification - plus the failure paths Section 57 demands: stale data pauses automation, broker disconnect halts SENTINEL, provider outage degrades gracefully, approval expiry logs but never executes, duplicate submission fires once, kill switch stops everything.",
    "**Security:** the Section 58 suite as standing CI gates - cross-user access, broken authorization, approval replay, duplicate orders, entitlement bypass, rate-limit bypass, injection, XSS, CSRF.",
    "**Performance:** scripted load at 1, 100, 1,000, and 10,000 simulated users measuring API latency, cache hit ratio, provider request counts (the fan-out proof), and notification delivery time.",
  ]));

  // ── 28 ──
  out.push(h2("28. Launch Readiness Checklist"));
  out.push(p("The checklist below defines the Phase 10 gate. Each line is binary and evidence-backed; the right-hand column names the phase that produces the evidence, so launch readiness is built up across the program rather than assembled at the end."));
  out.push(tCaption("Launch gate (all lines must be green before charging any user)"));
  out.push(table(
    ["Area", "Requirement", "Evidence from"],
    [
      ["Security", "Auth live; MFA optional; S1-S8 closed; Section 58 suite green", "Phase 1 + 7"],
      ["Isolation", "Per-user scoping verified by adversarial tests; no shared financial state", "Phase 1"],
      ["Safety", "Kill switch drilled; safety states surfaced; approvals single-use and expiring", "Phase 4"],
      ["Honesty", "Delayed-data disclosure before click-through; no real-time claim; simulated vs paper labeled; no profit claims", "Phase 2 + 8"],
      ["Legal", "Terms of Service, Privacy Policy, refund/cancellation policy live and linked from site and app", "Phase 6 + 10"],
      ["Compliance", "Store requirements verified current (if shells ship); billing approach matches Section 35 addendum", "Phase 9 + 10"],
      ["Operations", "Status page; monitoring and alerting; backups and restore drill; support contact", "Phase 7 + 10"],
      ["Data integrity", "Idempotency verified under retry; audit trail hash-chain verified", "Phase 4 + 7"],
      ["Support", "Help Center covers Sections 9's map; contextual education present on complex concepts", "Phase 8"],
      ["Quality", "Full regression green on desktop, laptop, tablet, iPhone, Android", "Phase 8 + 9"],
    ],
    [16, 62, 22]
  ));

  // ── 29 ──
  out.push(h2("29. Marketing-Site Readiness"));
  out.push(p("The landing page's honest tone is a genuine asset, and its structural gaps are exactly the eight findings Section 70 anticipated; the audit verified each against the live page. Fixes are ordered by leverage, per Section 37's addendum that real screenshots outrank any font or color work."));
  out.push(...bullets([
    "**Add real product evidence:** screenshots of the terminal, a chart with the signal plan, and an example SENTINEL approval card - replacing an all-text pitch (verified: no imagery exists).",
    "**Publish the legal trio:** Terms of Service, Privacy Policy, and a refund/cancellation policy, plus contact information - required before charging anyone and by both stores at review (verified: absent).",
    "**Move the data-delay disclosure up:** the hero's LIVE and REAL-TIME DATA badges must be qualified before the click-through, not in the footer (verified: footer-only disclosure).",
    "**Rephrase TradingView-grade** to product-native language (verified claim).",
    "**Decide subscription billing before store submission:** web Stripe now, native IAP when shells exist (Section 35 addendum).",
    "**Price the news provider before the feature is marketed** (Section 11 addendum; item 21's map is the starting point).",
    "**Gate crypto marketing on its own risk calibration** (Section 4 addendum).",
    "**Frame Alpaca paper as the on-ramp it is**, with the live-trading regulatory flag kept explicit in any copy that mentions brokerage connectivity (Section 19 addendum).",
  ]));

  out.push(h1("Part IV - Decisions Required Before Implementation"));
  out.push(p("Section 64 asks for questions only where an answer materially changes cost, architecture, security, legal posture, or roadmap - and asks that everything else be decided by best practice and documented. Eight decisions meet that bar. Each is stated with a recommendation and the default that will apply if you prefer not to decide now; defaults follow the mandate's zero-cost, safety-first, web-first principles. These are the only blocking questions; everything else in this audit proceeds on documented best practice."));
  out.push(tCaption("Decisions, recommendations, and defaults"));
  out.push(table(
    ["#", "Decision", "Recommendation", "Default if unanswered"],
    [
      ["D1", "Multi-user timing: full multi-tenant now vs invite-only soft launch", "Multi-tenant schema in Phase 1; invite-only launch until Phase 6", "Multi-tenant schema; invite-only"],
      ["D2", "News provider budget: free tier first vs paid feed", "Finnhub free tier behind NewsProvider; cache and dedupe; revisit at 100 users", "Free tier first"],
      ["D3", "Subscription model and price point", "Free Analytics tier + paid Pro (SENTINEL Delegate, backtesting, advanced alerts); price set in Phase 6 with metering data in hand", "Two-tier model; price at Phase 6"],
      ["D4", "Data honesty: relabel hero as delayed vs license real-time", "Relabel now (free, honest); revisit licensed feeds only with revenue", "Relabel as delayed"],
      ["D5", "Alpaca Paper integration timing", "Phase 4 behind ExecutionProvider; live-money path stays unbuilt and flagged", "Phase 4, live path deferred"],
      ["D6", "Crypto scope", "Schema-ready in Phase 1 (assetClass, calibration table); feature return deferred to a post-Phase-4 cycle", "Schema-ready, feature deferred"],
      ["D7", "Mobile approach: PWA first vs native shells now", "Responsive + PWA in Phase 8/9; native only when store presence is needed", "PWA first"],
      ["D8", "Database migration timing", "PostgreSQL (Supabase or Neon free tier) in Phase 1 alongside auth work", "Phase 1 migration"],
    ],
    [6, 30, 40, 24]
  ));
  out.push(p("With this audit approved and the eight decisions answered (or defaulted), Phase 1 begins with security hardening and the foundation layer, on the sequence of item 26. The audit will be re-run in compressed form at the Phase 7 gate - re-verifying every item marked Inferred here against the then-current source - so that the launch decision in Phase 10 rests on verified rather than assumed ground."));
  return out;
};
