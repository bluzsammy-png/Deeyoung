// QUANTEDGE PRO — Technical indicators (pure functions, no look-ahead)
// All functions operate on arrays ordered oldest → newest and only use data ≤ index i.

export interface Bar { t: number; o: number; h: number; l: number; c: number; v: number }

export function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values: number[], period: number): (number | null)[] {
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

export function rsi(values: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length <= period) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  gain /= period; loss /= period;
  out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

export function macd(values: number[], fast = 12, slow = 26, signalP = 9) {
  const emaFast = ema(values, fast);
  const emaSlow = ema(values, slow);
  const macdLine: (number | null)[] = values.map((_, i) =>
    emaFast[i] != null && emaSlow[i] != null ? (emaFast[i] as number) - (emaSlow[i] as number) : null
  );
  const defined = macdLine.filter((v) => v != null) as number[];
  const signalDefined = ema(defined, signalP);
  const signalLine: (number | null)[] = new Array(values.length).fill(null);
  let j = 0;
  for (let i = 0; i < values.length; i++) {
    if (macdLine[i] != null) {
      signalLine[i] = signalDefined[j] ?? null;
      j++;
    }
  }
  const histogram: (number | null)[] = values.map((_, i) =>
    macdLine[i] != null && signalLine[i] != null ? (macdLine[i] as number) - (signalLine[i] as number) : null
  );
  return { macdLine, signalLine, histogram };
}

export function bollinger(values: number[], period = 20, mult = 2) {
  const mid = sma(values, period);
  const upper: (number | null)[] = new Array(values.length).fill(null);
  const lower: (number | null)[] = new Array(values.length).fill(null);
  const widthPct: (number | null)[] = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    const slice = values.slice(i - period + 1, i + 1);
    const m = mid[i] as number;
    const variance = slice.reduce((a, b) => a + (b - m) ** 2, 0) / period;
    const sd = Math.sqrt(variance);
    upper[i] = m + mult * sd;
    lower[i] = m - mult * sd;
    widthPct[i] = ((upper[i] as number) - (lower[i] as number)) / m * 100;
  }
  return { mid, upper, lower, widthPct };
}

/** Intraday VWAP — session-anchored; caller passes the session start index. */
export function vwap(bars: Bar[], startIdx = 0): (number | null)[] {
  const out: (number | null)[] = new Array(bars.length).fill(null);
  let cumPV = 0, cumV = 0;
  for (let i = startIdx; i < bars.length; i++) {
    const tp = (bars[i].h + bars[i].l + bars[i].c) / 3;
    cumPV += tp * bars[i].v;
    cumV += bars[i].v;
    out[i] = cumV > 0 ? cumPV / cumV : null;
  }
  return out;
}

export function atr(bars: Bar[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(bars.length).fill(null);
  if (bars.length < period + 1) return out;
  const trs: number[] = [0];
  for (let i = 1; i < bars.length; i++) {
    trs.push(Math.max(
      bars[i].h - bars[i].l,
      Math.abs(bars[i].h - bars[i - 1].c),
      Math.abs(bars[i].l - bars[i - 1].c)
    ));
  }
  let prev = trs.slice(1, period + 1).reduce((a, b) => a + b, 0) / period;
  out[period] = prev;
  for (let i = period + 1; i < bars.length; i++) {
    prev = (prev * (period - 1) + trs[i]) / period;
    out[i] = prev;
  }
  return out;
}

export function roc(values: number[], period = 10): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  for (let i = period; i < values.length; i++) {
    if (values[i - period] !== 0) out[i] = (values[i] - values[i - period]) / values[i - period] * 100;
  }
  return out;
}

/** Relative volume = current cumulative volume vs expected at session fraction. */
export function relativeVolume(dayVolume: number, avgVolume: number, sessionFraction = 1): number {
  if (avgVolume <= 0 || sessionFraction <= 0) return 1;
  const expected = avgVolume * sessionFraction;
  return dayVolume / expected;
}

/** Realized volatility (annualized, from daily closes) in %. */
export function realizedVolPct(values: number[], lookback = 30): number | null {
  if (values.length < lookback + 1) return null;
  const rets: number[] = [];
  for (let i = values.length - lookback; i < values.length; i++) {
    rets.push(values[i] / values[i - 1] - 1);
  }
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, r) => a + (r - mean) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(variance * 252) * 100;
}

export function pctChange(a: number, b: number): number {
  if (b === 0) return 0;
  return (a - b) / b * 100;
}

/** Pearson correlation of two return series. */
export function correlation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 5) return 0;
  const ra = a.slice(-n), rb = b.slice(-n);
  const ma = ra.reduce((x, y) => x + y, 0) / n;
  const mb = rb.reduce((x, y) => x + y, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    num += (ra[i] - ma) * (rb[i] - mb);
    da += (ra[i] - ma) ** 2;
    db += (rb[i] - mb) ** 2;
  }
  const den = Math.sqrt(da * db);
  return den === 0 ? 0 : Math.max(-1, Math.min(1, num / den));
}

export function last<T>(arr: T[]): T | undefined {
  return arr.length ? arr[arr.length - 1] : undefined;
}

export function lastDefined(arr: (number | null)[]): number | null {
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null) return arr[i];
  return null;
}
