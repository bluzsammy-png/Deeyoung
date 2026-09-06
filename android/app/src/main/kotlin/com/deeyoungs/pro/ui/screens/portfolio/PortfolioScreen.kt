package com.deeyoungs.pro.ui.screens.portfolio

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
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
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
import com.deeyoungs.pro.data.PortfolioDto
import com.deeyoungs.pro.ui.components.EmptyState
import com.deeyoungs.pro.ui.components.EquityChart
import com.deeyoungs.pro.ui.components.ErrorState
import com.deeyoungs.pro.ui.components.LoadingState
import com.deeyoungs.pro.ui.components.Panel
import com.deeyoungs.pro.ui.components.PaywallCard
import com.deeyoungs.pro.ui.components.SectionTitle
import com.deeyoungs.pro.ui.components.StatTile
import com.deeyoungs.pro.ui.components.StaleBadge
import com.deeyoungs.pro.ui.navigation.Routes
import com.deeyoungs.pro.ui.screens.auth.simpleFactory
import com.deeyoungs.pro.ui.theme.MarketColors
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class PortfolioUiState(
    val loading: Boolean = true,
    val data: PortfolioDto? = null,
    val error: String? = null,
    val paywalled: String? = null,
    val stale: Boolean = false,
)

class PortfolioViewModel(private val repo: com.deeyoungs.pro.data.PortfolioRepository) : ViewModel() {

    private val _state = MutableStateFlow(PortfolioUiState())
    val state: StateFlow<PortfolioUiState> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = _state.value.data == null, error = null)
            when (val res = repo.portfolio()) {
                is ApiResult.Success -> _state.value = _state.value.copy(loading = false, data = res.data, stale = res.stale, error = null)
                is ApiResult.Paywalled -> _state.value = _state.value.copy(loading = false, paywalled = res.message)
                is ApiResult.Offline -> _state.value = _state.value.copy(
                    loading = false,
                    error = if (_state.value.data == null) "You are offline and we have nothing cached yet." else null,
                )
                else -> _state.value = _state.value.copy(loading = false, error = "Portfolio data is not reachable right now.")
            }
        }
    }
}

@Composable
fun PortfolioScreen(nav: NavHostController) {
    val container = ProApp.container(LocalContext.current)
    val vm: PortfolioViewModel = viewModel(factory = simpleFactory { PortfolioViewModel(container.portfolioRepository) })
    val state by vm.state.collectAsState()

    if (state.loading) {
        LoadingState(label = "Loading your portfolio")
        return
    }
    state.paywalled?.let {
        Column(Modifier.padding(16.dp)) {
            Text("Portfolio", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(bottom = 12.dp))
            PaywallCard(message = it, onUpgrade = { nav.navigate(Routes.pricing()) })
        }
        return
    }
    val data = state.data
    if (data == null) {
        ErrorState(message = state.error ?: "Portfolio unavailable.", onRetry = { vm.load() })
        return
    }
    val intel = data.intel

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Text("Portfolio", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
        }
        item { StaleBadge(state.stale) }

        item {
            Panel {
                Row(Modifier.fillMaxWidth()) {
                    StatTile("Equity", Format.money(intel.equity), Modifier.weight(1f))
                    StatTile("Invested", Format.money(intel.investedValue), Modifier.weight(1f))
                    StatTile("Cash", Format.money(intel.cash), Modifier.weight(1f))
                }
                Spacer(Modifier.height(10.dp))
                Row(Modifier.fillMaxWidth()) {
                    StatTile(
                        "Total P&L", Format.money(intel.totalPnl, signed = true), Modifier.weight(1f),
                        delta = Format.pct(intel.totalPnlPct),
                        deltaColor = if ((intel.totalPnl ?: 0.0) >= 0) MarketColors.pos() else MarketColors.neg(),
                    )
                    StatTile(
                        "Day P&L", Format.money(intel.dayPnl, signed = true), Modifier.weight(1f),
                        delta = Format.pct(intel.dayPnlPct),
                        deltaColor = if ((intel.dayPnl ?: 0.0) >= 0) MarketColors.pos() else MarketColors.neg(),
                    )
                    StatTile("Max DD", Format.pct(intel.maxDrawdownPct, signed = false), Modifier.weight(1f))
                }
            }
        }

        if (data.snap.size >= 2) {
            item {
                Panel {
                    SectionTitle("Equity snapshots")
                    Spacer(Modifier.height(6.dp))
                    EquityChart(points = data.snap.map { com.deeyoungs.pro.data.EquityPointDto(it.t, it.equity) }, height = 140)
                }
            }
        }

        item { SectionTitle("Positions (${intel.positions.size})") }
        if (intel.positions.isEmpty()) {
            item { EmptyState(text = "No open positions. Paper trades you place land here with live risk math.") }
        } else {
            items(intel.positions, key = { it.symbol }) { p ->
                Panel {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(p.symbol, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                            Text(
                                "${Format.qty(p.qty)} @ ${Format.price(p.avgPrice)} avg · ${Format.pct(p.weightPct, signed = false)} of book",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        Column(horizontalAlignment = Alignment.End) {
                            Text(Format.money(p.marketValue), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                            Text(
                                Format.money(p.unrealizedPnl, signed = true),
                                style = MaterialTheme.typography.labelMedium,
                                color = if ((p.unrealizedPnl ?: 0.0) >= 0) MarketColors.pos() else MarketColors.neg(),
                            )
                        }
                    }
                }
            }
        }

        if (intel.warnings.isNotEmpty()) {
            item { SectionTitle("Risk warnings") }
            items(intel.warnings) { w ->
                Panel {
                    Text(
                        w,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MarketColors.warn(),
                    )
                }
            }
        }

        if (intel.scenarios.isNotEmpty()) {
            item { SectionTitle("Scenario shocks") }
            item {
                Panel {
                    intel.scenarios.forEach { s ->
                        Row(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                            Text(s.name, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
                            Text(
                                "${Format.money(s.impactUsd, signed = true)} (${Format.pct(s.impactPct)})",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MarketColors.neg(),
                            )
                        }
                    }
                }
            }
        }

        item { SectionTitle("Recent orders") }
        if (data.orders.isEmpty()) {
            item { EmptyState(text = "No orders yet.") }
        } else {
            items(data.orders.take(10), key = { it.id ?: it.createdAt ?: it.symbol }) { o ->
                Panel {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(o.symbol, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                                Spacer(Modifier.width(6.dp))
                                Text(
                                    "${o.side ?: ""} ${Format.qty(o.qty)}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            Text(
                                "${o.status ?: ""}${o.rejectReason?.let { " · $it" } ?: ""} · ${Format.ago(o.createdAt)}",
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
