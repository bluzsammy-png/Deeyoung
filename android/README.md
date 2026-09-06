# DeeYoung Pro — Native Android Client

A real native Android application (Kotlin + Jetpack Compose + Material 3) for
[deyoungpro.site](https://deyoungpro.site). It is a **client** of the existing
Next.js backend: same API, same database, same accounts. No WebView, no
duplicated business logic, no secrets in the app.

## Architecture

```
deyoungpro.site (Next.js, unchanged)  ←  web users
        ↕ shares
Railway backend (API + Postgres/Supabase)
        ↑
Android app (this folder)
  single Activity → Compose NavHost → ViewModels → Repositories → Retrofit/OkHttp
  session token: better-auth bearer, stored in Keystore-encrypted prefs
```

- `app/src/main/kotlin/com/deeyoungs/pro/core/` — DI container, network, session, settings, formatting
- `data/` — Retrofit API interface, DTOs (kotlinx.serialization), repositories, offline cache
- `ui/` — theme (Crimson Luxe), navigation, components, screens
- `push/` — WorkManager alert poller (works today) + FCM registrar (activation-gated)

## Build

Requirements: JDK 17 (or 21), Android SDK 35. Then:

```bash
cd android
./gradlew :app:assembleDebug     # debug APK  → app/build/outputs/apk/debug/
./gradlew :app:assembleRelease   # release APK → app/build/outputs/apk/release/
./gradlew :app:bundleRelease     # AAB for Google Play
./gradlew :app:testDebugUnitTest # unit tests
```

`gradle.properties` holds the configuration:
- `DEEYOUNG_BASE_URL_RELEASE` — production API base (default: the Railway origin)
- `DEEYOUNG_BASE_URL_DEBUG` — emulator local dev (10.0.2.2:3000)

## Release signing (Play-ready)

1. Generate a keystore (keep it PRIVATE, it is gitignored):
   ```bash
   keytool -genkeypair -v -keystore keystore.properties-placeholder.jks \
     -alias deeyoung -keyalg RSA -keysize 2048 -validity 10000
   ```
2. Create `android/keystore.properties` (gitignored):
   ```
   storeFile=../keystores/deeyoung-release.jks
   storePassword=...
   keyAlias=deeyoung
   keyPassword=...
   ```
3. `./gradlew :app:assembleRelease` — signed automatically.
4. Get the fingerprint for App Links:
   ```bash
   keytool -list -v -keystore <your.jks> -alias deeyoung | grep SHA256
   ```

## App Links (deyoungpro.site)

The backend serves `/.well-known/assetlinks.json` (added in this change).
On Railway set:
- `ANDROID_APP_PACKAGE=com.deeyoungs.pro`
- `ANDROID_APP_SHA256=<SHA256 from the step above>`

Android then auto-opens `https://deyoungpro.site/...` links in the app.
Until then, links open in the browser and the `deeyoung://` scheme works.

## Background push (optional, free)

The app already raises native notifications for HIGH/CRITICAL account events
via a periodic WorkManager poll (no Firebase needed).

For real-time push: create a free Firebase project, add Android app
`com.deeyoungs.pro`, drop `google-services.json` into `android/app/`, set the
`FCM_*` properties in `gradle.properties`, add the `firebase-messaging`
dependency and the `google-services` plugin, rebuild. `PushRegistrar` then
registers the device token at `POST /api/mobile/push` automatically.

See `docs/AUDIT.md` for the full conversion audit.
