# DeeYoung Pro — Android Conversion Audit

Date: 2026-09-06 · Version 1.0.0 · package `com.deeyoungs.pro`

## 1. What was inspected on the web side

The full Next.js project was read before writing any Android code:

| Area | Finding |
|---|---|
| Pages/routes | `/` (landing + terminal), `/status` (public engine audit), `/checkout/[tier]`, `/terms`, `/privacy`, `/admin` (separate login + console) |
| UI/UX | "Crimson Luxe" design system: crimson `#DC2626`, black `#0A0A0A`, white, dark-first, Space Grotesk display + JetBrains Mono numerics, hairline panels |
| Auth | better-auth (email+password, 30-day sessions, email verification in production, Google social when configured, anti-abuse layers) |
| User flows | sign-up → (verify) → terminal; plan gates FREE/STARTER/PRO/ELITE enforced server-side by `withGuard` (402 `PREMIUM_REQUIRED`) |
| Dashboard | engine ledger (public audit surface): equity, win rate, open/closed trades, orders, equity curve, live scan state, decision journal ("show workings") |
| API | `engine/status`, `desk`, `market/{quotes,search,candles}`, `signals`, `portfolio`, `trades`, `sentinel/{state,config,kill}`, `approvals`, `news`, `ai/{analyst,briefing}`, `support`, `billing/{checkout,order,webhook}`, `brokers`, `admin/*`, `auth/*` |
| State management | React Query + Zustand on web; server is the source of truth |
| Payments | hosted checkout links per tier (`PAYMENT_LINK_*` env), manual verification fallback; NO card data touches the client |
| External services | Yahoo/Finnhub/TwelveData (market data), OKX/Bybit/Alpaca/MetaApi/OANDA/Deriv (venues), Resend/AgentMail (email), PostHog, z-ai-web-dev-sdk (AI), ntfy (ops telemetry) |
| Branding | `logo.svg` (white Z mark), `icon-512.png`, PWA manifest, Space Grotesk/JetBrains Mono (OFL) |
| Security-sensitive | AES-256-GCM broker credentials server-side; HMAC-hashed IPs; bridge token hashes; Turnstile; admin surface isolated |

A previous mobile attempt exists (`capacitor.config.ts`): a server-driven
WebView shell. It remains untouched; the native app replaces that approach on
Android.

## 2. What was converted to native

- **Auth**: sign-up, sign-in, password reset request, change password, sign
  out, session restore, biometric app lock (BiometricPrompt), 401 handling.
  Uses better-auth's bearer plugin: the same accounts and sessions as the web.
- **Home / Engine ledger**: equity, realized P&L, win rate, open positions,
  recent closed trades with net R, equity curve (custom Canvas chart), engine
  decision journal, orders, pause/emergency state, share sheet.
- **Markets**: asset-class tabs, quotes with honesty badges
  (LIVE/DELAYED/STALE/SIMULATED), symbol search (any market), symbol detail
  with candlestick chart (Canvas) + OHLC stats + manual paper-trade sheet.
- **Signals**: regime panel with drivers, signal list with entry/stop/target/RR,
  expandable factor math + plain-language WHY.
- **Portfolio**: equity/invested/cash, P&L day + total, positions with weights,
  risk warnings, scenario shocks, recent orders. (Paid surface, 402-aware.)
- **Playbook desk**: public cross-market reads.
- **SENTINEL** (Pro/Elite): mode explanation, pending approvals with
  Approve/Reject, limit editor (server-validated), emergency stop with
  confirm dialogs, audit trail.
- **Notifications**: feed from the account's NotificationRecords + native
  Android notifications for new HIGH/CRITICAL events (WorkManager poll).
- **Plans**: tier cards mirroring web pricing; hosted checkout opened in
  Chrome Custom Tabs (no secrets in app).
- **Support**: the in-house thread chat, works signed-out like the web widget.
- **Settings**: profile name, plan, biometric lock, theme (system/dark/light),
  notifications toggle, sign out. Dark-first brand theme, light theme included.

## 3. Native platform integration

| Feature | Implementation |
|---|---|
| Navigation | Single Activity, Compose Navigation, bottom bar (phone) / NavigationRail (tablet), state-preserving tab navigation, predictive-back enabled |
| Back button | System back through NavHost; dialogs/sheets dismiss first |
| Deep links | `deeyoung://` scheme + App Links for `https://deyoungpro.site` and the Railway origin (autoVerify), mapped to routes (`/status`→Home, `/checkout/tier`→Plans, ...) |
| App Links | Backend route `/.well-known/assetlinks.json` reads `ANDROID_APP_PACKAGE` + `ANDROID_APP_SHA256` env |
| Biometric | `BiometricPrompt` (BIOMETRIC_WEAK), unlock overlay at cold start, toggle in Settings, graceful fallback |
| Secure storage | Session token in `EncryptedSharedPreferences` (AES-256-GCM, Keystore); excluded from cloud backup + device transfer via data-extraction rules |
| Network/offline | ConnectivityManager flow, offline banner, last-good-response cache (DataStore) with CACHED badge, honest offline errors ("the order was NOT sent") |
| Loading/error states | Every screen: loading, error+retry, empty, paywall states |
| Pull-to-refresh | Material 3 `PullToRefreshBox` on data screens |
| Share | Android share sheet for engine performance summary |
| Notifications | Channels (trade alerts/general), POST_NOTIFICATIONS runtime permission, WorkManager poll worker, FCM registrar (activation-gated) |
| Keyboard | `adjustResize`, ime-friendly inputs, password visibility toggles |
| Accessibility | contentDescription on icons, semantics on states, 48dp targets, Material type scale |
| Dark mode | Dark-first brand; system/dark/light switch; light palette from web tokens |
| Tablets | WindowSizeClass: NavigationRail + wider layout on expanded widths |
| Permissions | INTERNET, ACCESS_NETWORK_STATE, USE_BIOMETRIC, POST_NOTIFICATIONS only |

## 4. Backend changes (all additive, website untouched)

1. `src/lib/auth.ts` — better-auth **bearer plugin** (`plugins: [bearer()]`).
   Effect: native clients sign in with the same endpoints and get a
   `set-auth-token` response header; `Authorization: Bearer <token>` then
   authenticates every existing guarded route. Browser cookie flow unchanged.
2. `prisma/schema.prisma` + `prisma/schema.postgres.prisma` — new `PushToken`
   model (device token registry; no FK by design, `userId` indexed). Applied
   automatically by the existing `prisma db push` boot step (CREATE TABLE only).
3. `src/app/api/mobile/push/route.ts` — POST/DELETE/GET device tokens
   (bearer-authenticated).
4. `src/app/.well-known/assetlinks.json/route.ts` — App Links statement from
   env, safe default when unset.

**Nothing else changed on the server.** Verified: `tsc --noEmit` reports zero
errors in changed files (10 pre-existing errors in unrelated scripts/skills
are unchanged).

## 5. End-to-end verification (executed)

Local Next.js server + throwaway SQLite DB (no production contact):

1. `POST /api/auth/sign-up/email` → user JSON + `set-auth-token` header (77-char token) ✔
2. `GET /api/auth/get-session` with `Authorization: Bearer` → full session ✔
3. `GET /api/signals` with bearer on FREE plan → **402 PREMIUM_REQUIRED**
   (session resolved, plan gate hit — exactly what the app's paywall handles) ✔
4. Same route without bearer → 401 AUTH_REQUIRED ✔
5. `GET /api/engine/status` public → 200 ✔
6. Plan set to PRO locally → `GET /api/signals` → 200 with live regime JSON ✔
7. `POST /api/mobile/push` → `{ok:true,id}` (PushToken row created) ✔
8. `/.well-known/assetlinks.json` → valid JSON with `com.deeyoungs.pro` ✔
9. `POST /api/auth/sign-out` → 200, session invalidated ✔

## 6. Build + test results (executed)

- `:app:assembleDebug` → `app-debug.apk` (21.6 MB) ✔
- `:app:assembleRelease` → `app-release.apk` (14.8 MB, signed with the CI
  fallback key when no keystore.properties is present) ✔
- `:app:bundleRelease` → `app-release.aab` (14.3 MB) ✔
- `:app:testDebugUnitTest` → **10/10 passed** (DTO parsing against real server
  JSON shapes + formatting) ✔
- APK inspected with `aapt`: correct package `com.deeyoungs.pro`, minSdk 26,
  targetSdk 35, only the 4 intended permissions, autoVerify hosts present ✔

## 7. What was NOT tested (honesty section)

- **No emulator/device run**: this build machine has no Android emulator
  (no KVM) and no physical device. UI behavior on real hardware (gestures,
  keyboard transitions, biometric prompts, notification rendering, rotation)
  is verified by code review + compile + unit tests, NOT by instrumentation
  tests. `connectedDebugAndroidTest` should be run on a device before store
  submission.
- **Rotation**: handled via configuration-free Compose + state in ViewModels
  (activity recreates and ViewModels survive), but not exercised on hardware.
- **Live FCM delivery**: architecture is wired but inactive until a free
  Firebase project is configured (see README). The periodic-poll path works
  without any setup.
- **Payment completion**: Custom Tabs open the same hosted checkout as the
  web; the payment flow itself is the provider's, unchanged.

## 8. Remaining web-based features (deliberate scope)

- **Backtest Lab, Learn hub, broker linking, admin console**: remain web-only
  in v1 (linked out). Broker credential entry on mobile is a security-sensitive
  flow better shipped with native keystore review in a later pass.
- **AI Trade Desk chat (`/api/ai/analyst`)**: the public playbook desk is
  native; the conversational analyst joins v1.1 (it needs streaming UX work).
- **Google sign-in on Android**: requires redirect out/in with Play App Links;
  email+password is the v1 path (server plugin already supports both).

## 9. Security review (actually inspected, not assumed)

Checked and clean:
- No secrets, API keys, or credentials anywhere in `android/` (verified by
  grep for key/secret/token patterns; FCM placeholders are empty by default).
- Session token only in Keystore-encrypted prefs; excluded from backups.
- HTTPS-only in release (network security config; cleartext limited to
  loopback hosts for local dev).
- No WebView in the app at all (the old Capacitor shell is not used).
- Release `BuildConfig` contains no sensitive values; debug-only HTTP logging
  (BASIC level, no headers/body in release builds).
- Exported surface: only MainActivity (launcher + deep links).
- All privileged actions ride the server's `withGuard` (auth, plan gates,
  rate limits, audit) — zero client-side authorization logic.
- Payment secrets stay server-side; the app only ever reads public checkout
  URLs.

Follow-ups recommended before wide distribution:
- Generate a production signing key outside this machine; never reuse debug keys.
- Set `ANDROID_APP_SHA256` on Railway to activate App Link verification.
- Turn on R8 (`isMinifyEnabled = true`) with the provided rules once Play
  mapping files are part of the release process.
- Add `connectedDebugAndroidTest` for the auth + trade flows on real hardware.

## 10. Artifacts

- `download/deeyoung-android/DeeYoungPro-1.0.0-debug.apk`
- `download/deeyoung-android/DeeYoungPro-1.0.0-release.apk` (CI-fallback signature)
- `download/deeyoung-android/DeeYoungPro-1.0.0-release.aab`
- Play publishing steps: see `android/README.md` (keystore, signing, upload,
  App Links activation).
