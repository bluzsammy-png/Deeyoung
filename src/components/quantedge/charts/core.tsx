"use client";

// DEEYOUNG PRO — Core chart graphics (custom SVG, product-native §37)
// Graphics 2.0: gradient candle bodies, last-price glow tag on the axis,
// full crosshair with price/time tags, gradient volume, animated overlays,
// drawn-in equity curve. Still pure SVG — no chart libraries.

import { useMemo, useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import type { Candle } from "@/lib/types";

const POS = "#10b981";
const NEG = "#f6465d";

// ─── Sparkline ────────────────────────────────────────────────────────────────

export function Sparkline({
  data, width = 96, height = 32, color, strokeWidth = 1.5, fill = true, glow = false,
}: {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  strokeWidth?: number;
  fill?: boolean;
  glow?: boolean;
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
          <stop offset="0%" stopColor={c} stopOpacity="0.24" />
          <stop offset="100%" stopColor={c} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <path d={area} fill={`url(#${gid})`} />}
      <path
        d={path} fill="none" stroke={c} strokeWidth={strokeWidth}
        strokeLinejoin="round" strokeLinecap="round"
        style={glow ? { filter: `drop-shadow(0 0 4px ${c}88)` } : undefined}
      />
      {/* end-point dot */}
      <circle
        cx={width} cy={(height - ((data[data.length - 1] - Math.min(...data)) / (Math.max(...data) - Math.min(...data) || 1)) * (height - 4) - 2)}
        r={1.8} fill={c}
        style={glow ? { filter: `drop-shadow(0 0 3px ${c})` } : undefined}
      />
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
  const padR = 64;          // right price axis
  const axisH = 20;         // bottom time axis
  const volH = showVolume ? 54 : 0;
  const topPad = 10;
  const chartH = H - topPad - axisH - volH - (volH ? 6 : 4);

  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
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
    const y = (v: number) => topPad + (1 - (v - yMin) / (yMax - yMin)) * chartH;
    const x = (i: number) => 8 + i * step + step / 2;
    const maxVol = Math.max(...candles.map((c) => c.v), 1);
    const intraday = candles[1].t - candles[0].t < 86_400_000;
    return { candles, ema20, ema50, vwapArr, yMin, yMax, step, x, y, innerW, maxVol, closes, intraday };
  }, [candles, chartH, showEMA, showVWAP]);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const px = ((e.clientX - rect.left) / rect.width) * W;
      const py = ((e.clientY - rect.top) / rect.height) * H;
      if (!model) return;
      const i = Math.floor((px - 8) / model.step);
      if (i >= 0 && i < model.candles.length) setHover({ i, x: px, y: py });
      else setHover(null);
    };
    const onLeave = () => setHover(null);
    el.addEventListener("mousemove", onMove);
    el.addEventListener("mouseleave", onLeave);
    return () => {
      el.removeEventListener("mousemove", onMove);
      el.removeEventListener("mouseleave", onLeave);
    };
  }, [model, H]);

  if (!model || !model.candles.length) return <div className="h-64 animate-pulse rounded-xl bg-panel-2" />;

  const { x, y, step } = model;
  const lastCandle = model.candles[model.candles.length - 1];
  const up = lastCandle.c >= lastCandle.o;
  const hc = hover ? model.candles[hover.i] : null;

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
  const fmtAxis = (v: number) => (v >= 100 ? v.toFixed(1) : v.toFixed(2));
  const fmtTime = (t: number) =>
    model.intraday
      ? new Date(t).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })
      : new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });

  // time axis ticks
  const tickCount = Math.min(6, model.candles.length);
  const tickIdx = Array.from({ length: tickCount }, (_, k) =>
    Math.round((k * (model.candles.length - 1)) / Math.max(1, tickCount - 1)),
  );

  const priceTag = (v: number, col: string, solid = true) => (
    <g>
      <rect x={W - padR + 2} y={y(v) - 8.5} width={padR - 6} height={17} rx={4}
        fill={solid ? col : "rgba(12,15,21,0.9)"} stroke={solid ? "none" : col} strokeWidth={1} />
      <text x={W - padR + 2 + (padR - 6) / 2} y={y(v) + 3.5} fontSize={10.5} textAnchor="middle"
        fill={solid ? "#04110c" : col} className="qe-num" fontWeight={600}>
        {fmtAxis(v)}
      </text>
    </g>
  );

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
          <linearGradient id={`${gid}-area`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={up ? POS : NEG} stopOpacity="0.16" />
            <stop offset="100%" stopColor={up ? POS : NEG} stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`${gid}-cup`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#34d399" />
            <stop offset="100%" stopColor={POS} />
          </linearGradient>
          <linearGradient id={`${gid}-cdn`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={NEG} />
            <stop offset="100%" stopColor="#fb7185" />
          </linearGradient>
          <linearGradient id={`${gid}-vup`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={POS} stopOpacity="0.45" />
            <stop offset="100%" stopColor={POS} stopOpacity="0.12" />
          </linearGradient>
          <linearGradient id={`${gid}-vdn`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={NEG} stopOpacity="0.45" />
            <stop offset="100%" stopColor={NEG} stopOpacity="0.12" />
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
                {fmtAxis(v)}
              </text>
            </g>
          );
        })}

        {/* area under close */}
        <path
          d={`M${model.candles.map((c, i) => `${x(i).toFixed(1)},${y(c.c).toFixed(1)}`).join(" L")} L${x(model.candles.length - 1).toFixed(1)},${(chartH + topPad)} L${x(0).toFixed(1)},${chartH + topPad} Z`}
          fill={`url(#${gid}-area)`}
        />

        {/* candles */}
        <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
          {model.candles.map((c, i) => {
            const isUp = c.c >= c.o;
            const cx = x(i);
            const bw = Math.max(1.2, step * 0.62);
            const yO = y(c.o), yC = y(c.c);
            const top = Math.min(yO, yC);
            const h = Math.max(1, Math.abs(yC - yO));
            const isLast = i === model.candles.length - 1;
            return (
              <g key={i} opacity={hover && hover.i !== i ? 0.72 : 1}>
                <line x1={cx} x2={cx} y1={y(c.h)} y2={y(c.l)} stroke={isUp ? POS : NEG} strokeWidth={Math.max(0.8, step * 0.1)} />
                <rect
                  x={cx - bw / 2} y={top} width={bw} height={h}
                  fill={`url(#${gid}-${isUp ? "cup" : "cdn"})`}
                  stroke={isUp ? POS : NEG} strokeWidth={Math.min(0.8, bw / 4)}
                  rx={bw > 3 ? 1 : 0}
                  style={isLast ? { filter: `drop-shadow(0 0 6px ${isUp ? POS : NEG}aa)` } : undefined}
                />
              </g>
            );
          })}
        </motion.g>

        {/* last price line + axis tag */}
        <line
          x1={8} x2={W - padR} y1={y(lastCandle.c)} y2={y(lastCandle.c)}
          stroke={up ? POS : NEG} strokeWidth={1} strokeDasharray="3 4" opacity={0.65}
          style={{ filter: `drop-shadow(0 0 4px ${up ? POS : NEG}66)` }}
        />
        {priceTag(lastCandle.c, up ? POS : NEG)}

        {/* EMA / VWAP overlays — drawn in */}
        {showEMA && (
          <>
            <motion.path
              d={emaPath(model.ema20)} fill="none" stroke="#f0b90b" strokeWidth={1.4} opacity={0.85}
              strokeLinecap="round"
              initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, ease: "easeOut" }}
            />
            <motion.path
              d={emaPath(model.ema50)} fill="none" stroke="#8b93a7" strokeWidth={1.4} opacity={0.7}
              strokeLinecap="round"
              initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.1, ease: "easeOut" }}
            />
          </>
        )}
        {showVWAP && model.vwapArr.length > 0 && (
          <path d={emaPath(model.vwapArr)} fill="none" stroke="#a78bfa" strokeWidth={1.3} strokeDasharray="5 4" opacity={0.8} />
        )}

        {/* volume — gradient bars */}
        {showVolume && (
          <g>
            {model.candles.map((c, i) => {
              const isUp = c.c >= c.o;
              const vh = Math.max(1, (c.v / model.maxVol) * volH);
              const bw = Math.max(1.2, step * 0.62);
              return (
                <rect
                  key={i}
                  x={x(i) - bw / 2}
                  y={H - axisH - vh}
                  width={bw}
                  height={vh}
                  fill={`url(#${gid}-${isUp ? "vup" : "vdn"})`}
                  rx={bw > 3 ? 1 : 0}
                />
              );
            })}
          </g>
        )}

        {/* time axis */}
        {tickIdx.map((i) => (
          <text
            key={i} x={x(i)} y={H - 6} fontSize={10}
            textAnchor={i === 0 ? "start" : i === model.candles.length - 1 ? "end" : "middle"}
            fill="currentColor" className="fill-muted-foreground qe-num" opacity={0.85}
          >
            {fmtTime(model.candles[i].t)}
          </text>
        ))}

        {/* crosshair */}
        {hc && (
          <g>
            <line x1={x(hover!.i)} x2={x(hover!.i)} y1={topPad} y2={H - axisH} stroke="currentColor" className="text-muted-foreground" strokeWidth={1} strokeDasharray="4 4" opacity={0.5} />
            {hover!.y > topPad && hover!.y < chartH + topPad && (
              <line x1={8} x2={W - padR} y1={hover!.y} y2={hover!.y} stroke="currentColor" className="text-muted-foreground" strokeWidth={1} strokeDasharray="4 4" opacity={0.35} />
            )}
            <circle cx={x(hover!.i)} cy={y(hc.c)} r={3.2} fill={hc.c >= hc.o ? POS : NEG} stroke="#07090d" strokeWidth={1.5} />
            {/* crosshair time tag */}
            <rect
              x={Math.min(Math.max(x(hover!.i) - 30, 4), W - padR - 62)}
              y={H - axisH + 2} width={62} height={16} rx={4} fill="rgba(12,15,21,0.92)" stroke="rgba(148,163,184,0.3)" strokeWidth={1}
            />
            <text
              x={Math.min(Math.max(x(hover!.i), 35), W - padR - 31)}
              y={H - axisH + 13.5} fontSize={9.5} textAnchor="middle" fill="#e6e9ef" className="qe-num"
            >
              {fmtTime(hc.t)}
            </text>
          </g>
        )}
      </svg>

      {/* crosshair price tag on the axis */}
      {hc && hover!.y > topPad && hover!.y < chartH + topPad && (
        <div
          className="pointer-events-none absolute z-10"
          style={{
            top: `${(hover!.y / H) * 100}%`,
            right: 0,
            transform: "translateY(-50%)",
          }}
        >
          <div className="qe-num rounded-md border border-hairline bg-[#0c0f15ee] px-1.5 py-0.5 text-[10.5px] font-semibold text-foreground shadow-xl">
            {fmtAxis(model.yMin + (1 - (hover!.y - topPad) / chartH) * (model.yMax - model.yMin))}
          </div>
        </div>
      )}

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
          <stop offset="0%" stopColor={col} stopOpacity="0.20" />
          <stop offset="100%" stopColor={col} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#eq-fill)" />
      <motion.path
        d={line} fill="none" stroke={col} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round"
        style={{ filter: `drop-shadow(0 0 6px ${col}66)` }}
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
      />
      {benchLine && <path d={benchLine} fill="none" stroke="#8b93a7" strokeWidth={1.2} strokeDasharray="5 5" opacity={0.55} />}
      {/* last point marker */}
      <motion.circle
        cx={x(data.length - 1)} cy={y(eqs[eqs.length - 1])} r={4} fill={col}
        initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 1.2, duration: 0.4 }}
        style={{ transformOrigin: `${x(data.length - 1)}px ${y(eqs[eqs.length - 1])}px`, filter: `drop-shadow(0 0 5px ${col})` }}
      >
        <animate attributeName="r" values="3;5;3" dur="2s" repeatCount="indefinite" />
      </motion.circle>
      <text x={W - 6} y={y(eqs[0]) - 6} fontSize={10} textAnchor="end" fill="#8b93a7" className="qe-num">start</text>
    </svg>
  );
}
