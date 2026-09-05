"use client";

// DEEYOUNG PRO — admin Billing tab: subscription order verification desk.
// Lists every BillingOrder; approve marks PAID and upgrades the buyer's plan,
// cancel rejects it, reopen returns a decided order to PENDING. Every action
// is audited server-side with the admin's id.

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, RefreshCw, Undo2, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Order {
  id: string;
  tier: string;
  currency: string;
  amount: number;
  status: string;
  provider: string;
  reference: string | null;
  createdAt: string;
  paidAt: string | null;
  user: { email: string; name: string | null; plan: string };
}

const STATUS_STYLES: Record<string, string> = {
  PENDING: "border-amber-500/40 text-amber-300",
  SUBMITTED: "border-sky-500/40 text-sky-300",
  PAID: "border-emerald-500/40 text-emerald-300",
  CANCELLED: "border-zinc-600 text-zinc-400",
};

export function BillingTab() {
  const { toast } = useToast();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/billing", { cache: "no-store" });
      if (r.status === 403) { setFailed(true); return; }
      const j = await r.json();
      setOrders(j.orders ?? []);
      setFailed(false);
    } catch { setFailed(true); }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (orderId: string, action: "approve" | "cancel" | "reopen") => {
    setBusy(orderId + action);
    try {
      const r = await fetch("/api/admin/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, action }),
      });
      const j = await r.json();
      if (!r.ok) {
        toast({ title: "Action failed", description: j?.error ?? "Try again.", variant: "destructive" });
        return;
      }
      if (action === "approve") toast({ title: "Order approved", description: `Plan upgraded to ${j.plan}.` });
      await load();
    } finally {
      setBusy(null);
    }
  };

  if (failed) return <p className="text-xs text-red-400">Could not load billing orders (403). Re-sign in and retry.</p>;
  if (!orders) return <p className="text-xs text-zinc-500">Loading orders…</p>;
  if (orders.length === 0) {
    return <p className="text-xs text-zinc-500">No subscription orders yet. Orders appear here the moment a buyer starts checkout.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-zinc-200">Subscription orders ({orders.length})</h2>
        <button onClick={load} className="flex items-center gap-1.5 rounded-lg border border-zinc-700 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-300 hover:bg-zinc-900">
          <RefreshCw className="h-3 w-3" /> Reload
        </button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full text-left text-xs">
          <thead className="bg-zinc-900/80 text-[10px] uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="px-3 py-2">Buyer</th>
              <th className="px-3 py-2">Plan</th>
              <th className="px-3 py-2">Amount</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Reference</th>
              <th className="px-3 py-2">Created</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/70">
            {orders.map((o) => (
              <tr key={o.id} className="align-middle">
                <td className="px-3 py-2">
                  <p className="font-semibold text-zinc-200">{o.user.name ?? o.user.email}</p>
                  <p className="text-[10.5px] text-zinc-500">{o.user.email} · plan: {o.user.plan}</p>
                </td>
                <td className="px-3 py-2 font-mono text-zinc-300">{o.tier}</td>
                <td className="px-3 py-2 font-mono text-zinc-300">{o.currency} {o.amount.toLocaleString("en-US")}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-lg border px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLES[o.status] ?? "border-zinc-600 text-zinc-400"}`}>{o.status}</span>
                </td>
                <td className="max-w-[180px] truncate px-3 py-2 font-mono text-[10.5px] text-zinc-400" title={o.reference ?? ""}>{o.reference ?? "…"}</td>
                <td className="px-3 py-2 text-zinc-500">{new Date(o.createdAt).toISOString().slice(0, 16).replace("T", " ")}</td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1.5">
                    {o.status !== "PAID" && (
                      <button onClick={() => act(o.id, "approve")} disabled={busy !== null}
                        className="flex items-center gap-1 rounded-lg border border-emerald-500/40 px-2 py-1 text-[10px] font-bold text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50">
                        {busy === o.id + "approve" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Approve
                      </button>
                    )}
                    {o.status !== "CANCELLED" && o.status !== "PAID" && (
                      <button onClick={() => act(o.id, "cancel")} disabled={busy !== null}
                        className="flex items-center gap-1 rounded-lg border border-red-500/40 px-2 py-1 text-[10px] font-bold text-red-300 hover:bg-red-500/10 disabled:opacity-50">
                        <X className="h-3 w-3" /> Cancel
                      </button>
                    )}
                    {(o.status === "PAID" || o.status === "CANCELLED") && (
                      <button onClick={() => act(o.id, "reopen")} disabled={busy !== null}
                        className="flex items-center gap-1 rounded-lg border border-zinc-600 px-2 py-1 text-[10px] font-bold text-zinc-300 hover:bg-zinc-900 disabled:opacity-50">
                        <Undo2 className="h-3 w-3" /> Reopen
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] leading-relaxed text-zinc-500">
        Approving marks the order PAID and upgrades the buyer&apos;s plan immediately. Only approve after the payment is
        actually confirmed on-chain or by the provider. Every action is audit-logged.
      </p>
    </div>
  );
}
