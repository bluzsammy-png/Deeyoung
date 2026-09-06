package com.deeyoungs.pro.push

import android.Manifest
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import com.deeyoungs.pro.ProApp
import com.deeyoungs.pro.R
import com.deeyoungs.pro.core.session.SessionState
import com.deeyoungs.pro.data.ApiResult
import java.util.concurrent.TimeUnit

/**
 * Free, zero-infrastructure alert path: a periodic WorkManager job polls the
 * account's notification feed (the same NotificationRecords the website
 * shows) and raises native Android notifications for new HIGH/CRITICAL
 * events. Runs roughly every 15 minutes (the OS minimum for periodic work)
 * while the session token is valid.
 *
 * Real-time push (FCM) is wired separately in PushRegistrar and activates as
 * soon as a free Firebase project is configured - see docs/AUDIT.md.
 */
class NotificationWorker(context: Context, params: WorkerParameters) : Worker(context, params) {

    override fun doWork(): Result {
        val container = ProApp.container(applicationContext)
        if (container.sessionStore.token.isNullOrBlank()) return Result.success()
        if (container.sessionManager.state.value is SessionState.SignedOut) return Result.success()

        val prefs = applicationContext.getSharedPreferences("deeyoung_push", Context.MODE_PRIVATE)
        val lastSeenId = prefs.getString("last_seen_id", null)

        val result = kotlinx.coroutines.runBlocking {
            kotlinx.coroutines.withTimeoutOrNull(30_000) { container.sentinelRepository.state() }
        }
        val state = (result as? ApiResult.Success)?.data ?: return Result.success()

        // Newest first. Post everything newer than the last seen marker, max 5.
        val fresh = state.notifications
            .takeWhile { it.id != lastSeenId }
            .filter { it.importance == "HIGH" || it.importance == "CRITICAL" }
            .take(5)

        fresh.forEach { post(it.id, it.title, it.body, it.importance == "CRITICAL") }
        state.notifications.firstOrNull()?.id?.let { newest ->
            prefs.edit().putString("last_seen_id", newest).apply()
        }
        return Result.success()
    }

    private fun post(id: String, title: String, body: String, critical: Boolean) {
        val ctx = applicationContext
        if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            return // user declined notifications: silently skip
        }
        val open = Intent(ctx, com.deeyoungs.pro.MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pending = PendingIntent.getActivity(
            ctx,
            id.hashCode(),
            open,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(ctx, ProApp.CHANNEL_TRADE_ALERTS)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(if (critical) NotificationCompat.PRIORITY_MAX else NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(pending)
            .setAutoCancel(true)
            .build()
        NotificationManagerCompat.from(ctx).notify(id.hashCode(), notification)
    }

    companion object {
        private const val WORK_NAME = "deeyoung_notification_poll"

        fun schedule(context: Context) {
            val request = PeriodicWorkRequestBuilder<NotificationWorker>(15, TimeUnit.MINUTES)
                .setConstraints(
                    Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build(),
                )
                .build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                WORK_NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                request,
            )
        }

        fun cancel(context: Context) {
            WorkManager.getInstance(context).cancelUniqueWork(WORK_NAME)
        }
    }
}
