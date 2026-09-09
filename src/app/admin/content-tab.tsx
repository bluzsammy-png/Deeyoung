"use client";

// DEEYOUNG PRO — admin Content tab: owner-editable site copy + media.
// Text keys save inline; the image key takes a file pick (client-side
// downscale + data URL) or a Clear button (falls back to the built-in
// default). Saves hit /api/admin/content (whitelist + size caps, audited).
// Everything the owner changes is live on the landing page within seconds
// (public reader caches 30s).

import { useCallback, useEffect, useState } from "react";
import { Download, ImageIcon, Loader2, RotateCcw, Save, Share2, Type } from "lucide-react";
import { CONTENT_TEXT_KEYS, CONTENT_IMAGE_KEYS, IMAGE_MAX_BYTES } from "@/lib/site-content";
import { MARKETING_ASSETS, marketingPath } from "@/lib/marketing-assets";

type Row = { key: string; value: string; updatedBy: string | null; updatedAt: string };

const TEXT_LABELS: Record<string, string> = {
  "hero.headline": "Hero headline (one line per row, last line is gradient)",
  "hero.sub": "Hero paragraph",
  "campaign.headline": "Campaign panel headline",
  announcement: "Announcement banner (empty = hidden)",
};

export function ContentTab() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ key: string; ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/content", { cache: "no-store" });
      if (r.ok) {
        const j = await r.json();
        const list: Row[] = j.rows ?? [];
        setRows(list);
        const d: Record<string, string> = {};
        for (const row of list) d[row.key] = row.value;
        setDrafts((prev) => ({ ...d, ...prev }));
      }
    } catch { /* keep last */ }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const valueOf = (key: string) => drafts[key] ?? rows?.find((r) => r.key === key)?.value ?? "";

  const save = async (key: string, value: string) => {
    setBusyKey(key); setMsg(null);
    try {
      const r = await fetch("/api/admin/content", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Save failed");
      setMsg({ key, ok: true, text: value === "" ? "Cleared - built-in default is live" : "Saved and live within 30s" });
      setDrafts((p) => ({ ...p, [key]: value }));
      void load();
    } catch (e) {
      setMsg({ key, ok: false, text: e instanceof Error ? e.message : "Try again" });
    } finally { setBusyKey(null); }
  };

  const pickImage = (key: string, file: File | null) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      setMsg({ key, ok: false, text: "Use a PNG, JPEG or WebP file" });
      return;
    }
    if (file.size > IMAGE_MAX_BYTES) {
      setMsg({ key, ok: false, text: `Too large: ${Math.round(file.size / 1000)}KB (max ${Math.round(IMAGE_MAX_BYTES / 1000)}KB)` });
      return;
    }
    const fr = new FileReader();
    fr.onload = () => void save(key, String(fr.result ?? ""));
    fr.readAsDataURL(file);
  };

  const updatedAtOf = (key: string) => {
    const r = rows?.find((x) => x.key === key);
    if (!r) return "built-in default";
    return `override by ${r.updatedBy ?? "admin"} at ${new Date(r.updatedAt).toISOString().slice(0, 16).replace("T", " ")}Z`;
  };

  return (
    <div className="mt-5 space-y-4">
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <h2 className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-400">
          <Type className="h-3.5 w-3.5 text-emerald-400" /> Site text
        </h2>
        <div className="space-y-4">
          {Object.entries(CONTENT_TEXT_KEYS).map(([key]) => (
            <div key={key}>
              <div className="flex items-baseline justify-between">
                <label htmlFor={`ct-${key}`} className="text-xs font-semibold text-zinc-300">{TEXT_LABELS[key] ?? key}</label>
                <span className="text-[10px] text-zinc-600">{updatedAtOf(key)}</span>
              </div>
              {key === "hero.sub" ? (
                <textarea id={`ct-${key}`} rows={4} value={valueOf(key)}
                  onChange={(e) => setDrafts((p) => ({ ...p, [key]: e.target.value }))}
                  placeholder="Leave empty to show the built-in copy"
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500/60" />
              ) : (
                <input id={`ct-${key}`} value={valueOf(key)}
                  onChange={(e) => setDrafts((p) => ({ ...p, [key]: e.target.value }))}
                  placeholder="Leave empty to show the built-in copy"
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500/60" />
              )}
              <div className="mt-1.5 flex items-center gap-2">
                <button onClick={() => void save(key, valueOf(key))} disabled={busyKey === key}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-[11px] font-bold text-emerald-950 disabled:opacity-40">
                  {busyKey === key ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Save
                </button>
                <button onClick={() => void save(key, "")} disabled={busyKey === key || valueOf(key) === ""}
                  className="flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-[11px] font-semibold text-zinc-300 disabled:opacity-40 hover:bg-zinc-900">
                  <RotateCcw className="h-3 w-3" /> Reset to default
                </button>
                {msg?.key === key && (
                  <span className={`text-[11px] ${msg.ok ? "text-emerald-400" : "text-rose-400"}`}>{msg.text}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <h2 className="mb-1 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-400">
          <Share2 className="h-3.5 w-3.5 text-emerald-400" /> Social flyers
        </h2>
        <p className="mb-3 text-[11px] text-zinc-500">
          Cinematic, ready-to-post assets for every platform. Download and share as-is; QR and copy point at deyoungpro.site.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {MARKETING_ASSETS.map((a) => (
            <div key={a.file} className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
              <a href={marketingPath(a.file)} target="_blank" rel="noreferrer" aria-label={`Open ${a.label}`}>
                <img
                  src={marketingPath(a.file)}
                  alt={a.label}
                  loading="lazy"
                  className="h-44 w-full object-cover object-top transition-transform duration-300 hover:scale-[1.02]"
                />
              </a>
              <div className="p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-xs font-bold text-zinc-200">{a.label}</p>
                  <p className="shrink-0 font-mono text-[10px] text-zinc-500">{a.w}&times;{a.h}</p>
                </div>
                <p className="mt-1 min-h-[2.2em] text-[10.5px] leading-relaxed text-zinc-500">{a.note}</p>
                <div className="mt-2 flex items-center gap-2">
                  <a
                    href={marketingPath(a.file)}
                    download={a.file}
                    className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-2.5 py-1.5 text-[11px] font-bold text-emerald-950 transition-transform hover:scale-[1.03]"
                  >
                    <Download className="h-3 w-3" /> Download
                  </a>
                  <a
                    href={marketingPath(a.file)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 rounded-lg border border-zinc-700 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-300 hover:bg-zinc-900"
                  >
                    Full size
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <h2 className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-400">
          <ImageIcon className="h-3.5 w-3.5 text-emerald-400" /> Site images
        </h2>
        {Object.entries(CONTENT_IMAGE_KEYS).map(([key, label]) => (
          <div key={key}>
            <div className="flex items-baseline justify-between">
              <label htmlFor={`ct-file-${key}`} className="text-xs font-semibold text-zinc-300">{label}</label>
              <span className="text-[10px] text-zinc-600">{updatedAtOf(key)}</span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <input id={`ct-file-${key}`} type="file" accept="image/png,image/jpeg,image/webp"
                onChange={(e) => { pickImage(key, e.target.files?.[0] ?? null); e.currentTarget.value = ""; }}
                className="block w-full max-w-sm text-xs text-zinc-400 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-500 file:px-3 file:py-1.5 file:text-[11px] file:font-bold file:text-emerald-950" />
              <button onClick={() => void save(key, "")} disabled={busyKey === key}
                className="flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-[11px] font-semibold text-zinc-300 disabled:opacity-40 hover:bg-zinc-900">
                <RotateCcw className="h-3 w-3" /> Reset to default
              </button>
              {msg?.key === key && (
                <span className={`text-[11px] ${msg.ok ? "text-emerald-400" : "text-rose-400"}`}>{msg.text}</span>
              )}
            </div>
            <p className="mt-1 text-[10px] text-zinc-600">PNG / JPEG / WebP, up to {Math.round(IMAGE_MAX_BYTES / 1000)}KB. 16:9 landscape works best.</p>
          </div>
        ))}
      </section>
    </div>
  );
}
