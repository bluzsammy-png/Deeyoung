package com.deeyoungs.pro.ui.screens.more

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Chat
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.outlined.CandlestickChart
import androidx.compose.material.icons.rounded.Campaign
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.Notifications
import androidx.compose.material.icons.rounded.Sell
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.Shield
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController
import com.deeyoungs.pro.ProApp
import com.deeyoungs.pro.core.session.SessionState
import com.deeyoungs.pro.core.util.WebLauncher
import com.deeyoungs.pro.ui.components.Panel
import com.deeyoungs.pro.ui.components.Pill
import com.deeyoungs.pro.ui.navigation.Routes
import com.deeyoungs.pro.ui.theme.Grotesk

/** More hub: everything that is not a top tab. */
@Composable
fun MoreScreen(nav: NavHostController) {
    val container = ProApp.container(LocalContext.current)
    val session by container.sessionManager.state.collectAsState()
    val user = (session as? SessionState.SignedIn)?.user
    val context = LocalContext.current

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text("More", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold, fontFamily = Grotesk)

        Panel {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(user?.name?.ifBlank { "Trader" } ?: "Trader", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Text(
                        user?.email ?: "",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Pill(
                    text = user?.plan ?: "FREE",
                    container = if (user?.plan in setOf("PRO", "ELITE", "STARTER")) {
                        MaterialTheme.colorScheme.primaryContainer
                    } else {
                        MaterialTheme.colorScheme.surfaceVariant
                    },
                    content = if (user?.plan in setOf("PRO", "ELITE", "STARTER")) {
                        MaterialTheme.colorScheme.primary
                    } else {
                        MaterialTheme.colorScheme.onSurfaceVariant
                    },
                )
            }
        }

        MoreItem(Icons.Outlined.CandlestickChart, "Playbook desk", "Public factor reads across every market") { nav.navigate(Routes.DESK) }
        MoreItem(Icons.Rounded.Shield, "SENTINEL automation", "Approve or delegate. Pro and Elite.") { nav.navigate(Routes.SENTINEL) }
        MoreItem(Icons.Rounded.Notifications, "Notifications", "Trade alerts and account events") { nav.navigate(Routes.NOTIFICATIONS) }
        MoreItem(Icons.Rounded.Sell, "Plans and upgrade", "Starter, Pro, Elite. Cancel anytime.") { nav.navigate(Routes.pricing()) }
        MoreItem(Icons.Rounded.Settings, "Settings", "Profile, security, appearance, sign out") { nav.navigate(Routes.SETTINGS) }
        MoreItem(Icons.AutoMirrored.Rounded.Chat, "Support", "Message the team, replies in-app") { nav.navigate(Routes.SUPPORT) }

        Panel {
            MoreRow("Live engine status (web)", null) { WebLauncher.open(context, "${container.apiClient.baseUrl}/status") }
            HorizontalDivider(color = MaterialTheme.colorScheme.outline)
            MoreRow("Terms", null) { WebLauncher.open(context, "${container.apiClient.baseUrl}/terms") }
            HorizontalDivider(color = MaterialTheme.colorScheme.outline)
            MoreRow("Privacy", null) { WebLauncher.open(context, "${container.apiClient.baseUrl}/privacy") }
        }

        Text(
            "DeeYoung Pro Android ${com.deeyoungs.pro.BuildConfig.VERSION_NAME} · client of ${container.apiClient.baseUrl.removePrefix("https://")}",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(24.dp))
    }
}

@Composable
private fun MoreItem(icon: ImageVector, title: String, subtitle: String, onClick: () -> Unit) {
    Panel(Modifier.fillMaxWidth().clickable(onClick = onClick)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(22.dp))
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Icon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, contentDescription = null)
        }
    }
}

@Composable
private fun MoreRow(title: String, badge: String?, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(title, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
        badge?.let { Pill(it) }
    }
}
