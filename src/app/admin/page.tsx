// DEEYOUNG PRO — /admin server gate. Renders the client console when the
// visitor is a signed-in admin; otherwise renders the standalone sign-in or
// a hard 403 — never a blank screen, never a false welcome.

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { AdminConsole, AdminSignIn, AdminForbidden } from "./console";

export const dynamic = "force-dynamic";

// Google sign-in button renders only when the provider is configured server-side.
const GOOGLE_ENABLED = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

async function adminEmails(): Promise<string[]> {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export default async function AdminPage() {
  let email: string | null = null;
  let userId: string | null = null;
  let role: string | null = null;
  let status: string | null = null;
  try {
    const h = await headers();
    const session = await auth.api.getSession({ headers: h });
    if (session?.user) {
      userId = session.user.id;
      email = String(session.user.email ?? "").toLowerCase();
      role = session.user.role ?? null;
      // status is an additional field — read the row for the ground truth
      const row = await db.user.findUnique({ where: { id: session.user.id }, select: { status: true, role: true } });
      status = row?.status ?? null;
      role = row?.role ?? role;
    }
  } catch {
    // db/auth warming — render sign-in rather than crashing the route
  }

  if (!email || !userId) return <AdminSignIn googleEnabled={GOOGLE_ENABLED} />;
  if (status === "BANNED" || status === "SUSPENDED") return <AdminForbidden reason={`Account ${status.toLowerCase()}.`} />;

  const listed = (await adminEmails()).includes(email);
  if (role !== "ADMIN" && !listed) return <AdminForbidden reason={`${email} is not on the admin list.`} />;

  return <AdminConsole adminEmail={email} />;
}
