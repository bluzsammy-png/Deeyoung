"use client";

// DEEYOUNG PRO — admin Support tab: the agent side of the in-house live chat.
// Left: thread inbox (unread badges, last message preview, auto-refresh 10s).
// Right: selected thread transcript + reply box. Replies are instantly visible
// to the visitor's widget on its next 4s poll. Clear = moderation delete.

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, ChevronLeft, Eraser, Loader2, MessageCircle, Send, XCircle } from "lucide-react";

type Thread = {
  key: string; last: string; lastRole: string; lastAt: string;
  unread: number; name: string | null; page: string | null; total: number;
};
type Msg = { id: string; role: string; body: string; createdAt: string; seen: boolean };

export function SupportTab() {
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [sendErr, setSendErr] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const loadThreads = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/support", { cache: "no-store" });
      if (r.ok) setThreads((await r.json()).threads ?? []);
    } catch { /* keep last */ }
  }, []);

  const openThread = useCallback(async (key: string) => {
    setSel(key);
    setSendErr(null);
    try {
      const r = await fetch(`/api/admin/support?key=${encodeURIComponent(key)}`, { cache: "no-store" });
      if (r.ok) setMsgs((await r.json()).messages ?? []);
      setThreads((t) => t?.map((x) => (x.key === key ? { ...x, unread: 0 } : x)) ?? t);
    } catch { /* keep last */ }
  }, []);

  useEffect(() => {
    const t = setTimeout(loadThreads, 0);
    const iv = setInterval(loadThreads, 10_000);
    return () => { clearTimeout(t); clearInterval(iv); };
  }, [loadThreads]);

  // Live transcript while a thread is open.
  useEffect(() => {
    if (!sel) return;
    const iv = setInterval(async () => {
      try {
        const r = await fetch(`/api/admin/support?key=${encodeURIComponent(sel)}`, { cache: "no-store" });
        if (r.ok) setMsgs((await r.json()).messages ?? []);
      } catch { /* keep last */ }
    }, 8000);
    return () => clearInterval(iv);
  }, [sel]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [msgs]);

  const reply = async () => {
    const body = draft.trim();
    if (!body || !sel || busy) return;
    setBusy(true);
    setSendErr(null);
    try {
      const r = await fetch("/api/admin/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: sel, body }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.message ?? "Reply failed");
      setDraft("");
      await openThread(sel);
    } catch (e) {
      setSendErr(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const clearThread = async (key: string) => {
    if (!confirm("Delete this entire conversation? This cannot be undone.")) return;
    await fetch(`/api/admin/support?key=${encodeURIComponent(key)}`, { method: "DELETE" });
    setSel(null); setMsgs(null);
    loadThreads();
  };

  const unreadTotal = threads?.reduce((n, t) => n + t.unread, 0) ?? 0;

  if (!threads) {
    return (
      <div className="mt-14 flex justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
      </div>
    );
  }

  return (
    <div className="mt-5 grid gap-4 lg:grid-cols-[22rem_1fr]">
      {/* Inbox */}
      <div className={`rounded-xl border border-zinc-800 bg-zinc-950/60 ${sel ? "hidden lg:block" : ""}`}>
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <p className="flex items-center gap-2 text-xs font-bold text-zinc-200">
            <MessageCircle className="h-3.5 w-3.5 text-emerald-400" /> Conversations
            {unreadTotal > 0 && (
              <span className="rounded-full bg-red-500/90 px-1.5 py-0.5 text-[10px] font-bold text-white">{unreadTotal}</span>
            )}
          </p>
          <button onClick={loadThreads} className="text-[10px] font-semibold text-zinc-500 hover:text-zinc-300">refresh</button>
        </div>
        <div className="max-h-[32rem] divide-y divide-zinc-900 overflow-y-auto">
          {threads.length === 0 && (
            <p className="px-4 py-8 text-center text-[11px] leading-relaxed text-zinc-600">
              No conversations yet.<br />When a visitor opens the chat bubble on the site, their thread appears here.
            </p>
          )}
          {threads.map((t) => (
            <button key={t.key} onClick={() => openThread(t.key)}
              className={`block w-full px-4 py-3 text-left transition hover:bg-zinc-900/70 ${sel === t.key ? "bg-zinc-900" : ""}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-[11px] font-bold text-zinc-200">{t.name ?? `Visitor · ${t.key.slice(0, 8)}`}</p>
                {t.unread > 0 && <span className="shrink-0 rounded-full bg-red-500/90 px-1.5 py-0.5 text-[10px] font-bold text-white">{t.unread}</span>}
              </div>
              <p className="mt-0.5 truncate text-[11px] text-zinc-500">
                {t.lastRole === "AGENT" ? "You: " : ""}{t.last}
              </p>
              <p className="mt-0.5 text-[10px] text-zinc-600">
                {new Date(t.lastAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                {t.page ? ` · ${t.page}` : ""}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Transcript */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-950/60">
        {!sel ? (
          <div className="flex h-64 items-center justify-center text-[11px] text-zinc-600">Select a conversation to reply.</div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
              <div className="flex items-center gap-2">
                <button onClick={() => { setSel(null); setMsgs(null); }} className="lg:hidden text-zinc-500 hover:text-zinc-300" aria-label="Back to list">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <p className="text-xs font-bold text-zinc-200">{threads.find((t) => t.key === sel)?.name ?? `Visitor · ${sel.slice(0, 8)}`}</p>
                <span className="font-mono text-[10px] text-zinc-600">{sel.slice(0, 12)}…</span>
              </div>
              <button onClick={() => clearThread(sel)} title="Clear conversation"
                className="flex items-center gap-1 rounded-md border border-zinc-800 px-2 py-1 text-[10px] font-semibold text-zinc-500 hover:border-red-900 hover:text-red-400">
                <Eraser className="h-3 w-3" /> clear
              </button>
            </div>
            <div ref={listRef} className="h-72 space-y-2.5 overflow-y-auto px-4 py-3">
              {msgs?.map((m) => (
                <div key={m.id} className={`flex flex-col ${m.role === "AGENT" ? "items-end" : "items-start"}`}>
                  <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-[11px] leading-relaxed ${m.role === "AGENT" ? "bg-emerald-600/90 text-white" : "bg-zinc-800/90 text-zinc-100"}`}>
                    {m.body}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1 px-1">
                    {m.role === "AGENT" && m.seen && <CheckCircle2 className="h-3 w-3 text-emerald-500" aria-label="seen by visitor" />}
                    <span className="text-[9px] text-zinc-600">{new Date(m.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                </div>
              ))}
              {msgs && msgs.length === 0 && <p className="pt-16 text-center text-[11px] text-zinc-600">Empty thread.</p>}
            </div>
            {sendErr && (
              <p className="mx-4 mb-2 flex items-center gap-1.5 rounded-lg border border-red-900/60 bg-red-950/30 px-3 py-2 text-[11px] text-red-300">
                <XCircle className="h-3.5 w-3.5" /> {sendErr}
              </p>
            )}
            <div className="flex items-center gap-1.5 border-t border-zinc-800 px-4 py-3">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && reply()}
                maxLength={2000}
                placeholder="Reply as DeeYoung Support…"
                className="min-w-0 flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-100 outline-none focus:border-emerald-600"
              />
              <button onClick={reply} disabled={busy || !draft.trim()} aria-label="Send reply"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-600 text-white transition hover:bg-emerald-500 disabled:opacity-40">
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
