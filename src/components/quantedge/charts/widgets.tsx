"use client";

// DEEYOUNG PRO — Widget graphics: SignalRing, RiskGauge, FactorBars, RegimeOrb,
// MarketHeatmap, CorrelationMatrix, AllocationDonut, CatalystTimeline.

import { motion } from "framer-motion";
import { useMemo } from "react";
import type { FactorContribution, RegimeState } from "@/lib/types";

const POS = "#10b981";
const NEG = "#f6465d";
const WARN = "#f0b90b";

// ─── Signal score ring (§14 visual) ───────────────────────────────────────────

export function SignalRing({ score, size = 92, label = "SIGNAL" }: { score: number; size?: number; label?: string }) {
  const r = (size - 12) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const col = score >= 75 ? POS : score >= 60 ? WARN : "#8b93a7";
  const gid = `sr-${size}-${score >= 75 ? "p" : score >= 60 ? "w" : "m"}`;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={col} />
            <stop offset="100%" stopColor={score >= 75 ? "#6ee7b7" : col} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" className="text-hairline" strokeWidth={6} />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={`url(#${gid})`} strokeWidth={6} strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ * (1 - pct) }}
          transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
          style={{ filter: `drop-shadow(0 0 5px ${col}99)` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="qe-num text-xl font-semibold leading-none" style={{ color: col }}>{Math.round(score)}</span>
        <span className="mt-0.5 text-[8px] font-semibold tracking-[0.14em] text-muted-foreground">{label}</span>
      </div>
    </div>
  );
}

// ─── Risk gauge (§37 product-native risk visualization) ───────────────────────

export function RiskGauge({ value, size = 170, label = "RISK" }: { value: number; size?: number; label?: string }) {
  // value 0-100 → angle -90..+90 on semicircle
  const v = Math.max(0, Math.min(100, value));
  const angle = -90 + (v / 100) * 180;
  const cx = size / 2, cy = size / 2, r = size / 2 - 14;
  const arc = (a0: number, a1: number) => {
    const p0 = { x: cx + r * Math.cos((a0 - 90) * Math.PI / 180), y: cy + r * Math.sin((a0 - 90) * Math.PI / 180) };
    const p1 = { x: cx + r * Math.cos((a1 - 90) * Math.PI / 180), y: cy + r * Math.sin((a1 - 90) * Math.PI / 180) };
    return `M${p0.x.toFixed(1)},${p0.y.toFixed(1)} A${r},${r} 0 0 1 ${p1.x.toFixed(1)},${p1.y.toFixed(1)}`;
  };
  const needle = { x: cx + (r - 8) * Math.cos((angle - 90) * Math.PI / 180), y: cy + (r - 8) * Math.sin((angle - 90) * Math.PI / 180) };
  return (
    <div className="relative inline-flex flex-col items-center">
      <svg width={size} height={size * 0.64} viewBox={`0 0 ${size} ${size * 0.64}`}>
        <path d={arc(-90, -30)} stroke={POS} strokeWidth={9} fill="none" strokeLinecap="round" opacity={0.75} />
        <path d={arc(-26, 26)} stroke={WARN} strokeWidth={9} fill="none" strokeLinecap="round" opacity={0.75} />
        <path d={arc(30, 90)} stroke={NEG} strokeWidth={9} fill="none" strokeLinecap="round" opacity={0.75} />
        <motion.line
          x1={cx} y1={cy} x2={needle.x} y2={needle.y}
          stroke="#e6e9ef" strokeWidth={2.4} strokeLinecap="round"
          style={{ filter: "drop-shadow(0 0 4px rgba(230,233,239,0.5))" }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8 }}
        />
        <circle cx={cx} cy={cy} r={4.5} fill="#e6e9ef" />
      </svg>
      <div className="-mt-3 text-center">
        <div className="qe-num text-2xl font-semibold" style={{ color: v > 66 ? NEG : v > 33 ? WARN : POS }}>{Math.round(v)}</div>
        <div className="qe-label mt-0.5">{label}</div>
      </div>
    </div>
  );
}

// ─── Factor contribution bars (§14 example) ───────────────────────────────────

export function FactorBars({ factors }: { factors: FactorContribution[] }) {
  const maxAbs = Math.max(...factors.map((f) => Math.max(Math.abs(f.contribution), f.max)), 1);
  return (
    <div className="space-y-2.5">
      {factors.map((f, i) => {
        const isPos = f.contribution >= 0;
        const w = (Math.abs(f.contribution) / maxAbs) * 100;
        const wMax = (f.max / maxAbs) * 100;
        return (
          <div key={f.key} className="group">
            <div className="mb-1 flex items-baseline justify-between text-xs">
              <span className="font-medium text-foreground/90">{f.name}</span>
              <span className={`qe-num font-semibold ${f.contribution > 0 ? "text-pos" : f.contribution < 0 ? "text-neg" : "text-muted-foreground"}`}>
                {f.contribution > 0 ? "+" : ""}{f.contribution.toFixed(1)}
                <span className="ml-1 text-[10px] text-muted-foreground">/ {f.max}</span>
              </span>
            </div>
            <div className="relative h-[7px] overflow-hidden rounded-full bg-panel-3">
              {/* max track */}
              <div className="absolute inset-y-0 left-0 rounded-full bg-hairline" style={{ width: `${wMax}%` }} />
              {/* contribution */}
              <motion.div
                className={`absolute inset-y-0 left-0 rounded-full ${isPos ? "bg-pos" : "bg-neg"}`}
                initial={{ width: 0 }}
                animate={{ width: `${w}%` }}
                transition={{ duration: 0.7, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
            <p className="mt-1 hidden text-[11px] leading-snug text-muted-foreground group-hover:block">{f.detail}</p>
          </div>
        );
      })}
    </div>
  );
}

// ─── Regime orb (§13) ─────────────────────────────────────────────────────────

const REGIME_COLORS: Record<string, string> = {
  RISK_ON: POS, RISK_OFF: NEG, HIGH_VOLATILITY: NEG, LOW_VOLATILITY: "#38bdf8",
  SIDEWAYS: "#8b93a7", MOMENTUM: POS, MEAN_REVERSION: WARN, EVENT_DRIVEN: WARN, LIQUIDITY_STRESS: NEG,
};

export function RegimeOrb({ regime, size = 150 }: { regime: RegimeState | null; size?: number }) {
  const col = regime ? REGIME_COLORS[regime.primary] ?? "#8b93a7" : "#8b93a7";
  return (
    <div className="flex items-center gap-5">
      <div className="relative" style={{ width: size, height: size }}>
        <div className="qe-breathe absolute inset-0 rounded-full" style={{ background: `radial-gradient(circle, ${col}33 0%, transparent 65%)` }} />
        {/* rotating halo — slow orbital scan */}
        <motion.svg
          width={size} height={size} className="absolute inset-0"
          animate={{ rotate: 360 }}
          transition={{ duration: 28, repeat: Infinity, ease: "linear" }}
        >
          <circle
            cx={size / 2} cy={size / 2} r={size / 2 - 4} fill="none"
            stroke={col} strokeOpacity={0.35} strokeWidth={1.2} strokeDasharray="2 10" strokeLinecap="round"
          />
        </motion.svg>
        <svg width={size} height={size} className="relative">
          <circle cx={size / 2} cy={size / 2} r={size / 2 - 8} fill="none" stroke={col} strokeOpacity={0.25} strokeWidth={1.5} />
          <circle cx={size / 2} cy={size / 2} r={size / 2 - 20} fill="none" stroke={col} strokeOpacity={0.5} strokeWidth={1} strokeDasharray="4 6" />
          <motion.circle
            cx={size / 2} cy={size / 2} r={size / 2 - 34}
            fill={col} fillOpacity={0.14} stroke={col} strokeWidth={1.6}
            animate={{ scale: [1, 1.04, 1] }}
            transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
            style={{ transformOrigin: "center" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Regime</span>
          <span className="mt-1 max-w-[110px] text-sm font-semibold leading-tight" style={{ color: col }}>
            {regime?.label ?? "…"}
          </span>
          {regime && <span className="qe-num mt-1 text-[10px] text-muted-foreground">{regime.confidence}% conf</span>}
        </div>
      </div>
    </div>
  );
}

// ─── Market heatmap (§37 product-native) ──────────────────────────────────────

export interface HeatCell { symbol: string; changePct: number; weight: number; name?: string }

export function MarketHeatmap({ cells, onPick }: { cells: HeatCell[]; onPick?: (s: string) => void }) {
  const sorted = [...cells].sort((a, b) => b.weight - a.weight);
  const color = (p: number) => {
    const c = Math.max(-2.5, Math.min(2.5, p)) / 2.5;
    if (c >= 0) return `rgba(16, 185, 129, ${0.12 + c * 0.62})`;
    return `rgba(246, 70, 93, ${0.12 + Math.abs(c) * 0.62})`;
  };
  return (
    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
      {sorted.map((cell, i) => (
        <motion.button
          key={cell.symbol}
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: i * 0.03, duration: 0.4 }}
          onClick={() => onPick?.(cell.symbol)}
          className="qe-panel-2 group flex min-h-[72px] cursor-pointer flex-col justify-between rounded-lg p-2.5 text-left ring-0 ring-white/0 transition-all duration-200 hover:z-10 hover:scale-[1.03] hover:ring-1 hover:ring-white/25"
          style={{ background: color(cell.changePct) }}
          whileHover={{ boxShadow: `0 10px 32px -10px ${color(cell.changePct).replace(/,[0-9.]+\)$/, ", 0.55)")}` }}
        >
          <div className="flex w-full items-baseline justify-between">
            <span className="text-sm font-bold tracking-tight text-white">{cell.symbol}</span>
            <span className="qe-num text-xs font-semibold text-white/95">
              {cell.changePct > 0 ? "+" : ""}{cell.changePct.toFixed(2)}%
            </span>
          </div>
          <span className="truncate text-[10px] text-white/65">{cell.name ?? ""}</span>
        </motion.button>
      ))}
    </div>
  );
}

// ─── Correlation matrix (§15) ─────────────────────────────────────────────────

export function CorrelationMatrix({ symbols, matrix }: { symbols: string[]; matrix: number[][] }) {
  const color = (v: number) => {
    if (v >= 0.8) return "rgba(246,70,93,0.55)";
    if (v >= 0.5) return "rgba(246,70,93,0.28)";
    if (v >= 0.2) return "rgba(148,163,184,0.16)";
    if (v >= -0.2) return "rgba(148,163,184,0.10)";
    return "rgba(16,185,129,0.35)";
  };
  return (
    <div className="overflow-x-auto qe-scroll">
      <table className="w-full min-w-[420px] border-separate border-spacing-[2px] text-[11px]">
        <thead>
          <tr>
            <th />
            {symbols.map((s) => <th key={s} className="qe-num pb-1 font-semibold text-muted-foreground">{s}</th>)}
          </tr>
        </thead>
        <tbody>
          {symbols.map((rowSym, i) => (
            <tr key={rowSym}>
              <td className="qe-num pr-2 text-right font-semibold text-muted-foreground">{rowSym}</td>
              {symbols.map((colSym, j) => (
                <td
                  key={colSym}
                  className="qe-num h-8 w-8 rounded text-center font-medium text-white/90"
                  style={{ background: i === j ? "rgba(148,163,184,0.22)" : color(matrix[i]?.[j] ?? 0) }}
                  title={`${rowSym} ↔ ${colSym}: ${(matrix[i]?.[j] ?? 0).toFixed(2)}`}
                >
                  {(matrix[i]?.[j] ?? 0).toFixed(2).replace("0.", ".")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Allocation donut (§15) ───────────────────────────────────────────────────

const DONUT_COLORS = ["#10b981", "#f0b90b", "#a78bfa", "#38bdf8", "#f6465d", "#8b93a7", "#34d399", "#fbbf24"];

export function AllocationDonut({ slices, size = 150 }: { slices: { label: string; pct: number }[]; size?: number }) {
  const r = size / 2 - 10;
  const circ = 2 * Math.PI * r;
  const shown = slices.slice(0, 8);
  // precompute dash offsets (pure, no render-phase mutation)
  const arcs = shown.reduce<{ s: { label: string; pct: number }; i: number; dash: number; offset: number; acc: number }[]>((out, s, i) => {
    const prevAcc = out.length ? out[out.length - 1].acc : 0;
    const accNext = prevAcc + s.pct / 100;
    out.push({ s, i, dash: circ * (s.pct / 100), offset: -circ * prevAcc, acc: accNext });
    return out;
  }, []);
  return (
    <div className="flex items-center gap-5">
      <svg width={size} height={size} className="-rotate-90 shrink-0">
        {arcs.map(({ s, i, dash, offset }) => (
          <circle
            key={s.label}
            cx={size / 2} cy={size / 2} r={r} fill="none"
            stroke={DONUT_COLORS[i % DONUT_COLORS.length]}
            strokeWidth={13}
            strokeDasharray={`${Math.max(0, dash - 2)} ${circ}`}
            strokeDashoffset={offset}
            strokeLinecap="butt"
          />
        ))}
      </svg>
      <div className="min-w-0 flex-1 space-y-1.5">
        {shown.map((s, i) => (
          <div key={s.label} className="flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
            <span className="truncate text-foreground/85">{s.label}</span>
            <span className="qe-num ml-auto font-semibold text-muted-foreground">{s.pct.toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Catalyst timeline (§11/§12 product-native) ───────────────────────────────

export interface TimelineItem { id: string; headline: string; source: string; publishedAt: number; strength: number; sentiment: string; tickers: string[]; category: string }

export function CatalystTimeline({ items }: { items: TimelineItem[] }) {
  if (!items.length) return null;
  return (
    <div className="relative pl-5">
      <div className="absolute bottom-2 left-[7px] top-2 w-px bg-hairline" />
      <div className="space-y-4">
        {items.slice(0, 8).map((it, i) => {
          const col = it.sentiment === "POSITIVE" ? POS : it.sentiment === "NEGATIVE" ? NEG : "#8b93a7";
          return (
            <motion.div
              key={it.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="relative"
            >
              <span
                className="absolute -left-5 top-1.5 rounded-full"
                style={{ width: 7 + it.strength * 0.5, height: 7 + it.strength * 0.5, background: col, boxShadow: `0 0 8px ${col}55` }}
              />
              <p className="text-[13px] font-medium leading-snug text-foreground/90">{it.headline}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                <span className="qe-num">{it.tickers.join(", ")}</span> · {it.source} · {it.category} · strength {it.strength}/9
              </p>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Execution timeline (§44 trace) ───────────────────────────────────────────

export interface TraceStep { name: string; state: "DONE" | "ACTIVE" | "PENDING" | "FAILED"; detail?: string; at?: number }

export function ExecutionTimeline({ steps }: { steps: TraceStep[] }) {
  return (
    <div className="space-y-0">
      {steps.map((s, i) => (
        <div key={s.name} className="relative flex gap-3 pb-4 last:pb-0">
          {i < steps.length - 1 && <div className="absolute left-[7px] top-5 h-full w-px bg-hairline" />}
          <span
            className={`relative mt-1 h-[15px] w-[15px] shrink-0 rounded-full border-2 ${
              s.state === "DONE" ? "border-pos bg-pos/25" :
              s.state === "ACTIVE" ? "border-warn bg-warn/25 qe-pulse-dot" :
              s.state === "FAILED" ? "border-neg bg-neg/25" : "border-hairline bg-panel-2"
            }`}
          />
          <div className="min-w-0">
            <p className={`text-xs font-semibold ${s.state === "PENDING" ? "text-muted-foreground" : "text-foreground/90"}`}>{s.name}</p>
            {s.detail && <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{s.detail}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Mini regime strip for landing (real sparkline strip) ─────────────────────

export function useRegimeColor(primary: string): string {
  return useMemo(() => REGIME_COLORS[primary] ?? "#8b93a7", [primary]);
}
