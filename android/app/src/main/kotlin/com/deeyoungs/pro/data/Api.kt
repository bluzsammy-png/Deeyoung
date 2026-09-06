package com.deeyoungs.pro.data

import kotlinx.serialization.json.JsonObject
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Query

/**
 * DeeYoung Pro API surface consumed by the native client.
 * The Android app is a CLIENT of the existing Next.js backend: no business
 * logic is duplicated here. Authenticated calls carry the better-auth session
 * token via `Authorization: Bearer` (bearer plugin on the server).
 */
interface DeeYoungApi {

    // ── Public surfaces ──────────────────────────────────────────────────────
    @GET("api/health")
    suspend fun health(): Response<HealthDto>

    @GET("api/engine/status")
    suspend fun engineStatus(): Response<EngineSnapshotDto>

    @GET("api/desk")
    suspend fun desk(): Response<DeskDto>

    @GET("api/market/quotes")
    suspend fun quotes(@Query("symbols") symbols: String): Response<QuotesDto>

    @GET("api/market/quotes")
    suspend fun quotesByClass(@Query("class") assetClass: String): Response<QuotesDto>

    @GET("api/billing/checkout")
    suspend fun checkoutLinks(): Response<CheckoutDto>

    @GET("api/auth-methods")
    suspend fun authMethods(): Response<AuthMethodsDto>

    // ── Markets (search/candles are guarded) ─────────────────────────────────
    @GET("api/market/search")
    suspend fun search(@Query("q") q: String): Response<SearchDto>

    @GET("api/market/candles")
    suspend fun candles(@Query("symbol") symbol: String, @Query("tf") tf: String): Response<CandleSeriesDto>

    // ── Guarded analytics ────────────────────────────────────────────────────
    @GET("api/signals")
    suspend fun signals(): Response<SignalsDto>

    @GET("api/portfolio")
    suspend fun portfolio(): Response<PortfolioDto>

    @GET("api/news")
    suspend fun news(@Query("symbols") symbols: String?): Response<NewsEnvelopeDto>

    @POST("api/ai/briefing")
    suspend fun briefing(): Response<BriefingDto>

    @POST("api/trades")
    suspend fun placeTrade(@Body body: TradeRequestBody): Response<TradeResponseDto>

    // ── SENTINEL ─────────────────────────────────────────────────────────────
    @GET("api/sentinel/state")
    suspend fun sentinelState(): Response<SentinelStateDto>

    @POST("api/sentinel/config")
    suspend fun updateSentinelConfig(@Body body: SentinelConfigUpdateBody): Response<SentinelConfigResponse>

    @POST("api/approvals")
    suspend fun decideApproval(@Body body: ApprovalDecisionBody): Response<ApprovalDecisionResponse>

    @POST("api/sentinel/kill")
    suspend fun killSwitch(@Body body: KillSwitchBody): Response<GenericOkDto>

    // ── Support (thread-key based, works signed-out) ─────────────────────────
    @POST("api/support")
    suspend fun sendSupport(@Body body: SupportPostBody): Response<SupportPostResponseDto>

    @GET("api/support")
    suspend fun supportThread(@Query("key") key: String): Response<SupportThreadDto>

    // ── better-auth (bearer plugin) ──────────────────────────────────────────
    @POST("api/auth/sign-in/email")
    suspend fun signIn(@Body body: SignInBody): Response<AuthUserDto>

    @POST("api/auth/sign-up/email")
    suspend fun signUp(@Body body: SignUpBody): Response<AuthUserDto>

    @POST("api/auth/sign-out")
    suspend fun signOut(@Body body: JsonObject): Response<JsonObject>

    @GET("api/auth/get-session")
    suspend fun getSession(): Response<AuthSessionDto?>

    @POST("api/auth/forget-password")
    suspend fun forgetPassword(@Body body: ForgetPasswordBody): Response<GenericOkDto>

    @POST("api/auth/change-password")
    suspend fun changePassword(@Body body: ChangePasswordBody): Response<GenericOkDto>

    @POST("api/auth/update-user")
    suspend fun updateUser(@Body body: UpdateUserBody): Response<GenericOkDto>

    // ── Mobile push registry ─────────────────────────────────────────────────
    @POST("api/mobile/push")
    suspend fun registerPushToken(@Body body: PushRegisterBody): Response<GenericOkDto>

    @DELETE("api/mobile/push")
    suspend fun deletePushToken(@Body body: PushRegisterBody): Response<GenericOkDto>
}
