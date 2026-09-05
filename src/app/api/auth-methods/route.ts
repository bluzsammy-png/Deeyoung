// DEEYOUNG PRO — tells the client which sign-in methods are configured server-side.
// The auth gate uses this to show/hide "Continue with Google" without build-time coupling:
// the provider itself activates the moment GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET exist.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    {
      google: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
