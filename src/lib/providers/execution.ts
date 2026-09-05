// DEEYOUNG PRO — ExecutionProvider abstraction (§19) + realistic paper fills (§20)
// DeeYoungPaperProvider: modeled slippage, spread, latency, partial fills, rejects.
// AlpacaPaperProvider: stub requiring BYOK keys — never pretends to be connected.
// Clearly labeled: "DeeYoung Simulated" vs "Alpaca Paper". Never implies real execution.

import { randomUUID } from "crypto";
import type { Quote } from "@/lib/types";

export interface FillRecord { t: number; qty: number; price: number; slippageBps: number }

export interface ExecutionResult {
  ok: boolean;
  status: "FILLED" | "PARTIAL" | "REJECTED" | "CANCELLED";
  filledQty: number;
  avgFillPrice: number | null;
  fills: FillRecord[];
  rejectReason?: string;
  latencyMs: number;
  brokerLabel: string; // "DeeYoung Simulated" | "Alpaca Paper"
}

export interface OrderRequest {
  symbol: string;
  side: "BUY" | "SELL";
  type: "MARKET" | "LIMIT" | "STOP";
  qty: number;
  limitPrice?: number;
  stopPrice?: number;
  quote: Quote;
  cashAvailable: number;
  currentQty: number;
}

export interface ExecutionProvider {
  name: string;
  label: string;
  execute(req: OrderRequest): Promise<ExecutionResult>;
}

/** Spread estimate from quote range (deterministic, honest). */
function spreadBps(quote: Quote): number {
  const range = Math.max(quote.dayHigh - quote.dayLow, quote.price * 0.002);
  const est = (range / quote.price) * 300; // ~3% of daily range as spread proxy
  return Math.max(1, Math.min(40, est));
}

export class DeeYoungPaperProvider implements ExecutionProvider {
  name = "DEEYOUNG_SIM";
  label = "DeeYoung Simulated";

  async execute(req: OrderRequest): Promise<ExecutionResult> {
    const t0 = Date.now();
    const fills: FillRecord[] = [];
    // Modeled latency 80–350ms
    const latency = 80 + Math.floor(Math.random() * 270);
    await new Promise((res) => setTimeout(res, Math.min(latency, 120)));

    // ── Rejects (§20) ──
    if (req.qty <= 0) return this.reject("Invalid quantity", t0, fills);
    if (req.side === "BUY" && req.type === "MARKET") {
      const est = req.qty * req.quote.price;
      if (est > req.cashAvailable) return this.reject("Insufficient cash for this order", t0, fills);
    }
    if (req.side === "SELL" && req.currentQty < req.qty) {
      return this.reject(`You only hold ${req.currentQty} shares`, t0, fills);
    }
    // Market closed → reject market orders (honest simulation)
    if (req.quote.marketState === "CLOSED" && req.type === "MARKET") {
      return this.reject("Market closed: order not simulated", t0, fills);
    }
    const advVolume = req.quote.avgVolume;
    if (req.qty > advVolume * 0.05) {
      return this.reject("Order exceeds 5% of average volume: reduce size", t0, fills);
    }

    // ── Fill modeling ──
    const spread = spreadBps(req.quote);
    const base = req.type === "LIMIT"
      ? (req.limitPrice ?? req.quote.price)
      : req.quote.price;
    // Marketable limit check
    if (req.type === "LIMIT") {
      if (req.side === "BUY" && req.quote.price > (req.limitPrice ?? 0)) {
        return this.reject("Limit price below market: order would rest unfilled", t0, fills);
      }
      if (req.side === "SELL" && req.quote.price < (req.limitPrice ?? Infinity)) {
        return this.reject("Limit price above market: order would rest unfilled", t0, fills);
      }
    }

    const slipSide = req.side === "BUY" ? 1 : -1;
    // Slippage grows with order size vs ADV (square-root market impact model)
    const participation = Math.min(1, req.qty / Math.max(advVolume, 1));
    const impactBps = 4 * Math.sqrt(participation * 100) + spread / 2;
    const gap = Math.random() < 0.03 ? (Math.random() * 8) : 0; // 3% chance of gap-through
    const fillPrice = base * (1 + slipSide * ((impactBps + gap) / 10_000));

    // Partial fill for large orders (>2% ADV)
    let filledQty = req.qty;
    if (req.qty > advVolume * 0.02) {
      filledQty = Math.max(1, Math.floor(req.qty * (0.5 + Math.random() * 0.3)));
    }
    fills.push({ t: Date.now(), qty: filledQty, price: Math.round(fillPrice * 100) / 100, slippageBps: Math.round(impactBps + gap) });

    const status: ExecutionResult["status"] = filledQty < req.qty ? "PARTIAL" : "FILLED";
    return {
      ok: true, status, filledQty,
      avgFillPrice: fills[0].price,
      fills,
      latencyMs: Date.now() - t0 + latency,
      brokerLabel: this.label,
    };
  }

  private reject(reason: string, t0: number, fills: FillRecord[]): ExecutionResult {
    return { ok: false, status: "REJECTED", filledQty: 0, avgFillPrice: null, fills, rejectReason: reason, latencyMs: Date.now() - t0, brokerLabel: this.label };
  }
}

export class AlpacaPaperProvider implements ExecutionProvider {
  name = "ALPACA_PAPER";
  label = "Alpaca Paper";

  async execute(_req: OrderRequest): Promise<ExecutionResult> {
    // BYOK keys not configured in this environment → honest refusal, never fake fills (§55)
    return {
      ok: false, status: "REJECTED", filledQty: 0, avgFillPrice: null, fills: [],
      rejectReason: "Alpaca Paper requires your API keys (BYOK). Connect keys in Settings → Broker to enable. DeeYoung will never simulate Alpaca fills without a live connection.",
      latencyMs: 0, brokerLabel: this.label,
    };
  }
}

export function getExecutionProvider(broker: string): ExecutionProvider {
  return broker === "ALPACA_PAPER" ? new AlpacaPaperProvider() : new DeeYoungPaperProvider();
}

export function newRequestId(): string {
  return randomUUID();
}
