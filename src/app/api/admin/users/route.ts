import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Moderation API — ADMIN only. Implements the trust ladder:
 *   WARN     → record a warning (user notified in-app; status stays ACTIVE)
 *   SUSPEND  → revoke all sessions, read-only lock
 *   BAN      → revoke all sessions, permanent block at the session layer
 *   UNBAN    → restore ACTIVE (appeals outcome)
 *   PLAN_SET → activate/deactivate a plan directly (grant STARTER/PRO/ELITE
 *              or revoke to FREE) without needing a billing order — the
 *              owner-side switch for comps, partnerships and downgrades.
 * Every action lands in the audit trail with the acting admin attached.
 */

/** GET /api/admin/users — user list + moderation state */
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "FORBIDDEN", message: "Admin access required." }, { status: 403 });

  const users = await db.user.findMany({
    orderBy: { createdAt: "desc" },
    take: 200, // scale guard — paginate beyond 200 users
    select: {
      id: true, name: true, email: true, role: true, status: true, plan: true,
      trialEndsAt: true, emailVerified: true, ipHash: true, createdAt: true,
    },
  });
  const warnings = await db.warning.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  const signupCounts = await db.signupAttempt.groupBy({ by: ["ipHash"], _count: { ipHash: true } });
  const signupByIp = new Map(signupCounts.map((s) => [s.ipHash, s._count.ipHash]));

  return NextResponse.json({
    users: users.map((u) => ({
      ...u,
      ipHash: undefined, // never leak hashes to the client; expose only the derived count
      signupCountFromIp: u.ipHash ? signupByIp.get(u.ipHash) ?? 0 : 0,
    })),
    warnings,
    stats: {
      total: users.length,
      banned: users.filter((u) => u.status === "BANNED").length,
      suspended: users.filter((u) => u.status === "SUSPENDED").length,
      trial: users.filter((u) => u.plan === "TRIAL").length,
      paid: users.filter((u) => ["STARTER", "PRO", "ELITE", "PREMIUM"].includes(u.plan)).length,
    },
  });
}

/** POST /api/admin/users — moderation actions */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "FORBIDDEN", message: "Admin access required." }, { status: 403 });

  const body = await req.json().catch(() => null);
  const action = body?.action;
  const userId = String(body?.userId ?? "");
  const reason = String(body?.reason ?? "").trim();
  const message = String(body?.message ?? "").trim();
  const plan = String(body?.plan ?? "").trim().toUpperCase();

  if (!["WARN", "SUSPEND", "BAN", "UNBAN", "PLAN_SET"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
  if (reason.length < 3) {
    return NextResponse.json({ error: "A clear reason (3+ chars) is required. It is shown to the user and audited." }, { status: 422 });
  }
  if (action === "PLAN_SET" && !["FREE", "STARTER", "PRO", "ELITE"].includes(plan)) {
    return NextResponse.json({ error: "plan must be one of FREE, STARTER, PRO, ELITE" }, { status: 400 });
  }

  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (target.id === admin.id) return NextResponse.json({ error: "You cannot moderate your own account." }, { status: 422 });
  if (target.role === "ADMIN") return NextResponse.json({ error: "Admin accounts are moderated by the platform owner only." }, { status: 422 });

  let status = target.status;
  let sessionsRevoked = 0;

  switch (action) {
    case "WARN":
      await db.warning.create({ data: { userId: target.id, reason, message } });
      if (target.status === "ACTIVE") {
        await db.user.update({ where: { id: target.id }, data: { status: "WARNED" } });
        status = "WARNED";
      }
      await db.notificationRecord.create({
        data: {
          userId: target.id, event: "ACCOUNT_SECURITY", importance: "CRITICAL",
          title: "Official warning. Action required",
          body: message || reason,
          channels: JSON.stringify(["WEB"]), status: "SENT", deliveredAt: new Date(),
        },
      });
      break;
    case "SUSPEND":
      status = "SUSPENDED";
      sessionsRevoked = (await db.session.deleteMany({ where: { userId: target.id } })).count;
      await db.notificationRecord.create({
        data: {
          userId: target.id, event: "ACCOUNT_SECURITY", importance: "CRITICAL",
          title: "Account suspended",
          body: message || `Your account has been suspended. Reason: ${reason}. Contact support to resolve this.`,
          channels: JSON.stringify(["WEB"]), status: "SENT", deliveredAt: new Date(),
        },
      });
      break;
    case "BAN":
      status = "BANNED";
      sessionsRevoked = (await db.session.deleteMany({ where: { userId: target.id } })).count;
      await db.notificationRecord.create({
        data: {
          userId: target.id, event: "ACCOUNT_SECURITY", importance: "CRITICAL",
          title: "Account banned",
          body: message || `Your account has been banned for: ${reason}. You may appeal by contacting support.`,
          channels: JSON.stringify(["WEB"]), status: "SENT", deliveredAt: new Date(),
        },
      });
      break;
    case "UNBAN":
      status = "ACTIVE";
      break;
    case "PLAN_SET": {
      const planLabel = plan === "FREE" ? "Free" : plan.charAt(0) + plan.slice(1).toLowerCase();
      await db.user.update({ where: { id: target.id }, data: { plan } });
      await db.notificationRecord.create({
        data: {
          userId: target.id, event: "ACCOUNT_SECURITY", importance: plan === "FREE" ? "IMPORTANT" : "CRITICAL",
          title: plan === "FREE" ? "Subscription deactivated" : `Subscription activated: ${planLabel}`,
          body: message || (plan === "FREE"
            ? `Your subscription has been changed to the Free plan. Reason: ${reason}.`
            : `Your account now includes the ${planLabel} plan at no charge. Reason on file: ${reason}. Enjoy.`),
          channels: JSON.stringify(["WEB"]), status: "SENT", deliveredAt: new Date(),
        },
      });
      await db.auditEvent.create({
        data: {
          userId: admin.id, category: "SUBSCRIPTION", action: `PLAN_SET_${plan}`,
          detail: JSON.stringify({ target: target.email, targetId: target.id, from: target.plan, to: plan, reason }),
        },
      }).catch(() => undefined);
      return NextResponse.json({ ok: true, action, plan, priorPlan: target.plan });
    }
  }

  if (action !== "WARN") {
    await db.user.update({ where: { id: target.id }, data: { status } });
  }

  await db.auditEvent.create({
    data: {
      userId: admin.id,
      category: "ADMIN",
      action: `MODERATION_${action}`,
      detail: JSON.stringify({ target: target.email, targetId: target.id, reason, message, sessionsRevoked }),
    },
  });

  return NextResponse.json({ ok: true, action, status, sessionsRevoked });
}
