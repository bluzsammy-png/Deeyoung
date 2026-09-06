package com.deeyoungs.pro.ui

import android.Manifest
import android.net.Uri
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CandlestickChart
import androidx.compose.material.icons.outlined.Widgets
import androidx.compose.material.icons.rounded.Home
import androidx.compose.material.icons.rounded.QueryStats
import androidx.compose.material.icons.rounded.Wallet
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationRail
import androidx.compose.material3.NavigationRailItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.windowsizeclass.ExperimentalMaterial3WindowSizeClassApi
import androidx.compose.material3.windowsizeclass.WindowWidthSizeClass
import androidx.compose.material3.windowsizeclass.calculateWindowSizeClass
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.deeyoungs.pro.ProApp
import com.deeyoungs.pro.core.session.SessionState
import com.deeyoungs.pro.ui.components.OfflineBar
import com.deeyoungs.pro.ui.navigation.Routes
import com.deeyoungs.pro.ui.navigation.TopLevel
import com.deeyoungs.pro.ui.navigation.mapDeepLinkToRoute
import com.deeyoungs.pro.ui.screens.auth.AuthScreen
import com.deeyoungs.pro.ui.screens.auth.BiometricLock
import com.deeyoungs.pro.ui.screens.desk.DeskScreen
import com.deeyoungs.pro.ui.screens.home.HomeScreen
import com.deeyoungs.pro.ui.screens.markets.MarketsScreen
import com.deeyoungs.pro.ui.screens.markets.SymbolDetailScreen
import com.deeyoungs.pro.ui.screens.more.MoreScreen
import com.deeyoungs.pro.ui.screens.more.NotificationsScreen
import com.deeyoungs.pro.ui.screens.more.PricingScreen
import com.deeyoungs.pro.ui.screens.more.SettingsScreen
import com.deeyoungs.pro.ui.screens.more.SupportScreen
import com.deeyoungs.pro.ui.screens.portfolio.PortfolioScreen
import com.deeyoungs.pro.ui.screens.sentinel.SentinelScreen
import com.deeyoungs.pro.ui.screens.signals.SignalsScreen
import com.deeyoungs.pro.ui.theme.DeeYoungTheme
import com.deeyoungs.pro.ui.theme.ThemeMode
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

/**
 * Root of the app: theme, session gate, biometric lock, navigation shell
 * (bottom bar on phones, navigation rail on tablets) and deep links.
 */
@OptIn(ExperimentalMaterial3WindowSizeClassApi::class)
@Composable
fun AppRoot(deepLinks: StateFlow<Uri?>) {
    val container = ProApp.container(LocalContext.current)
    val settings by container.settingsStore.settings.collectAsState(initial = null)
    val session by container.sessionManager.state.collectAsState()
    val snackbar = remember { SnackbarHostState() }
    val scope = androidx.compose.runtime.rememberCoroutineScope()

    // Verify the persisted session on cold start; refresh plan/status.
    LaunchedEffect(Unit) {
        container.sessionManager.refreshUser()
    }

    // Session rejected server-side (401): tell the user, auth gate takes over.
    val authEvents by container.apiClient.authEvents.collectAsState()
    LaunchedEffect(authEvents) {
        if (authEvents > 0) snackbar.showSnackbar("Your session ended. Please sign in again.")
    }

    DeeYoungTheme(mode = settings?.themeMode ?: ThemeMode.SYSTEM) {
        val signedIn = session is SessionState.SignedIn
        var unlocked by remember { mutableStateOf(false) }
        val lockEnabled = signedIn && (settings?.biometricLock ?: false)

        if (!signedIn) {
            AuthScreen(onSessionMessage = { message -> scope.launch { snackbar.showSnackbar(message) } })
        } else {
            // Ask for notification permission once (Android 13+).
            val notifPermission = rememberLauncherForActivityResult(
                ActivityResultContracts.RequestPermission(),
            ) { }
            LaunchedEffect(Unit) {
                if (Build.VERSION.SDK_INT >= 33) {
                    notifPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
                }
            }

            if (lockEnabled && !unlocked) {
                BiometricLock(onUnlocked = { unlocked = true })
            } else {
                MainShell(deepLinks = deepLinks, snackbar = snackbar)
            }
        }
    }
}

@OptIn(ExperimentalMaterial3WindowSizeClassApi::class)
@Composable
private fun MainShell(deepLinks: StateFlow<Uri?>, snackbar: SnackbarHostState) {
    val container = ProApp.container(LocalContext.current)
    val nav = rememberNavController()
    val activity = LocalContext.current as androidx.activity.ComponentActivity
    val windowSize = calculateWindowSizeClass(activity)
    val wide = windowSize.widthSizeClass != WindowWidthSizeClass.Compact
    val backStack by nav.currentBackStackEntryAsState()
    val currentRoute = backStack?.destination?.route
    val showBars = currentRoute in TopLevel.entries.map { it.route }
    val offline by container.networkMonitor.isOnline.collectAsState(initial = true)

    // Deep link handling (App Links + custom scheme + warm re-delivery).
    val pending by deepLinks.collectAsState()
    LaunchedEffect(pending) {
        mapDeepLinkToRoute(pending)?.let { route ->
            runCatching { nav.navigate(route) { launchSingleTop = true } }
        }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbar) },
        topBar = { OfflineBar(visible = !offline) },
        bottomBar = {
            if (!wide && showBars) {
                NavigationBar(containerColor = MaterialTheme.colorScheme.surface) {
                    TopLevel.entries.forEach { tab ->
                        NavigationBarItem(
                            selected = currentRoute == tab.route,
                            onClick = { nav.navigateTop(tab.route) },
                            icon = { Icon(tab.icon(), contentDescription = tab.label) },
                            label = { Text(tab.label) },
                        )
                    }
                }
            }
        },
    ) { padding ->
        Row(Modifier.fillMaxSize().padding(padding)) {
            if (wide && showBars) {
                NavigationRail(containerColor = MaterialTheme.colorScheme.surface) {
                    TopLevel.entries.forEach { tab ->
                        NavigationRailItem(
                            selected = currentRoute == tab.route,
                            onClick = { nav.navigateTop(tab.route) },
                            icon = { Icon(tab.icon(), contentDescription = tab.label) },
                            label = { Text(tab.label) },
                        )
                    }
                }
            }
            NavHost(navController = nav, startDestination = Routes.HOME, modifier = Modifier.fillMaxSize()) {
                composable(Routes.HOME) { HomeScreen(nav) }
                composable(Routes.MARKETS) { MarketsScreen(nav) }
                composable(Routes.SIGNALS) { SignalsScreen(nav) }
                composable(Routes.PORTFOLIO) { PortfolioScreen(nav) }
                composable(Routes.MORE) { MoreScreen(nav) }
                composable(Routes.DESK) { DeskScreen(nav) }
                composable(Routes.SENTINEL) { SentinelScreen(nav) }
                composable(Routes.SETTINGS) { SettingsScreen(nav) }
                composable(Routes.SUPPORT) { SupportScreen(nav) }
                composable(Routes.NOTIFICATIONS) { NotificationsScreen(nav) }
                composable(
                    Routes.PRICING,
                    arguments = listOf(
                        navArgument("tier") { type = NavType.StringType; nullable = true; defaultValue = null },
                    ),
                ) { entry ->
                    PricingScreen(nav, highlightedTier = entry.arguments?.getString("tier"))
                }
                composable(
                    Routes.SYMBOL,
                    arguments = listOf(navArgument("symbol") { type = NavType.StringType }),
                ) { entry ->
                    SymbolDetailScreen(nav, symbol = entry.arguments?.getString("symbol") ?: "")
                }
            }
        }
    }
}

private fun NavHostController.navigateTop(route: String) {
    navigate(route) {
        popUpTo(graph.startDestinationId) { saveState = true }
        launchSingleTop = true
        restoreState = true
    }
}

private fun TopLevel.icon() = when (this) {
    TopLevel.Home -> Icons.Rounded.Home
    TopLevel.Markets -> Icons.Outlined.CandlestickChart
    TopLevel.Signals -> Icons.Rounded.QueryStats
    TopLevel.Portfolio -> Icons.Rounded.Wallet
    TopLevel.More -> Icons.Outlined.Widgets
}
