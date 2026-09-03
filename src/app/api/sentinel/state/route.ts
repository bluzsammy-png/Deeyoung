import { NextResponse } from "next/server";
import { effectiveState } from "@/lib/sentinel";
import { withGuard } from "@/lib/guard";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** GET /api/sentinel/state — config, effective state, pending approvals, notifications, audit tail */
export const GET = withGuard(async (_req, { user, config, account }) => {
  const now = new Date();
  // expire stale approvals lazily on read (time-limited §16)
  await db.approval.updateMany({
    where: { userId: user.id, status: "PENDING", expiresAt: { lt: now } },
    data: { status: "EXPIRED" },
  });

  const [approvals, notifications, auditEvents, openSignals] = await Promise.all([
    db.approval.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 20 }),
    db.notificationRecord.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 30 }),
    db.auditEvent.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 40 }),
    db.signalRecord.findMany({ where: { userId: user.id }, orderBy: { openedAt: "desc" }, take: 25 }),
  ]);

  const positions = await db.position.findMany({ where: { userId: user.id } });
  const invested = positions.reduce((a, p) => a + p.qty * p.avgPrice, 0);

  return NextResponse.json({
    mode: config.mode as string,
    state: effectiveState(config, false),
    killSwitch: config.killSwitch,
    config,
    account: { cash: account.cash, broker: account.broker, equity: account.cash + invested },
    approvals,
    notifications,
    auditEvents,
    openSignals,
  });
}, { minPlan: "PRO" });
