package com.deeyoungs.pro.ui.screens.signals

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.TrendingDown
import androidx.compose.material.icons.automirrored.rounded.TrendingUp
import androidx.compose.material.icons.rounded.ExpandLess
import androidx.compose.material.icons.rounded.ExpandMore
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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
import com.deeyoungs.pro.data.ApiResult
import com.deeyoungs.pro.data.RegimeDto
import com.deeyoungs.pro.data.SignalDto
import com.deeyoungs.pro.ui.components.FactorBar
import com.deeyoungs.pro.ui.components.Panel
import com.deeyoungs.pro.ui.components.PaywallCard
import com.deeyoungs.pro.ui.components.PullRefreshList
import com.deeyoungs.pro.ui.components.Pill
import com.deeyoungs.pro.ui.components.SectionTitle
import com.deeyoungs.pro.ui.components.StaleBadge
import com.deeyoungs.pro.ui.navigation.Routes
import com.deeyoungs.pro.ui.screens.auth.simpleFactory
import com.deeyoungs.pro.ui.theme.Grotesk
import com.deeyoungs.pro.ui.theme.MarketColors
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class SignalsUiState(
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val signals: List<SignalDto> = emptyList(),
    val regime: RegimeDto? = null,
    val error: String? = null,
    val paywalled: String? = null,
    val stale: Boolean = false,
)

class SignalsViewModel(private val intelRepo: com.deeyoungs.pro.data.IntelRepository) : ViewModel() {

    private val _state = MutableStateFlow(SignalsUiState())
    val state: StateFlow<SignalsUiState> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = _state.value.signals.isEmpty(), error = null)
            when (val res = intelRepo.signals()) {
                is ApiResult.Success -> _state.value = _state.value.copy(
                    loading = false, refreshing = false, signals = res.data.signals,
                    regime = res.data.regime, stale = res.stale, error = null,
                )
                is ApiResult.Paywalled -> _state.value = _state.value.copy(
                    loading = false, refreshing = false, paywalled = res.message,
                )
                is ApiResult.Offline -> _state.value = _state.value.copy(
                    loading = false, refreshing = false,
                    error = if (_state.value.signals.isEmpty()) "You are offline and we have nothing cached yet." else null,
                )
                else -> _state.value = _state.value.copy(
                    loading = false, refreshing = false,
                    error = "Signals are not reachable right now.",
                )
            }
        }
    }

    fun refresh() {
        _state.value = _state.value.copy(refreshing = true)
        load()
    }
}

@Composable
fun SignalsScreen(nav: NavHostController) {
    val container = ProApp.container(LocalContext.current)
    val vm: SignalsViewModel = viewModel(factory = simpleFactory { SignalsViewModel(container.intelRepository) })
    val state by vm.state.collectAsState()

    Column(Modifier.fillMaxSize()) {
        Text(
            "Signals",
            style = MaterialTheme.typography.headlineSmall,
            fontFamily = Grotesk,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
        )

        if (state.loading) {
            com.deeyoungs.pro.ui.components.LoadingState(label = "Scanning the multi-factor engine")
            return@Column
        }
        state.paywalled?.let {
            Column(Modifier.padding(16.dp)) {
                PaywallCard(message = it, onUpgrade = { nav.navigate(Routes.pricing()) })
            }
            return@Column
        }

        state.regime?.let { regime ->
            Panel(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("Regime: ${regime.label}", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                        Text(
                            regime.explanation,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Pill("conf ${Format.price(regime.confidence)}")
                }
                Spacer(Modifier.height(6.dp))
                Row {
                    regime.drivers.take(4).forEach { d ->
                        Pill(
                            "${d.name}: ${d.value}",
                            container = when (d.leaning) {
                                "BULL" -> MarketColors.posDim()
                                "BEAR" -> MarketColors.negDim()
                                else -> MaterialTheme.colorScheme.surfaceVariant
                            },
                            content = when (d.leaning) {
                                "BULL" -> MarketColors.pos()
                                "BEAR" -> MarketColors.neg()
                                else -> MaterialTheme.colorScheme.onSurfaceVariant
                            },
                            modifier = Modifier.padding(end = 6.dp),
                        )
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
        }

        PullRefreshList(
            refreshing = state.refreshing,
            onRefresh = { vm.refresh() },
            items = state.signals,
            key = { it.symbol },
            emptyText = "No signals above threshold right now. Patience is part of the edge.",
            header = {
                Row(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                    StaleBadge(state.stale)
                    Spacer(Modifier.weight(1f))
                    Text(
                        "${state.signals.size} qualified reads",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            },
            itemContent = { signal ->
                SignalCard(signal)
            },
        )
    }
}

@Composable
private fun SignalCard(signal: SignalDto) {
    var expanded by remember { mutableStateOf(false) }
    val bullish = signal.direction == "LONG"

    Panel(Modifier.fillMaxWidth().padding(vertical = 4.dp).clickable { expanded = !expanded }) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(
                if (bullish) Icons.AutoMirrored.Rounded.TrendingUp else Icons.AutoMirrored.Rounded.TrendingDown,
                contentDescription = null,
                tint = if (bullish) MarketColors.pos() else MarketColors.neg(),
            )
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(signal.symbol, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.width(8.dp))
                    Pill(
                        signal.direction,
                        container = if (bullish) MarketColors.posDim() else MarketColors.negDim(),
                        content = if (bullish) MarketColors.pos() else MarketColors.neg(),
                    )
                }
                Text(
                    "score ${Format.price(signal.score)} · ${signal.name ?: ""}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Icon(if (expanded) Icons.Rounded.ExpandLess else Icons.Rounded.ExpandMore, contentDescription = if (expanded) "Collapse" else "Expand")
        }
        Spacer(Modifier.height(10.dp))
        Row(Modifier.fillMaxWidth()) {
            StatMini("Entry", Format.price(signal.entry), Modifier.weight(1f))
            StatMini("Stop", Format.price(signal.stop), Modifier.weight(1f), MarketColors.neg())
            StatMini("Target", Format.price(signal.target), Modifier.weight(1f), MarketColors.pos())
            StatMini("RR", Format.price(signal.rr), Modifier.weight(1f))
        }

        AnimatedVisibility(expanded) {
            Column {
                Spacer(Modifier.height(10.dp))
                SectionTitle("Why (factor math)")
                signal.factors.sortedByDescending { kotlin.math.abs(it.contribution) }.forEach { f ->
                    FactorBar(f)
                }
                signal.explanation?.let {
                    Spacer(Modifier.height(8.dp))
                    Text(it, style = MaterialTheme.typography.bodyMedium)
                }
                Text(
                    "data ${signal.dataState ?: "?"} · spread ${Format.price(signal.spreadBps)}bps · liquidity ${if (signal.liquidityOk == true) "OK" else "LOW"}",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 8.dp),
                )
            }
        }
    }
}

@Composable
private fun StatMini(label: String, value: String, modifier: Modifier = Modifier, color: androidx.compose.ui.graphics.Color? = null) {
    Column(modifier) {
        Text(label.uppercase(), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(
            value,
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold,
            color = color ?: MaterialTheme.colorScheme.onSurface,
        )
    }
}
