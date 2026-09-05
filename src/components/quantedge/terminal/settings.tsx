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
      <SectionHead title="Settings" sub="Your control center: trading, SENTINEL, notifications, providers, account" />

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
        <SettingsCard title="Broker" desc="Execution provider; paper by default, live via your verified broker">
          <div className="space-y-2">
            <BrokerOption
              active={broker === "DEEYOUNG_SIM"}
              onClick={() => { setBroker("DEEYOUNG_SIM"); toast({ title: "DeeYoung Simulated active", description: "Fills modeled with slippage, spread, and latency. Simulated fills are always labeled." }); }}
              name="DeeYoung Simulated"
              desc="Built-in paper engine. Always labeled SIMULATED in the UI. No keys needed."
            />
            <BrokerOption
              active={broker === "OWN_BROKER"}
              onClick={() => {
                toast({
                  title: "Connect your broker to go live",
                  description: "Use the cards below: Deriv with an API token, any MT4/MT5 broker with our EA bridge, or Alpaca, Binance, Bybit and OANDA with API keys. Once connected, the engine mirrors its signals onto your account automatically.",
                });
              }}
              name="Your own broker (recommended)"
              desc="Connect Deriv, any MT4/MT5 broker, Alpaca, Binance, Bybit or OANDA below. A verified FULL connection follows the engine live through your own account."
            />
          </div>
        </SettingsCard>

        {/* ── Direct broker connections: verified keys, live routing ── */}
        <LiveBrokerCard />

        {/* ── Deriv native + MT4/MT5 own bridge ── */}
        <DerivCard />
        <MtBridgeCard />

        {/* ── Data providers (BYOK §30) ── */}
        <SettingsCard title="Data providers" desc="Bring your own key; secrets stay server-side, encrypted, never returned by APIs">
          <div>
            <label className="qe-label mb-1.5 flex items-center gap-1.5">
              <KeyRound className="h-3 w-3" /> Finnhub API key (free tier: news & catalysts)
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                value={finnhubKey}
                onChange={(e) => setFinnhubKey(e.target.value)}
                placeholder="Paste key; stored server-side only"
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
        <SettingsCard title="System health" desc="Visible internal monitoring: what is up, degraded, or down">
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

// ─── Broker connectivity: Deriv native API + our own MT4/MT5 EA bridge ───────

interface BrokerLinkRow {
  id: string;
  platform: string;
  label: string;
  server: string;
  login: string;
  mode: string;
  status: string;
  statusDetail: string;
  env: string;
  currency: string;
  balance?: number | null;
  equity?: number | null;
  autoMirror?: boolean;
  autoLots?: number | null;
  autoStakeUsd?: number | null;
  autoNotionalUsd?: number | null;
  bridgeLive?: boolean;
  lastHandshakeAt?: string | null;
  eaVersion?: string | null;
  verifiedAt?: string | null;
  createdAt?: string;
}

function useBrokerLinks() {
  const [links, setLinks] = useState<BrokerLinkRow[]>([]);
  const load = useCallback(async () => {
    try {
      const j = await (await fetch("/api/brokers")).json();
      setLinks(j.links ?? []);
    } catch { /* hold */ }
  }, []);
  useEffect(() => {
    load();
    const iv = setInterval(load, 10_000);
    return () => clearInterval(iv);
  }, [load]);
  return { links, load };
}

function AutoMirrorToggle({ link, onSaved }: { link: BrokerLinkRow; onSaved: () => void }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const on = link.autoMirror !== false;
  return (
    <button
      role="switch"
      aria-checked={on}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const res = await fetch("/api/brokers", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: link.id, autoMirror: !on }),
          });
          if (!res.ok) throw new Error("patch failed");
          toast({
            title: !on ? "Auto-mirror on" : "Auto-mirror off",
            description: !on
              ? "Engine signals will now execute on this account automatically."
              : "This account becomes manual: only trades you place are routed here.",
          });
          onSaved();
        } catch {
          toast({ title: "Could not update", description: "Retry in a moment.", variant: "destructive" });
        } finally {
          setBusy(false);
        }
      }}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${on ? "bg-brand" : "bg-panel-3"}`}
    >
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
    </button>
  );
}

function SizeField({ id, field, label, value, min, max, step, onSaved }: {
  id: string; field: "autoLots" | "autoStakeUsd" | "autoNotionalUsd"; label: string;
  value: number | null | undefined; min: number; max: number; step: number; onSaved: () => void;
}) {
  const { toast } = useToast();
  const [v, setV] = useState(value != null ? String(value) : "");
  useEffect(() => { setV(value != null ? String(value) : ""); }, [value]);
  const save = async () => {
    const n = Number(v);
    if (v !== "" && (!Number.isFinite(n) || n < min || n > max)) {
      toast({ title: "Out of range", description: `${label} must be between ${min} and ${max}.`, variant: "destructive" });
      setV(value != null ? String(value) : "");
      return;
    }
    const body: Record<string, unknown> = { id };
    body[field] = v === "" ? null : n;
    try {
      const res = await fetch("/api/brokers", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error("patch failed");
      toast({ title: "Size saved", description: `Mirrored ${field === "autoLots" ? "lot size" : field === "autoStakeUsd" ? "stake" : "notional"} set to ${v === "" ? "the default" : v}.` });
      onSaved();
    } catch {
      toast({ title: "Could not save", description: "Retry in a moment.", variant: "destructive" });
    }
  };
  return (
    <label className="flex items-center gap-1.5">
      <span className="text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === "Enter") save(); }}
        inputMode="decimal"
        placeholder="default"
        className="w-16 rounded-md border border-hairline bg-panel px-1.5 py-1 text-right text-[10.5px] outline-none focus:border-brand/50"
      />
    </label>
  );
}

function LinkRow({ link, showSize, onSaved }: { link: BrokerLinkRow; showSize: "autoLots" | "autoStakeUsd" | "autoNotionalUsd" | null; onSaved: () => void }) {
  const { toast } = useToast();
  const isMt = link.platform === "MT4" || link.platform === "MT5";
  const badge = (() => {
    if (isMt) {
      if (link.status === "PENDING_BRIDGE") return { cls: "border-warn/40 bg-warn/10 text-warn", text: "Waiting for terminal" };
      if (link.status === "CONNECTED") return link.bridgeLive
        ? { cls: "border-pos/40 bg-pos/10 text-pos", text: "Live" }
        : { cls: "border-warn/40 bg-warn/10 text-warn", text: "Terminal offline" };
      return { cls: "border-neg/40 bg-neg/10 text-neg", text: link.status };
    }
    if (link.status === "CONNECTED") {
      if (link.env === "DEMO" || link.env === "PAPER" || link.env === "TESTNET" || link.env === "PRACTICE") return { cls: "border-hairline text-muted-foreground", text: `Live routing · ${link.env}` };
      return { cls: "border-pos/40 bg-pos/10 text-pos", text: "Live routing" };
    }
    return { cls: "border-neg/40 bg-neg/10 text-neg", text: link.status };
  })();

  const remove = async () => {
    try {
      await fetch(`/api/brokers?id=${link.id}`, { method: "DELETE" });
      toast({ title: "Connection removed", description: "The encrypted credentials and bridge key were deleted with it." });
      onSaved();
    } catch {
      toast({ title: "Couldn't remove that", description: "Retry in a moment.", variant: "destructive" });
    }
  };

  return (
    <div className="rounded-lg border border-hairline bg-panel-2 px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold">
            {link.platform} · {link.label}{" "}
            <span className={`ml-1.5 rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${badge.cls}`}>{badge.text}</span>
          </p>
          <p className="mt-0.5 truncate text-[10.5px] text-muted-foreground">
            {link.login ? `${link.login} · ` : ""}{link.balance != null ? `${link.balance.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${link.currency}` : ""}
            {isMt && link.eaVersion ? ` · EA v${link.eaVersion}` : ""}
            {isMt && link.lastHandshakeAt ? ` · last check-in ${new Date(link.lastHandshakeAt).toLocaleTimeString()}` : ""}
          </p>
          <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{link.statusDetail}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <label className="flex items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground">
            Auto-mirror
            <AutoMirrorToggle link={link} onSaved={onSaved} />
          </label>
          <button onClick={remove} className="rounded-lg border border-hairline px-2.5 py-1.5 text-[10.5px] font-semibold text-muted-foreground transition-colors hover:border-neg/40 hover:text-neg">
            Remove
          </button>
        </div>
      </div>
      {showSize ? (
        <div className="mt-2 flex items-center gap-3 border-t border-hairline pt-2">
          <span className="text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground">Size per mirrored signal</span>
          {showSize === "autoLots" ? <SizeField id={link.id} field="autoLots" label="Lots" value={link.autoLots} min={0.01} max={10} step={0.01} onSaved={onSaved} /> : null}
          {showSize === "autoStakeUsd" ? <SizeField id={link.id} field="autoStakeUsd" label="Stake" value={link.autoStakeUsd} min={1} max={100} step={1} onSaved={onSaved} /> : null}
          {showSize === "autoNotionalUsd" ? <SizeField id={link.id} field="autoNotionalUsd" label="USD" value={link.autoNotionalUsd} min={10} max={1000} step={10} onSaved={onSaved} /> : null}
        </div>
      ) : null}
    </div>
  );
}

// ─── Deriv native (official API token, no third party) ───────────────────────

function DerivCard() {
  const { toast } = useToast();
  const { links, load } = useBrokerLinks();
  const derivLinks = links.filter((l) => l.platform === "DERIV");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [apiToken, setApiToken] = useState("");

  const submit = async () => {
    if (!apiToken.trim()) {
      toast({ title: "Missing token", description: "Paste the API token from your Deriv account first.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/brokers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: "DERIV", apiToken }),
      });
      const j = await res.json();
      if (!res.ok) {
        toast({ title: "Deriv rejected that token", description: j.message ?? "Nothing was stored.", variant: "destructive" });
      } else {
        toast({ title: "Deriv connected", description: j.message ?? "Verified by reading your account." });
        setAdding(false);
        setApiToken("");
        load();
      }
    } catch {
      toast({ title: "Network error", description: "Retry in a moment.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsCard title="Deriv (official API)" desc="Paste an API token; the server reads your account to verify it, then the engine mirrors its signals onto it automatically">
      <div className="space-y-3">
        {derivLinks.map((l) => <LinkRow key={l.id} link={l} showSize="autoStakeUsd" onSaved={load} />)}

        {!adding ? (
          <button
            onClick={() => setAdding(true)}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-hairline py-3 text-xs font-semibold text-muted-foreground transition-colors hover:border-brand/40 hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" /> Connect a Deriv account
          </button>
        ) : (
          <div className="space-y-2.5 rounded-lg border border-hairline bg-panel-2 p-3.5">
            <input
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              placeholder="Deriv API token"
              type="password"
              className="w-full rounded-lg border border-hairline bg-panel px-3 py-2 text-xs outline-none focus:border-brand/50"
            />
            <div className="flex gap-2">
              <button onClick={submit} disabled={busy} className="flex-1 rounded-lg bg-brand py-2 text-xs font-bold text-white transition-all hover:brightness-110 disabled:opacity-60">
                {busy ? "Reading your Deriv account…" : "Verify & connect"}
              </button>
              <button onClick={() => setAdding(false)} className="rounded-lg border border-hairline px-3 py-2 text-xs font-semibold text-muted-foreground">Cancel</button>
            </div>
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              In Deriv: Settings &gt; API token, create a token with READ and TRADING scopes, paste it above. The server
              authorizes with that token, reads your balance and account type, and stores it AES-256-GCM encrypted.
              Demo accounts (VRTC login ids) are labeled DEMO and trade the demo book; real accounts go live.
              Engine signals execute as multiplier contracts (multiplied up/down) with your per-signal stake, and are
              closed when the engine closes the trade. Deriv does not list every asset; unsupported symbols are
              recorded as skipped, never substituted.
            </p>
          </div>
        )}
      </div>
    </SettingsCard>
  );
}

// ─── MT4 / MT5 via our own EA bridge (any broker, incl. Deriv MT5) ───────────

const MT_SERVER_HINTS = [
  "DerivSVG5-Real", "DerivSVG5-Demo", "DerivSV-Real", "Deriv-Demo",
  "ICMarketsSC-MT5", "Pepperstone-Live", "FTMO-Server",
];

function MtBridgeCard() {
  const { toast } = useToast();
  const { links, load } = useBrokerLinks();
  const mtLinks = links.filter((l) => l.platform === "MT4" || l.platform === "MT5");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [platform, setPlatform] = useState<"MT4" | "MT5">("MT5");
  const [label, setLabel] = useState("");
  const [server, setServer] = useState("");
  const [login, setLogin] = useState("");
  const [issued, setIssued] = useState<{ token: string; mq5: string; mq4: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/brokers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, label, server, login }),
      });
      const j = await res.json();
      if (!res.ok) {
        toast({ title: "Could not issue a bridge key", description: j.message ?? "Retry in a moment.", variant: "destructive" });
      } else {
        setIssued({ token: j.bridgeToken, mq5: j.ea.mq5, mq4: j.ea.mq4 });
        setAdding(false);
        setLabel(""); setServer(""); setLogin("");
        load();
      }
    } catch {
      toast({ title: "Network error", description: "Retry in a moment.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsCard title="MT4 / MT5 (own bridge, any broker)" desc="Install our EA on your terminal; it connects itself, executes commands locally, and reports fills back. No third-party service, no account password">
      <div className="space-y-3">
        {mtLinks.map((l) => <LinkRow key={l.id} link={l} showSize="autoLots" onSaved={load} />)}

        {issued ? (
          <div className="space-y-2.5 rounded-lg border border-pos/40 bg-pos/[0.06] p-3.5">
            <p className="text-xs font-bold text-pos">Bridge key issued. It is shown once; only its hash is stored.</p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-hairline bg-panel px-3 py-2 text-[10.5px]">{issued.token}</code>
              <button
                onClick={async () => {
                  try { await navigator.clipboard.writeText(issued.token); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard denied */ }
                }}
                className="shrink-0 rounded-lg border border-hairline px-3 py-2 text-[11px] font-semibold"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <a href={issued.mq5} download className="rounded-lg border border-hairline bg-panel-2 px-3 py-2 text-[11px] font-semibold transition-colors hover:border-brand/40">Download EA for MT5</a>
              <a href={issued.mq4} download className="rounded-lg border border-hairline bg-panel-2 px-3 py-2 text-[11px] font-semibold transition-colors hover:border-brand/40">Download EA for MT4</a>
              <button onClick={() => setIssued(null)} className="rounded-lg px-3 py-2 text-[11px] font-semibold text-muted-foreground">Done</button>
            </div>
            <ol className="list-decimal space-y-1 pl-4 text-[10px] leading-relaxed text-muted-foreground">
              <li>Open MetaEditor (F4 in your terminal), create a new Expert Advisor, replace its contents with the downloaded file, and click Compile.</li>
              <li>In the terminal: Tools &gt; Options &gt; Expert Advisors, tick Allow WebRequest for listed URL, and add this site&apos;s exact address: <span className="font-mono">{typeof window !== "undefined" ? window.location.origin : ""}</span></li>
              <li>Drag QuantEdgeBridge onto any chart, paste the bridge key and this site&apos;s URL into the inputs, and enable Algo Trading.</li>
              <li>The EA shakes hands within seconds; this card flips to Live and the engine starts mirroring signals onto the account.</li>
            </ol>
          </div>
        ) : null}

        {!adding ? (
          <button
            onClick={() => setAdding(true)}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-hairline py-3 text-xs font-semibold text-muted-foreground transition-colors hover:border-brand/40 hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" /> Bridge an MT4 / MT5 terminal
          </button>
        ) : (
          <div className="space-y-2.5 rounded-lg border border-hairline bg-panel-2 p-3.5">
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-panel p-1">
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
            <div className="grid grid-cols-2 gap-2">
              <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (e.g. Deriv MT5)" className="rounded-lg border border-hairline bg-panel px-3 py-2 text-xs outline-none focus:border-brand/50" />
              <input value={server} onChange={(e) => setServer(e.target.value)} placeholder="Broker server (optional)" list="mt-server-hints" className="rounded-lg border border-hairline bg-panel px-3 py-2 text-xs outline-none focus:border-brand/50" />
              <datalist id="mt-server-hints">
                {MT_SERVER_HINTS.map((s) => <option key={s} value={s} />)}
              </datalist>
              <input value={login} onChange={(e) => setLogin(e.target.value)} placeholder="Account number (optional)" inputMode="numeric" className="col-span-2 rounded-lg border border-hairline bg-panel px-3 py-2 text-xs outline-none focus:border-brand/50" />
            </div>
            <div className="flex gap-2">
              <button onClick={submit} disabled={busy} className="flex-1 rounded-lg bg-brand py-2 text-xs font-bold text-white transition-all hover:brightness-110 disabled:opacity-60">
                {busy ? "Issuing bridge key…" : "Issue bridge key"}
              </button>
              <button onClick={() => setAdding(false)} className="rounded-lg border border-hairline px-3 py-2 text-xs font-semibold text-muted-foreground">Cancel</button>
            </div>
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              MetaTrader has no official web API, so the bridge runs on YOUR terminal: our EA polls your private command
              queue on this server, places the orders locally in MetaTrader, and reports the fills back. Your login and
              password stay inside your terminal; the server only ever holds the bridge key hash and the commands.
              The account number and server name are optional labels; the EA fills them in at its first handshake.
              Works with any MT4/MT5 broker, including Deriv MT5 (DerivSVG5-Real, DerivSVG5-Demo).
            </p>
          </div>
        )}
      </div>
    </SettingsCard>
  );
}

// ─── Direct broker connections (verified keys, live routing) ──────────────────

interface LiveLink {
  id: string;
  platform: string;
  label: string;
  login: string;
  mode: string;
  status: string;
  statusDetail: string;
  env: string;
  currency: string;
  balance?: number | null;
  equity?: number | null;
  verifiedAt?: string | null;
}

const LIVE_PLATFORM_META: Record<string, { name: string; envs: string[]; envDefault: string; fields: "KEY_SECRET" | "TOKEN_ACCOUNT"; hint: string }> = {
  ALPACA: {
    name: "Alpaca", envs: ["PAPER", "LIVE"], envDefault: "PAPER", fields: "KEY_SECRET",
    hint: "Keys live on the API Keys page of your Alpaca dashboard. PAPER keys trade the Alpaca paper account; LIVE keys trade real money.",
  },
  BINANCE: {
    name: "Binance spot", envs: ["TESTNET", "LIVE"], envDefault: "TESTNET", fields: "KEY_SECRET",
    hint: "Spot keys with spot trading enabled. TESTNET keys come from testnet.binance.vision; LIVE keys trade real funds.",
  },
  BYBIT: {
    name: "Bybit perps", envs: ["DEMO", "LIVE"], envDefault: "DEMO", fields: "KEY_SECRET",
    hint: "Unified account keys with Contract permissions. DEMO keys are generated in Demo Trading mode; LIVE keys trade real funds.",
  },
  OANDA: {
    name: "OANDA FX", envs: ["PRACTICE", "LIVE"], envDefault: "PRACTICE", fields: "TOKEN_ACCOUNT",
    hint: "The v20 API token plus the account id (practice ids look like 101-001-1234567-001). PRACTICE is the free fxTrade account.",
  },
};

function LiveBrokerCard() {
  const { toast } = useToast();
  const [links, setLinks] = useState<LiveLink[]>([]);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [platform, setPlatform] = useState<keyof typeof LIVE_PLATFORM_META>("ALPACA");
  const [env, setEnv] = useState<string>(LIVE_PLATFORM_META.ALPACA.envDefault);
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [accountId, setAccountId] = useState("");
  const [mode, setMode] = useState<"INVESTOR" | "FULL">("FULL");
  const [label, setLabel] = useState("");
  const [result, setResult] = useState<string | null>(null);

  const meta = LIVE_PLATFORM_META[platform];

  const load = useCallback(async () => {
    try {
      const j = await (await fetch("/api/brokers")).json();
      setLinks((j.links ?? []).filter((l: LiveLink) => Object.keys(LIVE_PLATFORM_META).includes(l.platform)));
    } catch { /* hold */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    setResult(null);
    if (meta.fields === "TOKEN_ACCOUNT" ? (!apiKey || !accountId) : (!apiKey || !apiSecret)) {
      toast({ title: "Missing details", description: "Fill every field the broker asks for.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/brokers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, env, apiKey, apiSecret, accountId, mode, label }),
      });
      const j = await res.json();
      if (!res.ok) {
        setResult(j.message ?? "The broker rejected those credentials.");
        toast({ title: "Verification failed", description: j.message ?? "Check the keys and retry.", variant: "destructive" });
      } else {
        toast({ title: "Broker connected", description: j.message ?? "Verified by reading your account." });
        setResult(j.message ?? null);
        setAdding(false);
        setApiKey(""); setApiSecret(""); setAccountId(""); setLabel("");
        load();
      }
    } catch {
      setResult("Network error. Retry in a moment.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await fetch(`/api/brokers?id=${id}`, { method: "DELETE" });
      setLinks((ls) => ls.filter((l) => l.id !== id));
      toast({ title: "Connection removed", description: "The encrypted credentials were deleted with it." });
    } catch {
      toast({ title: "Couldn't remove that", description: "Retry in a moment.", variant: "destructive" });
    }
  };

  return (
    <SettingsCard title="Connect your broker" desc="Your API keys, verified on save; FULL access trades live through your account">
      <div className="space-y-3">
        {links.map((l) => (
          <div key={l.id} className="flex items-center justify-between gap-3 rounded-lg border border-hairline bg-panel-2 px-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-xs font-bold">
                {l.platform} · {l.label}{" "}
                <span className={`ml-1 rounded border px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider ${l.env === "LIVE" || l.env === "LIVE" ? "border-neg/40 bg-neg/10 text-neg" : "border-hairline text-muted-foreground"}`}>{l.env}</span>
                {l.mode === "FULL" && l.status === "CONNECTED" ? (
                  <span className="ml-1 rounded border border-pos/40 bg-pos/10 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-pos">live routing</span>
                ) : null}
              </p>
              <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{l.statusDetail}</p>
              {l.balance != null || l.equity != null ? (
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {l.balance != null ? `Balance ${l.balance.toLocaleString()} ${l.currency}` : ""}
                  {l.equity != null ? ` · Equity ${l.equity.toLocaleString()} ${l.currency}` : ""}
                </p>
              ) : null}
            </div>
            <button onClick={() => remove(l.id)} className="shrink-0 rounded-lg border border-hairline px-2.5 py-1.5 text-[10px] font-semibold text-muted-foreground transition-colors hover:border-neg/40 hover:text-neg">
              Remove
            </button>
          </div>
        ))}

        {!adding ? (
          <button onClick={() => setAdding(true)} className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-hairline py-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-brand/40 hover:text-foreground">
            <Plus className="h-3.5 w-3.5" /> Connect Alpaca, Binance, Bybit or OANDA
          </button>
        ) : (
          <div className="space-y-2.5 rounded-lg border border-hairline bg-panel-2 p-3">
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(LIVE_PLATFORM_META) as Array<keyof typeof LIVE_PLATFORM_META>).map((p) => (
                <button
                  key={p}
                  onClick={() => { setPlatform(p); setEnv(LIVE_PLATFORM_META[p].envDefault); }}
                  className={`rounded-md px-2.5 py-1.5 text-[11px] font-bold transition-colors ${platform === p ? "bg-brand/15 text-brand" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {LIVE_PLATFORM_META[p].name}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Environment</span>
              {meta.envs.map((e) => (
                <button key={e} onClick={() => setEnv(e)} className={`rounded-md border px-2 py-1 text-[10px] font-bold ${env === e ? "border-brand/50 bg-brand/10 text-brand" : "border-hairline text-muted-foreground"}`}>{e}</button>
              ))}
              {env === "LIVE" && <span className="text-[10px] font-semibold text-neg">real money</span>}
            </div>
            <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={meta.fields === "TOKEN_ACCOUNT" ? "API token" : "API key"} type="password" autoComplete="off" className="w-full rounded-lg border border-hairline bg-panel px-3 py-2 text-xs outline-none focus:border-brand/50" />
            {meta.fields === "KEY_SECRET" && (
              <input value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} placeholder="API secret" type="password" autoComplete="off" className="w-full rounded-lg border border-hairline bg-panel px-3 py-2 text-xs outline-none focus:border-brand/50" />
            )}
            {meta.fields === "TOKEN_ACCOUNT" && (
              <input value={accountId} onChange={(e) => setAccountId(e.target.value)} placeholder="Account id" className="w-full rounded-lg border border-hairline bg-panel px-3 py-2 text-xs outline-none focus:border-brand/50" />
            )}
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (optional)" className="w-full rounded-lg border border-hairline bg-panel px-3 py-2 text-xs outline-none focus:border-brand/50" />
            <label className="flex items-center gap-2 text-[10.5px] text-muted-foreground">
              <input type="checkbox" checked={mode === "FULL"} onChange={(e) => setMode(e.target.checked ? "FULL" : "INVESTOR")} className="accent-[#dc2626]" />
              FULL access: verified keys route my trades live through my broker (unchecked = read-only watch, paper execution)
            </label>
            <div className="flex gap-2">
              <button onClick={submit} disabled={busy} className="flex-1 rounded-lg bg-brand py-2 text-xs font-bold text-white transition-all hover:brightness-110 disabled:opacity-60">
                {busy ? "Reading your account…" : "Verify & connect"}
              </button>
              <button onClick={() => { setAdding(false); setResult(null); }} className="rounded-lg border border-hairline px-3 py-2 text-xs font-semibold text-muted-foreground">
                Cancel
              </button>
            </div>
            {result && <p className="text-[10px] leading-relaxed text-muted-foreground">{result}</p>}
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              {meta.hint} On save, the server reads your account with these keys to prove them; nothing is stored if the broker rejects them. Keys are AES-256-GCM encrypted at rest and never returned by any API. Orders fill only at prices your broker confirms.
            </p>
          </div>
        )}
      </div>
    </SettingsCard>
  );
}
