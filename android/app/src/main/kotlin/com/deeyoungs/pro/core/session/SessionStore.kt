package com.deeyoungs.pro.core.session

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Session storage on-disk: AES-256-GCM via the Android Keystore.
 * Holds the better-auth session token (used as `Authorization: Bearer`) and a
 * cached copy of the session user so cold starts render instantly. Excluded
 * from cloud backup and device transfer (see data_extraction_rules.xml).
 */
class SessionStore(context: Context) {

    private val prefs: SharedPreferences by lazy {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context,
            "deeyoung_session",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    var token: String?
        get() = prefs.getString(KEY_TOKEN, null)
        set(value) = prefs.edit().putString(KEY_TOKEN, value).apply()

    var cachedUserJson: String?
        get() = prefs.getString(KEY_USER, null)
        set(value) = prefs.edit().putString(KEY_USER, value).apply()

    var fcmToken: String?
        get() = prefs.getString(KEY_FCM, null)
        set(value) = prefs.edit().putString(KEY_FCM, value).apply()

    fun clear() {
        prefs.edit().clear().apply()
    }

    companion object {
        private const val KEY_TOKEN = "session_token"
        private const val KEY_USER = "cached_user_json"
        private const val KEY_FCM = "fcm_token"
    }
}
