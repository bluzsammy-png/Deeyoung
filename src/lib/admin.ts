// DEEYOUNG PRO — shared admin gate for /api/admin/* surfaces.
// Two-layer check (defense in depth, self-healing for pre-ADMIN_EMAILS-era
// accounts): the user row must carry role=ADMIN, OR the session email must be
// listed in the ops-configured ADMIN_EMAILS env. Banned/suspended admins are
// always refused. Every caller must treat null as FORBIDDEN.

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function requireAdmin() {
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  if (!session?.user) return null;

  const email = String(session.user.email ?? "").toLowerCase();
  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const admin = await db.user.findUnique({ where: { id: session.user.id } });
  if (!admin) return null;
  if (admin.status === "BANNED" || admin.status === "SUSPENDED") return null;

  const envListed = adminEmails.includes(email);
  if (admin.role !== "ADMIN" && !envListed) return null;

  // Self-heal: an env-listed admin whose row predates the flag gets promoted.
  if (admin.role !== "ADMIN" && envListed) {
    await db.user.update({ where: { id: admin.id }, data: { role: "ADMIN" } }).catch(() => undefined);
    admin.role = "ADMIN";
  }
  return admin;
}
