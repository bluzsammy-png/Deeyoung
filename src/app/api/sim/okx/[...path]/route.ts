// DEEYOUNG PRO — SELF-HOSTED OKX-WIRE SIMULATOR (venue #2, zero-signup path).
//
// WHAT THIS IS: an in-app "exchange" that speaks the exact OKX REST v5 subset
// the execution adapter uses (time / balance / trade order GET+POST). It
// verifies OKX-ACCESS-SIGN signatures with HMAC-SHA256 exactly like OKX does,
// so every mirrored order exercises the adapter's FULL signing path — key
// header layout, timestamp format, requestPath+body canonical string,
// clOrdId plumbing, lot sizing, fill-state polling.
//
// WHAT THIS IS NOT: a real counterparty. Fills are simulated against the
// live market price (keyless Binance public REST) with a fixed 4bps sim
// slippage and a 10bps taker fee — the same fee model as the paper engine.
// Orders live in memory (restart clears them; the paper ledger stays the
// source of truth, exactly as with any venue outage).
//
// HONESTY RULE: whenever this simulator is the target, the UI labels it
// "okx-sim (self-hosted simulator)" — never "OKX". Real OKX demo/live keys
// remain the upgrade path; flipping is one env var (OKX_BASE_URL unset).
//
// Audit hooks: bad signature → 50113; wrong key/passphrase → 50111; stale
// timestamp (>±30s) → 50102; unknown clOrdId on GET → 51603; replay of a
// known clOrdId → returns the existing order (idempotent).

import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual, randomUUID } from "crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SIM_KEY = process.env.OKX_API_KEY || ""; // same creds the adapter holds
const SIM_SECRET = process.env.OKX_API_SECRET || "";
const SIM_PASSPHRASE = process.env.OKX_API_PASSPHRASE || "";

const SIM_SLIPPAGE_BPS = 4; // buy fills 4bps above market, sell 4bps below
const TAKER_FEE = 0.001; // 10bps, charged in base ccy on buys / quote on sells
const TS_TOLERANCE_MS = 30_000;

interface SimOrder {
  ordId: string;
  clOrdId: string;
  instId: string;
  side: "buy" | "sell";
  sz: string;
  state: "filled";
  avgPx: number;
  accFillSz: number;
  fee: number;
  ts: string;
}

const orders = new Map<string, SimOrder>(); // clOrdId → order

function ok<T>(data: T) {
  return NextResponse.json({ code: "0", msg: "", data });
}
function err(code: string, msg: string, status = 400) {
  return NextResponse.json({ code, msg, data: [] }, { status });
}

/** Verify OKX-ACCESS-SIGN for this request. okxPath is the signed canonical
 *  path ("/api/v5/trade/order?clOrdId=…"), i.e. WITHOUT the /api/sim prefix. */
function verifySig(
  headers: Headers, method: "GET" | "POST", okxPath: string, body: string,
): { ok: true } | { ok: false; code: string; msg: string } {
  if (!SIM_SECRET) return { ok: false, code: "50110", msg: "simulator has no credentials configured" };
  const key = headers.get("okx-access-key") ?? "";
  const pass = headers.get("okx-access-passphrase") ?? "";
  const tsHdr = headers.get("okx-access-timestamp") ?? "";
  const sign = headers.get("okx-access-sign") ?? "";

  if (key !== SIM_KEY) return { ok: false, code: "50111", msg: "APIKey invalid" };
  if (pass !== SIM_PASSPHRASE) return { ok: false, code: "50111", msg: "Passphrase invalid" };

  const ts = Date.parse(tsHdr);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > TS_TOLERANCE_MS) {
    return { ok: false, code: "50102", msg: "Request timestamp expired" };
  }
  const expected = createHmac("sha256", SIM_SECRET)
    .update(`${tsHdr}${method}${okxPath}${body}`)
    .digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(sign);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, code: "50113", msg: "Invalid Sign" };
  }
  return { ok: true };
}

/** instId BTC-USDT → binance symbol BTCUSDT → live price (keyless). */
async function livePrice(instId: string): Promise<number | null> {
  const sym = instId.replace("-", "");
  try {
    const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${encodeURIComponent(sym)}`,
      { signal: AbortSignal.timeout(6000), cache: "no-store" });
    const j = (await res.json()) as { price?: string };
    const p = Number(j.price);
    return Number.isFinite(p) && p > 0 ? p : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const url = new URL(req.url);
  const qs = url.search; // includes leading "?" or ""
  // Adapter calls BASE + "/api/v5/…" and BASE already ends with /api/sim/okx,
  // so the catch-all path IS the OKX-style path minus the leading slash.
  const okxPath = `/${(path ?? []).join("/")}${qs}`;
  const seg = (path ?? []).join("/");

  if (seg === "api/v5/public/time") {
    return ok([{ ts: String(Date.now()) }]);
  }

  if (seg === "api/v5/account/balance") {
    const v = verifySig(req.headers, "GET", okxPath, "");
    if (!v.ok) return err(v.code, v.msg, 401);
    return ok([{ details: [{ ccy: "USDT", cashBal: "10000.00" }] }]);
  }

  if (seg === "api/v5/trade/order") {
    const v = verifySig(req.headers, "GET", okxPath, "");
    if (!v.ok) return err(v.code, v.msg, 401);
    const clOrdId = url.searchParams.get("clOrdId") ?? "";
    const o = orders.get(clOrdId);
    if (!o) return err("51603", "order does not exist", 404);
    return ok([{
      ordId: o.ordId, clOrdId: o.clOrdId, instId: o.instId,
      state: o.state, avgPx: String(o.avgPx), accFillSz: String(o.accFillSz),
      fee: String(-o.fee), // OKX reports fees as negative
    }]);
  }

  return err("404", `simulator: no route for ${okxPath}`, 404);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const bodyText = await req.text();
  const okxPath = `/${(path ?? []).join("/")}`;

  if (okxPath !== "/api/v5/trade/order") {
    return err("404", `simulator: no route for POST ${okxPath}`, 404);
  }

  const v = verifySig(req.headers, "POST", okxPath, bodyText);
  if (!v.ok) return err(v.code, v.msg, 401);

  let body: { instId?: string; side?: string; ordType?: string; sz?: string; clOrdId?: string; tgtCcy?: string };
  try {
    body = JSON.parse(bodyText);
  } catch {
    return err("51000", "malformed body");
  }
  const { instId, side, ordType, sz, clOrdId } = body;
  if (!instId || (side !== "buy" && side !== "sell") || ordType !== "market" || !sz || !clOrdId) {
    return err("51000", "simulator expects instId/side=buy|sell/ordType=market/sz/clOrdId");
  }
  if (orders.has(clOrdId)) {
    const prev = orders.get(clOrdId)!;
    return ok([{ sCode: "0", sMsg: "", ordId: prev.ordId }]);
  }

  const px = await livePrice(instId);
  if (!px) return err("51001", "simulator could not fetch live market price");

  const fillPx = side === "buy" ? px * (1 + SIM_SLIPPAGE_BPS / 10_000) : px * (1 - SIM_SLIPPAGE_BPS / 10_000);
  const szNum = Number(sz);
  let accFillSz: number, fee: number;
  if (side === "buy") {
    // spot BUY: sz is QUOTE ccy (USDT notional); fee charged in base ccy
    accFillSz = (szNum / fillPx) * (1 - TAKER_FEE);
    fee = accFillSz * fillPx * TAKER_FEE;
  } else {
    // spot SELL: sz is BASE ccy; fee charged in quote ccy
    accFillSz = szNum;
    fee = szNum * fillPx * TAKER_FEE;
  }

  const order: SimOrder = {
    ordId: randomUUID().replace(/-/g, "").slice(0, 24),
    clOrdId, instId, side: side as "buy" | "sell", sz,
    state: "filled", avgPx: +fillPx.toPrecision(10), accFillSz: +accFillSz.toPrecision(10),
    fee: +fee.toPrecision(8), ts: new Date().toISOString(),
  };
  orders.set(clOrdId, order);
  if (orders.size > 500) orders.delete(orders.keys().next().value as string); // ring cap

  console.log(`[sim] FILL ${side} ${instId} sz=${sz} avgPx=${order.avgPx} accFillSz=${order.accFillSz} fee=${order.fee} clOrdId=${clOrdId}`);
  return ok([{ sCode: "0", sMsg: "", ordId: order.ordId }]);
}
