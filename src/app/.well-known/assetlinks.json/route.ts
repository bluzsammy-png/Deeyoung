// DEEYOUNG PRO — Android App Links verification statement.
// Serves https://<host>/.well-known/assetlinks.json so the native Android app
// can claim https://deyoungpro.site deep links (autoVerify intent filters).
//
// Configuration (Railway variables — no code changes needed):
//   ANDROID_APP_PACKAGE  = applicationId, e.g. com.deeyoungs.pro (default)
//   ANDROID_APP_SHA256   = comma-separated SHA-256 fingerprints of the app's
//                          signing certs (debug + release). Get them with:
//                          keytool -list -v -keystore <keystore> | grep SHA256
//
// Until ANDROID_APP_SHA256 is set this returns a valid statement with no
// matching certificate: deep links keep working as normal links (Android shows
// the disambiguation dialog) and the site is unaffected.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  const pkg = process.env.ANDROID_APP_PACKAGE || "com.deeyoungs.pro";
  const fingerprints = (process.env.ANDROID_APP_SHA256 ?? "")
    .split(",")
    .map((s) => s.trim().replace(/^sha256:/i, "").toUpperCase())
    .filter(Boolean);

  return NextResponse.json(
    [
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: pkg,
          sha256_cert_fingerprints: fingerprints,
        },
      },
    ],
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
