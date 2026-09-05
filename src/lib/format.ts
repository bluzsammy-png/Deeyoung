// DEEYOUNG PRO — display formatters (tabular, institutional)

export function fmtPrice(v: number | null | undefined, currency = "USD"): string {
  if (v == null || !Number.isFinite(v)) return "-";
  const digits = v >= 1000 ? 2 : v >= 1 ? 2 : 4;
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

export function fmtNum(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return "-";
  return v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtPct(v: number | null | undefined, digits = 2, signed = true): string {
  if (v == null || !Number.isFinite(v)) return "-";
  const s = v > 0 && signed ? "+" : "";
  return `${s}${v.toFixed(digits)}%`;
}

export function fmtMoney(v: number | null | undefined, digits = 0, signed = false): string {
  if (v == null || !Number.isFinite(v)) return "-";
  const s = v > 0 && signed ? "+" : v < 0 ? "−" : "";
  return `${s}$${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

export function fmtCompact(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "-";
  const abs = Math.abs(v);
  if (abs >= 1e12) return `${(v / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return v.toFixed(0);
}

export function fmtTime(ts: number | string | Date): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function fmtDateTime(ts: number | string | Date): string {
  const d = new Date(ts);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

export function fmtAgo(ts: number | string | Date): string {
  const ms = Date.now() - new Date(ts).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function dirColor(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v) || v === 0) return "text-muted-foreground";
  return v > 0 ? "text-pos" : "text-neg";
}

// ─── Instrument-aware price formatting ────────────────────────────────────────
// FX majors quote as rates (1.1592 / 158.702), not dollar values — "$1.1592" is
// misleading. Everything else keeps the dollar prefix.

const FX_RATE_SYMBOLS = new Set(["EURUSD", "GBPUSD", "AUDUSD", "USDCHF", "USDCAD", "NZDUSD"]);
const JPY_RATE_SYMBOLS = new Set(["USDJPY", "EURJPY", "GBPJPY"]);

export function isFxRateSymbol(symbol: string): boolean {
  return FX_RATE_SYMBOLS.has(symbol) || JPY_RATE_SYMBOLS.has(symbol);
}

/** Formats a price for the instrument's convention: FX rates lose the "$" and
 *  use pip-precision digits; gold/equities stay dollar-formatted. */
export function fmtInstrument(v: number | null | undefined, symbol = ""): string {
  if (v == null || !Number.isFinite(v)) return "-";
  if (JPY_RATE_SYMBOLS.has(symbol)) {
    return v.toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  }
  if (FX_RATE_SYMBOLS.has(symbol)) {
    return v.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  }
  return fmtPrice(v);
}
