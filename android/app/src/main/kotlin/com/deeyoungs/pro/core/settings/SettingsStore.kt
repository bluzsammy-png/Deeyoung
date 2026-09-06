package com.deeyoungs.pro.core.settings

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.deeyoungs.pro.ui.theme.ThemeMode
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.dataStore by preferencesDataStore(name = "deeyoung_settings")

data class AppSettings(
    val themeMode: ThemeMode = ThemeMode.SYSTEM,
    val biometricLock: Boolean = false,
    val notificationsEnabled: Boolean = true,
    val supportThreadKey: String? = null,
)

/**
 * User preferences (DataStore). Only NON-sensitive data lives here: theme,
 * biometric lock preference, notification preference. The session token lives
 * in SessionStore (Keystore-encrypted).
 */
class SettingsStore(private val context: Context) {

    private object Keys {
        val THEME = stringPreferencesKey("theme_mode")
        val BIOMETRIC = booleanPreferencesKey("biometric_lock")
        val NOTIFICATIONS = booleanPreferencesKey("notifications_enabled")
        val SUPPORT_KEY = stringPreferencesKey("support_thread_key")
    }

    val settings: Flow<AppSettings> = context.dataStore.data.map { p ->
        AppSettings(
            themeMode = p[Keys.THEME]?.let { runCatching { ThemeMode.valueOf(it) }.getOrNull() }
                ?: ThemeMode.SYSTEM,
            biometricLock = p[Keys.BIOMETRIC] ?: false,
            notificationsEnabled = p[Keys.NOTIFICATIONS] ?: true,
            supportThreadKey = p[Keys.SUPPORT_KEY],
        )
    }

    suspend fun setThemeMode(mode: ThemeMode) {
        context.dataStore.edit { it[Keys.THEME] = mode.name }
    }

    suspend fun setBiometricLock(enabled: Boolean) {
        context.dataStore.edit { it[Keys.BIOMETRIC] = enabled }
    }

    suspend fun setNotificationsEnabled(enabled: Boolean) {
        context.dataStore.edit { it[Keys.NOTIFICATIONS] = enabled }
    }

    suspend fun setSupportThreadKey(key: String?) {
        context.dataStore.edit {
            if (key == null) it.remove(Keys.SUPPORT_KEY) else it[Keys.SUPPORT_KEY] = key
        }
    }
}
