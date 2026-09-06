package com.deeyoungs.pro

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.fragment.app.FragmentActivity
import com.deeyoungs.pro.ui.AppRoot
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/**
 * Single-activity architecture: every screen is a Compose destination inside
 * AppRoot. Extends FragmentActivity so BiometricPrompt works natively.
 * Deep links (App Links + custom scheme) arrive here and are handed to the
 * nav graph through a state flow, including warm re-delivery from onNewIntent.
 */
class MainActivity : FragmentActivity() {

    private val deepLinks = MutableStateFlow<Uri?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        deepLinks.value = intent?.data
        setContent {
            AppRoot(deepLinks = deepLinks)
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        deepLinks.value = intent.data
    }
}
