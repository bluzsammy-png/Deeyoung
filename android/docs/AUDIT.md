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
- **Google sign-in on Android**: SHIPPED in v1.0.1 as the native ID-token flow
  (Credential Manager -> `/api/auth/sign-in/social`); activates when the owner
  sets the Google OAuth env vars (steps in section 11).

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

---

## 11. v1.0.1 changelog (owner-reported defect round)

**Owner report: "app downloads but login says error; icon shows a z.ai logo,
not DeYoung; add Google login on sign in / sign up."** All three verified and
fixed:

1. **Login error (root cause, code-level).** better-auth answers
   `/sign-in/email` and `/sign-up/email` with an envelope
   `{ redirect, token, url, user:{...} }` (verified in better-auth 1.7.2
   `dist/api/routes/sign-in.mjs`). v1.0.0 declared the Retrofit return as flat
   `AuthUserDto` whose `id` is required, so kotlinx.serialization threw on
   EVERY login even with correct credentials; the interceptor had already
   stored the token but the UI showed "Sign-in failed". Fix: `AuthEnvelopeDto`
   envelope, `settleEnvelope()` only enters SignedIn when a real token was
   issued, new `ApiResult.VerifyEmail` surfaces the email-verification hold
   with a resend flow (`/api/auth/send-verification-email`). Regression tests
   pin the envelope shape (`AuthEnvelopeParseTest`, 6/6 green).
2. **Icon showed a Z (read as z.ai).** `ic_launcher_foreground.xml` and
   `ic_splash_logo.xml` were vectorized from the legacy `public/logo.svg`
   (white "Z" glyph; the site itself no longer uses it - PWA icons are the
   EdgeMark). Replaced with the real EdgeMark (white D + red rising wire +
   live dot): adaptive foreground scaled into the 66dp safe circle (verified
   by rendered preview), full-tile version for splash/auth, alpha-only
   `ic_notification.xml` for notifications, launcher background red ->
   #0B0B0D to match the site tile.
3. **Google sign-in (native, ID-token flow).** Credential Manager +
   `googleid` 1.1.1: `GetGoogleIdOption(serverClientId, nonce)` -> POST
   `/api/auth/sign-in/social {provider, idToken{token,nonce}}` (better-auth
   verifies the token server-side; bearer plugin emits `set-auth-token`,
   captured by the existing interceptor). Button on both Sign in and Create
   account; availability + client id probed at runtime from
   `/api/auth-methods` (now returns `googleClientId`), so NO rebuild is needed
   when the owner adds env vars. Account linking is already enabled
   server-side (trustedProviders: google), so Google lands in the existing
   account for the same email.

**Signing note (important).** The v1.0.0 debug-grade key was lost with a
sandbox reset (it lived in `~/.android`; private keys cannot be extracted from
an APK). v1.0.1 is signed with a NEW debug-grade key, now committed as a
managed keystore (`android/keystores/deeyoung-debug.keystore`, standard debug
credentials, pinned via `signingConfigs.getByName("debug")`) so every future
build signs identically and updates install in place. Consequence: v1.0.0
installs must uninstall once before installing v1.0.1. Current cert SHA-256
(use THIS value for `ANDROID_APP_SHA256` and the Google OAuth Android client):

```
d9103a3a2bd1c48b53060563c65bdf4ecf2c20044f11e55bcfc2464a3c11de9b
```

(The older `6a37dbd8...c750a` value is obsolete with v1.0.0.)

**Owner steps to switch Google sign-in on (free, ~10 minutes):**
1. console.cloud.google.com -> new project (e.g. `deeyoung-pro`).
2. OAuth consent screen: External, app name DeeYoung Pro, support email.
3. Credentials -> Create OAuth client ID, type **Web application**:
   - Authorized redirect URI:
     `https://deyoungpro.site/api/auth/callback/google`
     (add the Railway origin twin too if used).
   - This client id serves BOTH `GOOGLE_CLIENT_ID` (server) and the app's
     `serverClientId` (delivered via `/api/auth-methods`).
4. Credentials -> Create OAuth client ID, type **Android**:
   - Package name: `com.deeyoungs.pro`
   - SHA-1: fingerprint of the signing cert (managed debug keystore for now).
5. Railway variables: `GOOGLE_CLIENT_ID=<web client id>`,
   `GOOGLE_CLIENT_SECRET=<secret>`. The web button and the app's Google button
   activate on the next request - no rebuild.
