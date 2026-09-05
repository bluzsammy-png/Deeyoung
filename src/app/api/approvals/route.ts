import { NextRequest, NextResponse } from "next/server";
import { withGuard } from "@/lib/guard";
import { db } from "@/lib/db";
import { getExecutionProvider } from "@/lib/providers/execution";
import { executeUserOrder } from "@/lib/brokers/user-venue";
import { marketProvider } from "@/lib/providers/market";

export const dynamic = "force-dynamic";

/**
 * POST /api/approvals — decide a pending approval (single-use, time-limited, audited §16)
 * Body: { approvalId, decision: "APPROVE" | "REJECT" }
 * Replay protection: approval status transitions are conditional (PENDING → decided exactly once §59).
 */
export const POST = withGuard(async (req: Request, { user }) => {
  const body = await req.json().catch(() => null);
  if (!body?.approvalId || !["APPROVE", "REJECT"].includes(body.decision)) {
    return NextResponse.json({ error: "approvalId and decision (APPROVE|REJECT) required" }, { status: 400 });
  }

  // Conditional update = atomic single-use claim (no double-execution on retries §59)
  const claimed = await db.approval.updateMany({
    where: { id: body.approvalId, userId: user.id, status: "PENDING", expiresAt: { gt: new Date() } },
    data: { status: body.decision === "APPROVE" ? "APPROVED" : "REJECTED", decidedAt: new Date() },
  });
  if (claimed.count === 0) {
    return NextResponse.json({ error: "Approval no longer pending. It was already decided or expired." }, { status: 409 });
  }

  const approval = await db.approval.findUnique({ where: { id: body.approvalId } });
  if (!approval) return NextResponse.json({ error: "Approval not found" }, { status: 404 });

  await db.auditEvent.create({
    data: {
      userId: user.id, category: "APPROVAL", action: `APPROVAL_${body.decision}ED`,
      detail: JSON.stringify({ approvalId: approval.id, symbol: approval.symbol, qty: approval.qty, score: approval.score }),
    },
  });

  if (body.decision === "REJECT") {
    await db.notificationRecord.create({
      data: {
        userId: user.id, event: "SENTINEL_APPROVAL_REQUEST", importance: "NORMAL",
        title: `Proposal rejected - ${approval.symbol}`,
        body: "No order was sent. Rejected proposals are logged to the audit trail.",
        channels: JSON.stringify(["WEB"]), status: "SENT", deliveredAt: new Date(),
      },
    });
    return NextResponse.json({ ok: true, decision: "REJECTED" });
  }

  // ── Execute on paper broker via execution abstraction (§19) ──
  const account = await db.paperAccount.findUnique({ where: { userId: user.id } });
  if (!account) return NextResponse.json({ error: "Account missing" }, { status: 500 });
  const quote = await marketProvider.getQuote(approval.symbol);
  // Venue: the user's VERIFIED FULL broker routes this LIVE; otherwise paper.
  const exec = await executeUserOrder(user.id, {
    symbol: approval.symbol,
    side: "BUY",
    qty: approval.qty,
    stopPrice: approval.stop ?? undefined,
    targetPrice: approval.target ?? undefined,
    refPrice: quote.price,
    clientTag: "deeyoung-sentinel",
  }, async (o) => {
    const provider = getExecutionProvider(account.broker);
    return provider.execute({
      symbol: o.symbol, side: o.side, type: "MARKET", qty: o.qty,
      stopPrice: o.stopPrice, quote, cashAvailable: account.cash, currentQty: 0,
    });
  });

  if (!exec.ok || exec.filledQty === 0) {
    await db.order.create({
      data: {
        userId: user.id, requestId: `apr-${approval.id}`, symbol: approval.symbol,
        side: "BUY", type: "MARKET", qty: approval.qty, status: "REJECTED",
        rejectReason: exec.rejectReason, source: "SENTINEL", approvalId: approval.id,
      },
    });
    await db.notificationRecord.create({
      data: {
        userId: user.id, event: "TRADE_EXECUTED", importance: "HIGH",
        title: `Execution failed - ${approval.symbol}`,
        body: exec.rejectReason ?? "Order rejected by broker",
        channels: JSON.stringify(["WEB"]), status: "SENT", deliveredAt: new Date(),
      },
    });
    return NextResponse.json({ ok: true, decision: "APPROVED", execution: exec }, { status: 200 });
  }

  const price = exec.avgFillPrice ?? quote.price;
  await db.order.create({
    data: {
      userId: user.id, requestId: `apr-${approval.id}`, symbol: approval.symbol,
      side: "BUY", type: "MARKET", qty: approval.qty, status: exec.status,
      filledQty: exec.filledQty, avgFillPrice: price, source: "SENTINEL",
      approvalId: approval.id, fills: JSON.stringify(exec.fills), filledAt: new Date(),
    },
  });
  const existing = await db.position.findFirst({ where: { userId: user.id, symbol: approval.symbol } });
  if (existing) {
    const newQty = existing.qty + exec.filledQty;
    const newAvg = (existing.qty * existing.avgPrice + exec.filledQty * price) / newQty;
    await db.position.update({ where: { id: existing.id }, data: { qty: newQty, avgPrice: newAvg, stop: approval.stop, target: approval.target } });
  } else {
    await db.position.create({
      data: { userId: user.id, symbol: approval.symbol, qty: exec.filledQty, avgPrice: price, stop: approval.stop, target: approval.target, sector: quote.sector },
    });
  }
  await db.paperAccount.update({ where: { id: account.id }, data: { cash: account.cash - exec.filledQty * price } });
  await db.signalRecord.create({
    data: {
      userId: user.id, symbol: approval.symbol, direction: "LONG", score: approval.score,
      factors: approval.proposal, entry: approval.entry, stop: approval.stop, target: approval.target,
      rr: approval.rr, regime: approval.regime, status: "OPEN",
    },
  });
  await db.auditEvent.create({
    data: {
      userId: user.id, category: "FILL", action: "APPROVED_ORDER_FILLED",
      detail: JSON.stringify({ symbol: approval.symbol, qty: exec.filledQty, price, slippageBps: exec.fills[0]?.slippageBps, broker: exec.brokerLabel }),
    },
  });
  await db.notificationRecord.create({
    data: {
      userId: user.id, event: "TRADE_EXECUTED", importance: "HIGH",
      title: `Filled: ${approval.symbol} Long ${exec.filledQty} @ $${price.toFixed(2)}`,
      body: `${exec.brokerLabel} · slippage ${exec.fills[0]?.slippageBps ?? 0}bps · latency ${exec.latencyMs}ms · stop $${approval.stop.toFixed(2)} · target $${approval.target.toFixed(2)}`,
      channels: JSON.stringify(["WEB"]), status: "SENT", deliveredAt: new Date(),
      deepLink: "portfolio",
    },
  });

  return NextResponse.json({ ok: true, decision: "APPROVED", execution: exec });
}, { minPlan: "PRO" });
