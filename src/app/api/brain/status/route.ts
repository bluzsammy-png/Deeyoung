// DEEYOUNG PRO — Brain status API (§NEW)
// Read-only view of the learning memory: what the bot has learned, how fresh it is,
// and which playbook guards are active. Also lazily starts the per-minute refresh loop.
// Paid surface (hard paywall): requires a signed-in, paid account.
import { NextResponse } from "next/server";
import { withGuard } from "@/lib/guard";
import { getBrain, ensureBrainLoop } from "@/lib/brain/memory";
import { CURRICULUM, RISK, TAKER_ROUND_TRIP_BPS } from "@/lib/brain/playbook";

export const dynamic = "force-dynamic";

export const GET = withGuard(async () => {
  ensureBrainLoop();
  const brain = getBrain();
  const snap = brain.snapshot();
  return NextResponse.json({
    ok: true,
    brain: snap,
    playbook: { curriculum: CURRICULUM, risk: RISK, takerRoundTripBps: TAKER_ROUND_TRIP_BPS },
    note: "Memory refreshes every minute (sentinel heartbeat). Weights move only after n≥20 journaled outcomes and stay within ±50% of validated base weights.",
  });
});
