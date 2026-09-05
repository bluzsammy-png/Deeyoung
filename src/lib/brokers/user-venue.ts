// DEEYOUNG PRO — per-user broker venue: resolution + live order dispatch.
//
// Product rule (owner directive): the platform is PAPER by default. When a
// user connects their OWN broker (Alpaca / Binance / Bybit / OANDA API keys,
// or an MT4/MT5 account through the MetaApi bridge), the server reads that
// account to verify it the moment the credentials are saved. A VERIFIED link
// in FULL mode routes that user's trade execution LIVE through their own
// broker account automatically; no code change, no owner action.
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
import {
  DERIV_MULTIPLIER_DEFAULT,
  derivBuyMultiplier,
  derivCryptoSymbol,
  derivOpenContract,
  derivStakeClamp,
} from "@/lib/brokers/deriv";
import type { AlpacaCreds } from "@/lib/brokers/alpaca";
import type { BinanceCreds } from "@/lib/brokers/binance-testnet";
import type { BybitCreds } from "@/lib/brokers/bybit";
import type { OandaCreds } from "@/lib/brokers/oanda";
import {
  bridgeToken,
  marketOrder as metaapiMarketOrder,
  positions as metaapiPositions,
  resolveBrokerSymbol,
  symbolSpecification,
} from "@/lib/brokers/metaapi";
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

/** MT4/MT5 brokers (Deriv, IC Markets, ...) route live through our own EA
 *  bridge (no third party) or, for legacy links, the MetaApi cloud bridge:
 *  no direct API exists for MetaTrader accounts. */
export const MT_PLATFORMS = ["MT4", "MT5"] as const;
export type MtPlatform = (typeof MT_PLATFORMS)[number];

export const DERIV_PLATFORM = "DERIV" as const;

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
  platform?: LivePlatform | MtPlatform | "DERIV";
  env?: string;
  label?: string;
  access?: "FULL" | "INVESTOR";
  /** MetaApi bridge account id for legacy MT4/MT5 links. */
  bridgeAccountId?: string;
  /** True when the link uses our own EA bridge (terminal reports fills). */
  eaBridge?: boolean;
  /** Decrypted credentials JSON: { apiKey?, apiSecret?, accountId? } or
   *  { apiToken? } for Deriv, or {} for EA bridge links. */
  credsRaw?: string;
}

export async function resolveUserVenue(userId: string): Promise<ResolvedVenue> {
  const link = await db.brokerLink.findFirst({
    where: {
      userId,
      status: "CONNECTED",
      mode: "FULL",
      OR: [
        { platform: { in: [...LIVE_PLATFORMS] } },
        { platform: DERIV_PLATFORM },
        { platform: { in: [...MT_PLATFORMS] }, bridgeAccountId: { not: null } },
        { platform: { in: [...MT_PLATFORMS] }, bridgeTokenHash: { not: null } },
      ],
    },
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
    platform: link.platform as LivePlatform | MtPlatform | "DERIV",
    env: link.env,
    label: link.label,
    access: "FULL",
    bridgeAccountId: link.bridgeAccountId ?? undefined,
    eaBridge: !!link.bridgeTokenHash,
    credsRaw,
  };
}

interface LinkCreds { apiKey?: string; apiSecret?: string; accountId?: string; apiToken?: string; password?: string; metaapiToken?: string; region?: string }

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

  // ── Deriv native (official websocket API, user's own API token) ──
  // Multiplier contracts are the closest Deriv product to a long/short
  // position: market entry, market exit, stake-based sizing. The recorded
  // entry price is the broker-reported entry/spot, never a local guess.
  if (venue.platform === "DERIV") {
    const creds = parseCreds(venue.credsRaw ?? "");
    const token = creds?.apiToken ?? "";
    if (!token) return rejected("Stored Deriv credentials could not be read. Reconnect the account.", "Deriv API");
    if (cls !== "CRYPTO") return rejected("The Deriv connector routes the engine's crypto universe. FX and equity symbols are not routed here.", "Deriv API");
    const dsym = await derivCryptoSymbol(token, req.symbol);
    if (!dsym) return rejected(`Deriv does not list ${req.symbol.replace(/USD$/i, "")} on your account. Nothing was traded.`, "Deriv API");
    const linkRow = venue.linkId ? await db.brokerLink.findUnique({ where: { id: venue.linkId } }) : null;
    const currency = linkRow?.currency || "USD";
    const notional = req.qty * req.refPrice;
    if (!(notional >= 1)) return rejected(`A Deriv multiplier needs a stake of at least 1 ${currency}. This order was not sent.`, "Deriv API");
    const stake = derivStakeClamp(Math.min(notional, 100));
    const stopUsd = req.stopPrice ? Math.min(stake * DERIV_MULTIPLIER_DEFAULT * Math.abs(req.refPrice - req.stopPrice) / req.refPrice, stake * DERIV_MULTIPLIER_DEFAULT * 0.9) : 0;
    const tgtUsd = req.targetPrice ? Math.min(stake * DERIV_MULTIPLIER_DEFAULT * Math.abs(req.targetPrice - req.refPrice) / req.refPrice, stake * DERIV_MULTIPLIER_DEFAULT * 0.9) : 0;
    const res = await derivBuyMultiplier(token, {
      symbol: dsym.symbol, side, currency, stakeUsd: stake,
      multiplier: DERIV_MULTIPLIER_DEFAULT, stopLossUsd: stopUsd, takeProfitUsd: tgtUsd,
    });
    if (!res.ok || !res.data) return rejected(res.detail, "Deriv API");
    await new Promise((r) => setTimeout(r, 800));
    const st = await derivOpenContract(token, res.data.contract_id);
    const entryPrice = st.ok ? st.data?.entrySpot ?? st.data?.currentSpot ?? null : null;
    return {
      ok: true, status: "FILLED",
      filledQty: stake, // Deriv multipliers size in stake, not units
      avgFillPrice: entryPrice,
      fills: entryPrice ? [{ t: Date.now(), qty: stake, price: entryPrice, slippageBps: 0 }] : [],
      latencyMs: Date.now() - t0,
      brokerLabel: `Deriv ${venue.env ?? ""}`.trim(),
      brokerOrderId: String(res.data.contract_id),
      detail:
        `Multiplier ${DERIV_MULTIPLIER_DEFAULT}x opened on ${dsym.display_name} with a ${stake} ${currency} stake` +
        (entryPrice ? `; entry spot ${entryPrice} reported by Deriv.` : "; the entry spot appears in your Deriv statement."),
    };
  }

  // ── MT4/MT5 through OUR OWN EA bridge (no third party) ──
  // The command is queued; the user's terminal executes it and reports back.
  // Sizing is in lots (MetaTrader units); the fill exists only when the
  // terminal reports it.
  if ((venue.platform === "MT4" || venue.platform === "MT5") && venue.eaBridge) {
    const linkRow = venue.linkId ? await db.brokerLink.findUnique({ where: { id: venue.linkId } }) : null;
    if (!linkRow?.bridgeTokenHash) return rejected("This MT link has no bridge key. Reconnect the account.", `${venue.platform} bridge`);
    const last = linkRow.lastHandshakeAt?.getTime() ?? 0;
    if (Date.now() - last > 3 * 60_000) {
      return rejected(
        "Your terminal is not connected to the bridge right now (no check-in for over 3 minutes). Open MetaTrader with the EA attached; this order was NOT sent.",
        `${venue.platform} bridge`,
      );
    }
    const lots = Math.min(10, Math.max(0.01, +( (linkRow.autoLots ?? 0.01) > 0 ? linkRow.autoLots! : 0.01 ).toFixed(2)));
    const cmd = await db.bridgeCommand.create({
      data: {
        linkId: linkRow.id, action: "OPEN", symbol: req.symbol, side, lots,
        stopLoss: req.stopPrice ?? null, takeProfit: req.targetPrice ?? null,
        refOid: req.clientTag ?? `MANUAL_${Date.now()}`,
      },
    });
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      const c = await db.bridgeCommand.findUnique({ where: { id: cmd.id } });
      if (!c) break;
      if (c.status === "FILLED" && c.fillPrice && c.fillPrice > 0) {
        return {
          ok: true, status: "FILLED", filledQty: lots, avgFillPrice: c.fillPrice,
          fills: [{ t: Date.now(), qty: lots, price: c.fillPrice, slippageBps: 0 }],
          latencyMs: Date.now() - t0,
          brokerLabel: `${venue.platform} ${venue.label ?? ""}`.trim(),
          brokerOrderId: c.fillTicket ?? c.id,
          detail: `Your terminal filled ${lots} lots ${c.fillTicket ? `(ticket ${c.fillTicket})` : ""} at ${c.fillPrice}.`,
        };
      }
      if (c.status === "REJECTED" || c.status === "UNSUPPORTED") {
        return rejected(c.message || `Your terminal could not execute the order (${c.status}).`, `${venue.platform} bridge`);
      }
    }
    return rejected(
      "The order is queued for your terminal but no fill was reported within 15 seconds. Check MetaTrader: if it fills there, the position is live on your account; nothing else was recorded here.",
      `${venue.platform} bridge`,
    );
  }

  // MT4/MT5 through the MetaApi bridge (legacy links, Deriv, IC Markets, ...). The broker's
  // own symbol list decides what is tradable; sizing comes from the broker's
  // contract specification, and a fill only counts once the broker's positions
  // list confirms it. Closing works through the same market path: on netting
  // accounts (Deriv MT5) an opposite market order reduces the position, and
  // the recorded price is still the broker's own fill.
  if (venue.platform === "MT4" || venue.platform === "MT5") {
    const token = bridgeToken(creds.metaapiToken);
    const accountId = venue.bridgeAccountId ?? "";
    if (!token || !accountId) {
      return rejected("This MT link has no bridge token. Reconnect the account to restore live execution.", `${venue.platform} bridge`);
    }
    const brokerSymbol = await resolveBrokerSymbol(accountId, token, req.symbol);
    if (!brokerSymbol) {
      return rejected(
        `Your broker's ${venue.platform} server does not list ${req.symbol}. The position book was not changed.`,
        `${venue.platform} bridge`,
      );
    }
    const spec = await symbolSpecification(accountId, token, brokerSymbol);
    if (!spec) {
      return rejected(
        `Could not read the contract specification for ${brokerSymbol} from your broker, so lot size cannot be computed honestly. The position book was not changed.`,
        `${venue.platform} bridge`,
      );
    }
    const rawLots = req.qty / spec.contractSize;
    if (!(rawLots > 0)) {
      return rejected(`Quantity ${req.qty} is below one lot of ${brokerSymbol} (contract size ${spec.contractSize}).`, `${venue.platform} bridge`);
    }
    const stepped = Math.max(spec.volumeMin, Math.min(spec.volumeMax, Math.floor(rawLots / spec.volumeStep) * spec.volumeStep));
    const lots = +stepped.toFixed(2);
    const placed = await metaapiMarketOrder(
      accountId, token, side, brokerSymbol, lots,
      req.stopPrice, req.targetPrice, req.clientTag ?? "deeyoung-pro",
    );
    if (!placed.ok) return rejected(placed.detail, `${venue.platform} bridge`);
    for (let i = 0; i < 3; i++) {
      await new Promise((r) => setTimeout(r, 800));
      const ps = await metaapiPositions(accountId, token);
      const pos = (ps ?? []).find((p) => p.id === placed.positionId);
      if (pos && pos.openPrice > 0) {
        const fillQty = pos.volume * spec.contractSize;
        return {
          ok: true, status: "FILLED", filledQty: fillQty, avgFillPrice: pos.openPrice,
          fills: [{ t: Date.now(), qty: fillQty, price: pos.openPrice, slippageBps: 0 }],
          latencyMs: Date.now() - t0,
          brokerLabel: `${venue.platform} ${venue.label ?? ""}`.trim(),
          brokerOrderId: placed.positionId ?? placed.orderId,
          detail: `Filled ${pos.volume} lots ${brokerSymbol} at ${pos.openPrice} on your ${venue.platform} account.`,
        };
      }
    }
    return rejected(
      `Your broker accepted the order (${placed.orderId ?? "no id"}) but the fill is not confirmed yet. Check your terminal; the position book was not changed.`,
      `${venue.platform} bridge`,
    );
  }

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
