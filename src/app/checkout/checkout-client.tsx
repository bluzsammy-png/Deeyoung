"use client";

// DEEYOUNG PRO — checkout flow client. Honest by construction:
//   • prices come from src/lib/pricing.ts (rendered) and are re-resolved
//     server-side when the order is created;
//   • the three states below are the ONLY states the server can return;
//   • no fake urgency, no invented stock, no placeholder screens.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight, Check, CheckCircle2, Copy, Loader2, LogIn, RefreshCw, ShieldCheck, Wallet,
} from "lucide-react";
import { authClient, type SessionUser } from "@/lib/auth-client";
import { effectivePlan, hasPaidAccess } from "@/lib/entitlements";
import { TIERS, detectCurrencyFromBrowser, tierPrice, CURRENCY_SYMBOL, type CurrencyCode } from "@/lib/pricing";

type RailState =
  | { kind: "idle" }
  | { kind: "hosted"; url: string }
  | { kind: "crypto"; orderId: string; address: string; network: string; asset: string; amountUsd: number }
  | { kind: "unavailable"; orderId: string }
  | { kind: "submitted" }
  | { kind: "error"; message: string };

export function CheckoutClient({ tierKey }: { tierKey: "STARTER" | "PRO" | "ELITE" }) {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const user = session?.user as SessionUser | undefined;
  const tier = TIERS.find((t) => t.key === tierKey)!;

  const [ccy, setCcy] = useState<CurrencyCode>("USD");
  const [rail, setRail] = useState<RailState>({ kind: "idle" });
  const [busy, setBusy] = useState(false);
  const [txRef, setTxRef] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setCcy(detectCurrencyFromBrowser());
  }, []);

  const plan = user ? effectivePlan(user) : "FREE";

  const startOrder = async () => {
    setBusy(true);
    setRail({ kind: "idle" });
    try {
      const res = await fetch("/api/billing/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: tierKey, currency: ccy }),
      });
      const j = await res.json();
      if (!res.ok) {
        setRail({ kind: "error", message: j?.message ?? "Could not start the order. Please retry." });
        return;
      }
      if (j.state === "hosted") {
        setRail({ kind: "hosted", url: j.url });
        window.location.href = j.url;
      } else if (j.state === "crypto") {
        setRail({ kind: "crypto", orderId: j.orderId, address: j.address, network: j.network, asset: j.asset, amountUsd: j.amountUsd });
      } else {
        setRail({ kind: "unavailable", orderId: j.orderId });
      }
    } catch {
      setRail({ kind: "error", message: "Network error. Please retry." });
    } finally {
      setBusy(false);
    }
  };

  const submitRef = async () => {
    if (rail.kind !== "crypto") return;
    setBusy(true);
    try {
      const res = await fetch("/api/billing/order", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: rail.orderId, reference: txRef.trim() }),
      });
      const j = await res.json();
      if (!res.ok) {
        setRail({ kind: "error", message: j?.message ?? "Could not submit that reference." });
        return;
      }
      setRail({ kind: "submitted" });
    } catch {
      setRail({ kind: "error", message: "Network error. Please retry." });
    } finally {
      setBusy(false);
    }
  };

  const copyAddress = async () => {
    if (rail.kind !== "crypto") return;
    try {
      await navigator.clipboard.writeText(rail.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* clipboard unavailable — user can select manually */ }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <p className="qe-eyebrow">Checkout</p>
      <h1 className="qe-display mt-2 text-3xl font-bold tracking-tight">
        Subscribe to {tier.name}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">{tier.tagline}. Cancel anytime. Prices are shown before you pay and never change mid-checkout.</p>

      {/* plan summary */}
      <div className={`qe-card mt-6 p-5 ${tier.popular ? "qe-border-gradient" : ""}`}>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="qe-display text-lg font-bold">{tier.name}</h2>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{tier.tagline}</span>
        </div>
        <div className="mt-3 flex items-end justify-between gap-3">
          <p className="qe-display text-3xl font-bold">
            {tierPrice(tier, ccy)}
            <span className="text-sm font-medium text-muted-foreground">/month</span>
          </p>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Currency
            <select
              value={ccy}
              onChange={(e) => setCcy(e.target.value as CurrencyCode)}
              className="rounded-lg border border-hairline bg-panel-2 px-2.5 py-1.5 text-xs font-semibold text-foreground outline-none focus:border-brand/50"
            >
              {(Object.keys(CURRENCY_SYMBOL) as CurrencyCode[]).map((code) => (
                <option key={code} value={code}>{code}</option>
              ))}
            </select>
          </label>
        </div>
        <ul className="qe-check-list mt-4 space-y-2 text-xs leading-relaxed text-foreground/85">
          {tier.features.map((f) => (
            <li key={f}>
              <CheckCircle2 className="h-3.5 w-3.5 text-brand-hi" />
              {f}
            </li>
          ))}
        </ul>
      </div>

      {/* flow */}
      {isPending ? (
        <div className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Checking your session
        </div>
      ) : !user ? (
        <div className="qe-card mt-6 p-5">
          <p className="text-sm font-semibold">Sign in to continue</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Your plan is attached to your account, so checkout needs you signed in first. Creating one takes about 20 seconds.
          </p>
          <button onClick={() => router.push("/?terminal=1")} className="qe-btn qe-btn-primary mt-4 w-full px-4 py-3 text-sm">
            <LogIn className="h-4 w-4" />
            Sign in or create an account
            <ArrowRight className="h-4 w-4" />
          </button>
          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
            After signing in you land on the plan picker; choose {tier.name} there and this checkout continues.
          </p>
        </div>
      ) : hasPaidAccess(user) ? (
        <div className="qe-card mt-6 border border-pos/40 p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-pos">
            <CheckCircle2 className="h-4 w-4" /> You already have an active plan ({plan})
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Your terminal is fully unlocked. To switch plans, open the account menu inside the app.
          </p>
          <button onClick={() => router.push("/?terminal=1")} className="qe-btn qe-btn-ghost mt-4 w-full px-4 py-3 text-sm">
            Open the terminal <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="qe-card mt-6 p-5">
          <button onClick={startOrder} disabled={busy} className="qe-btn qe-btn-primary w-full px-4 py-3.5 text-sm disabled:opacity-60">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            Continue to payment
            <ArrowRight className="h-4 w-4" />
          </button>
          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
            You are signed in as {user.email}. The order is created on the server with the exact price above before any payment step appears.
          </p>
        </div>
      )}

      {/* rail states */}
      {rail.kind === "crypto" && (
        <div className="qe-card mt-4 border border-brand/30 p-5">
          <div className="flex items-center gap-2 text-sm font-bold">
            <Wallet className="h-4 w-4 text-brand-hi" /> Pay {rail.amountUsd} {rail.asset} ({rail.network})
          </div>
          <ol className="mt-3 space-y-2 text-xs leading-relaxed text-muted-foreground">
            <li>1. Send exactly {rail.amountUsd} {rail.asset} on the {rail.network} network to the address below.</li>
            <li>2. Copy your transaction id (hash) from your wallet or exchange.</li>
            <li>3. Paste it here. The owner verifies the payment and your plan unlocks, usually within a few hours.</li>
          </ol>
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-hairline bg-panel-2 px-3 py-2.5">
            <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground">{rail.address}</code>
            <button onClick={copyAddress} className="qe-btn qe-btn-ghost shrink-0 px-2.5 py-1.5 text-[11px]" aria-label="Copy payment address">
              {copied ? <Check className="h-3.5 w-3.5 text-pos" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <label className="mt-4 block text-xs font-semibold">Transaction id</label>
          <input
            value={txRef}
            onChange={(e) => setTxRef(e.target.value)}
            placeholder="Paste the txid from your wallet"
            className="mt-1.5 w-full rounded-lg border border-hairline bg-panel-2 px-3 py-2.5 font-mono text-xs text-foreground outline-none focus:border-brand/50"
          />
          <button onClick={submitRef} disabled={busy || txRef.trim().length < 8} className="qe-btn qe-btn-primary mt-3 w-full px-4 py-3 text-sm disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Submit for verification
          </button>
        </div>
      )}

      {rail.kind === "submitted" && (
        <div className="qe-card mt-4 border border-pos/40 p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-pos">
            <CheckCircle2 className="h-4 w-4" /> Payment reference received
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Your order is queued for verification. Once the payment is confirmed, your {tier.name} plan unlocks automatically
            and you get an email at your account address. You can close this page.
          </p>
        </div>
      )}

      {rail.kind === "unavailable" && (
        <div className="qe-card mt-4 border border-warn/30 p-5">
          <p className="text-sm font-semibold text-warn">Online checkout is being connected</p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Your order is saved. Payment rails are being switched on right now; when they go live you get an email at
            your account address and this page completes the purchase end to end. You can also write to{" "}
            <a className="text-brand-hi hover:underline" href="mailto:deyongsltd@gmail.com">deyongsltd@gmail.com</a> and
            the team will arrange your subscription directly.
          </p>
        </div>
      )}

      {rail.kind === "error" && (
        <div className="qe-card mt-4 border border-neg/40 p-5 text-sm text-neg">{rail.message}</div>
      )}

      <div className="mt-6 flex items-center justify-between text-[11px] text-muted-foreground">
        <button onClick={() => router.push("/#pricing")} className="inline-flex items-center gap-1 transition-colors hover:text-foreground">
          <RefreshCw className="h-3 w-3" /> Compare plans
        </button>
        <span>Payments are never requested at signup, only here.</span>
      </div>
    </div>
  );
}
