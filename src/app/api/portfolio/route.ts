import { NextResponse } from "next/server";
import { bootstrapUser, parse } from "@/lib/sentinel";
import { buildPortfolioIntelligence } from "@/lib/engine/portfolio";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** GET /api/portfolio — Portfolio Intelligence beyond P&L (§15) */
export async function GET() {
  const { user, account } = await bootstrapUser();
  const positions = await db.position.findMany({ where: { userId: user.id } });
  const intel = await buildPortfolioIntelligence(positions, account);

  const orders = await db.order.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return NextResponse.json({
    intel,
    orders: orders.map((o) => ({
      ...o,
      fills: parse<unknown[]>(o.fills, []),
    })),
  });
}
