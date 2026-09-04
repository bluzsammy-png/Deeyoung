# DeeYoung Pro — Multi-Agent Worklog

(Restarted 2026-09-04 — prior worklog lost with the sandbox reset. History preserved in git log.)

---
Task ID: 9
Agent: main (Super Z)
Task: Answer "does the bot perform well / need extra update", wire MetaApi bridge (token delivered), pivot to OANDA after MetaApi abandonment, rebuild live-run harness.

Work Log:
- Verified production runs latest commit: deployment `feac61ba` SUCCESS on `6993411` (learning brain + candlestick module live). Boot logs clean, Prisma synced.
- Analyzed brain code: adaptive weights clamped [0.5,1.5], n>=20 before a factor moves, per-minute refresh, CATALYST/REGIME excluded, journaling on every close, dead-hour guards.
- Walk-forward proof (in commit ff6bcce): discipline guards cut max drawdown 9.4-11.5% → 2.06%, net loss -8.9/-9.1% → -1.85% on unseen 30d. Net-of-cost profitability NOT yet achieved (honest).
- User delivered MetaApi token. Verified JWT structurally perfect (RS512, complete 512-byte signature, iat 2026-09-04T05:35Z, no transport corruption).
- MetaApi endpoint forensics: `api.metaapi.cloud` + `metatrader-api-v1.*` UNREACHABLE from sandbox AND Railway (fetch failed); `mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai` reachable but rejects the token 401 on the SDK's own first-call endpoint (`/users/current/servers/mt-client-api`) with the exact header the official SDK uses. Verdict: token generated from wrong dashboard section (MT Manager API page) — user was stuck there earlier.
- Built `/api/brokers/metaapi-diag` route + boot-time bridge self-check in `src/instrumentation.ts` (aggregate log lines only, never echoes secrets). Deployed via `serviceInstanceDeployV2` pinned SHA (deploys `809fb0da`, `d27356e6`).
- Rebuilt `scripts/live-run.ts` (lost in reset): chunked foreground runs, `resume` keeps open positions, 4 books (gates 65/70 × M10/M30), 15s poll, 2min scan stride, $10k notional, 22bps RT cost, per-book 30min cooldowns, worst-case stop-first; NOW wired to the learning brain: adaptiveWeights per horizon fed to computeSignal, outcomes journaled on every close (factor attribution, hourUtc, ATR bucket), playbook guards (score≥65, RR≥1.5, ≤3 concurrent, -2R day cap, 30min loss cooldown, brain-measured dead hours), brain persisted to liverun-brain.json per minute. Smoke tests clean (0 feed errors). Force-added to git (`scripts/` is gitignored).
- Fixed corruption in `scripts/validation-campaign.ts` line 195 (`sigByH]` → `sigByH[h]`) — present in committed HEAD 73554e3; discovered dev-server (`bun run dev`/next dev) held stale file state that reverted in-place edits; defeated via atomic rename from patched copy.
- USER DECISION: "forget about meta api lets use something else" → pivot to OANDA fxTrade Practice (verified reachable: proper 401s) as primary FX venue; Alpaca paper verified reachable as future US-stocks venue.
- Built `src/lib/brokers/oanda.ts`: v20 practice REST adapter (account summary, pricing, market orders w/ SL/TP fills, open positions, notional→units conversion, honest PENDING_BRIDGE states).
- Rewrote diag route + boot self-check to be OANDA-aware; MetaApi marked RETIRED in code.
- Scrubbed `METAAPI_TOKEN` from Railway env (variableDelete) — dead credential removed.

Stage Summary:
- Production: latest code live; bridge self-check logs OANDA state at every boot.
- Awaiting from user: OANDA practice token (signup → Manage API Access → generate), account id auto-discovered by me via /v3/accounts.
- Live paper run harness ready; run `bun scripts/live-run.ts --max-minutes 9` (+ `resume`) each session to accumulate real trades for the brain.
- Secrets handling: MetaApi token (rejected anyway) scrubbed from Railway; never written to worklog; user rotates all keys at wrap-up.
