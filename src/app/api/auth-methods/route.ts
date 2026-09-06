// DEEYOUNG PRO — tells the client which sign-in methods are configured server-side.
// The auth gate uses this to show/hide "Continue with Google" without build-time coupling:
// the provider itself activates the moment GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET exist.
// googleClientId (the WEB OAuth client id) lets the native Android app run the
// Credential Manager ID-token flow -> /api/auth/sign-in/social without hardcoding it.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  const google = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  return NextResponse.json(
    {
      google,
      googleClientId: google ? process.env.GOOGLE_CLIENT_ID : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
