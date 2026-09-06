package com.deeyoungs.pro.core.util

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.browser.customtabs.CustomTabsIntent

/**
 * Opens external web content (checkout, legal, status page) in an in-app
 * browser tab. No secrets are ever passed to the web: payments happen entirely
 * on the provider's hosted page, exactly like the website flow.
 */
object WebLauncher {
    fun open(context: Context, url: String) {
        val safe = if (url.startsWith("http")) url else "https://$url"
        try {
            val intent = CustomTabsIntent.Builder()
                .setShowTitle(true)
                .build()
            intent.launchUrl(context, Uri.parse(safe))
        } catch (_: Exception) {
            // No custom tabs available (rare): fall back to the system browser.
            runCatching {
                context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(safe)))
            }
        }
    }
}
