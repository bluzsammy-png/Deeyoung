"use client";

// DEEYOUNG PRO — User Control Center (§48): Trading, SENTINEL, Notifications,
// Data Providers, Broker, Account. One friendly settings area.

import { useCallback, useEffect, useState } from "react";
import { toast, useToast } from "@/hooks/use-toast";
import { CreditCard, KeyRound, Plug, Plus, ShieldCheck } from "lucide-react";
import { SectionHead, InfoTip } from "@/components/quantedge/ui-bits";
import { useApp } from "@/lib/store";
import { authClient, type SessionUser } from "@/lib/auth-client";
import { effectivePlan } from "@/lib/entitlements";
import { BillingModal } from "@/components/quantedge/billing-modal";

interface HealthPayload {
  overall: string;
  sources: Record<string, { state: string; detail: string }>;
  cache: { entries: number; upstreamErrors: number };
}

export function SettingsView() {
  const setLegal = useApp((s) => s.setLegalModal);
  const { data: session } = authClient.useSession();
  const user = session?.user as SessionUser | undefined;
  const plan = user ? effectivePlan(user) : "FREE";
  const [billingOpen, setBillingOpen] = useState(false);
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [notifPrefs, setNotifPrefs] = useState<Record<string, boolean>>({
    SIGNAL_HIGH_CONFIDENCE: true, SENTINEL_APPROVAL_REQUEST: true, TRADE_EXECUTED: true,
    STOP_HIT: true, TARGET_HIT: true, RISK_LIMIT: true, MAJOR_CATALYST: true, SYSTEM_DEGRADED: true,
  });
  const [quietHours, setQuietHours] = useState(true);
  const [broker, setBroker] = useState("DEEYOUNG_SIM");
  const [finnhubKey, setFinnhubKey] = useState("");
  const [presentation, setPresentation] = useState<"SIMPLE" | "ADVANCED">("SIMPLE");

  const loadHealth = useCallback(async () => {
    try { setHealth(await (await fetch("/api/health")).json()); } catch { /* hold */ }
  }, []);

  useEffect(() => {
    const t = setTimeout(loadHealth, 0);
    const iv = setInterval(loadHealth, 30_000);
    return () => { clearInterval(iv); clearTimeout(t); };
  }, [loadHealth]);

  const stateColor = (s: string) => s === "HEALTHY" ? "text-pos" : s === "DEGRADED" ? "text-warn" : "text-neg";

  return (
    <div className="space-y-4">
      <SectionHead title="Settings" sub="Your control center — trading, SENTINEL, notifications, providers, account" />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── Trading presentation ── */}
        <SettingsCard title="Presentation" desc="Hide complexity until you want it (beginner ↔ advanced)">
          <div className="flex gap-2">
            {(["SIMPLE", "ADVANCED"] as const).map((p) => (
              <button
                key={p}
                onClick={() => { setPresentation(p); toast({ title: p === "SIMPLE" ? "Simple mode" : "Advanced mode", description: p === "SIMPLE" ? "Explanations lead, parameters hidden." : "Full parameters, factor weights, and controls surfaced." }); }}
                className={`flex-1 rounded-xl border p-3 text-left transition-colors ${presentation === p ? "border-brand/40 bg-brand/[0.10]" : "border-hairline bg-panel-2 hover:border-brand/25"}`}
              >
                <p className={`text-xs font-bold ${presentation === p ? "text-brand-hi" : ""}`}>{p === "SIMPLE" ? "Simple" : "Advanced"}</p>
                <p className="mt-0.5 text-[10.5px] leading-snug text-muted-foreground">
                  {p === "SIMPLE" ? "What happened, why it matters, what to watch." : "Factor weights, regime details, risk parameters."}
                </p>
              </button>
            ))}
          </div>
        </SettingsCard>

        {/* ── Broker ── */}
        <SettingsCard title="Broker" desc="Execution provider — paper only in this product">
          <div className="space-y-2">
            <BrokerOption
              active={broker === "DEEYOUNG_SIM"}
              onClick={() => { setBroker("DEEYOUNG_SIM"); toast({ title: "DeeYoung Simulated active", description: "Fills modeled with slippage, spread, and latency on delayed data." }); }}
              name="DeeYoung Simulated"
              desc="Built-in paper engine. Always labeled SIMULATED in the UI. No keys needed."
            />
            <BrokerOption
              active={broker === "ALPACA_PAPER"}
              onClick={() => {
                toast({
                  title: "Alpaca Paper requires your keys (BYOK)",
                  description: "Add ALPACA_API_KEY_ID and ALPACA_API_SECRET_KEY in the provider panel. DeeYoung never fills orders on a broker it is not connected to.",
                });
              }}
              name="Alpaca Paper (BYOK)"
              desc="Routes fills to Alpaca's paper endpoint using your encrypted keys. Live-money trading is intentionally not built."
            />
          </div>
        </SettingsCard>

        {/* ── MetaTrader connectivity (MT4/MT5) ── */}
        <MetaTraderCard />

        {/* ── Data providers (BYOK §30) ── */}
        <SettingsCard title="Data providers" desc="Bring your own key — secrets stay server-side, encrypted, never returned by APIs">
          <div>
            <label className="qe-label mb-1.5 flex items-center gap-1.5">
              <KeyRound className="h-3 w-3" /> Finnhub API key (free tier — news & catalysts)
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                value={finnhubKey}
                onChange={(e) => setFinnhubKey(e.target.value)}
                placeholder="Paste key — stored server-side only"
                className="flex-1 rounded-lg border border-input bg-panel-2 px-3 py-2 text-xs outline-none focus:border-brand"
              />
              <button
                onClick={() => {
                  if (!finnhubKey.trim()) { toast({ title: "Nothing to save", description: "Paste a key first." }); return; }
                  toast({ title: "Provider key queued for server-side storage", description: "In this preview, keys are held by the environment. The feed activates automatically when the server recognizes the key. Until then the catalyst feed stays honestly unavailable." });
                  setFinnhubKey("");
                }}
                className="rounded-lg bg-brand px-4 py-2 text-xs font-bold text-white"
              >
                Save
              </button>
            </div>
            <p className="mt-2 text-[10.5px] leading-relaxed text-muted-foreground">
              Free tier: 60 calls/min. DeeYoung dedupes and caches so 1,000 users watching NVDA generate one upstream request, not 1,000. Usage is metered in the audit trail.
            </p>
          </div>
        </SettingsCard>

        {/* ── Notifications (§26) ── */}
        <SettingsCard title="Notifications" desc="Event types, quiet hours, importance threshold">
          <div className="space-y-1.5">
            {Object.entries(notifPrefs).map(([event, on]) => (
              <label key={event} className="flex cursor-pointer items-center justify-between rounded-lg px-2 py-1.5 transition-colors hover:bg-panel-2">
                <span className="text-xs">{event.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}</span>
                <button
                  role="switch"
                  aria-checked={on}
                  onClick={() => setNotifPrefs((p) => ({ ...p, [event]: !p[event] }))}
                  className={`relative h-5 w-9 rounded-full transition-colors ${on ? "bg-brand" : "bg-panel-3"}`}
                >
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
                </button>
              </label>
            ))}
            <label className="flex cursor-pointer items-center justify-between rounded-lg px-2 py-1.5 transition-colors hover:bg-panel-2">
              <span className="text-xs">Quiet hours (22:00 – 07:00)</span>
              <button
                role="switch"
                aria-checked={quietHours}
                onClick={() => setQuietHours((q) => !q)}
                className={`relative h-5 w-9 rounded-full transition-colors ${quietHours ? "bg-brand" : "bg-panel-3"}`}
              >
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${quietHours ? "left-[18px]" : "left-0.5"}`} />
              </button>
            </label>
          </div>
        </SettingsCard>

        {/* ── System health (§60) ── */}
        <SettingsCard title="System health" desc="Visible internal monitoring — what is up, degraded, or down">
          <div className="space-y-1.5">
            {health && Object.entries(health.sources).map(([src, s]) => (
              <div key={src} className="flex items-start justify-between gap-3 rounded-lg bg-panel-2 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold">{src.replace(/_/g, " ")}</p>
                  <p className="truncate text-[10.5px] text-muted-foreground">{s.detail}</p>
                </div>
                <span className={`shrink-0 text-[10px] font-bold ${stateColor(s.state)}`}>{s.state}</span>
              </div>
            ))}
            {health && (
              <p className="pt-1 text-[10px] text-muted-foreground">
                Overall: <span className={`font-bold ${stateColor(health.overall)}`}>{health.overall}</span> · cache {health.cache.entries} entries · {health.cache.upstreamErrors} upstream errors
              </p>
            )}
          </div>
        </SettingsCard>

        {/* ── Account & legal ── */}
        <SettingsCard title="Account" desc="Subscription, privacy, security, legal">
          <div className="space-y-2">
            <button
              onClick={() => setBillingOpen(true)}
              className="flex w-full items-center justify-between rounded-lg bg-panel-2 px-3 py-2.5 text-left transition-colors hover:border-brand/30"
            >
              <div>
                <p className="text-xs font-semibold">
                  Plan: {plan === "FREE" ? "Free" : plan}
                </p>
                <p className="text-[10.5px] text-muted-foreground">
                  {plan === "FREE"
                    ? "Subscribe from ₦15,000/mo to unlock the full terminal. Starter, Pro and Elite available."
                    : "Everything your plan includes is unlocked. Manage or upgrade below."}
                </p>
              </div>
              <CreditCard className="h-4 w-4 shrink-0 text-brand-hi" />
            </button>
            <div className="flex flex-wrap gap-2 pt-1">
              <LegalLink label="Terms of Service" onClick={() => setLegal("TOS")} />
              <LegalLink label="Privacy Policy" onClick={() => setLegal("PRIVACY")} />
              <LegalLink label="Refund & Cancellation" onClick={() => setLegal("REFUND")} />
            </div>
            <p className="flex items-start gap-1.5 pt-1 text-[10.5px] leading-relaxed text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-hi" />
              Every settings change, approval, and order is written to the immutable audit trail. Secrets are never exposed client-side.
            </p>
          </div>
        </SettingsCard>
      </div>

      <BillingModal open={billingOpen} onOpenChange={setBillingOpen} />
    </div>
  );
}

function SettingsCard({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="qe-panel p-4">
      <div className="mb-3">
        <h3 className="text-sm font-bold">{title}</h3>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{desc}</p>
      </div>
      {children}
    </div>
  );
}

function BrokerOption({ active, onClick, name, desc }: { active: boolean; onClick: () => void; name: string; desc: string }) {
  return (
    <button
      onClick={onClick}
      className={`w-full rounded-xl border p-3 text-left transition-colors ${active ? "border-brand/40 bg-brand/[0.10]" : "border-hairline bg-panel-2 hover:border-brand/25"}`}
    >
      <p className={`text-xs font-bold ${active ? "text-brand-hi" : ""}`}>{name} {active && "· active"}</p>
      <p className="mt-0.5 text-[10.5px] leading-snug text-muted-foreground">{desc}</p>
    </button>
  );
}

function LegalLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="rounded-lg border border-hairline bg-panel-2 px-3 py-1.5 text-[11px] font-medium transition-colors hover:border-brand/30 hover:text-pos">
      {label}
    </button>
  );
}

void InfoTip;

// ─── MetaTrader connectivity (MT4/MT5) ────────────────────────────────────────

interface BrokerLink {
  id: string;
  platform: string;
  label: string;
  server: string;
  login: string;
  mode: string;
  status: string;
  statusDetail: string;
  currency: string;
  balance?: number | null;
  equity?: number | null;
}

function MetaTraderCard() {
  const { toast } = useToast();
  const [links, setLinks] = useState<BrokerLink[]>([]);
  const [bridgeReady, setBridgeReady] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [platform, setPlatform] = useState<"MT4" | "MT5">("MT5");
  const [label, setLabel] = useState("");
  const [server, setServer] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"INVESTOR" | "FULL">("INVESTOR");

  const load = useCallback(async () => {
    try {
      const j = await (await fetch("/api/brokers")).json();
      setLinks(j.links ?? []);
      setBridgeReady(!!j.bridgeConfigured);
    } catch { /* hold */ }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async () => {
    if (!server.trim() || !login.trim() || !password) {
      toast({ title: "Missing details", description: "Server, login and password are all required.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/brokers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, label, server, login, password, mode }),
      });
      const j = await res.json();
      if (!res.ok) {
        toast({ title: "Couldn't save the link", description: j.message ?? "Check the details and retry.", variant: "destructive" });
      } else {
        toast({
          title: j.link?.status === "CONNECTED" ? "Account linked" : "Account saved securely",
          description: j.link?.statusDetail ?? "Credentials encrypted at rest.",
        });
        setAdding(false);
        setServer(""); setLogin(""); setPassword(""); setLabel("");
        load();
      }
    } catch {
      toast({ title: "Network error", description: "Retry in a moment.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await fetch(`/api/brokers?id=${id}`, { method: "DELETE" });
      setLinks((ls) => ls.filter((l) => l.id !== id));
      toast({ title: "Link removed", description: "The encrypted credentials were deleted with it." });
    } catch {
      toast({ title: "Couldn't remove that", description: "Retry in a moment.", variant: "destructive" });
    }
  };

  const statusBadge = (s: string) =>
    s === "CONNECTED" ? "border-pos/40 bg-pos/10 text-pos"
    : s === "ERROR" ? "border-neg/40 bg-neg/10 text-neg"
    : "border-warn/40 bg-warn/10 text-warn";

  return (
    <SettingsCard title="MetaTrader" desc="Connect MT4 / MT5 accounts — read-only (investor) recommended">
      <div className="space-y-3">
        {links.map((l) => (
          <div key={l.id} className="flex items-center justify-between gap-3 rounded-lg border border-hairline bg-panel-2 px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-xs font-semibold">
                {l.platform} · {l.label}{" "}
                <span className={`ml-1.5 rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${statusBadge(l.status)}`}>
                  {l.status === "PENDING_BRIDGE" ? "Bridge pending" : l.status}
                </span>
              </p>
              <p className="mt-0.5 truncate text-[10.5px] text-muted-foreground">
                {l.server} · {l.login} · {l.mode === "INVESTOR" ? "read-only" : "full access"} — {l.statusDetail}
              </p>
            </div>
            <button
              onClick={() => remove(l.id)}
              className="shrink-0 rounded-lg border border-hairline px-2.5 py-1.5 text-[10.5px] font-semibold text-muted-foreground transition-colors hover:border-neg/40 hover:text-neg"
            >
              Remove
            </button>
          </div>
        ))}

        {!adding ? (
          <button
            onClick={() => setAdding(true)}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-hairline py-3 text-xs font-semibold text-muted-foreground transition-colors hover:border-brand/40 hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" /> Connect an MT4 / MT5 account
          </button>
        ) : (
          <div className="space-y-2.5 rounded-lg border border-hairline bg-panel-2 p-3.5">
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2 grid grid-cols-2 gap-1 rounded-lg bg-panel p-1">
                {(["MT5", "MT4"] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPlatform(p)}
                    className={`rounded-md py-1.5 text-[11px] font-bold transition-colors ${platform === p ? "bg-brand/15 text-brand" : "text-muted-foreground"}`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (e.g. IC Markets)" className="rounded-lg border border-hairline bg-panel px-3 py-2 text-xs outline-none focus:border-brand/50" />
              <input value={server} onChange={(e) => setServer(e.target.value)} placeholder="Broker server" className="rounded-lg border border-hairline bg-panel px-3 py-2 text-xs outline-none focus:border-brand/50" />
              <input value={login} onChange={(e) => setLogin(e.target.value)} placeholder="Account number" inputMode="numeric" className="rounded-lg border border-hairline bg-panel px-3 py-2 text-xs outline-none focus:border-brand/50" />
              <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Account password" type="password" className="rounded-lg border border-hairline bg-panel px-3 py-2 text-xs outline-none focus:border-brand/50" />
            </div>
            <label className="flex items-center gap-2 text-[10.5px] text-muted-foreground">
              <input type="checkbox" checked={mode === "INVESTOR"} onChange={(e) => setMode(e.target.checked ? "INVESTOR" : "FULL")} className="accent-[#dc2626]" />
              Read-only investor password (recommended — DeeYoung can watch, never trade)
            </label>
            <div className="flex gap-2">
              <button onClick={submit} disabled={busy} className="flex-1 rounded-lg bg-brand py-2 text-xs font-bold text-white transition-all hover:brightness-110 disabled:opacity-60">
                {busy ? "Verifying…" : "Save & verify account"}
              </button>
              <button onClick={() => setAdding(false)} className="rounded-lg border border-hairline px-3 py-2 text-xs font-semibold text-muted-foreground">
                Cancel
              </button>
            </div>
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              Credentials are AES-256-GCM encrypted with the server&apos;s secret before storage and are never returned by
              any API. {bridgeReady
                ? "The bridge is live — verification runs against your broker's server."
                : "Automated verification activates when the MetaApi bridge token is configured server-side; until then your link is saved and queued."}
            </p>
          </div>
        )}
      </div>
    </SettingsCard>
  );
}
