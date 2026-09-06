package com.deeyoungs.pro.data

import com.deeyoungs.pro.BuildConfig
import com.deeyoungs.pro.core.session.SessionStore
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.serialization.json.Json
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Response
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.HttpException
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * Result envelope for every repository call. Models the server's real failure
 * modes so screens can render honest states: loading, content, paywall,
 * offline, or error.
 */
sealed interface ApiResult<out T> {
    data class Success<T>(val data: T, val stale: Boolean = false) : ApiResult<T>
    data class HttpError(val code: Int, val message: String, val errorCode: String? = null) : ApiResult<Nothing>
    data object AuthRequired : ApiResult<Nothing>
    data class Paywalled(val message: String) : ApiResult<Nothing>
    data object RateLimited : ApiResult<Nothing>
    data object Offline : ApiResult<Nothing>
    data class Failure(val message: String) : ApiResult<Nothing>
}

inline fun <T, R> ApiResult<T>.map(transform: (T) -> R): ApiResult<R> = when (this) {
    is ApiResult.Success -> ApiResult.Success(transform(data))
    is ApiResult.HttpError -> this
    is ApiResult.AuthRequired -> this
    is ApiResult.Paywalled -> this
    is ApiResult.RateLimited -> this
    is ApiResult.Offline -> this
    is ApiResult.Failure -> this
}

/**
 * The single OkHttp/Retrofit client of the app.
 *
 * Security posture:
 *  - the session token is attached from SessionStore on every call;
 *  - sign-in/sign-up responses capture the better-auth `set-auth-token`
 *    header (bearer plugin) and persist it;
 *  - a 401 from the API clears the session exactly once and broadcasts it;
 *  - Authorization headers are never logged (no body/headers logging at all
 *    in release; BASIC level in debug).
 */
class ApiClient(private val sessionStore: SessionStore) {

    val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        coerceInputValues = true
        explicitNulls = false
        encodeDefaults = false
    }

    private val _authEvents = MutableStateFlow(0L)
    /** Increments every time the session was rejected (401) and got cleared. */
    val authEvents: StateFlow<Long> = _authEvents

    val baseUrl: String =
        if (BuildConfig.DEBUG) BuildConfig.BASE_URL_DEBUG else BuildConfig.BASE_URL_RELEASE

    private val authInterceptor = Interceptor { chain ->
        val token = sessionStore.token
        val req = chain.request().newBuilder()
            .header("Accept", "application/json")
            .apply { if (!token.isNullOrBlank()) header("Authorization", "Bearer $token") }
            .build()
        chain.proceed(req)
    }

    private val tokenCaptureInterceptor = Interceptor { chain ->
        val response = chain.proceed(chain.request())
        val isAuthEndpoint = response.request.url.encodedPath.contains("/api/auth/")
        if (isAuthEndpoint) {
            val token = response.header("set-auth-token")
            if (!token.isNullOrBlank()) {
                sessionStore.token = token
            }
        }
        response
    }

    private val unauthorizedInterceptor = Interceptor { chain ->
        val response = chain.proceed(chain.request())
        if (response.code == 401 &&
            response.request.url.encodedPath.contains("/api/") &&
            !response.request.url.encodedPath.contains("/api/auth/")
        ) {
            // Session token expired or was revoked server-side: clear it and
            // let the UI navigate back to sign-in. No retry loop.
            if (sessionStore.token != null) {
                sessionStore.clear()
                _authEvents.value += 1
            }
        }
        response
    }

    val ok: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(45, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .addInterceptor(authInterceptor)
        .addInterceptor(tokenCaptureInterceptor)
        .addInterceptor(unauthorizedInterceptor)
        .apply {
            if (BuildConfig.DEBUG) {
                val logging = HttpLoggingInterceptor().apply { level = HttpLoggingInterceptor.Level.BASIC }
                addInterceptor(logging)
            }
        }
        .build()

    val api: DeeYoungApi = Retrofit.Builder()
        .baseUrl(if (baseUrl.endsWith("/")) baseUrl else "$baseUrl/")
        .client(ok)
        .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
        .build()
        .create(DeeYoungApi::class.java)

    /** Convert a repository lambda into an ApiResult. */
    suspend fun <T> call(block: suspend () -> retrofit2.Response<T>): ApiResult<T> = try {
        val res = block()
        val body = res.body()
        when {
            res.isSuccessful && body != null -> ApiResult.Success(body)
            res.isSuccessful -> ApiResult.Failure("Empty response")
            res.code() == 401 -> ApiResult.AuthRequired
            res.code() == 402 -> ApiResult.Paywalled(extractMessage(res))
            res.code() == 429 -> ApiResult.RateLimited
            else -> ApiResult.HttpError(res.code(), extractMessage(res), extractErrorCode(res))
        }
    } catch (e: IOException) {
        ApiResult.Offline
    } catch (e: HttpException) {
        ApiResult.HttpError(e.code(), e.message())
    } catch (e: Exception) {
        ApiResult.Failure(e.message ?: "Unexpected error")
    }

    private fun <T> extractMessage(res: retrofit2.Response<T>): String = try {
        val errorBody = res.errorBody()?.string()
        if (errorBody != null) {
            val obj = json.parseToJsonElement(errorBody)
            val o = obj as? kotlinx.serialization.json.JsonObject
            o?.get("message")?.toString()?.trim('"')
                ?: o?.get("error")?.toString()?.trim('"')
                ?: "Request failed (${res.code()})"
        } else {
            "Request failed (${res.code()})"
        }
    } catch (_: Exception) {
        "Request failed (${res.code()})"
    }

    private fun <T> extractErrorCode(res: retrofit2.Response<T>): String? = try {
        val errorBody = res.errorBody()?.string() ?: return null
        val o = json.parseToJsonElement(errorBody) as? kotlinx.serialization.json.JsonObject
        o?.get("error")?.toString()?.trim('"')?.takeIf { it != "null" }
    } catch (_: Exception) {
        null
    }
}
