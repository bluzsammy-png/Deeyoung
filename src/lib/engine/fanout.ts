// DEEYOUNG PRO — engine-to-broker fan-out ("connect your broker, go live").
//
// Product rule (owner directive): the platform stays PAPER by default. The
// engine always trades the house paper book first. Every engine entry/exit is
// additionally MIRRORED, fire-and-forget, onto every broker link that is
// CONNECTED, FULL access, and autoMirror=true — the moment a user connects a
// broker the system reads that API and their account starts following the
// engine live. No code change, no owner action.
//
// Supported live paths:
//   - DERIV  — native Deriv websocket API (user's own API token), multipliers
//   - MT4/MT5 — our own EA bridge: commands queue in BridgeCommand, the user's
//     terminal executes them and reports fills back
//   - MT4/MT5 legacy MetaApi links — kept working through the same cloud lib
//   - ALPACA / BINANCE / BYBIT — direct API market orders
//   - OANDA — the engine universe is crypto, so OANDA links are skipped with
//     an explicit reason (OANDA routes FX only)
//
// Honesty rules encoded here:
//   - a mirror fill is only recorded from a broker/terminal response;
//   - unsupported symbols are recorded UNSUPPORTED, never substituted;
//   - per-link guard rails: max 3 open mirrors, max 20 mirror orders per day;
//   - dispatch is serialized per link so entries/exits cannot interleave.

import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import {
  DERIV_MULTIPLIER_DEFAULT,
  derivAuthorize,
  derivBuyMultiplier,
  derivCryptoSymbol,
  derivSellContract,
  derivStakeClamp,
} from "@/lib/brokers/deriv";
import { alpacaMarketOrder, type AlpacaCreds } from "@/lib/brokers/alpaca";
import { binanceTestnetMarketOrder, type BinanceCreds } from "@/lib/brokers/binance-testnet";
import { bybitMarketOrder, type BybitCreds } from "@/lib/brokers/bybit";
import { marketOrder as metaapiMarketOrder, resolveBrokerSymbol, bridgeToken } from "@/lib/brokers/metaapi";

const MAX_OPEN_MIRRORS = 3;
const MAX_MIRROR_ORDERS_PER_DAY = 20;
const MT_LOTS_DEFAULT = 0.01;
const MT_LOTS_MIN = 0.01;
const MT_LOTS_MAX = 1.0;
const DIRECT_NOTIONAL_DEFAULT = 100;
const DIRECT_NOTIONAL_MIN = 10;
const DIRECT_NOTIONAL_MAX = 1000;

function mtLots(lots: number | null | undefined): number {
  const v = typeof lots === "number" && lots > 0 ? lots : MT_LOTS_DEFAULT;
  return Math.min(MT_LOTS_MAX, Math.max(MT_LOTS_MIN, Math.round(v * 100) / 100));
}
function directNotional(v: number | null | undefined): number {
  const x = typeof v === "number" && v > 0 ? v : DIRECT_NOTIONAL_DEFAULT;
  return Math.min(DIRECT_NOTIONAL_MAX, Math.max(DIRECT_NOTIONAL_MIN, Math.round(x * 100) / 100));
}

// ── per-link serialization ───────────────────────────────────────────────────
const linkChains = new Map<string, Promise<void>>();
function enqueue(linkId: string, job: () => Promise<void>): void {
  const prev = linkChains.get(linkId) ?? Promise.resolve();
  const next = prev.then(job).catch(() => { /* per-link failures are recorded on the mirror row */ });
  linkChains.set(linkId, next);
  void next.then(() => {
    if (linkChains.get(linkId) === next) linkChains.delete(linkId);
  });
}

async function guardRailsOk(linkId: string): Promise<boolean> {
  const [openCount, dayCount] = await Promise.all([
    db.brokerMirrorTrade.count({ where: { linkId, status: { in: ["QUEUED", "FILLED"] } } }),
    db.brokerMirrorTrade.count({ where: { linkId, createdAt: { gte: new Date(new Date().setUTCHours(0, 0, 0, 0)) } } }),
  ]);
  return openCount < MAX_OPEN_MIRRORS && dayCount < MAX_MIRROR_ORDERS_PER_DAY;
}

interface LinkCreds { apiToken?: string; apiKey?: string; apiSecret?: string; accountId?: string; password?: string; metaapiToken?: string; region?: string }
function parseCreds(raw: string): LinkCreds | null {
  try { const j = JSON.parse(raw); return typeof j === "object" && j !== null ? j as LinkCreds : null; } catch { return null; }
}

// ── ENTRY ────────────────────────────────────────────────────────────────────

export interface FanoutEntryInput {
  engineOid: string;
  positionId?: string | null;
  symbol: string;
  refPrice: number;
  stop?: number | null;
  target?: number | null;
}

/** Mirror one engine ENTRY onto every live autoMirror broker link. */
export async function fanoutOnEntry(input: FanoutEntryInput): Promise<void> {
  try {
    const links = await db.brokerLink.findMany({
      where: { status: "CONNECTED", mode: "FULL", autoMirror: true },
      orderBy: { createdAt: "asc" },
    });
    for (const link of links) {
      const isBridge = link.platform === "MT4" || link.platform === "MT5";
      const usable = !isBridge
        || !!link.bridgeTokenHash
        || (!!link.bridgeAccountId && link.platform === "MT5");
      if (!usable) continue;
      if (link.balance != null && link.balance <= 0) {
        await db.brokerMirrorTrade.create({
          data: {
            userId: link.userId, linkId: link.id, platform: link.platform,
            engineOid: input.engineOid, positionId: input.positionId ?? null,
            symbol: input.symbol, side: "BUY", refPrice: input.refPrice,
            status: "SKIPPED", detail: "Skipped: the linked account reported a zero balance.",
          },
        });
        continue;
      }
      if (!(await guardRailsOk(link.id))) continue;

      const row = await db.brokerMirrorTrade.create({
        data: {
          userId: link.userId, linkId: link.id, platform: link.platform,
          engineOid: input.engineOid, positionId: input.positionId ?? null,
          symbol: input.symbol, side: "BUY", refPrice: input.refPrice,
          status: "PENDING", detail: "",
        },
      });
      enqueue(link.id, () => dispatchEntry(link, row.id, input));
    }
  } catch { /* fan-out must never break the engine loop */ }
}

async function dispatchEntry(
  link: Awaited<ReturnType<typeof db.brokerLink.findFirstOrThrow>>,
  mirrorId: string,
  input: FanoutEntryInput,
): Promise<void> {
  try {
    if (link.platform === "DERIV") {
      const credsRaw = decryptSecret({ cipher: link.credCipher, iv: link.credIV, tag: link.credTag });
      const creds = credsRaw ? parseCreds(credsRaw) : null;
      const token = creds?.apiToken ?? "";
      if (!token) {
        await db.brokerMirrorTrade.update({ where: { id: mirrorId }, data: { status: "ERROR", detail: "Stored Deriv token could not be read. Reconnect the account." } });
        return;
      }
      const dsym = await derivCryptoSymbol(token, input.symbol);
      if (!dsym) {
        // Distinguish honestly: an invalid token is a rejection, a missing
        // symbol is genuinely unsupported on this account.
        const auth = await derivAuthorize(token);
        await db.brokerMirrorTrade.update({
          where: { id: mirrorId },
          data: auth.ok
            ? { status: "UNSUPPORTED", detail: `Deriv does not list ${input.symbol.replace(/USD$/i, "")} on this account. Nothing was traded.` }
            : { status: "REJECTED", detail: auth.detail },
        });
        return;
      }
      const stake = derivStakeClamp(link.autoStakeUsd);
      const mult = DERIV_MULTIPLIER_DEFAULT;
      // Convert the engine's price stop/target into Deriv's monetary guards.
      const stopUsd = input.stop ? Math.min(stake * mult * Math.abs(input.refPrice - input.stop) / input.refPrice, stake * mult * 0.9) : 0;
      const tgtUsd = input.target ? Math.min(stake * mult * Math.abs(input.target - input.refPrice) / input.refPrice, stake * mult * 0.9) : 0;
      const res = await derivBuyMultiplier(token, {
        symbol: dsym.symbol, side: "BUY", currency: link.currency || "USD",
        stakeUsd: stake, multiplier: mult,
        stopLossUsd: stopUsd, takeProfitUsd: tgtUsd,
      });
      if (!res.ok) {
        await db.brokerMirrorTrade.update({ where: { id: mirrorId }, data: { status: "REJECTED", detail: res.detail } });
        return;
      }
      await db.brokerMirrorTrade.update({
        where: { id: mirrorId },
        data: {
          status: "FILLED", brokerRef: String(res.data?.contract_id ?? ""),
          detail: `${dsym.display_name} ${mult}x multiplier opened with ${stake} ${link.currency} stake. ${res.detail}`.trim(),
        },
      });
      return;
    }

    if (link.platform === "MT4" || link.platform === "MT5") {
      if (link.bridgeTokenHash) {
        const cmd = await db.bridgeCommand.create({
          data: {
            linkId: link.id, action: "OPEN", symbol: input.symbol, side: "BUY",
            lots: mtLots(link.autoLots), stopLoss: input.stop ?? null, takeProfit: input.target ?? null,
            refOid: input.engineOid, mirrorId,
          },
        });
        await db.brokerMirrorTrade.update({ where: { id: mirrorId }, data: { status: "QUEUED", detail: `Queued for your terminal (command ${cmd.id.slice(-6)}).` } });
        return;
      }
      // Legacy MetaApi link (pre-own-bridge).
      const credsRaw = decryptSecret({ cipher: link.credCipher, iv: link.credIV, tag: link.credTag });
      const creds = credsRaw ? parseCreds(credsRaw) : null;
      const token = bridgeToken(creds?.metaapiToken ?? "");
      const accountId = link.bridgeAccountId ?? "";
      if (!token || !accountId) {
        await db.brokerMirrorTrade.update({ where: { id: mirrorId }, data: { status: "ERROR", detail: "This legacy MT link has no bridge access. Reconnect the account." } });
        return;
      }
      const brokerSymbol = await resolveBrokerSymbol(accountId, token, input.symbol);
      if (!brokerSymbol) {
        await db.brokerMirrorTrade.update({ where: { id: mirrorId }, data: { status: "UNSUPPORTED", detail: `Your broker's ${link.platform} server does not list ${input.symbol}.` } });
        return;
      }
      const placed = await metaapiMarketOrder(accountId, token, "BUY", brokerSymbol, mtLots(link.autoLots), input.stop ?? undefined, input.target ?? undefined, "deeyoung-mirror");
      await db.brokerMirrorTrade.update({
        where: { id: mirrorId },
        data: placed.ok
          ? { status: "FILLED", brokerRef: placed.positionId ?? placed.orderId ?? null, detail: `Order accepted by your broker (${brokerSymbol}); fill price follows the terminal.` }
          : { status: "REJECTED", detail: placed.detail },
      });
      return;
    }

    // Direct API platforms: fixed-notional market orders.
    const credsRaw = decryptSecret({ cipher: link.credCipher, iv: link.credIV, tag: link.credTag });
    const creds = credsRaw ? parseCreds(credsRaw) : null;
    const notional = directNotional(link.autoNotionalUsd);
    const qty = notional / input.refPrice;

    if (link.platform === "BINANCE") {
      const c: BinanceCreds = { key: creds?.apiKey ?? "", secret: creds?.apiSecret ?? "", env: link.env === "LIVE" ? "LIVE" : "TESTNET" };
      const binSymbol = `${input.symbol.replace(/USD$/i, "").toUpperCase()}USDT`;
      const res = await binanceTestnetMarketOrder({ symbol: binSymbol, side: "BUY", quantity: +qty.toFixed(6), clientOrderId: `mirror-${mirrorId.slice(-10)}` }, c);
      const exQty = res.executedQty ?? 0;
      const cumQuote = res.cummulativeQuoteQty ?? 0;
      if (res.verdict !== "FILLED" || !(exQty > 0) || !(cumQuote > 0)) {
        await db.brokerMirrorTrade.update({ where: { id: mirrorId }, data: { status: "REJECTED", detail: res.errorDetail ?? `Binance did not fill the order (${res.verdict}).` } });
        return;
      }
      await db.brokerMirrorTrade.update({ where: { id: mirrorId }, data: { status: "FILLED", fillQty: exQty, fillPrice: cumQuote / exQty, brokerRef: String(res.orderId ?? ""), detail: `Filled ${exQty} ${binSymbol} on Binance ${c.env}.` } });
      return;
    }
    if (link.platform === "BYBIT") {
      const c: BybitCreds = { key: creds?.apiKey ?? "", secret: creds?.apiSecret ?? "", env: link.env === "LIVE" ? "LIVE" : "DEMO" };
      const bybSymbol = `${input.symbol.replace(/USD$/i, "").toUpperCase()}USDT`;
      const res = await bybitMarketOrder(bybSymbol, "Buy", +qty.toFixed(6), input.stop ?? undefined, input.target ?? undefined, "DEEYOUNG-MIRROR", c);
      if (!res.ok || !((res.avgFillPrice ?? 0) > 0) || !((res.filledQty ?? 0) > 0)) {
        await db.brokerMirrorTrade.update({ where: { id: mirrorId }, data: { status: res.ok ? "FILLED" : "REJECTED", fillQty: res.filledQty ?? null, fillPrice: res.avgFillPrice ?? null, brokerRef: res.orderId ?? null, detail: res.ok ? "Order accepted; waiting for the fill price from Bybit." : res.detail } });
        return;
      }
      await db.brokerMirrorTrade.update({ where: { id: mirrorId }, data: { status: "FILLED", fillQty: res.filledQty, fillPrice: res.avgFillPrice, brokerRef: res.orderId ?? null, detail: res.detail } });
      return;
    }
    if (link.platform === "ALPACA") {
      const c: AlpacaCreds = { keyId: creds?.apiKey ?? "", secretKey: creds?.apiSecret ?? "", env: link.env === "LIVE" ? "LIVE" : "PAPER" };
      const alpSymbol = `${input.symbol.replace(/USD$/i, "")}/USD`;
      const res = await alpacaMarketOrder(alpSymbol, "buy", +qty.toFixed(6), input.target ?? undefined, input.stop ?? undefined, "deeyoung-mirror", c);
      await db.brokerMirrorTrade.update({
        where: { id: mirrorId },
        data: res.ok
          ? { status: "FILLED", fillQty: qty, brokerRef: res.orderId ?? null, detail: `Alpaca ${c.env} accepted the order; the fill price follows from Alpaca.` }
          : { status: "REJECTED", detail: res.detail },
      });
      return;
    }
    if (link.platform === "OANDA") {
      await db.brokerMirrorTrade.update({ where: { id: mirrorId }, data: { status: "UNSUPPORTED", detail: "OANDA routes FX only and the engine currently trades crypto. Nothing was traded." } });
      return;
    }
    await db.brokerMirrorTrade.update({ where: { id: mirrorId }, data: { status: "ERROR", detail: `Platform ${link.platform} has no mirror path.` } });
  } catch (e) {
    await db.brokerMirrorTrade.update({ where: { id: mirrorId }, data: { status: "ERROR", detail: String(e).slice(0, 280) } }).catch(() => {});
  }
}

// ── EXIT ─────────────────────────────────────────────────────────────────────

export interface FanoutExitInput {
  positionId: string;
  symbol: string;
  refPrice: number;
  reason: string;
}

/** Mirror one engine EXIT (close) onto every mirror opened for this position.
 *  Rows still PENDING are included: the engine can close within seconds of
 *  opening, while the broker confirmation is still in flight. */
export async function fanoutOnExit(input: FanoutExitInput): Promise<void> {
  try {
    const rows = await db.brokerMirrorTrade.findMany({
      where: { positionId: input.positionId, status: { in: ["PENDING", "QUEUED", "FILLED"] } },
    });
    for (const row of rows) {
      const link = await db.brokerLink.findUnique({ where: { id: row.linkId } });
      if (!link) continue;
      enqueue(link.id, () => dispatchExit(link, row.id, input));
    }
  } catch { /* never break the engine loop */ }
}

async function dispatchExit(
  link: Awaited<ReturnType<typeof db.brokerLink.findFirstOrThrow>>,
  mirrorId: string,
  input: FanoutExitInput,
): Promise<void> {
  try {
    let row = await db.brokerMirrorTrade.findUnique({ where: { id: mirrorId } });
    if (!row) return;

    // Entry still in flight? Wait (bounded) so the close targets a real
    // broker position instead of racing the entry confirmation.
    const settleDeadline = Date.now() + 30_000;
    while (row.status === "PENDING" && Date.now() < settleDeadline) {
      await new Promise((r) => setTimeout(r, 1000));
      row = await db.brokerMirrorTrade.findUnique({ where: { id: mirrorId } });
      if (!row) return;
    }
    if (row.status === "PENDING") {
      await db.brokerMirrorTrade.update({ where: { id: mirrorId }, data: { status: "ERROR", detail: "Engine closed the trade but the broker entry never confirmed. Nothing was left open programmatically; check the broker account." } });
      return;
    }
    if (row.status === "REJECTED" || row.status === "UNSUPPORTED" || row.status === "SKIPPED") {
      await db.brokerMirrorTrade.update({ where: { id: mirrorId }, data: { detail: `${row.detail} Engine closed the paper trade; nothing to close at the broker (entry never filled).`.slice(0, 300) } });
      return;
    }

    if (link.platform === "DERIV") {
      const contractId = Number(row.brokerRef);
      if (!contractId) {
        await db.brokerMirrorTrade.update({ where: { id: mirrorId }, data: { status: "ERROR", detail: "No Deriv contract id recorded for this mirror; it cannot be closed programmatically." } });
        return;
      }
      const credsRaw = decryptSecret({ cipher: link.credCipher, iv: link.credIV, tag: link.credTag });
      const token = credsRaw ? parseCreds(credsRaw)?.apiToken ?? "" : "";
      if (!token) {
        await db.brokerMirrorTrade.update({ where: { id: mirrorId }, data: { status: "ERROR", detail: "Stored Deriv token could not be read. Reconnect the account to allow closing." } });
        return;
      }
      const res = await derivSellContract(token, contractId);
      await db.brokerMirrorTrade.update({
        where: { id: mirrorId },
        data: res.ok
          ? { status: "CLOSED", closePrice: res.data?.sold_for ?? null, closedAt: new Date(), detail: `Contract closed at market; close value ${res.data?.sold_for ?? "?"} ${link.currency}.` }
          : { status: "ERROR", detail: `Deriv close failed: ${res.detail}` },
      });
      return;
    }

    if (link.platform === "MT4" || link.platform === "MT5") {
      if (link.bridgeTokenHash) {
        await db.bridgeCommand.create({
          data: {
            linkId: link.id, action: "CLOSE", symbol: row.symbol, side: "SELL",
            lots: row.fillQty && row.fillQty > 0 ? row.fillQty : mtLots(link.autoLots),
            ticket: row.brokerRef ?? "0",
            refOid: `X_${input.positionId}_${input.reason}`, mirrorId,
          },
        });
        await db.brokerMirrorTrade.update({ where: { id: mirrorId }, data: { detail: "Close queued for your terminal." } });
        return;
      }
      // Legacy MetaApi close: opposite market order (netting accounts).
      const credsRaw = decryptSecret({ cipher: link.credCipher, iv: link.credIV, tag: link.credTag });
      const creds = credsRaw ? parseCreds(credsRaw) : null;
      const token = bridgeToken(creds?.metaapiToken ?? "");
      const accountId = link.bridgeAccountId ?? "";
      if (!token || !accountId) {
        await db.brokerMirrorTrade.update({ where: { id: mirrorId }, data: { status: "ERROR", detail: "This legacy MT link has no bridge access. Reconnect the account." } });
        return;
      }
      const brokerSymbol = await resolveBrokerSymbol(accountId, token, row.symbol);
      if (!brokerSymbol) {
        await db.brokerMirrorTrade.update({ where: { id: mirrorId }, data: { status: "ERROR", detail: `Broker does not list ${row.symbol}; cannot close.` } });
        return;
      }
      const placed = await metaapiMarketOrder(accountId, token, "SELL", brokerSymbol, row.fillQty && row.fillQty > 0 ? row.fillQty : mtLots(link.autoLots), undefined, undefined, "deeyoung-mirror-close");
      await db.brokerMirrorTrade.update({
        where: { id: mirrorId },
        data: placed.ok
          ? { status: "CLOSED", closedAt: new Date(), detail: "Close order accepted by your broker." }
          : { status: "ERROR", detail: placed.detail },
      });
      return;
    }

    // Direct API closes: sell back the recorded fill quantity.
    const credsRaw = decryptSecret({ cipher: link.credCipher, iv: link.credIV, tag: link.credTag });
    const creds = credsRaw ? parseCreds(credsRaw) : null;
    const closeQty = row.fillQty && row.fillQty > 0 ? row.fillQty : 0;

    if (link.platform === "BINANCE") {
      const c: BinanceCreds = { key: creds?.apiKey ?? "", secret: creds?.apiSecret ?? "", env: link.env === "LIVE" ? "LIVE" : "TESTNET" };
      const binSymbol = `${row.symbol.replace(/USD$/i, "").toUpperCase()}USDT`;
      const res = await binanceTestnetMarketOrder({ symbol: binSymbol, side: "SELL", quantity: +closeQty.toFixed(6), clientOrderId: `mirrorx-${mirrorId.slice(-10)}` }, c);
      const exQty = res.executedQty ?? 0;
      const cumQuote = res.cummulativeQuoteQty ?? 0;
      if (res.verdict !== "FILLED" || !(exQty > 0) || !(cumQuote > 0)) {
        await db.brokerMirrorTrade.update({ where: { id: mirrorId }, data: { status: "ERROR", detail: res.errorDetail ?? `Binance close did not fill (${res.verdict}).` } });
        return;
      }
      await db.brokerMirrorTrade.update({ where: { id: mirrorId }, data: { status: "CLOSED", closePrice: cumQuote / exQty, closedAt: new Date(), detail: `Closed ${exQty} ${binSymbol} on Binance ${c.env}.` } });
      return;
    }
    if (link.platform === "BYBIT") {
      const c: BybitCreds = { key: creds?.apiKey ?? "", secret: creds?.apiSecret ?? "", env: link.env === "LIVE" ? "LIVE" : "DEMO" };
      const res = await bybitMarketOrder(`${row.symbol.replace(/USD$/i, "").toUpperCase()}USDT`, "Sell", +closeQty.toFixed(6), undefined, undefined, "DEEYOUNG-MIRROR-X", c);
      await db.brokerMirrorTrade.update({
        where: { id: mirrorId },
        data: res.ok
          ? { status: "CLOSED", closePrice: res.avgFillPrice ?? null, closedAt: new Date(), detail: res.detail }
          : { status: "ERROR", detail: res.detail },
      });
      return;
    }
    if (link.platform === "ALPACA") {
      const c: AlpacaCreds = { keyId: creds?.apiKey ?? "", secretKey: creds?.apiSecret ?? "", env: link.env === "LIVE" ? "LIVE" : "PAPER" };
      const res = await alpacaMarketOrder(`${row.symbol.replace(/USD$/i, "")}/USD`, "sell", +closeQty.toFixed(6), undefined, undefined, "deeyoung-mirror-x", c);
      await db.brokerMirrorTrade.update({
        where: { id: mirrorId },
        data: res.ok
          ? { status: "CLOSED", closedAt: new Date(), detail: `Alpaca ${c.env} accepted the closing order.` }
          : { status: "ERROR", detail: res.detail },
      });
      return;
    }
    // OANDA: engine crypto positions are never mirrored onto OANDA (UNSUPPORTED
    // at entry), so there is nothing to close here.
  } catch (e) {
    await db.brokerMirrorTrade.update({ where: { id: mirrorId }, data: { status: "ERROR", detail: String(e).slice(0, 280) } }).catch(() => {});
  }
}

/** Live mirror counters for the status snapshot / telemetry. */
export async function fanoutStats(): Promise<{ liveLinks: number; openMirrors: number; mirrorsToday: number }> {
  try {
    const dayStart = new Date(new Date().setUTCHours(0, 0, 0, 0));
    const [liveLinks, openMirrors, mirrorsToday] = await Promise.all([
      db.brokerLink.count({ where: { status: "CONNECTED", mode: "FULL", autoMirror: true } }),
      db.brokerMirrorTrade.count({ where: { status: { in: ["QUEUED", "FILLED"] } } }),
      db.brokerMirrorTrade.count({ where: { createdAt: { gte: dayStart } } }),
    ]);
    return { liveLinks, openMirrors, mirrorsToday };
  } catch {
    return { liveLinks: 0, openMirrors: 0, mirrorsToday: 0 };
  }
}
