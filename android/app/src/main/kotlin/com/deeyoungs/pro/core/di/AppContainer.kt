package com.deeyoungs.pro.core.di

import android.content.Context
import com.deeyoungs.pro.core.net.NetworkMonitor
import com.deeyoungs.pro.core.session.SessionManager
import com.deeyoungs.pro.core.session.SessionStore
import com.deeyoungs.pro.core.settings.SettingsStore
import com.deeyoungs.pro.data.ApiClient
import com.deeyoungs.pro.data.BillingRepository
import com.deeyoungs.pro.data.EngineRepository
import com.deeyoungs.pro.data.IntelRepository
import com.deeyoungs.pro.data.MarketRepository
import com.deeyoungs.pro.data.PortfolioRepository
import com.deeyoungs.pro.data.ResponseCache
import com.deeyoungs.pro.data.SentinelRepository
import com.deeyoungs.pro.data.SupportRepository

/**
 * Manual dependency container (no DI framework: the graph is small and fully
 * explicit). One instance per process, built in ProApp.
 */
class AppContainer(context: Context) {

    val sessionStore = SessionStore(context)
    val settingsStore = SettingsStore(context)
    val apiClient = ApiClient(sessionStore)
    val networkMonitor = NetworkMonitor(context)
    val responseCache = ResponseCache(context)

    val sessionManager = SessionManager(apiClient, sessionStore)

    val engineRepository = EngineRepository(apiClient, responseCache)
    val marketRepository = MarketRepository(apiClient, responseCache)
    val intelRepository = IntelRepository(apiClient, responseCache)
    val portfolioRepository = PortfolioRepository(apiClient, responseCache)
    val sentinelRepository = SentinelRepository(apiClient, responseCache)
    val billingRepository = BillingRepository(apiClient)
    val supportRepository = SupportRepository(apiClient, settingsStore)
}
