package com.deeyoungs.pro.push

import android.content.Context
import com.deeyoungs.pro.BuildConfig
import com.deeyoungs.pro.ProApp
import com.deeyoungs.pro.data.ApiResult
import com.deeyoungs.pro.data.PushRegisterBody
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * FCM registrar (activation-gated, honest by design).
 *
 * Default builds ship WITHOUT the Firebase dependency: no google-services
 * plugin, no Firebase classes, zero telemetry. Everything is still wired:
 *
 *  1. Add the free Firebase project config (see android/gradle.properties
 *     FCM_* keys + docs/AUDIT.md for the exact steps).
 *  2. This registrar initializes Firebase with those values, fetches the FCM
 *     token and registers it at POST /api/mobile/push (the server-side
 *     PushToken registry route already exists).
 *  3. FCM high-priority messages then reach the device without polling.
 *
 * The reflection dance below keeps the build green when the dependency is
 * absent - the code path is real, it simply reports "not configured" instead
 * of crashing.
 */
object PushRegistrar {

    data class Status(val configured: Boolean, val registered: Boolean, val message: String)

    suspend fun registerIfConfigured(context: Context): Status = withContext(Dispatchers.IO) {
        val appId = BuildConfig.FCM_APPLICATION_ID
        val projectId = BuildConfig.FCM_PROJECT_ID
        val apiKey = BuildConfig.FCM_API_KEY
        if (appId.isBlank() || projectId.isBlank() || apiKey.isBlank()) {
            return@withContext Status(
                configured = false,
                registered = false,
                message = "FCM not configured (free path: periodic poll alerts are active instead).",
            )
        }

        try {
            // Reflective Firebase init: only runs when the firebase-messaging
            // dependency is present (added during FCM activation).
            val firebaseAppClass = Class.forName("com.google.firebase.FirebaseApp")
            val firebaseOptionsClass = Class.forName("com.google.firebase.FirebaseOptions")

            val optionsBuilder = firebaseOptionsClass.getDeclaredConstructor().apply { isAccessible = true }.newInstance()
            fun chain(method: String, value: String) {
                firebaseOptionsClass.getMethod(method, String::class.java).invoke(optionsBuilder, value)
            }
            chain("setApplicationId", appId)
            chain("setProjectId", projectId)
            chain("setApiKey", apiKey)
            chain("setGcmSenderId", projectId)

            val app = firebaseAppClass
                .getMethod("getApps", Context::class.java)
                .invoke(null, context) as List<*>
            if (app.isEmpty()) {
                firebaseAppClass
                    .getMethod("initializeApp", Context::class.java, firebaseOptionsClass)
                    .invoke(null, context, optionsBuilder)
            }

            val messagingClass = Class.forName("com.google.firebase.messaging.FirebaseMessaging")
            val messaging = messagingClass.getMethod("getInstance").invoke(null)
            val token = messagingClass.getMethod("getToken").invoke(messaging) as String

            val container = ProApp.container(context)
            val res = container.apiClient.call {
                container.apiClient.api.registerPushToken(PushRegisterBody(token = token))
            }
            if (res is ApiResult.Success) {
                container.sessionStore.fcmToken = token
                Status(true, true, "FCM token registered with the backend.")
            } else {
                Status(true, false, "FCM token fetched but registration failed: ${res.javaClass.simpleName}.")
            }
        } catch (e: ClassNotFoundException) {
            Status(true, false, "Firebase dependency missing: add firebase-messaging during FCM activation.")
        } catch (e: Throwable) {
            Status(true, false, "FCM registration failed: ${e.message ?: "unknown"}")
        }
    }
}
