import { NextRequest, NextResponse } from "next/server";
import { withGuard } from "@/lib/guard";
import { parse } from "@/lib/sentinel";
import { db } from "@/lib/db";
import { getExecutionProvider, newRequestId } from "@/lib/providers/execution";
import { marketProvider, UNIVERSE } from "@/lib/providers/market";

export const dynamic = "force-dynamic";

/**
 * POST /api/trades — manual paper trade (idempotent via requestId §59)
 * Body: { symbol, side: BUY|SELL, qty, type?: MARKET|LIMIT, limitPrice?, requestId }
 * This is the user's own action — distinct from SENTINEL automation. Labeled simulated.
 */
export const POST = withGuard(async (req: NextRequest, { user, account }) => {
  const body = await req.json().catch(() => null);
  if (!body?.symbol || !["BUY", "SELL"].includes(body.side) || typeof body.qty !== "number" || body.qty <= 0) {
    return NextResponse.json({ error: "symbol, side (BUY|SELL), qty>0 required" }, { status: 400 });
  }
  const symbol = String(body.symbol).toUpperCase();
  if (!/^[A-Z0-9.\-]{1,10}$/.test(symbol)) return NextResponse.json({ error: "Invalid symbol" }, { status: 400 });

  // Idempotency: same requestId never creates two orders (§59)
  const requestId = String(body.requestId ?? newRequestId());
  const existing = await db.order.findUnique({ where: { requestId } });
  if (existing) {
    return NextResponse.json({ ok: true, deduped: true, order: existing, message: "This request was already processed." });
  }

  const quote = await marketProvider.getQuote(symbol);
  if (quote.dataState === "SIMULATED") {
    return NextResponse.json({ error: "Market data is degraded — trading is paused until fresh data returns. DeeYoung never fills orders on stale or simulated marks." }, { status: 503 });
  }

  const positions = await db.position.findMany({ where: { userId: user.id } });
  const currentQty = positions.find((p) => p.symbol === symbol)?.qty ?? 0;
  const provider = getExecutionProvider(account.broker);
  const exec = await provider.execute({
    symbol, side: body.side, type: body.type === "LIMIT" ? "LIMIT" : "MARKET",
    qty: body.qty, limitPrice: typeof body.limitPrice === "number" ? body.limitPrice : undefined,
    quote, cashAvailable: account.cash, currentQty,
  });

  const order = await db.order.create({
    data: {
      userId: user.id, requestId, symbol,
      assetClass: UNIVERSE[symbol]?.assetClass ?? "EQUITY",
      side: body.side, type: body.type === "LIMIT" ? "LIMIT" : "MARKET",
      qty: body.qty, limitPrice: body.limitPrice ?? null,
      status: exec.ok ? exec.status : "REJECTED",
      filledQty: exec.filledQty, avgFillPrice: exec.avgFillPrice,
      rejectReason: exec.rejectReason ?? null,
      fills: JSON.stringify(exec.fills),
      filledAt: exec.ok ? new Date() : null,
    },
  });

  if (exec.ok && exec.filledQty > 0) {
    const price = exec.avgFillPrice ?? quote.price;
    if (body.side === "BUY") {
      const existingPos = positions.find((p) => p.symbol === symbol);
      if (existingPos) {
        const newQty = existingPos.qty + exec.filledQty;
        await db.position.update({
          where: { id: existingPos.id },
          data: { qty: newQty, avgPrice: (existingPos.qty * existingPos.avgPrice + exec.filledQty * price) / newQty },
        });
      } else {
        await db.position.create({
          data: { userId: user.id, symbol, qty: exec.filledQty, avgPrice: price, sector: UNIVERSE[symbol]?.sector ?? "UNKNOWN" },
        });
      }
      await db.paperAccount.update({ where: { id: account.id }, data: { cash: account.cash - exec.filledQty * price } });
    } else {
      const pos = positions.find((p) => p.symbol === symbol);
      if (pos) {
        const pnl = (price - pos.avgPrice) * exec.filledQty;
        const remaining = pos.qty - exec.filledQty;
        if (remaining <= 0) {
          await db.position.delete({ where: { id: pos.id } });
        } else {
          await db.position.update({ where: { id: pos.id }, data: { qty: remaining } });
        }
        await db.paperAccount.update({
          where: { id: account.id },
          data: {
            cash: account.cash + exec.filledQty * price,
            realizedPnl: account.realizedPnl + pnl,
          },
        });
        const lastOrder = await db.order.findUnique({ where: { requestId } });
        if (lastOrder) {
          const fills = parse<{ pnl?: number }[]>(lastOrder.fills, []);
          fills.push({ pnl });
          await db.order.update({ where: { id: lastOrder.id }, data: { fills: JSON.stringify(fills) } });
        }
      }
    }
    await db.auditEvent.create({
      data: {
        userId: user.id, category: "FILL", action: `MANUAL_${body.side}_FILLED`,
        detail: JSON.stringify({ symbol, qty: exec.filledQty, price, slippageBps: exec.fills[0]?.slippageBps, broker: exec.brokerLabel }),
      },
    });
  } else {
    await db.auditEvent.create({
      data: { userId: user.id, category: "ORDER", action: "MANUAL_ORDER_REJECTED", detail: JSON.stringify({ symbol, reason: exec.rejectReason }) },
    });
  }

  return NextResponse.json({ ok: exec.ok, order, execution: exec });
});
