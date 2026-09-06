package com.deeyoungs.pro.ui.screens.desk

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
import androidx.compose.material.icons.automirrored.rounded.TrendingDown
import androidx.compose.material.icons.automirrored.rounded.TrendingFlat
import androidx.compose.material.icons.automirrored.rounded.TrendingUp
import androidx.compose.material3.Icon
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
import com.deeyoungs.pro.data.DeskReadDto
import com.deeyoungs.pro.ui.components.DataStateBadge
import com.deeyoungs.pro.ui.components.EmptyState
import com.deeyoungs.pro.ui.components.ErrorState
import com.deeyoungs.pro.ui.components.LoadingState
import com.deeyoungs.pro.ui.components.Panel
import com.deeyoungs.pro.ui.components.Pill
import com.deeyoungs.pro.ui.components.SectionTitle
import com.deeyoungs.pro.ui.components.StaleBadge
import com.deeyoungs.pro.ui.screens.auth.simpleFactory
import com.deeyoungs.pro.ui.theme.Grotesk
import com.deeyoungs.pro.ui.theme.MarketColors
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class DeskUiState(
    val loading: Boolean = true,
    val reads: List<DeskReadDto> = emptyList(),
    val updatedAt: Long? = null,
    val error: String? = null,
    val stale: Boolean = false,
)

class DeskViewModel(private val marketRepo: com.deeyoungs.pro.data.MarketRepository) : ViewModel() {

    private val _state = MutableStateFlow(DeskUiState())
    val state: StateFlow<DeskUiState> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = _state.value.reads.isEmpty(), error = null)
            when (val res = marketRepo.desk()) {
                is ApiResult.Success -> _state.value = _state.value.copy(
                    loading = false, reads = res.data.desk, updatedAt = res.data.updatedAt,
                    stale = res.stale, error = null,
                )
                is ApiResult.Offline -> _state.value = _state.value.copy(
                    loading = false,
                    error = if (_state.value.reads.isEmpty()) "You are offline and we have nothing cached yet." else null,
                )
                else -> _state.value = _state.value.copy(loading = false, error = "The desk board is not reachable right now.")
            }
        }
    }
}

/** Public cross-market playbook reads (same surface as the site homepage). */
@Composable
fun DeskScreen(nav: NavHostController) {
    val container = ProApp.container(LocalContext.current)
    val vm: DeskViewModel = viewModel(factory = simpleFactory { DeskViewModel(container.marketRepository) })
    val state by vm.state.collectAsState()

    if (state.loading) {
        LoadingState(label = "Loading the playbook desk")
        return
    }
    if (state.reads.isEmpty()) {
        ErrorState(message = state.error ?: "No desk reads available.", onRetry = { vm.load() })
        return
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            Text("Playbook desk", style = MaterialTheme.typography.headlineSmall, fontFamily = Grotesk, fontWeight = FontWeight.SemiBold)
            Text(
                "Factor-engine reads across FX, metals, energy, indices and stocks. Public and never fabricated.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        item { StaleBadge(state.stale) }
        item { SectionTitle("Board (${state.reads.size})") }
        items(state.reads, key = { it.symbol }) { read ->
            val bullish = read.direction == "LONG"
            val neutral = read.direction == "NEUTRAL"
            Panel {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        when {
                            bullish -> Icons.AutoMirrored.Rounded.TrendingUp
                            neutral -> Icons.AutoMirrored.Rounded.TrendingFlat
                            else -> Icons.AutoMirrored.Rounded.TrendingDown
                        },
                        contentDescription = null,
                        tint = when {
                            bullish -> MarketColors.pos()
                            neutral -> MaterialTheme.colorScheme.onSurfaceVariant
                            else -> MarketColors.neg()
                        },
                    )
                    Spacer(Modifier.width(10.dp))
                    Column(Modifier.weight(1f)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(read.symbol, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                            Spacer(Modifier.width(8.dp))
                            DataStateBadge(read.dataState)
                        }
                        Text(
                            read.name,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Column(horizontalAlignment = Alignment.End) {
                        Pill(
                            read.direction,
                            container = if (bullish) MarketColors.posDim() else if (neutral) MaterialTheme.colorScheme.surfaceVariant else MarketColors.negDim(),
                            content = if (bullish) MarketColors.pos() else if (neutral) MaterialTheme.colorScheme.onSurfaceVariant else MarketColors.neg(),
                        )
                        Text(
                            "score ${Format.price(read.score)} · RR ${Format.price(read.rr)}",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                Spacer(Modifier.height(8.dp))
                Row {
                    Text("entry ${Format.price(read.entry)}", style = MaterialTheme.typography.labelSmall)
                    Spacer(Modifier.width(12.dp))
                    Text("stop ${Format.price(read.stop)}", style = MaterialTheme.typography.labelSmall, color = MarketColors.neg())
                    Spacer(Modifier.width(12.dp))
                    Text("target ${Format.price(read.target)}", style = MaterialTheme.typography.labelSmall, color = MarketColors.pos())
                    Spacer(Modifier.weight(1f))
                    Text(Format.agoMs(read.computedAt), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}
