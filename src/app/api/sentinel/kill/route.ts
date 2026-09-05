import { NextResponse } from "next/server";
import { withGuard } from "@/lib/guard";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * POST /api/sentinel/kill — Emergency Stop (§18)
 * { engaged: true }  → disable automation, cancel pending approvals, audit, notify.
 * { engaged: false } → release (requires confirmRelease=true; always audited).
 */
export const POST = withGuard(async (req: Request, { user }) => {
  const body = await req.json().catch(() => ({}));
  const config = await db.sentinelConfig.findUnique({ where: { userId: user.id } });
  if (!config) return NextResponse.json({ error: "Config missing" }, { status: 500 });

  const engage = body.engaged === true;
  if (!engage && body.confirmRelease !== true) {
    return NextResponse.json({ error: "Releasing the emergency stop requires confirmRelease=true." }, { status: 422 });
  }

  await db.sentinelConfig.update({
    where: { id: config.id },
    data: {
      killSwitch: engage,
      state: engage ? "EMERGENCY_STOP" : "ACTIVE",
    },
  });

  if (engage) {
    const cancelled = await db.approval.updateMany({
      where: { userId: user.id, status: "PENDING" },
      data: { status: "REJECTED" },
    });
    await db.auditEvent.create({
      data: {
        userId: user.id, category: "EMERGENCY_STOP", action: "KILL_SWITCH_ENGAGED",
        detail: JSON.stringify({ cancelledApprovals: cancelled.count, at: new Date().toISOString() }),
      },
    });
    await db.notificationRecord.create({
      data: {
        userId: user.id, event: "SYSTEM_DEGRADED", importance: "CRITICAL",
        title: "Emergency Stop engaged",
        body: `All SENTINEL automation disabled. ${cancelled.count} pending approval(s) cancelled. New actions blocked until you release the switch.`,
        channels: JSON.stringify(["WEB"]), status: "SENT", deliveredAt: new Date(),
      },
    });
    return NextResponse.json({ ok: true, killSwitch: true, cancelledApprovals: cancelled.count });
  }

  await db.auditEvent.create({
    data: { userId: user.id, category: "EMERGENCY_STOP", action: "KILL_SWITCH_RELEASED", detail: "{}" },
  });
  await db.notificationRecord.create({
    data: {
      userId: user.id, event: "SYSTEM_DEGRADED", importance: "HIGH",
      title: "Emergency Stop released",
      body: "SENTINEL is re-armed. Current mode and limits unchanged. Observe mode remains the safe default.",
      channels: JSON.stringify(["WEB"]), status: "SENT", deliveredAt: new Date(),
    },
  });
  return NextResponse.json({ ok: true, killSwitch: false });
}, { minPlan: "PRO" });
