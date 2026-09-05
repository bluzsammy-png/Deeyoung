import { NextResponse } from "next/server";
import { withGuard, GuardError } from "@/lib/guard";
import { planRank } from "@/lib/entitlements";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const MODES = ["OBSERVE", "APPROVE", "DELEGATE"];
const STATES = ["ACTIVE", "PAUSED"];

/** POST /api/sentinel/config — update SENTINEL mode, limits, pause state. Audited (§45). */
export const POST = withGuard(async (req: Request, { user, config }) => {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const updates: Record<string, unknown> = {};
  const changes: string[] = [];

  if (body.mode && MODES.includes(body.mode) && body.mode !== config.mode) {
    // Delegate is Elite-only — automation is the top-tier capability.
    if (body.mode === "DELEGATE" && planRank(user) < 4) {
      throw new GuardError(402, "PREMIUM_REQUIRED", "DELEGATE mode is part of Elite. Upgrade to automate execution inside your hard limits.");
    }
    // Delegate requires explicit confirmation flag (never silently enable §7/§69.6)
    if (body.mode === "DELEGATE" && body.confirmDelegate !== true) {
      return NextResponse.json({ error: "DELEGATE mode requires confirmDelegate=true. Automatic execution is never enabled silently." }, { status: 422 });
    }
    updates.mode = body.mode;
    changes.push(`mode: ${config.mode} → ${body.mode}`);
  }
  if (body.state && STATES.includes(body.state) && body.state !== config.state) {
    updates.state = body.state;
    changes.push(`state: ${config.state} → ${body.state}`);
  }
  const numeric: [string, number, number][] = [
    ["riskPerTradePct", 0.1, 5], ["maxPositionPct", 1, 100], ["maxNotionalUsd", 100, 1_000_000],
    ["maxOpenPositions", 1, 50], ["maxDailyLossPct", 0.5, 20], ["maxWeeklyLossPct", 1, 40],
    ["maxDailyTrades", 1, 200], ["minRR", 0.5, 10], ["minSignalScore", 40, 95],
    ["minLiquidityUsd", 100_000, 1e9], ["maxSpreadBps", 1, 100],
    ["maxCorrelatedExposurePct", 5, 100], ["maxPortfolioDrawdownPct", 2, 50],
  ];
  for (const [key, min, max] of numeric) {
    const v = body[key];
    if (typeof v === "number" && v >= min && v <= max && v !== (config as unknown as Record<string, number>)[key]) {
      updates[key] = v;
      changes.push(`${key}: ${(config as unknown as Record<string, number>)[key]} → ${v}`);
    }
  }
  if (body.allowedAssets && Array.isArray(body.allowedAssets)) {
    updates.allowedAssets = JSON.stringify(body.allowedAssets);
    changes.push(`allowedAssets: ${body.allowedAssets.join(",")}`);
  }
  if (typeof body.autoPauseOnDataStale === "boolean") {
    updates.autoPauseOnDataStale = body.autoPauseOnDataStale;
    changes.push(`autoPauseOnDataStale: ${body.autoPauseOnDataStale}`);
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: true, config, message: "No changes" });
  }

  const updated = await db.sentinelConfig.update({ where: { id: config.id }, data: updates });
  await db.auditEvent.create({
    data: { userId: user.id, category: "RISK", action: "SENTINEL_CONFIG_UPDATED", detail: JSON.stringify({ changes }) },
  });
  return NextResponse.json({ ok: true, config: updated, changes });
}, { minPlan: "PRO" });
