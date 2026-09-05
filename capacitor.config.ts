// DEEYOUNG PRO — Capacitor native shell (Android/iOS).
// Strategy: server-driven app — the webview loads the live production site, so
// every improvement ships without app-store review lag. Native build is done by
// CI (.github/workflows/android-apk.yml → free GitHub Actions APK artifact).
//
// iOS reality check (honesty rule): Apple requires a paid Apple Developer
// account ($99/yr) + macOS/Xcode to sign and publish iOS apps — there is no
// free iOS store path for anyone. The SAME code works today on iOS via the
// PWA: open the site in Safari → Share → "Add to Home Screen" (manifest
// already ships). The Android APK is the free native path and is built by CI.
import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.deeyoungs.pro",
  appName: "DeeYoung Pro",
  webDir: "public",
  server: {
    url: process.env.CAP_SERVER_URL || "https://deeyoung-production.up.railway.app",
    cleartext: false,
    androidScheme: "https",
  },
  android: { allowMixedContent: false },
  ios: { contentInset: "always" },
};

export default config;
