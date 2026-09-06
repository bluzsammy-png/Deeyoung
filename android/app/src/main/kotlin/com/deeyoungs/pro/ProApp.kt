package com.deeyoungs.pro

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import com.deeyoungs.pro.core.di.AppContainer

/**
 * Application entry point: builds the manual DI container and registers the
 * Android notification channels used by trade alerts.
 */
class ProApp : Application() {

    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
        registerChannels()
    }

    private fun registerChannels() {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.createNotificationChannel(
            NotificationChannel(
                CHANNEL_TRADE_ALERTS,
                getString(R.string.notif_channel_alerts),
                NotificationManager.IMPORTANCE_HIGH,
            ).apply { description = getString(R.string.notif_channel_alerts_desc) },
        )
        nm.createNotificationChannel(
            NotificationChannel(
                CHANNEL_GENERAL,
                getString(R.string.notif_channel_general),
                NotificationManager.IMPORTANCE_DEFAULT,
            ).apply { description = getString(R.string.notif_channel_general_desc) },
        )
    }

    companion object {
        const val CHANNEL_TRADE_ALERTS = "trade_alerts"
        const val CHANNEL_GENERAL = "general"

        fun container(context: Context): AppContainer =
            (context.applicationContext as ProApp).container
    }
}
