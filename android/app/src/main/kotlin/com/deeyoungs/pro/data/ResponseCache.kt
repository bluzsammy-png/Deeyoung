package com.deeyoungs.pro.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.first

private val Context.cacheStore by preferencesDataStore(name = "deeyoung_cache")

/** Cache slots: one per screen that benefits from offline cold-start content. */
enum class CacheKey { ENGINE, QUOTES, SIGNALS, PORTFOLIO, DESK, SENTINEL }

/**
 * Last-good-response cache (DataStore). Not a source of truth: repositories
 * write every fresh success and read only when the network is unreachable, so
 * an offline cold start still shows the last real data with a stale badge.
 */
class ResponseCache(private val context: Context) {

    private fun keyOf(key: CacheKey) = stringPreferencesKey("cache_${key.name.lowercase()}")

    suspend fun read(key: CacheKey): String? =
        context.cacheStore.data.first()[keyOf(key)]

    suspend fun write(key: CacheKey, json: String) {
        context.cacheStore.edit { it[keyOf(key)] = json }
    }

    suspend fun clear() {
        context.cacheStore.edit { prefs ->
            CacheKey.entries.forEach { prefs.remove(keyOf(it)) }
        }
    }
}
