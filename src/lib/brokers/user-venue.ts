// DEEYOUNG PRO — per-user broker venue: resolution + live order dispatch.
//
// Product rule (owner directive): the platform is PAPER by default. When a
// user connects their OWN broker API (Alpaca / Binance / Bybit / OANDA), the
// server reads that API to verify it the moment the keys are saved. A
// VERIFIED link in FULL mode routes that user's trade execution LIVE through
// their own broker account automatically; no code change, no owner action.
// INVESTOR (read-only) links and unverified links stay on the paper sim.
//
// Honesty rules encoded here:
//   - fills are only recorded from prices the BROKER reports back; if the
//     broker has not confirmed a fill price, the result is ok=false with the
//     broker's own detail, never a locally invented price;
//   - symbol classes are enforced per venue (FX only on OANDA, crypto only
//     on Binance/Bybit, equities+crypto on Alpaca) with explicit rejections;
//   - secrets are decrypted in-process per call and never logged.

import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import type { ExecutionResult } from "@/lib/providers/execution";
import type { AlpacaCreds } from "@/lib/brokers/alpaca";
import type { BinanceCreds } from "@/lib/brokers/binance-testnet";
import type { BybitCreds } from "@/lib/brokers/bybit";
import type { OandaCreds } from "@/lib/brokers/oanda";
import {
  alpacaAccountSummary,
  alpacaGetOrder,
  alpacaMarketOrder,
} from "@/lib/brokers/alpaca";
import {
  binanceTestnetAccountSummary,
  binanceTestnetMarketOrder,
} from "@/lib/brokers/binance-testnet";
import {
  bybitAccountSummary,
  bybitMarketOrder,
} from "@/lib/brokers/bybit";
import {
  oandaAccountSummary,
  oandaMarketOrder,
  notionalToUnits,
} from "@/lib/brokers/oanda";

export const LIVE_PLATFORMS = ["ALPACA", "BINANCE", "BYBIT", "OANDA"] as const;
export type LivePlatform = (typeof LIVE_PLATFORMS)[number];

export const PLATFORM_ENV_DEFAULTS: Record<LivePlatform, string> = {
  ALPACA: "PAPER",
  BINANCE: "TESTNET",
  BYBIT: "DEMO",
  OANDA: "PRACTICE",
};

export const PLATFORM_ENV_OPTIONS: Record<LivePlatform, string[]> = {
  ALPACA: ["PAPER", "LIVE"],
  BINANCE: ["TESTNET", "LIVE"],
  BYBIT: ["DEMO", "LIVE"],
  OANDA: ["PRACTICE", "LIVE"],
};

/** Engine symbol classes, derived from the universe naming convention. */
export function symbolClass(symbol: string): "CRYPTO" | "FX" | "EQUITY" {
  if (/^(BTC|ETH|SOL|DOGE|XRP|LTC|BCH|AVAX|LINK|ADA|DOT|SHIB|XLM|XMR|EOS|XMR|TRX|BNB|XMR)(USD)$/i.test(symbol)) return "CRYPTO";
  if (/^[A-Z]{6}$/.test(symbol) && /USD$|EUR$|JPY$|GBP$|CHF$|CAD$|AUD$|NZD$/.test(symbol)) return "FX";
  return "EQUITY";
}

const CRYPTO_BASE = /^(BTC|ETH|SOL|DOGE|XRP|LTC|BCH|AVAX|LINK|ADA|DOT|SHIB|XLM|TRX|BNB)(?=USD$)/i;
// Consuming variant: strips the trailing USD entirely (Binance/Bybit USDT pairs).
const CRYPTO_BASE_STRIP = /^(BTC|ETH|SOL|DOGE|XRP|LTC|BCH|AVAX|LINK|ADA|DOT|SHIB|XLM|TRX|BNB)USD$/i;

// ── Resolution ──────────────────────────────────────────────────────────────

export interface ResolvedVenue {
  mode: "PAPER" | "LIVE";
  linkId?: string;
  platform?: LivePlatform;
  env?: string;
  label?: string;
  access?: "FULL" | "INVESTOR";
  /** Decrypted credentials JSON: { apiKey?, apiSecret?, accountId? }. */
  credsRaw?: string;
}

export async function resolveUserVenue(userId: string): Promise<ResolvedVenue> {
  const link = await db.brokerLink.findFirst({
    where: { userId, platform: { in: [...LIVE_PLATFORMS] }, status: "CONNECTED", mode: "FULL" },
    orderBy: { createdAt: "desc" },
  });
  if (!link) return { mode: "PAPER" };
  const credsRaw = decryptSecret({ cipher: link.credCipher, iv: link.credIV, tag: link.credTag });
  if (!credsRaw) {
    // Corrupt ciphertext should never happen; failing closed to PAPER is the
    // safe direction (no live orders without proven credentials).
    return { mode: "PAPER" };
  }
  return {
    mode: "LIVE",
    linkId: link.id,
    platform: link.platform as LivePlatform,
    env: link.env,
    label: link.label,
    access: "FULL",
    credsRaw,
  };
}

interface LinkCreds { apiKey?: string; apiSecret?: string; accountId?: string }

function parseCreds(raw: string): LinkCreds | null {
  try {
    const j = JSON.parse(raw) as LinkCreds;
    if (typeof j !== "object" || j === null) return null;
    return j;
  } catch {
    return null;
  }
}

/** Verification used by POST /api/brokers: read the account with the user's
 *  own keys BEFORE anything is stored. Returns the honest snapshot. */
export async function verifyPlatformAccount(
  platform: LivePlatform,
  env: string,
  creds: LinkCreds,
): Promise<{ ok: boolean; detail: string; balance?: number; equity?: number; currency?: string; snapshot?: string }> {
  if (platform === "ALPACA") {
    const c: AlpacaCreds = { keyId: creds.apiKey ?? "", secretKey: creds.apiSecret ?? "", env: env === "LIVE" ? "LIVE" : "PAPER" };
    const s = await alpacaAccountSummary(c);
    return { ok: s.ok, detail: s.detail, balance: s.cash, equity: s.equity, currency: "USD", snapshot: JSON.stringify(c) };
  }
  if (platform === "BINANCE") {
    const c: BinanceCreds = { key: creds.apiKey ?? "", secret: creds.apiSecret ?? "", env: env === "LIVE" ? "LIVE" : "TESTNET" };
    const s = await binanceTestnetAccountSummary(c);
    return {
      ok: s.verdict === "KEYS_VALID",
      detail: s.verdict === "KEYS_VALID"
        ? `Connected to Binance ${c.env === "LIVE" ? "LIVE" : "TESTNET"} spot: ${s.balancesOverZero ?? 0} non-zero balances, canTrade=${s.canTrade ?? "?"}.`
        : (s.errorDetail ?? "Binance did not accept those keys."),
      snapshot: JSON.stringify(c),
    };
  }
  if (platform === "BYBIT") {
    const c: BybitCreds = { key: creds.apiKey ?? "", secret: creds.apiSecret ?? "", env: env === "LIVE" ? "LIVE" : "DEMO" };
    const s = await bybitAccountSummary(c);
    return { ok: s.ok, detail: s.detail, equity: s.equity, currency: "USD", snapshot: JSON.stringify(c) };
  }
  // OANDA
  const c: OandaCreds = {
    token: creds.apiKey ?? "",
    accountId: creds.accountId ?? "",
    env: env === "LIVE" ? "LIVE" : "PRACTICE",
  };
  const s = await oandaAccountSummary(c);
  return { ok: s.ok, detail: s.detail, balance: s.balance, currency: s.currency, snapshot: JSON.stringify(c) };
}

// ── Execution dispatch ──────────────────────────────────────────────────────

export interface UserOrderRequest {
  symbol: string;
  side: "BUY" | "SELL";
  qty: number;
  stopPrice?: number;
  targetPrice?: number;
  refPrice: number; // reference/quote price for notional conversions
  clientTag?: string;
}

export interface UserExecutionResult extends Omit<ExecutionResult, "status"> {
  status: "FILLED" | "REJECTED";
  detail?: string;
  brokerOrderId?: string;
}

function rejected(reason: string, label: string): UserExecutionResult {
  return { ok: false, status: "REJECTED", filledQty: 0, avgFillPrice: null, fills: [], rejectReason: reason, detail: reason, latencyMs: 0, brokerLabel: label };
}

export interface PaperOrderInput {
  symbol: string;
  side: "BUY" | "SELL";
  type: "MARKET" | "LIMIT" | "STOP";
  qty: number;
  limitPrice?: number;
  stopPrice?: number;
  quote: { price: number } & Record<string, unknown>;
  cashAvailable: number;
  currentQty: number;
}

/** Route one user order: LIVE through the user's verified broker, or paper. */
export async function executeUserOrder(
  userId: string,
  req: UserOrderRequest,
  paperFallback: (o: PaperOrderInput) => Promise<ExecutionResult>,
): Promise<UserExecutionResult> {
  const venue = await resolveUserVenue(userId);
  if (venue.mode !== "LIVE" || !venue.platform) {
    // Paper path: reuse the existing provider so simulation semantics stay identical.
    const res = await paperFallback({
      symbol: req.symbol, side: req.side, type: "MARKET", qty: req.qty,
      stopPrice: req.stopPrice, quote: { price: req.refPrice },
      cashAvailable: Number.MAX_SAFE_INTEGER, currentQty: 0,
    });
    return {
      ...res,
      status: res.ok ? "FILLED" : "REJECTED",
      detail: res.rejectReason,
    };
  }

  const t0 = Date.now();
  const creds = parseCreds(venue.credsRaw ?? "");
  if (!creds) return rejected("Stored broker credentials could not be read. Reconnect the broker.", `${venue.platform} LIVE`);

  const side = req.side;
  const cls = symbolClass(req.symbol);

  if (venue.platform === "ALPACA") {
    if (cls === "FX") return rejected("Alpaca does not trade FX. Connect OANDA for FX symbols.", "Alpaca LIVE");
    const c: AlpacaCreds = { keyId: creds.apiKey ?? "", secretKey: creds.apiSecret ?? "", env: venue.env === "LIVE" ? "LIVE" : "PAPER" };
    const alpSymbol = cls === "CRYPTO" ? req.symbol.replace(CRYPTO_BASE, "$1/") : req.symbol;
    const placed = await alpacaMarketOrder(
      alpSymbol, side === "BUY" ? "buy" : "sell", req.qty,
      req.targetPrice, req.stopPrice, req.clientTag ?? "deeyoung-pro", c,
    );
    if (!placed.ok) return rejected(placed.detail, `Alpaca ${c.env}`);
    // Confirm the fill by polling the order (bounded; market orders fill fast).
    for (let i = 0; i < 3; i++) {
      await new Promise((r) => setTimeout(r, 700));
      const o = await alpacaGetOrder(placed.orderId ?? "", c);
      if (o?.filled_avg_price && +o.filled_avg_price > 0) {
        const price = +o.filled_avg_price;
        const fq = +(o.filled_qty ?? req.qty);
        return {
          ok: true, status: "FILLED", filledQty: fq, avgFillPrice: price,
          fills: [{ t: Date.now(), qty: fq, price, slippageBps: 0 }],
          latencyMs: Date.now() - t0, brokerLabel: `Alpaca ${c.env}`, brokerOrderId: o.id,
          detail: placed.detail,
        };
      }
    }
    return rejected(`Alpaca accepted the order (id ${placed.orderId}) but the fill is not confirmed yet. Check your Alpaca dashboard; the position book was not changed.`, `Alpaca ${c.env}`);
  }

  if (venue.platform === "BINANCE") {
    if (cls !== "CRYPTO") return rejected("Binance spot trades crypto only.", "Binance LIVE");
    const c: BinanceCreds = { key: creds.apiKey ?? "", secret: creds.apiSecret ?? "", env: venue.env === "LIVE" ? "LIVE" : "TESTNET" };
    const binSymbol = `${req.symbol.replace(CRYPTO_BASE_STRIP, "$1").toUpperCase()}USDT`;
    const res = await binanceTestnetMarketOrder({
      symbol: binSymbol, side, quantity: req.qty, clientOrderId: req.clientTag ?? "deeyoung-pro",
    }, c);
    const exQty = res.executedQty ?? 0;
    const cumQuote = res.cummulativeQuoteQty ?? 0;
    if (res.verdict !== "FILLED" || !(exQty > 0) || !(cumQuote > 0)) {
      return rejected(res.errorDetail ?? `Binance did not fill the order (${res.verdict}).`, `Binance ${c.env}`);
    }
    const price = cumQuote / exQty;
    return {
      ok: true, status: "FILLED", filledQty: exQty, avgFillPrice: price,
      fills: [{ t: Date.now(), qty: exQty, price, slippageBps: 0 }],
      latencyMs: Date.now() - t0, brokerLabel: `Binance ${c.env}`, brokerOrderId: String(res.orderId),
      detail: `Filled ${exQty} ${binSymbol} at ${price.toPrecision(8)} on Binance ${c.env}.`,
    };
  }

  if (venue.platform === "BYBIT") {
    if (cls !== "CRYPTO") return rejected("Bybit routing trades crypto perps only.", "Bybit LIVE");
    const c: BybitCreds = { key: creds.apiKey ?? "", secret: creds.apiSecret ?? "", env: venue.env === "LIVE" ? "LIVE" : "DEMO" };
    const bybSymbol = `${req.symbol.replace(CRYPTO_BASE_STRIP, "$1").toUpperCase()}USDT`;
    const res = await bybitMarketOrder(
      bybSymbol, side === "BUY" ? "Buy" : "Sell", req.qty,
      req.stopPrice, req.targetPrice, req.clientTag ?? "DEEYOUNG-PRO", c,
    );
    const avg = res.avgFillPrice ?? 0;
    const fq = res.filledQty ?? 0;
    if (!res.ok || !(avg > 0) || !(fq > 0)) {
      return rejected(res.ok
        ? `Bybit accepted the order (id ${res.orderId}) but no fill price was confirmed. Check Bybit; the position book was not changed.`
        : res.detail, `Bybit ${c.env}`);
    }
    return {
      ok: true, status: "FILLED", filledQty: fq, avgFillPrice: avg,
      fills: [{ t: Date.now(), qty: fq, price: avg, slippageBps: 0 }],
      latencyMs: Date.now() - t0, brokerLabel: `Bybit ${c.env}`, brokerOrderId: res.orderId,
      detail: res.detail,
    };
  }

  // OANDA — FX only.
  if (cls !== "FX") return rejected("OANDA routes FX only. Connect Alpaca for equities or Binance/Bybit for crypto.", "OANDA LIVE");
  const c: OandaCreds = {
    token: creds.apiKey ?? "",
    accountId: creds.accountId ?? "",
    env: venue.env === "LIVE" ? "LIVE" : "PRACTICE",
  };
  const instrument = `${req.symbol.slice(0, 3)}_${req.symbol.slice(3)}`;
  const units = notionalToUnits(instrument, req.qty * req.refPrice, req.refPrice);
  const res = await oandaMarketOrder(
    instrument, side, units, req.stopPrice, req.targetPrice,
    req.clientTag ?? "DEEYOUNG-PRO", c,
  );
  const fillPrice = res.fillPrice ?? 0;
  if (!res.ok || !(fillPrice > 0)) {
    return rejected(res.ok
      ? `OANDA accepted the order (trade ${res.tradeId}) but no fill price was returned. Check your OANDA account; the position book was not changed.`
      : res.detail, `OANDA ${c.env}`);
  }
  return {
    ok: true, status: "FILLED", filledQty: units, avgFillPrice: fillPrice,
    fills: [{ t: Date.now(), qty: units, price: fillPrice, slippageBps: 0 }],
    latencyMs: Date.now() - t0, brokerLabel: `OANDA ${c.env}`, brokerOrderId: res.tradeId,
    detail: res.detail,
  };
}
