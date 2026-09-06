package com.deeyoungs.pro.data

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

/*
 * DEEYOUNG PRO — API DTOs.
 * These mirror the server's JSON contracts (Next.js route handlers + better-auth).
 * Every non-essential field has a default so the client tolerates additive
 * server changes without breaking (ignoreUnknownKeys + defaults).
 */

// ── Engine (public audit surface: GET /api/engine/status) ────────────────────

@Serializable
data class EngineSnapshotDto(
    val engine: EngineInfoDto? = null,
    val account: EngineAccountDto? = null,
    val openPositions: List<EnginePositionDto> = emptyList(),
    val recentClosed: List<ClosedTradeDto> = emptyList(),
    val recentOrders: List<EngineOrderDto> = emptyList(),
    val books: Map<String, BookStatDto> = emptyMap(),
    val equityCurve: List<EquityPointDto> = emptyList(),
    val live: LiveInfoDto? = null,
    val decisions: List<DecisionDto> = emptyList(),
    val build: BuildInfoDto? = null,
)

@Serializable
data class EngineInfoDto(
    val runLabel: String? = null,
    val status: String? = null,
    val startedAt: String? = null,
    val elapsedHours: Double? = null,
    val executionModel: String? = null,
    val control: EngineControlDto? = null,
)

@Serializable
data class EngineControlDto(
    val paused: Boolean = false,
    val reason: String? = null,
    val updatedAt: String? = null,
)

@Serializable
data class EngineAccountDto(
    val startingUsd: Double = 0.0,
    val settledEquityUsd: Double = 0.0,
    val realizedPnlUsd: Double = 0.0,
    val feesUsd: Double = 0.0,
    val peakEquityUsd: Double = 0.0,
    val maxDrawdownPct: Double = 0.0,
    val dayKey: String? = null,
    val dayPnlR: Double = 0.0,
    val openCount: Int = 0,
    val closedCount: Int = 0,
    val winRatePct: Double? = null,
)

@Serializable
data class EnginePositionDto(
    val bookKey: String? = null,
    val symbol: String,
    val gate: Int? = null,
    val horizonMin: Int? = null,
    val side: String? = null,
    val qty: Double = 0.0,
    val entryPrice: Double = 0.0,
    val stop: Double? = null,
    val target: Double? = null,
    val score: Double? = null,
    val rr: Double? = null,
    val notionalUsd: Double? = null,
    val openedAt: String? = null,
    val factors: List<FactorDto> = emptyList(),
)

@Serializable
data class ClosedTradeDto(
    val bookKey: String? = null,
    val symbol: String,
    val gate: Int? = null,
    val horizonMin: Int? = null,
    val side: String? = null,
    val entryPrice: Double = 0.0,
    val exitPrice: Double? = null,
    val exitReason: String? = null,
    val grossPnlUsd: Double? = null,
    val netPnlUsd: Double? = null,
    val netR: Double? = null,
    val openedAt: String? = null,
    val closedAt: String? = null,
    val score: Double? = null,
    val factors: List<FactorDto> = emptyList(),
)

@Serializable
data class EngineOrderDto(
    val clientOid: String? = null,
    val bookKey: String? = null,
    val symbol: String,
    val side: String? = null,
    val kind: String? = null,
    val refPrice: Double? = null,
    val fillPrice: Double? = null,
    val slippageBps: Double? = null,
    val feeUsd: Double? = null,
    val qty: Double? = null,
    val status: String? = null,
    val createdAt: String? = null,
)

@Serializable
data class BookStatDto(
    val trades: Int = 0,
    val winRatePct: Double? = null,
    val netUsd: Double = 0.0,
    val netR: Double = 0.0,
)

@Serializable
data class EquityPointDto(val t: Long, val e: Double)

@Serializable
data class LiveInfoDto(
    val regimeUp: Boolean? = null,
    val regimeAt: Long? = null,
    val lastScanAt: Long? = null,
    val bestSinceBoot: Double? = null,
    val bestSymSinceBoot: String? = null,
    val crossSinceBoot: Map<String, Int> = emptyMap(),
    val cycles: Int? = null,
)

@Serializable
data class DecisionDto(
    val ts: Long,
    val sym: String,
    val horizon: String? = null,
    val score: Double? = null,
    val regimeUp: Boolean? = null,
    val catalyst: Double? = null,
    val aligned: Double? = null,
    val verdict: String? = null,
    val factors: List<FactorDto> = emptyList(),
)

@Serializable
data class BuildInfoDto(
    val sha: String? = null,
    val source: String? = null,
    val marker: String? = null,
)

@Serializable
data class FactorDto(
    val name: String? = null,
    val key: String? = null,
    val contribution: Double = 0.0,
    val max: Double? = null,
    val detail: String? = null,
)

// ── Markets ───────────────────────────────────────────────────────────────────

@Serializable
data class QuotesDto(
    val quotes: List<QuoteDto> = emptyList(),
    val provider: String? = null,
    val asOf: Long? = null,
)

@Serializable
data class QuoteDto(
    val symbol: String,
    val name: String = "",
    val assetClass: String = "EQUITY",
    val sector: String = "",
    val price: Double = 0.0,
    val change: Double = 0.0,
    val changePct: Double = 0.0,
    val open: Double? = null,
    val dayHigh: Double? = null,
    val dayLow: Double? = null,
    val prevClose: Double? = null,
    val volume: Double = 0.0,
    val avgVolume: Double = 0.0,
    val marketCap: Double? = null,
    val currency: String = "USD",
    val exchange: String = "",
    val marketState: String? = null,
    val asOf: Long? = null,
    val dataState: String = "LIVE",
    val provider: String = "",
)

@Serializable
data class SearchDto(
    val results: List<SearchHitDto> = emptyList(),
    val asOf: Long? = null,
)

@Serializable
data class SearchHitDto(
    val symbol: String,
    val name: String = "",
    val exchange: String = "",
    val assetClass: String = "EQUITY",
)

@Serializable
data class CandleSeriesDto(
    val symbol: String,
    val timeframe: String = "",
    val candles: List<CandleDto> = emptyList(),
    val dataState: String = "LIVE",
    val provider: String = "",
    val asOf: Long? = null,
)

@Serializable
data class CandleDto(val t: Long, val o: Double, val h: Double, val l: Double, val c: Double, val v: Double = 0.0)

// ── Signals ───────────────────────────────────────────────────────────────────

@Serializable
data class SignalsDto(
    val regime: RegimeDto? = null,
    val signals: List<SignalDto> = emptyList(),
    val account: SignalsAccountDto? = null,
    val sentinel: SentinelMiniDto? = null,
    val asOf: Long? = null,
)

@Serializable
data class RegimeDto(
    val primary: String = "",
    val label: String = "",
    val confidence: Double = 0.0,
    val explanation: String = "",
    val drivers: List<RegimeDriverDto> = emptyList(),
    val asOf: Long? = null,
)

@Serializable
data class RegimeDriverDto(
    val name: String = "",
    val value: String = "",
    val leaning: String = "NEUTRAL",
)

@Serializable
data class SignalDto(
    val symbol: String,
    val direction: String = "NEUTRAL",
    val score: Double = 0.0,
    val factors: List<FactorDto> = emptyList(),
    val entry: Double = 0.0,
    val stop: Double = 0.0,
    val target: Double = 0.0,
    val rr: Double = 0.0,
    val atr: Double? = null,
    val regime: String? = null,
    val catalystScore: Double? = null,
    val liquidityOk: Boolean? = null,
    val spreadBps: Double? = null,
    val generatedAt: Long? = null,
    val dataState: String? = null,
    val explanation: String? = null,
    val name: String? = null,
    val sector: String? = null,
    val lastPrice: Double? = null,
    val changePct: Double? = null,
)

@Serializable
data class SignalsAccountDto(
    val equity: Double = 0.0,
    val cash: Double = 0.0,
    val broker: String = "",
)

@Serializable
data class SentinelMiniDto(
    val mode: String? = null,
    val state: String? = null,
    val killSwitch: Boolean = false,
)

// ── Portfolio (GET /api/portfolio) ────────────────────────────────────────────

@Serializable
data class PortfolioDto(
    val intel: PortfolioIntelDto = PortfolioIntelDto(),
    val snap: List<EquitySnapDto> = emptyList(),
    val orders: List<UserOrderDto> = emptyList(),
)

@Serializable
data class EquitySnapDto(val t: Long, val equity: Double)

@Serializable
data class PortfolioIntelDto(
    val equity: Double? = null,
    val cash: Double? = null,
    val investedValue: Double? = null,
    val totalPnl: Double? = null,
    val totalPnlPct: Double? = null,
    val dayPnl: Double? = null,
    val dayPnlPct: Double? = null,
    val positions: List<PositionViewDto> = emptyList(),
    val longExposurePct: Double? = null,
    val concentrationHHI: Double? = null,
    val portfolioVolatilityPct: Double? = null,
    val maxDrawdownPct: Double? = null,
    val topContributors: List<ContributorDto> = emptyList(),
    val topDetractors: List<ContributorDto> = emptyList(),
    val warnings: List<String> = emptyList(),
    val scenarios: List<ScenarioDto> = emptyList(),
    val correlation: CorrelationDto? = null,
)

@Serializable
data class PositionViewDto(
    val symbol: String,
    val name: String? = null,
    val qty: Double? = null,
    val avgPrice: Double? = null,
    val lastPrice: Double? = null,
    val marketValue: Double? = null,
    val unrealizedPnl: Double? = null,
    val unrealizedPnlPct: Double? = null,
    val weightPct: Double? = null,
    val dayChangePct: Double? = null,
    val sector: String? = null,
)

@Serializable
data class ContributorDto(val symbol: String, val pnl: Double? = null)

@Serializable
data class ScenarioDto(
    val name: String,
    val impactUsd: Double? = null,
    val impactPct: Double? = null,
)

@Serializable
data class CorrelationDto(
    val symbols: List<String> = emptyList(),
    val matrix: List<List<Double>> = emptyList(),
)

@Serializable
data class UserOrderDto(
    val id: String? = null,
    val symbol: String,
    val side: String? = null,
    val type: String? = null,
    val qty: Double? = null,
    val status: String? = null,
    val filledQty: Double? = null,
    val avgFillPrice: Double? = null,
    val rejectReason: String? = null,
    val source: String? = null,
    val createdAt: String? = null,
)

// ── SENTINEL (GET /api/sentinel/state, POST /api/sentinel/config, /api/approvals) ──

@Serializable
data class SentinelStateDto(
    val mode: String = "OBSERVE",
    val state: String = "ACTIVE",
    val killSwitch: Boolean = false,
    val config: SentinelConfigDto? = null,
    val account: SignalsAccountDto? = null,
    val approvals: List<ApprovalDto> = emptyList(),
    val notifications: List<NotificationDto> = emptyList(),
    val auditEvents: List<AuditEventDto> = emptyList(),
    val openSignals: List<SignalRecordDto> = emptyList(),
)

@Serializable
data class SentinelConfigDto(
    val id: String? = null,
    val mode: String = "OBSERVE",
    val state: String = "ACTIVE",
    val killSwitch: Boolean = false,
    val riskPerTradePct: Double = 1.0,
    val maxPositionPct: Double = 20.0,
    val maxNotionalUsd: Double = 25000.0,
    val maxOpenPositions: Int = 8,
    val maxDailyLossPct: Double = 3.0,
    val maxWeeklyLossPct: Double = 8.0,
    val maxDailyTrades: Int = 10,
    val minRR: Double = 1.5,
    val minSignalScore: Double = 70.0,
    val signalHorizon: String? = null,
    val minLiquidityUsd: Double = 5_000_000.0,
    val maxSpreadBps: Double = 15.0,
    val maxCorrelatedExposurePct: Double = 35.0,
    val maxPortfolioDrawdownPct: Double = 15.0,
    val allowedAssets: String? = null,
    val allowedStrategies: String? = null,
    val allowedSessions: String? = null,
    val autoPauseOnDataStale: Boolean = true,
)

@Serializable
data class ApprovalDto(
    val id: String,
    val symbol: String,
    val side: String? = null,
    val qty: Double = 0.0,
    val entry: Double = 0.0,
    val stop: Double = 0.0,
    val target: Double = 0.0,
    val riskUsd: Double? = null,
    val rr: Double? = null,
    val score: Double? = null,
    val regime: String? = null,
    val status: String = "PENDING",
    val expiresAt: String? = null,
    val createdAt: String? = null,
)

@Serializable
data class NotificationDto(
    val id: String,
    val event: String? = null,
    val title: String = "",
    val body: String = "",
    val importance: String = "NORMAL",
    val deepLink: String? = null,
    val createdAt: String? = null,
    val openedAt: String? = null,
)

@Serializable
data class AuditEventDto(
    val id: String? = null,
    val category: String? = null,
    val action: String? = null,
    val detail: String? = null,
    val createdAt: String? = null,
)

@Serializable
data class SignalRecordDto(
    val id: String? = null,
    val symbol: String,
    val direction: String? = null,
    val score: Double? = null,
    val entry: Double? = null,
    val stop: Double? = null,
    val target: Double? = null,
    val rr: Double? = null,
    val status: String? = null,
    val openedAt: String? = null,
)

@Serializable
data class ApprovalDecisionBody(val approvalId: String, val decision: String)

@Serializable
data class KillSwitchBody(val engaged: Boolean, val confirmRelease: Boolean? = null)

@Serializable
data class ApprovalDecisionResponse(
    val ok: Boolean = false,
    val decision: String? = null,
    val error: String? = null,
    val message: String? = null,
)

@Serializable
data class SentinelConfigUpdateBody(
    val mode: String? = null,
    val state: String? = null,
    val confirmDelegate: Boolean? = null,
    val riskPerTradePct: Double? = null,
    val maxPositionPct: Double? = null,
    val maxNotionalUsd: Double? = null,
    val maxOpenPositions: Int? = null,
    val maxDailyLossPct: Double? = null,
    val maxWeeklyLossPct: Double? = null,
    val maxDailyTrades: Int? = null,
    val minRR: Double? = null,
    val minSignalScore: Double? = null,
    val minLiquidityUsd: Double? = null,
    val maxSpreadBps: Double? = null,
    val maxCorrelatedExposurePct: Double? = null,
    val maxPortfolioDrawdownPct: Double? = null,
    val autoPauseOnDataStale: Boolean? = null,
)

@Serializable
data class SentinelConfigResponse(
    val ok: Boolean = false,
    val config: SentinelConfigDto? = null,
    val changes: List<String> = emptyList(),
    val message: String? = null,
    val error: String? = null,
)

// ── Manual trade (POST /api/trades) ──────────────────────────────────────────

@Serializable
data class TradeRequestBody(
    val symbol: String,
    val side: String,
    val qty: Double,
    val type: String = "MARKET",
    val requestId: String,
)

@Serializable
data class TradeResponseDto(
    val ok: Boolean = false,
    val deduped: Boolean? = null,
    val message: String? = null,
    val error: String? = null,
    val order: UserOrderDto? = null,
    val execution: ExecutionDto? = null,
)

@Serializable
data class ExecutionDto(
    val ok: Boolean = false,
    val status: String? = null,
    val filledQty: Double? = null,
    val avgFillPrice: Double? = null,
    val rejectReason: String? = null,
    val brokerLabel: String? = null,
    val latencyMs: Long? = null,
    val venue: String? = null,
)

// ── News (GET /api/news) ──────────────────────────────────────────────────────

@Serializable
data class NewsEnvelopeDto(
    val state: String = "NEWS_DATA_UNAVAILABLE",
    val catalysts: List<CatalystDto> = emptyList(),
    val provider: String = "",
    val asOf: Long? = null,
    val message: String? = null,
    val byokConfigured: Boolean = false,
)

@Serializable
data class CatalystDto(
    val id: String,
    val headline: String,
    val source: String = "",
    val url: String = "",
    val publishedAt: Long = 0,
    val category: String = "NEWS",
    val sentiment: String = "NEUTRAL",
    val relevance: Double? = null,
    val strength: Double? = null,
    val tickers: List<String> = emptyList(),
)

// ── AI briefing (POST /api/ai/briefing) ──────────────────────────────────────

@Serializable
data class BriefingDto(
    val ok: Boolean = false,
    val briefing: String? = null,
    val message: String? = null,
    val asOf: Long? = null,
)

// ── Desk (GET /api/desk — public playbook reads) ─────────────────────────────

@Serializable
data class DeskDto(
    val desk: List<DeskReadDto> = emptyList(),
    val updatedAt: Long? = null,
)

@Serializable
data class DeskReadDto(
    val symbol: String,
    val name: String = "",
    val assetClass: String = "EQUITY",
    val direction: String = "NEUTRAL",
    val score: Double = 0.0,
    val rr: Double = 0.0,
    val entry: Double = 0.0,
    val stop: Double = 0.0,
    val target: Double = 0.0,
    val dataState: String = "LIVE",
    val computedAt: Long = 0,
)

// ── Billing (GET /api/billing/checkout) ──────────────────────────────────────

@Serializable
data class CheckoutDto(
    val provider: String? = null,
    val ready: Boolean = false,
    val links: Map<String, String?> = emptyMap(),
)

// ── Support (POST/GET /api/support) ──────────────────────────────────────────

@Serializable
data class SupportPostBody(
    val threadKey: String? = null,
    val body: String,
    val name: String? = null,
    val page: String? = "android-app",
)

@Serializable
data class SupportPostResponseDto(
    val ok: Boolean = false,
    val threadKey: String? = null,
    val error: String? = null,
    val message: String? = null,
)

@Serializable
data class SupportThreadDto(
    val messages: List<SupportMessageDto> = emptyList(),
    val error: String? = null,
)

@Serializable
data class SupportMessageDto(
    val id: String,
    val role: String = "VISITOR",
    val body: String = "",
    val createdAt: String? = null,
    val seen: Boolean = false,
    val mine: Boolean = false,
)

// ── Auth (better-auth) ────────────────────────────────────────────────────────

@Serializable
data class SignInBody(val email: String, val password: String)

@Serializable
data class SignUpBody(val email: String, val password: String, val name: String)

@Serializable
data class AuthUserDto(
    val id: String,
    val name: String = "",
    val email: String = "",
    val image: String? = null,
    val emailVerified: Boolean = false,
    val role: String = "USER",
    val status: String = "ACTIVE",
    val plan: String = "FREE",
    val trialEndsAt: String? = null,
)

@Serializable
data class AuthSessionDto(
    val session: AuthSessionInfoDto? = null,
    val user: AuthUserDto? = null,
)

@Serializable
data class AuthSessionInfoDto(
    val id: String? = null,
    val userId: String? = null,
    val expiresAt: String? = null,
)

@Serializable
data class AuthMethodsDto(
    val google: Boolean = false,
    /** Web OAuth client id - used as Credential Manager's serverClientId. */
    val googleClientId: String? = null,
)

/**
 * The REAL shape better-auth returns from /sign-in/email, /sign-up/email and
 * /sign-in/social: an envelope { redirect, token, url, user } - the user object
 * is nested, and `token` is null when email verification blocks auto sign-in.
 * (v1.0.0 parsed this as a flat AuthUserDto and failed on every login even
 * with correct credentials - the bug this release fixes.)
 */
@Serializable
data class AuthEnvelopeDto(
    val token: String? = null,
    val user: AuthUserDto? = null,
    val redirect: Boolean? = null,
    val url: String? = null,
)

/** Native Google sign-in: ID token from Credential Manager, verified server-side. */
@Serializable
data class SocialSignInBody(
    val provider: String,
    val idToken: GoogleIdTokenBody,
)

@Serializable
data class GoogleIdTokenBody(
    val token: String,
    val nonce: String? = null,
)

@Serializable
data class SendVerificationBody(val email: String, val callbackURL: String? = null)

@Serializable
data class ForgetPasswordBody(val email: String, val redirectTo: String? = null)

@Serializable
data class ChangePasswordBody(val currentPassword: String, val newPassword: String)

@Serializable
data class UpdateUserBody(val name: String)

@Serializable
data class GenericOkDto(
    val ok: Boolean? = null,
    val status: Boolean? = null,
    val message: String? = null,
    val error: String? = null,
    val code: String? = null,
)

@Serializable
data class PushRegisterBody(val token: String, val platform: String = "ANDROID")

// ── System ───────────────────────────────────────────────────────────────────

@Serializable
data class HealthDto(
    val ok: Boolean? = null,
    val status: String? = null,
    val service: String? = null,
    val time: String? = null,
)
