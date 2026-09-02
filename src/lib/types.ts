// QUANTEDGE PRO — Shared domain types
// One product, two brains: Analytics (primary) + SENTINEL (optional action layer). §2–§5

export type DataState = "LIVE" | "DELAYED" | "STALE" | "SIMULATED" | "UNAVAILABLE";

export interface Quote {
  symbol: string;
  name: string;
  assetClass: "EQUITY" | "ETF" | "CRYPTO";
  sector: string;
  price: number;
  change: number;        // absolute vs prior close
  changePct: number;
  open: number;
  dayHigh: number;
  dayLow: number;
  prevClose: number;
  volume: number;
  avgVolume: number;     // 3-month average, for relative volume
  marketCap?: number;
  currency: string;
  exchange: string;
  marketState: "REGULAR" | "PRE" | "POST" | "CLOSED";
  asOf: number;          // epoch ms of last trade
  dataState: DataState;  // honesty badge (§50)
  provider: string;
}

export interface Candle {
  t: number;   // epoch ms
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface CandleSeries {
  symbol: string;
  timeframe: string;
  candles: Candle[];
  dataState: DataState;
  provider: string;
  asOf: number;
}

// ─── Signals (§14) ────────────────────────────────────────────────────────────

export type SignalDirection = "LONG" | "SHORT" | "NEUTRAL";

export interface FactorContribution {
  name: string;
  key: string;
  contribution: number; // signed: + bullish / − bearish
  max: number;
  detail: string;
}

export interface SignalResult {
  symbol: string;
  direction: SignalDirection;
  score: number;              // 0–100 absolute conviction
  factors: FactorContribution[];
  entry: number;
  stop: number;
  target: number;
  rr: number;
  atr: number;
  regime: string;
  catalystScore: number;      // 0–9
  liquidityOk: boolean;
  spreadBps: number;
  generatedAt: number;
  dataState: DataState;
  explanation: string;        // plain-language WHY (§6: understand → investigate)
}

// ─── Regime (§13) ─────────────────────────────────────────────────────────────

export interface RegimeState {
  primary: string;      // RISK_ON | RISK_OFF | HIGH_VOLATILITY | LOW_VOLATILITY | SIDEWAYS | MOMENTUM | MEAN_REVERSION | EVENT_DRIVEN | LIQUIDITY_STRESS
  label: string;        // display
  confidence: number;   // 0–100
  drivers: { name: string; value: string; leaning: "BULL" | "BEAR" | "NEUTRAL" }[];
  explanation: string;  // "Why is this regime active?" (§13)
  influences: {
    signalThresholdDelta: number;
    positionSizingMultiplier: number;
    tradeFrequency: string;
    stopDistanceMultiplier: number;
  };
  asOf: number;
}

// ─── Risk Engine (deterministic — AI may NEVER bypass) (§5, §16) ─────────────

export interface RiskCheck {
  name: string;
  pass: boolean;
  detail: string;
}

export interface RiskVerdict {
  pass: boolean;
  checks: RiskCheck[];
  positionQty: number;     // risk-based sizing
  riskUsd: number;
  notionalUsd: number;
}

// ─── Catalysts (§11, §12) ─────────────────────────────────────────────────────

export type CatalystCategory =
  | "EARNINGS" | "GUIDANCE" | "ANALYST_UPGRADE" | "ANALYST_DOWNGRADE" | "SEC_FILING"
  | "INSIDER" | "MA" | "CONTRACT" | "PRODUCT" | "REGULATORY" | "LAWSUIT"
  | "MANAGEMENT" | "MACRO" | "ECONOMIC_RELEASE" | "UNUSUAL_VOLUME" | "SECTOR" | "CRYPTO";

export interface Catalyst {
  id: string;
  headline: string;
  source: string;
  url: string;
  publishedAt: number;
  category: CatalystCategory | "NEWS";
  sentiment: "POSITIVE" | "NEGATIVE" | "NEUTRAL";
  relevance: number;      // 0–1
  strength: number;       // 0–9 catalyst strength
  tickers: string[];
}

// ─── SENTINEL ─────────────────────────────────────────────────────────────────

export type SentinelMode = "OBSERVE" | "APPROVE" | "DELEGATE";

export type SentinelState =
  | "ACTIVE" | "PAUSED" | "WAITING_FOR_APPROVAL" | "RISK_LOCKED"
  | "BROKER_DISCONNECTED" | "DATA_UNAVAILABLE" | "NEWS_PROVIDER_UNAVAILABLE"
  | "SYSTEM_DEGRADED" | "EMERGENCY_STOP";

export interface SentinelTickResult {
  scanned: number;
  signalsFound: number;
  proposalsCreated: number;
  executed: number;
  state: SentinelState;
  notes: string[];
}

// ─── Portfolio Intelligence (§15) ─────────────────────────────────────────────

export interface PortfolioPositionView {
  symbol: string;
  name: string;
  sector: string;
  qty: number;
  avgPrice: number;
  lastPrice: number;
  marketValue: number;
  unrealizedPnl: number;
  unrealizedPct: number;
  weightPct: number;
  riskUsd: number;         // mark-to-stop
  dataState: DataState;
}

export interface PortfolioIntelligence {
  equity: number;
  cash: number;
  investedValue: number;
  totalPnl: number;
  totalPnlPct: number;
  dayPnl: number;
  dayPnlPct: number;
  positions: PortfolioPositionView[];
  allocation: { sector: string; value: number; pct: number }[];
  longExposurePct: number;
  concentrationHHI: number;
  portfolioVolatilityPct: number;
  maxDrawdownPct: number;
  topContributors: { symbol: string; pnl: number }[];
  topDetractors: { symbol: string; pnl: number }[];
  warnings: string[];      // e.g. semiconductor concentration (§15)
  scenarios: { name: string; impactUsd: number; impactPct: number }[];
  correlation?: { symbols: string[]; matrix: number[][] };
}

// ─── Backtesting (§21) ────────────────────────────────────────────────────────

export interface BacktestMetrics {
  totalReturnPct: number;
  cagrPct: number;
  maxDrawdownPct: number;
  sharpe: number;
  sortino: number;
  winRatePct: number;
  avgWinPct: number;
  avgLossPct: number;
  largestWinPct: number;
  largestLossPct: number;
  profitFactor: number;
  expectancyPct: number;
  numTrades: number;
  exposurePct: number;
  benchmarkReturnPct: number;
  alphaPct: number;
}

// ─── News Provider (§11) ──────────────────────────────────────────────────────

export interface NewsEnvelope {
  state: "OK" | "NEWS_DATA_UNAVAILABLE"; // never fabricate (§11, §43)
  catalysts: Catalyst[];
  provider: string;
  asOf: number;
  message?: string;
  byokConfigured: boolean;
}
