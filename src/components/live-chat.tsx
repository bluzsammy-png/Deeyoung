"use client";

// DEEYOUNG PRO — in-house live support bubble (free forever, no third party).
// Visitors click the floating bubble, type a message; the owner replies from
// the /admin Support tab and the answer appears here in near-real-time.
// Poll cadence: 4s open (snappy chat) / 25s closed (unread badge only).
// Success/fail marks on every outbound send — consistent with the app's
// WinMark/FailMark visual language.

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, MessageCircle, Send, XCircle } from "lucide-react";

type Msg = { id: string; role: string; body: string; createdAt: string; mine?: boolean; send?: "ok" | "fail" };

const KEY_STORAGE = "dy_support_thread";
const NAME_STORAGE = "dy_support_name";

function newThreadKey(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 32);
}

export function LiveChat() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [name, setName] = useState<string | null>(null);
  const [askName, setAskName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [unread, setUnread] = useState(0);
  const keyRef = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    keyRef.current = localStorage.getItem(KEY_STORAGE);
    const saved = localStorage.getItem(NAME_STORAGE);
    if (saved) setName(saved);
  }, []);

  const poll = useCallback(async () => {
    const key = keyRef.current;
    if (!key) return;
    try {
      const res = await fetch(`/api/support?key=${encodeURIComponent(key)}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      const incoming: Msg[] = data.messages ?? [];
      setMsgs((prev) => {
        // Preserve optimistic send marks for rows the server echo hasn't matched yet.
        const ids = new Set(incoming.map((m) => m.id));
        const pending = prev.filter((m) => m.id.startsWith("tmp_") && m.send === "ok");
        const merged = [...incoming, ...pending.filter((p) => !incoming.some((i) => i.body === p.body))];
        setUnread(merged.filter((m) => m.role === "AGENT" && !ids.has(m.id)).length);
        return merged;
      });
    } catch {
      /* offline — next tick retries */
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    poll();
    const t = setInterval(poll, 4000);
    return () => clearInterval(t);
  }, [open, poll]);

  // Closed-state slow poll: powers the unread badge on the bubble.
  useEffect(() => {
    if (open) return;
    const t = setInterval(poll, 25000);
    return () => clearInterval(t);
  }, [open, poll]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [msgs, open]);

  const send = async () => {
    const body = draft.trim();
    if (!body || busy) return;
    if (!name) {
      setAskName(true);
      setDraft(body);
      return;
    }
    setBusy(true);
    const tmpId = `tmp_${Date.now()}`;
    setMsgs((p) => [...p, { id: tmpId, role: "VISITOR", body, createdAt: new Date().toISOString(), mine: true, send: "ok" }]);
    setDraft("");
    try {
      if (!keyRef.current) {
        keyRef.current = newThreadKey();
        localStorage.setItem(KEY_STORAGE, keyRef.current);
      }
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadKey: keyRef.current, body, name, page: location.pathname }),
      });
      if (!res.ok) throw new Error("send failed");
      setMsgs((p) => p.map((m) => (m.id === tmpId ? { ...m, send: "ok" } : m)));
      setTimeout(poll, 600);
    } catch {
      setMsgs((p) => p.map((m) => (m.id === tmpId ? { ...m, send: "fail" } : m)));
    } finally {
      setBusy(false);
    }
  };

  const saveName = () => {
    const n = nameDraft.trim();
    if (n.length < 2) return;
    setName(n);
    localStorage.setItem(NAME_STORAGE, n);
    setAskName(false);
  };

  return (
    <div className="fixed bottom-4 right-4 z-[90] flex flex-col items-end gap-2 print:hidden">
      {open && (
        <div className="flex h-[26rem] w-[21rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl shadow-black/60">
          <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/80 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-500/15 text-emerald-400">
                <MessageCircle className="h-4 w-4" />
              </span>
              <div>
                <p className="text-xs font-bold text-zinc-100">DeeYoung Support</p>
                <p className="text-[10px] text-emerald-400">typically replies within minutes</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close support chat" className="text-zinc-500 hover:text-zinc-200">
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>

          <div ref={listRef} className="flex-1 space-y-2.5 overflow-y-auto px-3 py-3">
            {msgs.length === 0 && (
              <p className="mt-10 text-center text-[11px] leading-relaxed text-zinc-500">
                Questions about plans, payments or your terminal?
                <br />
                Ask here. Replies land right in this panel.
              </p>
            )}
            {msgs.map((m) => (
              <div key={m.id} className={`flex flex-col ${m.role === "VISITOR" ? "items-end" : "items-start"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-[11px] leading-relaxed ${
                    m.role === "VISITOR" ? "bg-emerald-600/90 text-white" : "bg-zinc-800/90 text-zinc-100"
                  }`}
                >
                  {m.body}
                </div>
                <div className="mt-0.5 flex items-center gap-1 px-1">
                  {m.role === "VISITOR" && m.send === "ok" && <CheckCircle2 className="h-3 w-3 text-emerald-500" />}
                  {m.role === "VISITOR" && m.send === "fail" && <XCircle className="h-3 w-3 text-red-500" />}
                  <span className="text-[9px] text-zinc-600">
                    {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {askName && (
            <div className="flex items-center gap-1.5 border-t border-zinc-800 px-3 py-2">
              <input
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveName()}
                placeholder="Your name (one time)"
                className="min-w-0 flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-[11px] text-zinc-100 outline-none focus:border-emerald-600"
              />
              <button onClick={saveName} className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-500">
                Save
              </button>
            </div>
          )}

          <div className="flex items-center gap-1.5 border-t border-zinc-800 px-3 py-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder={name ? "Type your message…" : "Type your message…"}
              maxLength={2000}
              className="min-w-0 flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-[11px] text-zinc-100 outline-none focus:border-emerald-600"
            />
            <button
              onClick={send}
              disabled={busy || !draft.trim()}
              aria-label="Send message"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-emerald-600 text-white transition hover:bg-emerald-500 disabled:opacity-40"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Open support chat"
        className="relative grid h-12 w-12 place-items-center rounded-full bg-emerald-600 text-white shadow-xl shadow-emerald-950/40 transition hover:bg-emerald-500"
      >
        {open ? <ChevronDown className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
        {!open && unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
    </div>
  );
}
