"use client";

// QUANTEDGE PRO — Core chart graphics (custom SVG, product-native §37)
// CandleChart with EMA/VWAP overlays + volume, Sparkline, EquityCurve.

import { useMemo, useState, useRef, useEffect } from "react";
import type { Candle } from "@/lib/types";

const POS = "#10b981";
const NEG = "#f6465d";

// ─── Sparkline ────────────────────────────────────────────────────────────────

export function Sparkline({
  data, width = 96, height = 32, color, strokeWidth = 1.5, fill = true,
}: {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  strokeWidth?: number;
  fill?: boolean;
}) {
  const { path, area, c } = useMemo(() => {
    if (!data.length) return { path: "", area: "", c: POS };
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const step = width / Math.max(1, data.length - 1);
    const pts = data.map((v, i) => `${(i * step).toFixed(2)},${(height - ((v - min) / range) * (height - 4) - 2).toFixed(2)}`);
    const p = `M${pts.join(" L")}`;
    const col = color ?? (data[data.length - 1] >= data[0] ? POS : NEG);
    return { path: p, area: `${p} L${width},${height} L0,${height} Z`, c: col };
  }, [data, width, height, color]);

  const gid = useMemo(() => `sp-${Math.random().toString(36).slice(2, 8)}`, []);
  if (!path) return <svg width={width} height={height} />;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={c} stopOpacity="0.22" />
          <stop offset="100%" stopColor={c} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <path d={area} fill={`url(#${gid})`} />}
      <path d={path} fill="none" stroke={c} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// ─── Candlestick chart ────────────────────────────────────────────────────────

interface CandleChartProps {
  candles: Candle[];
  height?: number;
  showVolume?: boolean;
  showEMA?: boolean;
  showVWAP?: boolean;
  dataState?: string;
}

function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function CandleChart({
  candles, height = 380, showVolume = true, showEMA = true, showVWAP = false,
}: CandleChartProps) {
  const W = 1000;
  const H = height;
  const padR = 64;
  const padB = showVolume ? 74 : 26;
  const volH = showVolume ? 64 : 0;
  const chartH = H - padB - 8;

  const [hover, setHover] = useState<{ i: number; x: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const gid = useMemo(() => `cc-${Math.random().toString(36).slice(2, 8)}`, []);

  const model = useMemo(() => {
    if (candles.length < 2) return null;
    const closes = candles.map((c) => c.c);
    const ema20 = showEMA ? ema(closes, 20) : [];
    const ema50 = showEMA ? ema(closes, 50) : [];
    // session VWAP for intraday
    const vwapArr: (number | null)[] = [];
    if (showVWAP) {
      let cumPV = 0, cumV = 0;
      for (const c of candles) {
        const tp = (c.h + c.l + c.c) / 3;
        cumPV += tp * c.v; cumV += c.v;
        vwapArr.push(cumV > 0 ? cumPV / cumV : null);
      }
    }
    const lows = Math.min(...candles.map((c) => c.l));
    const highs = Math.max(...candles.map((c) => c.h));
    const pad = (highs - lows) * 0.06;
    const yMin = lows - pad;
    const yMax = highs + pad;
    const innerW = W - padR - 8;
    const step = innerW / candles.length;
    const y = (v: number) => 8 + (1 - (v - yMin) / (yMax - yMin)) * chartH;
    const x = (i: number) => 8 + i * step + step / 2;
    const maxVol = Math.max(...candles.map((c) => c.v), 1);
    return { candles, ema20, ema50, vwapArr, yMin, yMax, step, x, y, innerW, maxVol, closes };
  }, [candles, chartH, showEMA, showVWAP]);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const px = ((e.clientX - rect.left) / rect.width) * W;
      if (!model) return;
      const i = Math.floor((px - 8) / model.step);
      if (i >= 0 && i < model.candles.length) setHover({ i, x: px });
      else setHover(null);
    };
    const onLeave = () => setHover(null);
    el.addEventListener("mousemove", onMove);
    el.addEventListener("mouseleave", onLeave);
    return () => {
      el.removeEventListener("mousemove", onMove);
      el.removeEventListener("mouseleave", onLeave);
    };
  }, [model]);

  if (!model) return <div className="h-64 animate-pulse rounded-xl bg-panel-2" />;

  const { x, y, step } = model;
  const lastCandle = candles[candles.length - 1];
  const up = lastCandle.c >= lastCandle.o;
  const hc = hover ? candles[hover.i] : null;

  const emaPath = (arr: (number | null)[]) => {
    let d = "";
    let started = false;
    arr.forEach((v, i) => {
      if (v == null) return;
      d += `${started ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
      started = true;
    });
    return d;
  };

  const gridLines = 5;

  return (
    <div className="relative w-full">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full select-none"
        style={{ height }}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={up ? POS : NEG} stopOpacity="0.14" />
            <stop offset="100%" stopColor={up ? POS : NEG} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* horizontal grid + right price axis */}
        {Array.from({ length: gridLines + 1 }).map((_, gi) => {
          const v = model.yMin + ((model.yMax - model.yMin) / gridLines) * gi;
          const yy = y(v);
          return (
            <g key={gi}>
              <line x1={8} x2={W - padR} y1={yy} y2={yy} stroke="currentColor" className="text-hairline" strokeWidth={1} />
              <text x={W - padR + 8} y={yy + 4} fontSize={11} fill="currentColor" className="fill-muted-foreground qe-num">
                {v >= 100 ? v.toFixed(1) : v.toFixed(2)}
              </text>
            </g>
          );
        })}

        {/* area under close */}
        <path
          d={`M${candles.map((c, i) => `${x(i).toFixed(1)},${y(c.c).toFixed(1)}`).join(" L")} L${x(candles.length - 1).toFixed(1)},${(chartH + 8)} L${x(0).toFixed(1)},${chartH + 8} Z`}
          fill={`url(#${gid})`}
        />

        {/* candles */}
        {candles.map((c, i) => {
          const isUp = c.c >= c.o;
          const col = isUp ? POS : NEG;
          const cx = x(i);
          const bw = Math.max(1.2, step * 0.62);
          const yO = y(c.o), yC = y(c.c);
          const top = Math.min(yO, yC);
          const h = Math.max(1, Math.abs(yC - yO));
          const isLast = i === candles.length - 1;
          return (
            <g key={i} opacity={hover && hover.i !== i ? 0.75 : 1}>
              <line x1={cx} x2={cx} y1={y(c.h)} y2={y(c.l)} stroke={col} strokeWidth={Math.max(0.8, step * 0.1)} />
              <rect x={cx - bw / 2} y={top} width={bw} height={h} fill={col} rx={bw > 3 ? 1 : 0} />
              {isLast && (
                <line
                  x1={8} x2={W - padR} y1={yC} y2={yC}
                  stroke={col} strokeWidth={1} strokeDasharray="3 4" opacity={0.6}
                />
              )}
            </g>
          );
        })}

        {/* EMA overlays */}
        {showEMA && (
          <>
            <path d={emaPath(model.ema20)} fill="none" stroke="#f0b90b" strokeWidth={1.4} opacity={0.85} />
            <path d={emaPath(model.ema50)} fill="none" stroke="#8b93a7" strokeWidth={1.4} opacity={0.7} />
          </>
        )}
        {showVWAP && model.vwapArr.length > 0 && (
          <path d={emaPath(model.vwapArr)} fill="none" stroke="#a78bfa" strokeWidth={1.3} strokeDasharray="5 4" opacity={0.8} />
        )}

        {/* volume */}
        {showVolume && (
          <g>
            {candles.map((c, i) => {
              const isUp = c.c >= c.o;
              const vh = (c.v / model.maxVol) * volH;
              const bw = Math.max(1.2, step * 0.62);
              return (
                <rect
                  key={i}
                  x={x(i) - bw / 2}
                  y={H - 20 - vh}
                  width={bw}
                  height={vh}
                  fill={isUp ? POS : NEG}
                  opacity={0.35}
                  rx={bw > 3 ? 1 : 0}
                />
              );
            })}
          </g>
        )}

        {/* crosshair */}
        {hc && (
          <g>
            <line x1={x(hover!.i)} x2={x(hover!.i)} y1={8} y2={H - 20} stroke="currentColor" className="text-muted-foreground" strokeWidth={1} strokeDasharray="4 4" opacity={0.5} />
            <circle cx={x(hover!.i)} cy={y(hc.c)} r={3.2} fill={hc.c >= hc.o ? POS : NEG} stroke="#07090d" strokeWidth={1.5} />
          </g>
        )}
      </svg>

      {/* crosshair tooltip */}
      {hc && (
        <div
          className="qe-glass pointer-events-none absolute top-3 z-10 rounded-lg px-3 py-2 text-xs shadow-xl"
          style={{
            left: `min(max(4px, ${(hover!.x / W) * 100}% - 60px), calc(100% - 132px))`,
          }}
        >
          <div className="qe-num grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
            <span className="text-muted-foreground">O</span><span>{hc.o.toFixed(2)}</span>
            <span className="text-muted-foreground">H</span><span className="text-pos">{hc.h.toFixed(2)}</span>
            <span className="text-muted-foreground">L</span><span className="text-neg">{hc.l.toFixed(2)}</span>
            <span className="text-muted-foreground">C</span><span className={hc.c >= hc.o ? "text-pos" : "text-neg"}>{hc.c.toFixed(2)}</span>
            <span className="text-muted-foreground">Vol</span><span>{(hc.v / 1e6).toFixed(1)}M</span>
          </div>
        </div>
      )}

      {/* legend */}
      {showEMA && (
        <div className="absolute left-3 top-2 flex gap-3 text-[10px] font-medium">
          <span className="text-[#f0b90b]">EMA20</span>
          <span className="text-[#8b93a7]">EMA50</span>
          {showVWAP && <span className="text-[#a78bfa]">VWAP</span>}
        </div>
      )}
    </div>
  );
}

// ─── Equity curve with drawdown shading + benchmark ───────────────────────────

export function EquityCurve({
  data, height = 260, showBenchmark = true,
}: {
  data: { t: number; equity: number; benchmark: number }[];
  height?: number;
  showBenchmark?: boolean;
}) {
  const W = 1000;
  if (data.length < 2) return <div className="h-48 animate-pulse rounded-xl bg-panel-2" />;

  const eqs = data.map((d) => d.equity);
  const bench = data.map((d) => d.benchmark);
  const min = Math.min(...eqs, ...bench) * 0.995;
  const max = Math.max(...eqs, ...bench) * 1.005;
  const chartH = height - 28;
  const x = (i: number) => (i / (data.length - 1)) * (W - 8) + 4;
  const y = (v: number) => 8 + (1 - (v - min) / (max - min)) * chartH;

  const peak = eqs[0];
  const line = data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(d.equity).toFixed(1)}`).join(" ");
  const area = `${line} L${x(data.length - 1).toFixed(1)},${chartH + 8} L${x(0).toFixed(1)},${chartH + 8} Z`;
  const benchLine = showBenchmark
    ? data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(d.benchmark).toFixed(1)}`).join(" ")
    : "";
  const finalUp = eqs[eqs.length - 1] >= eqs[0];
  const col = finalUp ? POS : NEG;

  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="w-full" style={{ height }} preserveAspectRatio="none">
      <defs>
        <linearGradient id="eq-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={col} stopOpacity="0.18" />
          <stop offset="100%" stopColor={col} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#eq-fill)" />
      <path d={line} fill="none" stroke={col} strokeWidth={1.8} strokeLinejoin="round" />
      {benchLine && <path d={benchLine} fill="none" stroke="#8b93a7" strokeWidth={1.2} strokeDasharray="5 5" opacity={0.55} />}
      {/* last point marker */}
      <circle cx={x(data.length - 1)} cy={y(eqs[eqs.length - 1])} r={4} fill={col}>
        <animate attributeName="r" values="3;5;3" dur="2s" repeatCount="indefinite" />
      </circle>
      <text x={W - 6} y={y(eqs[0]) - 6} fontSize={10} textAnchor="end" fill="#8b93a7" className="qe-num">start</text>
    </svg>
  );
}
