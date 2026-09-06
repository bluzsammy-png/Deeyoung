package com.deeyoungs.pro.ui.navigation

import android.net.Uri

/** Route names for the nav graph. */
object Routes {
    const val HOME = "home"
    const val MARKETS = "markets"
    const val SIGNALS = "signals"
    const val PORTFOLIO = "portfolio"
    const val MORE = "more"
    const val DESK = "desk"
    const val SENTINEL = "sentinel"
    const val PRICING = "pricing?tier={tier}"
    const val SETTINGS = "settings"
    const val SUPPORT = "support"
    const val NOTIFICATIONS = "notifications"
    const val SYMBOL = "symbol/{symbol}"

    fun symbol(symbol: String) = "symbol/${android.net.Uri.encode(symbol)}"
    fun pricing(tier: String? = null) = if (tier.isNullOrBlank()) "pricing" else "pricing?tier=$tier"
}

/** Top-level tabs (bottom bar on phones, rail on tablets). */
enum class TopLevel(val route: String, val label: String) {
    Home(Routes.HOME, "Home"),
    Markets(Routes.MARKETS, "Markets"),
    Signals(Routes.SIGNALS, "Signals"),
    Portfolio(Routes.PORTFOLIO, "Portfolio"),
    More(Routes.MORE, "More"),
}

/**
 * Maps an incoming deep link to a nav route.
 * Handles App Links (https://deyoungpro.site, https://deyoung-production.up.railway.app)
 * and the custom scheme (deeyoung://markets).
 */
fun mapDeepLinkToRoute(uri: Uri?): String? {
    if (uri == null) return null
    val host = uri.host ?: ""
    val path = uri.path?.trimEnd('/') ?: ""
    val webHosts = setOf("deyoungpro.site", "deyoung-production.up.railway.app", "www.deyoungpro.site")
    val segment = { index: Int -> path.split("/").getOrNull(index + 1) }

    return when {
        uri.scheme == "deeyoung" -> mapSegment(path.trimStart('/'), null)
        host in webHosts -> mapSegment(path.trimStart('/'), segment(0))
        else -> null
    }
}

private fun mapSegment(path: String, first: String?): String? {
    return when {
        path.isBlank() -> Routes.HOME
        first != null -> when (first.lowercase()) {
            "status", "dashboard" -> Routes.HOME
            "markets" -> Routes.MARKETS
            "signals" -> Routes.SIGNALS
            "portfolio" -> Routes.PORTFOLIO
            "desk" -> Routes.DESK
            "sentinel" -> Routes.SENTINEL
            "support" -> Routes.SUPPORT
            "pricing" -> Routes.pricing()
            "checkout" -> Routes.pricing(path.split("/").getOrNull(1))
            else -> null
        }
        else -> when (path.lowercase()) {
            "home", "dashboard", "status" -> Routes.HOME
            "markets" -> Routes.MARKETS
            "signals" -> Routes.SIGNALS
            "portfolio" -> Routes.PORTFOLIO
            "desk" -> Routes.DESK
            "sentinel" -> Routes.SENTINEL
            "more" -> Routes.MORE
            "settings" -> Routes.SETTINGS
            "support" -> Routes.SUPPORT
            "notifications" -> Routes.NOTIFICATIONS
            "pricing" -> Routes.pricing()
            else -> null
        }
    }
}
