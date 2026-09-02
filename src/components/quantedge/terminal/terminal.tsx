"use client";

// DEEYOUNG PRO — Terminal shell: nav, live ticker tape (§40), SENTINEL heartbeat,
// notification center. Desktop sidebar + mobile bottom bar (§41 mobile-native).

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity, Bell, BookOpen, Bot, FlaskConical, Gauge, LayoutDashboard, LineChart,
  PauseCircle, Play, Settings, ShieldCheck, Wallet, X,
} from "lucide-react";
import { useApp, type TerminalView } from "@/lib/store";
import { authClient, type SessionUser } from "@/lib/auth-client";
import { hasPremiumAccess } from "@/lib/entitlements";
import { EdgeMark } from "@/components/quantedge/landing";
import { LegalModal } from "@/components/quantedge/legal";
import { DataBadge } from "@/components/quantedge/ui-bits";
import { AccountMenu, PlanBadge } from "@/components/quantedge/account-menu";
import { PremiumGate } from "@/components/quantedge/premium-gate";
import { DashboardView } from "@/components/quantedge/terminal/dashboard";
import { MarketsView } from "@/components/quantedge/terminal/markets";
import { PortfolioView } from "@/components/quantedge/terminal/portfolio";
import { SentinelView } from "@/components/quantedge/terminal/sentinel-view";
import { ResearchView } from "@/components/quantedge/terminal/research";
import { SignalsView } from "@/components/quantedge/terminal/signals-view";
import { LearnView } from "@/components/quantedge/terminal/learn";
import { SettingsView } from "@/components/quantedge/terminal/settings";
import { AdminView } from "@/components/quantedge/terminal/admin";
import { fmtPct, fmtPrice } from "@/lib/format";
import type { Quote } from "@/lib/types";

const NAV: { id: TerminalView; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "markets", label: "Markets", icon: LineChart },
  { id: "signals", label: "Signals", icon: Activity },
  { id: "portfolio", label: "Portfolio", icon: Wallet },
  { id: "sentinel", label: "SENTINEL", icon: Bot },
  { id: "research", label: "Research", icon: FlaskConical },
  { id: "learn", label: "Learn", icon: BookOpen },
  { id: "settings", label: "Settings", icon: Settings },
];

const MOBILE_NAV: TerminalView[] = ["dashboard", "markets", "signals", "portfolio", "sentinel"];

interface TickerState { quote: Quote }

export function Terminal() {
  const view = useApp((s) => s.view);
  const setView = useApp((s) => s.setView);
  const { data: session } = authClient.useSession();
  const user = session?.user as SessionUser | undefined;
  const premium = !!user && hasPremiumAccess(user);
  const isAdmin = user?.role === "ADMIN";
  const [tickers, setTickers] = useState<TickerState[]>([]);
  const [tickInfo, setTickInfo] = useState({ state: "LIVE", provider: "" });
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [sentinelStatus, setSentinelStatus] = useState<{ mode: string; state: string; killSwitch: boolean } | null>(null);

  // ── Live ticker tape (shared cache upstream; 20s refresh) ──
  useEffect(() => {
    let alive = true;
    const syms = ["NVDA", "AAPL", "MSFT", "TSLA", "AMD", "META", "GOOGL", "AMZN", "SPY", "QQQ", "SMH", "PLTR", "COIN", "JPM"];
    const load = async () => {
      try {
        const res = await fetch(`/api/market/quotes?symbols=${syms.join(",")}`);
        const json = await res.json();
        if (alive && json.quotes) {
          setTickers(json.quotes.map((q: Quote) => ({ quote: q })));
          setTickInfo({ state: json.quotes[0]?.dataState ?? "LIVE", provider: json.provider ?? "" });
        }
      } catch { /* tape holds last good data; badges stay honest */ }
    };
    const t = setTimeout(load, 0);
    const iv = setInterval(load, 45_000);
    return () => { alive = false; clearInterval(iv); clearTimeout(t); };
  }, []);

  // ── SENTINEL heartbeat: tick every 75s + fetch state (Pro feature; skipped on FREE) ──
  const refreshState = useCallback(async () => {
    try {
      const res = await fetch("/api/sentinel/state");
      if (res.status === 402 || res.status === 401) return; // plan doesn't include SENTINEL
      const json = await res.json();
      if (json.notifications) setNotifications(json.notifications);
      const pending = (json.approvals ?? []).filter((a: { status: string }) => a.status === "PENDING").length;
      setUnread(pending + (json.notifications ?? []).filter((n: { openedAt: null }) => !n.openedAt).length);
      setSentinelStatus({ mode: json.mode, state: json.state, killSwitch: json.killSwitch });
    } catch { /* transient */ }
  }, []);

  useEffect(() => {
    if (!premium) return;
    const t = setTimeout(refreshState, 0);
    const tick = async () => {
      try { await fetch("/api/sentinel/tick", { method: "POST" }); } catch { /* skip */ }
      refreshState();
    };
    const iv = setInterval(tick, 75_000);
    // initial tick shortly after mount
    const t0 = setTimeout(tick, 2500);
    return () => { clearInterval(iv); clearTimeout(t0); clearTimeout(t); };
  }, [refreshState, premium]);

  // derived: FREE plans never see the sentinel mini status (no setState-in-effect needed)
  const visibleSentinelStatus = premium ? sentinelStatus : null;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <LegalModal open={useApp((s) => s.legalModal)} onClose={() => useApp.getState().setLegalModal(null)} />

      {/* ── Desktop sidebar ── */}
      <aside className="z-30 hidden w-[212px] shrink-0 flex-col border-r border-hairline bg-panel md:flex">
        <button onClick={() => setView("dashboard")} className="flex items-center gap-2.5 px-5 py-5 text-left">
          <EdgeMark size={30} />
          <div className="leading-none">
            <span className="text-sm font-bold tracking-tight">DeeYoung<span className="text-brand"> Pro</span></span>
            <span className="mt-1 block text-[8.5px] font-medium uppercase tracking-[0.2em] text-muted-foreground">Read the market. Move first.</span>
          </div>
        </button>

        <nav className="flex-1 space-y-0.5 px-3 py-2">
          {[...NAV, ...(isAdmin ? [{ id: "admin" as TerminalView, label: "Admin & Trust", icon: ShieldCheck }] : [])].map((n) => {
            const active = view === n.id;
            return (
              <button
                key={n.id}
                onClick={() => setView(n.id)}
                className={`group relative flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-[13px] font-medium transition-colors ${
                  active ? "bg-brand/12 text-brand" : "text-muted-foreground hover:bg-panel-2 hover:text-foreground"
                }`}
              >
                {active && <motion.span layoutId="nav-pill" className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-brand" />}
                <n.icon className="h-[17px] w-[17px]" />
                {n.label}
                {n.id === "sentinel" && unread > 0 && (
                  <span className="qe-num ml-auto rounded-full bg-neg px-1.5 py-0.5 text-[9px] font-bold text-white">{unread}</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* sentinel mini status */}
        {visibleSentinelStatus && (
          <button onClick={() => setView("sentinel")} className="mx-3 mb-3 rounded-xl border border-hairline bg-panel-2 p-3 text-left transition-colors hover:border-brand/30">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold tracking-[0.14em] text-muted-foreground">SENTINEL</span>
              <span className={`h-2 w-2 rounded-full ${visibleSentinelStatus.killSwitch ? "bg-neg qe-pulse-dot" : visibleSentinelStatus.state === "ACTIVE" ? "bg-pos qe-pulse-dot" : "bg-warn"}`} />
            </div>
            <p className="mt-1.5 text-xs font-semibold">{visibleSentinelStatus.state.replace(/_/g, " ")}</p>
            <p className="text-[10px] text-muted-foreground">Mode: {visibleSentinelStatus.mode}</p>
          </button>
        )}
      </aside>

      {/* ── Main column ── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* top bar: ticker tape + status */}
        <header className="z-20 flex h-[52px] shrink-0 items-center gap-3 border-b border-hairline bg-panel/80 px-3 backdrop-blur-md">
          {/* mobile logo */}
          <div className="flex items-center gap-2 md:hidden">
            <EdgeMark size={26} />
          </div>

          {/* tape */}
          <div className="relative min-w-0 flex-1 overflow-hidden" title="Delayed per exchange terms">
            <div className="qe-ticker-track flex w-max items-center gap-6 pl-2">
              {[...tickers, ...tickers].map((t, i) => (
                <span key={i} className="flex items-center gap-1.5 whitespace-nowrap text-xs">
                  <span className="font-semibold">{t.quote.symbol}</span>
                  <span className="qe-num text-foreground/75">{fmtPrice(t.quote.price)}</span>
                  <span className={`qe-num ${t.quote.changePct >= 0 ? "text-pos" : "text-neg"}`}>{fmtPct(t.quote.changePct)}</span>
                  <span className={`h-1.5 w-1.5 rounded-full ${t.quote.changePct >= 0 ? "bg-pos" : "bg-neg"}`} />
                </span>
              ))}
              {!tickers.length && <span className="text-xs text-muted-foreground">connecting to market data…</span>}
            </div>
          </div>

          <DataBadge state={tickInfo.state} className="hidden sm:inline-flex" />

          {sentinelStatus?.killSwitch && (
            <span className="rounded-lg border border-neg/40 bg-neg/15 px-2.5 py-1 text-[10px] font-bold tracking-wider text-neg qe-alarm">
              EMERGENCY STOP
            </span>
          )}

          {/* plan + account */}
          {user && (
            <div className="flex items-center gap-2">
              <PlanBadge user={user} onClickUpgrade={() => setView("settings")} />
              <AccountMenu user={user} />
            </div>
          )}

          {/* notifications */}
          <button
            onClick={() => { setNotifOpen((o) => !o); setUnread(0); }}
            className="relative rounded-xl p-2 text-muted-foreground transition-colors hover:bg-panel-2 hover:text-foreground"
            aria-label="Notifications"
          >
            <Bell className="h-[18px] w-[18px]" />
            {unread > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-neg" />}
          </button>
        </header>

        {/* notification drawer */}
        <AnimatePresence>
          {notifOpen && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="absolute right-3 top-[56px] z-50 w-[340px] max-w-[calc(100vw-24px)]"
            >
              <div className="qe-panel shadow-2xl">
                <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
                  <span className="text-xs font-bold tracking-wider">NOTIFICATIONS</span>
                  <button onClick={() => setNotifOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
                </div>
                <div className="qe-scroll max-h-[420px] overflow-y-auto">
                  {notifications.length === 0 && (
                    <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                      Quiet so far. SENTINEL posts approval requests, fills, and risk events here.
                    </p>
                  )}
                  {notifications.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => {
                        if (n.deepLink?.startsWith("sentinel")) setView("sentinel");
                        else if (n.deepLink === "portfolio") setView("portfolio");
                        setNotifOpen(false);
                      }}
                      className="block w-full border-b border-hairline px-4 py-3 text-left transition-colors last:border-0 hover:bg-panel-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-semibold leading-snug">{n.title}</p>
                        <span className={`mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${n.importance === "CRITICAL" ? "bg-neg" : n.importance === "HIGH" ? "bg-warn" : "bg-pos"}`} />
                      </div>
                      <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{n.body}</p>
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* view container */}
        <main className="qe-scroll min-h-0 flex-1 overflow-y-auto pb-24 md:pb-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={view}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22 }}
              className="mx-auto w-full max-w-[1240px] px-4 py-5 sm:px-6"
            >
              {view === "dashboard" && <DashboardView />}
              {view === "markets" && <MarketsView />}
              {view === "signals" && <SignalsView />}
              {view === "portfolio" && <PortfolioView />}
              {view === "sentinel" && <PremiumGate feature="sentinel"><SentinelView /></PremiumGate>}
              {view === "research" && <PremiumGate feature="research"><ResearchView /></PremiumGate>}
              {view === "learn" && <LearnView />}
              {view === "settings" && <SettingsView />}
              {view === "admin" && isAdmin && <AdminView />}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* ── Mobile bottom nav (§36: Home Markets Signals Portfolio More) ── */}
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-panel/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
          <div className="grid grid-cols-5">
            {MOBILE_NAV.map((id) => {
              const n = NAV.find((x) => x.id === id)!;
              const active = view === id;
              return (
                <button
                  key={id}
                  onClick={() => setView(id)}
                  className={`relative flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium ${active ? "text-brand" : "text-muted-foreground"}`}
                >
                  <n.icon className="h-[19px] w-[19px]" />
                  {n.label}
                  {id === "sentinel" && unread > 0 && <span className="absolute right-[22%] top-1.5 h-2 w-2 rounded-full bg-neg" />}
                </button>
              );
            })}
          </div>
          {/* overflow row */}
          <div className="flex justify-center gap-1 border-t border-hairline px-2 py-1">
            {[...(["research", "learn", "settings"] as TerminalView[]), ...(isAdmin ? (["admin"] as TerminalView[]) : [])].map((id) => {
              const n = id === "admin"
                ? { id: "admin" as TerminalView, label: "Admin & Trust", icon: ShieldCheck }
                : NAV.find((x) => x.id === id)!;
              if (!n) return null;
              return (
                <button
                  key={id}
                  onClick={() => setView(n.id)}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-[10px] font-medium ${view === id ? "bg-brand/12 text-brand" : "text-muted-foreground"}`}
                >
                  <n.icon className="h-3 w-3" />{n.label}
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}

interface Notification {
  id: string; title: string; body: string; importance: string; deepLink: string | null; openedAt: string | null;
}

// icons referenced by mobile overflow nav
void PauseCircle; void Play; void Gauge;
