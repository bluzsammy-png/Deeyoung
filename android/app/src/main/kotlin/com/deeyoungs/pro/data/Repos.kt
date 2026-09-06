package com.deeyoungs.pro.data

import com.deeyoungs.pro.core.settings.SettingsStore
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.serialization.serializer
import java.util.UUID

/**
 * Repository layer. Thin on purpose: the backend already owns every rule
 * (risk, entitlements, execution). These classes only shape calls, manage the
 * offline cache and translate errors.
 */
class EngineRepository(private val client: ApiClient, private val cache: ResponseCache) {
    suspend fun status(): ApiResult<EngineSnapshotDto> = client.cachedCall(
        cache, CacheKey.ENGINE,
    ) { client.api.engineStatus() }
}

class MarketRepository(private val client: ApiClient, private val cache: ResponseCache) {
    suspend fun quotesByClass(assetClass: String): ApiResult<QuotesDto> = when (assetClass) {
        "ALL" -> client.cachedCall(cache, CacheKey.QUOTES) { client.api.quotes("") }
        else -> client.call { client.api.quotesByClass(assetClass) }
    }

    /** Exactly one symbol via the shared quotes endpoint. */
    suspend fun quote(symbol: String): ApiResult<QuotesDto> =
        client.call { client.api.quotes(symbol) }

    suspend fun search(q: String): ApiResult<SearchDto> =
        client.call { client.api.search(q) }

    suspend fun candles(symbol: String, tf: String): ApiResult<CandleSeriesDto> =
        client.call { client.api.candles(symbol, tf) }

    suspend fun desk(): ApiResult<DeskDto> = client.cachedCall(
        cache, CacheKey.DESK,
    ) { client.api.desk() }
}

class IntelRepository(private val client: ApiClient, private val cache: ResponseCache) {
    suspend fun signals(): ApiResult<SignalsDto> = client.cachedCall(
        cache, CacheKey.SIGNALS,
    ) { client.api.signals() }

    suspend fun briefing(): ApiResult<BriefingDto> =
        client.call { client.api.briefing() }

    suspend fun news(symbols: String? = null): ApiResult<NewsEnvelopeDto> =
        client.call { client.api.news(symbols) }
}

class PortfolioRepository(private val client: ApiClient, private val cache: ResponseCache) {
    suspend fun portfolio(): ApiResult<PortfolioDto> = client.cachedCall(
        cache, CacheKey.PORTFOLIO,
    ) { client.api.portfolio() }

    /** Manual paper trade. Idempotency key generated per submission. */
    suspend fun placeTrade(symbol: String, side: String, qty: Double): ApiResult<TradeResponseDto> =
        client.call {
            client.api.placeTrade(
                TradeRequestBody(
                    symbol = symbol.uppercase().trim(),
                    side = side,
                    qty = qty,
                    requestId = "mob-${UUID.randomUUID()}",
                ),
            )
        }
}

class SentinelRepository(private val client: ApiClient, private val cache: ResponseCache) {
    suspend fun state(): ApiResult<SentinelStateDto> = client.cachedCall(
        cache, CacheKey.SENTINEL,
    ) { client.api.sentinelState() }

    suspend fun updateConfig(update: SentinelConfigUpdateBody): ApiResult<SentinelConfigResponse> =
        client.call { client.api.updateSentinelConfig(update) }

    suspend fun decide(approvalId: String, approve: Boolean): ApiResult<ApprovalDecisionResponse> =
        client.call {
            client.api.decideApproval(
                ApprovalDecisionBody(approvalId, if (approve) "APPROVE" else "REJECT"),
            )
        }

    /** Emergency Stop. Release requires explicit confirmation (server rule). */
    suspend fun killSwitch(engaged: Boolean): ApiResult<GenericOkDto> =
        client.call {
            client.api.killSwitch(
                KillSwitchBody(
                    engaged = engaged,
                    confirmRelease = if (engaged) null else true,
                ),
            )
        }
}

class BillingRepository(private val client: ApiClient) {
    suspend fun checkoutLinks(): ApiResult<CheckoutDto> =
        client.call { client.api.checkoutLinks() }
}

class SupportRepository(private val client: ApiClient, private val settings: SettingsStore) {

    suspend fun send(name: String?, body: String): ApiResult<SupportPostResponseDto> {
        val key = settings.settings.firstOrNull()?.supportThreadKey
        val res = client.call {
            client.api.sendSupport(SupportPostBody(threadKey = key, body = body, name = name))
        }
        if (res is ApiResult.Success) res.data.threadKey?.let { settings.setSupportThreadKey(it) }
        return res
    }

    suspend fun thread(): ApiResult<SupportThreadDto> {
        val key = settings.settings.firstOrNull()?.supportThreadKey
            ?: return ApiResult.Success(SupportThreadDto(messages = emptyList()))
        return client.call { client.api.supportThread(key) }
    }
}

/**
 * Call + last-good cache: every fresh success is written to the cache slot;
 * when the device is offline the last good response is served with
 * `stale = true` so screens can show an honest "offline, cached" badge.
 */
private suspend inline fun <reified T> ApiClient.cachedCall(
    cache: ResponseCache,
    key: CacheKey,
    noinline block: suspend () -> retrofit2.Response<T>,
): ApiResult<T> {
    val res = call(block)
    return when (res) {
        is ApiResult.Success -> {
            runCatching { cache.write(key, json.encodeToString(serializer<T>(), res.data)) }
            res
        }
        is ApiResult.Offline -> {
            val cached = cache.read(key)
            if (cached != null) {
                runCatching { ApiResult.Success(json.decodeFromString<T>(cached), stale = true) }
                    .getOrElse { ApiResult.Offline }
            } else {
                ApiResult.Offline
            }
        }
        else -> res
    }
}
