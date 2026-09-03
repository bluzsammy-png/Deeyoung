"use client";

// DEEYOUNG PRO — Symbol discovery combobox (§28).
// Type-ahead against /api/market/search: any tradable symbol worldwide —
// equities, ETFs, FX pairs, crypto, indices, futures. No fake local filtering.

import { useEffect, useRef, useState } from "react";

export interface SymbolHit {
  symbol: string;
  name: string;
  exchange: string;
  assetClass: string;
}

export function SymbolSearch({ onPick, placeholder = "Search any symbol — stocks, FX, crypto, indices, futures…" }: {
  onPick: (hit: SymbolHit) => void;
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SymbolHit[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 1) { setHits([]); return; }
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const res = await fetch(`/api/market/search?q=${encodeURIComponent(query)}`);
        const json = await res.json();
        setHits(Array.isArray(json.results) ? json.results : []);
      } catch { setHits([]); }
      finally { setBusy(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <div ref={box} className="relative">
      <input
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        aria-label="Search symbols"
        className="w-full rounded-xl border border-hairline bg-panel-2 px-3 py-2.5 text-sm outline-none focus:border-brand/50"
      />
      {open && q.trim().length > 0 && (
        <div className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-hairline bg-panel-2 shadow-xl">
          {busy && hits.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground">Searching…</div>}
          {!busy && hits.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground">No matches — try a ticker or company name.</div>}
          {hits.map((h) => (
            <button
              key={`${h.symbol}:${h.exchange}`}
              type="button"
              onClick={() => { onPick(h); setOpen(false); setQ(""); }}
              className="flex w-full items-baseline gap-2 px-3 py-2 text-left hover:bg-brand/10"
            >
              <span className="text-sm font-bold">{h.symbol}</span>
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{h.name}</span>
              <span className="text-[10px] uppercase text-muted-foreground">{h.exchange || h.assetClass}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
