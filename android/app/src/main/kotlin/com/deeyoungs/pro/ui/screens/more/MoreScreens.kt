package com.deeyoungs.pro.ui.screens.more

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.Chat
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Notifications
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import com.deeyoungs.pro.ProApp
import com.deeyoungs.pro.core.util.Format
import com.deeyoungs.pro.core.util.WebLauncher
import com.deeyoungs.pro.data.ApiResult
import com.deeyoungs.pro.data.BillingRepository
import com.deeyoungs.pro.data.CheckoutDto
import com.deeyoungs.pro.ui.components.EmptyState
import com.deeyoungs.pro.ui.components.Panel
import com.deeyoungs.pro.ui.components.Pill
import com.deeyoungs.pro.ui.components.SectionTitle
import com.deeyoungs.pro.ui.screens.auth.simpleFactory
import com.deeyoungs.pro.ui.theme.Grotesk
import com.deeyoungs.pro.ui.theme.MarketColors
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

// ─── Pricing ─────────────────────────────────────────────────────────────────

data class PricingUiState(
    val loading: Boolean = true,
    val checkout: CheckoutDto? = null,
    val error: String? = null,
)

class PricingViewModel(private val billing: BillingRepository) : ViewModel() {
    private val _state = MutableStateFlow(PricingUiState())
    val state: StateFlow<PricingUiState> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            when (val res = billing.checkoutLinks()) {
                is ApiResult.Success -> _state.value = PricingUiState(loading = false, checkout = res.data)
                is ApiResult.Offline -> _state.value = PricingUiState(loading = false, error = "You are offline.")
                else -> _state.value = PricingUiState(loading = false, error = "Checkout is not reachable right now.")
            }
        }
    }
}

private data class TierUi(
    val key: String,
    val name: String,
    val tagline: String,
    val priceUsd: Int,
    val popular: Boolean = false,
    val features: List<String>,
)

private val TIERS_UI = listOf(
    TierUi(
        "STARTER", "Starter", "The full analytics terminal", 24,
        features = listOf(
            "Every market: stocks, FX majors, gold, crypto, indices",
            "Multi-factor signal scores, math fully visible",
            "Portfolio risk: concentration, correlation, drawdown",
            "Watchlist + price and signal alerts",
            "Unlimited paper trading",
        ),
    ),
    TierUi(
        "PRO", "Pro", "Analytics + the action layer", 70, popular = true,
        features = listOf(
            "Everything in Starter",
            "SENTINEL Approve: it drafts, you decide",
            "Backtest Lab with bias-guarded results",
            "AI Daily Briefing before the open",
            "Catalyst intelligence and alerts",
        ),
    ),
    TierUi(
        "ELITE", "Elite", "For traders who want it automated", 158,
        features = listOf(
            "Everything in Pro",
            "SENTINEL Delegate: auto-executes inside your hard limits",
            "Priority support line",
            "Early access to new engines",
            "Founding-member badge",
        ),
    ),
)

@Composable
fun PricingScreen(nav: NavHostController, highlightedTier: String?) {
    val container = ProApp.container(LocalContext.current)
    val vm: PricingViewModel = viewModel(factory = simpleFactory { PricingViewModel(container.billingRepository) })
    val state by vm.state.collectAsState()
    val context = LocalContext.current

    Column(Modifier.fillMaxSize()) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(16.dp)) {
            IconButton(onClick = { nav.popBackStack() }) {
                Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "Back")
            }
            Text("Plans", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold, fontFamily = Grotesk)
        }

        if (state.loading) {
            com.deeyoungs.pro.ui.components.LoadingState(label = "Loading checkout links")
            return@Column
        }
        val checkout = state.checkout
        if (checkout == null) {
            com.deeyoungs.pro.ui.components.ErrorState(Modifier, message = state.error ?: "Checkout unavailable.", onRetry = { vm.load() })
            return@Column
        }

        LazyColumn(
            contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Text(
                    "The Android app is a client of the same account as the website: subscribe once, use both.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            items(TIERS_UI, key = { it.key }) { tier ->
                val link = checkout.links[tier.key]
                Panel {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(tier.name, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
                                if (tier.popular) {
                                    Spacer(Modifier.width(8.dp))
                                    Pill("MOST POPULAR", container = MaterialTheme.colorScheme.primaryContainer, content = MaterialTheme.colorScheme.primary)
                                }
                                if (highlightedTier == tier.key) {
                                    Spacer(Modifier.width(6.dp))
                                    Pill("SELECTED")
                                }
                            }
                            Text(
                                tier.tagline,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        Text(
                            "$${tier.priceUsd}/mo",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                    Spacer(Modifier.height(10.dp))
                    tier.features.forEach { f ->
                        Row(Modifier.padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Rounded.Check, contentDescription = null, tint = MarketColors.pos(), modifier = Modifier.width(16.dp))
                            Spacer(Modifier.width(6.dp))
                            Text(f, style = MaterialTheme.typography.bodySmall)
                        }
                    }
                    Spacer(Modifier.height(12.dp))
                    if (checkout.ready && link != null) {
                        Button(onClick = { WebLauncher.open(context, link) }, modifier = Modifier.fillMaxWidth()) {
                            Text("Subscribe to ${tier.name}")
                        }
                        Text(
                            "Secure hosted checkout${checkout.provider?.let { " via $it" } ?: ""}. No card details ever touch this app.",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = 6.dp),
                        )
                    } else {
                        OutlinedButton(onClick = { WebLauncher.open(context, container.apiClient.baseUrl) }, modifier = Modifier.fillMaxWidth()) {
                            Text("Checkout opens on the website")
                        }
                    }
                }
            }
            item {
                Text(
                    "Regional pricing (PPP-aware) is applied on the website. Currency is chosen at checkout.",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

// ─── Support ─────────────────────────────────────────────────────────────────

@Composable
fun SupportScreen(nav: NavHostController) {
    val container = ProApp.container(LocalContext.current)
    var messages by remember { mutableStateOf(listOf<com.deeyoungs.pro.data.SupportMessageDto>()) }
    var input by remember { mutableStateOf("") }
    var sending by remember { mutableStateOf(false) }
    var loadError by remember { mutableStateOf<String?>(null) }
    val scope = androidx.compose.runtime.rememberCoroutineScope()

    suspend fun refresh() {
        when (val res = container.supportRepository.thread()) {
            is ApiResult.Success -> {
                messages = res.data.messages
                loadError = null
            }
            is ApiResult.Offline -> loadError = "Offline: messages load when you reconnect."
            else -> loadError = "Could not load the conversation."
        }
    }

    LaunchedEffect(Unit) { refresh() }

    Column(Modifier.fillMaxSize()) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(16.dp)) {
            IconButton(onClick = { nav.popBackStack() }) {
                Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "Back")
            }
            Column {
                Text("Support", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold, fontFamily = Grotesk)
                Text(
                    "A human answers from the studio. No bots pretending to type.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        loadError?.let {
            Text(it, style = MaterialTheme.typography.labelMedium, color = MarketColors.warn(), modifier = Modifier.padding(horizontal = 16.dp))
        }

        LazyColumn(
            modifier = Modifier.weight(1f),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (messages.isEmpty()) {
                item { EmptyState(text = "Ask anything about the product, your account or billing.") }
            }
            items(messages, key = { it.id }) { m ->
                val mine = m.mine
                Row(Modifier.fillMaxWidth(), horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start) {
                    Panel(Modifier.width(280.dp)) {
                        Text(m.body, style = MaterialTheme.typography.bodyMedium)
                        Spacer(Modifier.height(4.dp))
                        Text(
                            "${if (mine) "You" else "DeeYoung"} · ${Format.ago(m.createdAt)}",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }

        Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(
                value = input,
                onValueChange = { input = it },
                placeholder = { Text("Type your message") },
                modifier = Modifier.weight(1f),
                maxLines = 3,
            )
            Spacer(Modifier.width(8.dp))
            Button(
                onClick = {
                    val body = input.trim()
                    if (body.isEmpty()) return@Button
                    sending = true
                    input = ""
                    scope.launch {
                        container.supportRepository.send(null, body)
                        refresh()
                        sending = false
                    }
                },
                enabled = !sending && input.isNotBlank(),
            ) {
                if (sending) CircularProgressIndicator(Modifier.width(16.dp).height(16.dp), strokeWidth = 2.dp)
                else Icon(Icons.AutoMirrored.Rounded.Chat, contentDescription = "Send")
            }
        }
        Spacer(Modifier.height(8.dp))
    }
}

// ─── Notifications ───────────────────────────────────────────────────────────

@Composable
fun NotificationsScreen(nav: NavHostController) {
    val container = ProApp.container(LocalContext.current)
    var state by remember { mutableStateOf<ApiResult<com.deeyoungs.pro.data.SentinelStateDto>?>(null) }
    val scope = androidx.compose.runtime.rememberCoroutineScope()

    LaunchedEffect(Unit) {
        state = container.sentinelRepository.state()
    }

    Column(Modifier.fillMaxSize()) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(16.dp)) {
            IconButton(onClick = { nav.popBackStack() }) {
                Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "Back")
            }
            Text("Notifications", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold, fontFamily = Grotesk)
        }

        when (val res = state) {
            null -> com.deeyoungs.pro.ui.components.LoadingState(label = "Loading notifications")
            is ApiResult.Paywalled -> Column(Modifier.padding(16.dp)) {
                Text(
                    "Live account events are part of the automation plans. The website shows the same feed.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(12.dp))
                Button(onClick = { nav.navigate(com.deeyoungs.pro.ui.navigation.Routes.pricing()) }) { Text("See plans") }
            }
            is ApiResult.Offline -> EmptyState(text = "Offline. Notifications load when you reconnect.")
            is ApiResult.Success -> {
                val items = res.data.notifications
                if (items.isEmpty()) {
                    EmptyState(text = "Nothing yet. Approvals, fills and risk events land here.")
                } else {
                    LazyColumn(
                        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        items(items, key = { it.id }) { n ->
                            Panel {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(
                                        Icons.Rounded.Notifications,
                                        contentDescription = null,
                                        tint = when (n.importance) {
                                            "CRITICAL", "HIGH" -> MarketColors.neg()
                                            else -> MaterialTheme.colorScheme.onSurfaceVariant
                                        },
                                    )
                                    Spacer(Modifier.width(10.dp))
                                    Column(Modifier.weight(1f)) {
                                        Text(n.title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                                        Text(
                                            n.body,
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                        Text(
                                            "${n.importance} · ${Format.ago(n.createdAt)}",
                                            style = MaterialTheme.typography.labelSmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
            else -> Column(Modifier.padding(16.dp)) {
                SectionTitle("Account events")
                Text(
                    "Sign in on a paid plan to see the live event feed.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}
