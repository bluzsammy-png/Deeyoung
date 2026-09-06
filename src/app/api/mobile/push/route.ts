// DEEYOUNG PRO — native mobile push token registry (Android first).
// The Android client registers its FCM token here so the backend can fan out
// notifications later (trade fills, approvals, stop/target hits). This route
// only STORES tokens: sending infrastructure (Firebase admin SDK or an
// equivalent free relay) is a documented follow-up and is intentionally NOT
// wired into the engine in this change — zero risk to the running website.
//
// Auth: same better-auth session the web app uses; native clients send
// `Authorization: Bearer <token>` (see src/lib/auth.ts bearer plugin).
// Body: { token: string, platform?: "ANDROID" | "IOS" }

import { NextResponse } from "next/server";
import { withGuard } from "@/lib/guard";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const TOKEN_MAX = 4096;

/** POST /api/mobile/push — register (or refresh) this device's push token. */
export const POST = withGuard(async (req: Request, { user }) => {
  const body = await req.json().catch(() => null);
  const token = String(body?.token ?? "").trim();
  const platform = String(body?.platform ?? "ANDROID").toUpperCase() === "IOS" ? "IOS" : "ANDROID";
  if (!token || token.length > TOKEN_MAX) {
    return NextResponse.json({ error: "A push token is required." }, { status: 400 });
  }

  const row = await db.pushToken.upsert({
    where: { token },
    create: { userId: user.id, token, platform },
    update: { userId: user.id, platform },
  });
  return NextResponse.json({ ok: true, id: row.id });
});

/** DELETE /api/mobile/push — unregister (sign-out, notifications disabled). */
export const DELETE = withGuard(async (req: Request, { user }) => {
  const body = await req.json().catch(() => null);
  const token = String(body?.token ?? "").trim();
  if (!token) return NextResponse.json({ error: "A push token is required." }, { status: 400 });
  await db.pushToken.deleteMany({ where: { token, userId: user.id } }).catch(() => undefined);
  return NextResponse.json({ ok: true });
});

/** GET /api/mobile/push — how many devices are registered to this account. */
export const GET = withGuard(async (_req, { user }) => {
  const n = await db.pushToken.count({ where: { userId: user.id } });
  return NextResponse.json({ count: n });
});
