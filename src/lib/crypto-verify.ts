// DEEYOUNG PRO — on-chain verification of USDT (TRC-20) subscription payments.
//
// The checkout crypto rail works like this:
//   1. POST /api/billing/order creates the order and returns a UNIQUE crypto
//      amount (base USD price + a per-order jitter of 0.01..0.89 derived from
//      the order id). Unique amounts are the standard anti-replay defence:
//      the wallet's historical transfers are publicly visible on block
//      explorers, so a txid alone must never be accepted as proof. The amount
//      binds the transfer to exactly one order.
//   2. The buyer sends that exact amount to the wallet and submits the txid.
//   3. PATCH /api/billing/order calls verifyUsdtTransfer() below, which checks
//      the TRON mainnet via TronGrid:
//        - the transfer is CONFIRMED and arrived AFTER the order was created
//        - it is a real USDT transfer (official TRC-20 contract address)
//        - the destination is our wallet
//        - the amount matches the order's unique expected amount
//   4. Only then does the order flip to PAID and the plan upgrade happen.
// Any mismatch stays in SUBMITTED for manual review in /admin (Billing tab).
//
// The wallet address is configuration: the CRYPTO_USDT_ADDRESS env var wins
// when set (Railway variables), otherwise the owner's published address below
// applies. A receiving address is not a secret; it is shown to every buyer.

export const DEFAULT_USDT_WALLET = "TTtFwf5ah8A4UUeptJGDj8tXkvdwVwwU4r";
export const USDT_TRC20_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"; // Tether USD on TRON mainnet

export function cryptoWallet(): string {
  return process.env.CRYPTO_USDT_ADDRESS?.trim() || DEFAULT_USDT_WALLET;
}

export function cryptoNetwork(): string {
  return (process.env.CRYPTO_NETWORK ?? "TRC-20").slice(0, 20);
}

export function cryptoAsset(): string {
  return (process.env.CRYPTO_ASSET ?? "USDT").slice(0, 10);
}

/**
 * Deterministic per-order crypto amount: base USD price + 0.01..0.89 jitter
 * derived from the order id. Two orders of the same tier never share an exact
 * amount, so a submitted txid can only ever satisfy the order it paid for.
 */
export function cryptoAmountUsd(orderId: string, baseUsd: number): number {
  let h = 0;
  for (let i = orderId.length - 1, taken = 0; i >= 0 && taken < 12; i--, taken++) {
    h = (h * 31 + orderId.charCodeAt(i)) >>> 0;
  }
  const jitter = ((h % 89) + 1) / 100; // 0.01 .. 0.89
  return Math.round((baseUsd + jitter) * 100) / 100;
}

export type CryptoVerifyResult =
  | { verdict: "PAID"; amount: number; from: string }
  | { verdict: "NOT_FOUND" }
  | { verdict: "MISMATCH"; detail: "token" | "amount" | "destination" }
  | { verdict: "PROVIDER_DOWN" };

interface Trc20Transfer {
  transaction_id?: string;
  token_info?: { address?: string; symbol?: string; decimals?: number };
  block_timestamp?: number;
  from?: string;
  to?: string;
  type?: string;
  value?: string;
}

/**
 * Verify a TRC-20 USDT transfer on TRON mainnet.
 * @param txid          buyer-submitted transaction id
 * @param expectedUsd   the order's unique expected amount (cryptoAmountUsd)
 * @param notBefore     order creation time; earlier transfers are rejected
 */
export async function verifyUsdtTransfer(
  txid: string,
  expectedUsd: number,
  notBefore: Date,
): Promise<CryptoVerifyResult> {
  const wallet = cryptoWallet();
  const url = new URL(`https://api.trongrid.io/v1/accounts/${wallet}/transactions/trc20`);
  url.searchParams.set("only_confirmed", "true");
  url.searchParams.set("only_to", "true");
  url.searchParams.set("limit", "200");
  // Only transfers at/after order creation (60s clock tolerance) can pay it.
  url.searchParams.set("min_timestamp", String(notBefore.getTime() - 60_000));

  let data: Trc20Transfer[];
  try {
    let res: Response | null = null;
    // One gentle retry: transient 429/5xx from the provider must not force
    // an unnecessary manual-review detour for the buyer.
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 1500));
      res = await fetch(url, {
        signal: AbortSignal.timeout(10_000),
        headers: { accept: "application/json" },
        cache: "no-store",
      });
      if (res.ok) break;
      res = null;
    }
    if (!res) return { verdict: "PROVIDER_DOWN" };
    const j = (await res.json().catch(() => null)) as { data?: Trc20Transfer[] } | null;
    data = Array.isArray(j?.data) ? j.data : [];
  } catch {
    return { verdict: "PROVIDER_DOWN" };
  }

  const t = data.find((x) => x.transaction_id === txid);
  if (!t) return { verdict: "NOT_FOUND" };

  if (t.type !== "Transfer" || t.token_info?.address !== USDT_TRC20_CONTRACT) {
    return { verdict: "MISMATCH", detail: "token" };
  }
  if (t.to !== wallet) return { verdict: "MISMATCH", detail: "destination" };

  // USDT TRC-20 has 6 decimals. Accept exact and slight overpayment
  // (up to +1.00), reject everything else for manual review.
  const value = Number(t.value) / 1e6;
  if (!Number.isFinite(value) || value < expectedUsd - 0.005 || value > expectedUsd + 1.0) {
    return { verdict: "MISMATCH", detail: "amount" };
  }

  return { verdict: "PAID", amount: value, from: t.from ?? "unknown" };
}
