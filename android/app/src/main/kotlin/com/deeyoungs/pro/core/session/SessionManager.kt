package com.deeyoungs.pro.core.session

import com.deeyoungs.pro.data.ApiClient
import com.deeyoungs.pro.data.ApiResult
import com.deeyoungs.pro.data.AuthUserDto
import com.deeyoungs.pro.data.ChangePasswordBody
import com.deeyoungs.pro.data.ForgetPasswordBody
import com.deeyoungs.pro.data.GenericOkDto
import com.deeyoungs.pro.data.SignInBody
import com.deeyoungs.pro.data.SignUpBody
import com.deeyoungs.pro.data.UpdateUserBody
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.json.Json

sealed interface SessionState {
    data object SignedOut : SessionState
    data class SignedIn(val user: AuthUserDto) : SessionState
}

/**
 * Owns the auth session lifecycle:
 *  - sign-in / sign-up (better-auth email+password; the session token arrives
 *    in the `set-auth-token` response header and is persisted by ApiClient);
 *  - cached cold-start user for instant render, refreshed from the server;
 *  - sign-out (server revocation + local wipe).
 */
class SessionManager(
    private val api: ApiClient,
    private val store: SessionStore,
) {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    private val _state = MutableStateFlow<SessionState>(restoreInitial())
    val state: StateFlow<SessionState> = _state.asStateFlow()

    private fun restoreInitial(): SessionState {
        val token = store.token
        val cached = store.cachedUserJson?.let {
            runCatching { json.decodeFromString<AuthUserDto>(it) }.getOrNull()
        }
        return if (!token.isNullOrBlank() && cached != null) SessionState.SignedIn(cached)
        else if (!token.isNullOrBlank()) SessionState.SignedIn(
            AuthUserDto(id = "", email = "", name = ""),
        )
        else SessionState.SignedOut
    }

    suspend fun signIn(email: String, password: String): ApiResult<AuthUserDto> {
        val res = api.call { api.api.signIn(SignInBody(email.trim().lowercase(), password)) }
        return settle(res)
    }

    suspend fun signUp(name: String, email: String, password: String): ApiResult<AuthUserDto> {
        val res = api.call {
            api.api.signUp(SignUpBody(email.trim().lowercase(), password, name.trim()))
        }
        return settle(res)
    }

    suspend fun refreshUser(): ApiResult<AuthUserDto> {
        if (store.token.isNullOrBlank()) return ApiResult.AuthRequired
        return when (val res = api.call { api.api.getSession() }) {
            is ApiResult.Success -> {
                val user = res.data?.user
                if (user != null) {
                    persistUser(user)
                    _state.value = SessionState.SignedIn(user)
                    ApiResult.Success(user)
                } else {
                    clearLocal()
                    ApiResult.AuthRequired
                }
            }
            is ApiResult.AuthRequired -> {
                clearLocal()
                ApiResult.AuthRequired
            }
            is ApiResult.Offline -> ApiResult.Offline
            is ApiResult.RateLimited -> ApiResult.RateLimited
            is ApiResult.HttpError -> ApiResult.Failure("Session check failed (${res.code})")
            is ApiResult.Paywalled -> ApiResult.Failure(res.message)
            is ApiResult.Failure -> ApiResult.Failure(res.message)
        }
    }

    suspend fun signOut() {
        runCatching { api.api.signOut(kotlinx.serialization.json.JsonObject(emptyMap())) }
        clearLocal()
    }

    suspend fun sendPasswordReset(email: String): ApiResult<GenericOkDto> =
        api.call { api.api.forgetPassword(ForgetPasswordBody(email.trim().lowercase())) }

    suspend fun changePassword(current: String, new: String): ApiResult<GenericOkDto> =
        api.call { api.api.changePassword(ChangePasswordBody(current, new)) }

    suspend fun updateName(name: String): ApiResult<GenericOkDto> {
        val res = api.call { api.api.updateUser(UpdateUserBody(name.trim())) }
        if (res is ApiResult.Success) refreshUser()
        return res
    }

    private suspend fun settle(res: ApiResult<AuthUserDto>): ApiResult<AuthUserDto> = when (res) {
        is ApiResult.Success -> {
            persistUser(res.data)
            _state.value = SessionState.SignedIn(res.data)
            res
        }
        else -> res
    }

    private fun persistUser(user: AuthUserDto) {
        store.cachedUserJson = json.encodeToString(AuthUserDto.serializer(), user)
    }

    private fun clearLocal() {
        store.clear()
        _state.value = SessionState.SignedOut
    }
}
