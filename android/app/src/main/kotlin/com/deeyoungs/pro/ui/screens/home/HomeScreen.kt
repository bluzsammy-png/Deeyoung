package com.deeyoungs.pro.ui.screens.home

import android.content.Intent
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Bolt
import androidx.compose.material.icons.rounded.Psychology
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import com.deeyoungs.pro.ProApp
import com.deeyoungs.pro.core.session.SessionState
import com.deeyoungs.pro.core.util.Format
import com.deeyoungs.pro.data.ApiResult
import com.deeyoungs.pro.data.BriefingDto
import com.deeyoungs.pro.data.EngineSnapshotDto
import com.deeyoungs.pro.ui.components.DataStateBadge
import com.deeyoungs.pro.ui.components.EmptyState
import com.deeyoungs.pro.ui.components.EquityChart
import com.deeyoungs.pro.ui.components.ErrorState
import com.deeyoungs.pro.ui.components.LoadingState
import com.deeyoungs.pro.ui.components.Panel
import com.deeyoungs.pro.ui.components.PaywallCard
import com.deeyoungs.pro.ui.components.Pill
import com.deeyoungs.pro.ui.components.PnlText
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

data class HomeUiState(
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val snapshot: EngineSnapshotDto? = null,
    val briefing: BriefingDto? = null,
    val briefingLoading: Boolean = false,
    val error: String? = null,
    val paywalled: String? = null,
    val stale: Boolean = false,
)

class HomeViewModel(
    private val engineRepo: com.deeyoungs.pro.data.EngineRepository,
    private val intelRepo: com.deeyoungs.pro.data.IntelRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(HomeUiState())
    val state: StateFlow<HomeUiState> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = _state.value.snapshot == null, error = null)
            when (val res = engineRepo.status()) {
                is ApiResult.Success -> _state.value = _state.value.copy(
                    loading = false, refreshing = false, snapshot = res.data, stale = res.stale, error = null,
                )
                is ApiResult.Offline -> _state.value = _state.value.copy(
                    loading = false, refreshing = false,
                    error = if (_state.value.snapshot == null) "You are offline and we have nothing cached yet." else null,
                )
                else -> _state.value = _state.value.copy(
                    loading = false, refreshing = false,
                    error = "The engine status is not reachable right now.",
                )
            }
        }
    }

    fun refresh() {
        _state.value = _state.value.copy(refreshing = true)
        load()
    }

    fun loadBriefing() {
        viewModelScope.launch {
            _state.value = _state.value.copy(briefingLoading = true)
            val res = intelRepo.briefing()
            _state.value = _state.value.copy(
                briefingLoading = false,
                briefing = (res as? ApiResult.Success)?.data ?: res.let { r ->
                    when (r) {
                        is ApiResult.Paywalled -> BriefingDto(ok = false, message = r.message)
                        is ApiResult.HttpError -> BriefingDto(ok = false, message = r.message)
                        is ApiResult.Offline -> BriefingDto(ok = false, message = "Offline: the briefing needs a connection.")
                        else -> BriefingDto(ok = false, message = "The briefing writer is unavailable right now.")
                    }
                },
            )
        }
    }
}

@Composable
fun HomeScreen(nav: NavHostController) {
    val container = ProApp.container(LocalContext.current)
    val vm: HomeViewModel = viewModel(factory = simpleFactory {
        HomeViewModel(container.engineRepository, container.intelRepository)
    })
    val state by vm.state.collectAsState()
    val session by container.sessionManager.state.collectAsState()
    val user = (session as? SessionState.SignedIn)?.user
    val context = LocalContext.current

    if (state.loading) {
        LoadingState(label = "Loading the engine ledger")
        return
    }
    val snap = state.snapshot
    if (snap == null) {
        ErrorState(message = state.error ?: "Engine status unavailable.", onRetry = { vm.load() })
        return
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("DeeYoung Pro", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
                    Text(
                        user?.name?.takeIf { it.isNotBlank() }?.let { "Welcome back, $it" } ?: user?.email ?: "",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                IconButton(onClick = { shareEngineSummary(context, snap) }) {
                    Icon(Icons.Rounded.Share, contentDescription = "Share engine performance")
                }
            }
        }

        item { StaleBadge(state.stale) }

        // Account row
        item {
            Panel {
                Row(Modifier.fillMaxWidth()) {
                    StatTile(
                        "Settled equity", Format.money(snap.account?.settledEquityUsd),
                        modifier = Modifier.weight(1f),
                        delta = Format.money(snap.account?.realizedPnlUsd, signed = true),
                        deltaColor = (snap.account?.realizedPnlUsd ?: 0.0).let {
                            if (it > 0) MarketColors.pos() else if (it < 0) MarketColors.neg() else null
                        },
                    )
                    StatTile(
                        "Win rate", snap.account?.winRatePct?.let { Format.pct(it, signed = false) } ?: "—",
                        modifier = Modifier.weight(1f),
                    )
                    StatTile(
                        "Closed", "${snap.account?.closedCount ?: 0}",
                        modifier = Modifier.weight(1f),
                        delta = "open ${snap.account?.openCount ?: 0}",
                    )
                }
            }
        }

        // Engine controls + status
        item {
            Panel {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        Icons.Rounded.Bolt, contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary, modifier = Modifier.width(24.dp),
                    )
                    Spacer(Modifier.width(8.dp))
                    Column(Modifier.weight(1f)) {
                        Text("Autonomous paper engine", style = MaterialTheme.typography.titleMedium)
                        Text(
                            snap.engine?.executionModel ?: "",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Pill(
                        text = when {
                            snap.engine?.control?.paused == true -> "PAUSED"
                            else -> "RUNNING"
                        },
                        container = if (snap.engine?.control?.paused == true) {
                            MarketColors.warn().copy(alpha = 0.15f)
                        } else {
                            MarketColors.posDim()
                        },
                        content = if (snap.engine?.control?.paused == true) MarketColors.warn() else MarketColors.pos(),
                    )
                }
                snap.engine?.control?.paused?.let { paused ->
                    if (paused && !snap.engine?.control?.reason.isNullOrBlank()) {
                        Spacer(Modifier.height(6.dp))
                        Text(
                            snap.engine?.control?.reason ?: "",
                            style = MaterialTheme.typography.bodySmall,
                            color = MarketColors.warn(),
                        )
                    }
                }
            }
        }

        // Equity curve
        if (snap.equityCurve.size >= 2) {
            item {
                Panel {
                    SectionTitle("Equity curve", trailing = { DataStateBadge("LIVE") })
                    Spacer(Modifier.height(8.dp))
                    EquityChart(points = snap.equityCurve)
                }
            }
        }

        // "Show workings": engine decisions feed
        if (!snap.decisions.isNullOrEmpty()) {
            item { SectionTitle("Engine decisions (show workings)") }
            items(snap.decisions.take(8), key = { it.ts.toString() + it.sym }) { d ->
                Card(
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
                    shape = RoundedCornerShape(12.dp),
                ) {
                    Column(Modifier.padding(12.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(d.sym, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                            Spacer(Modifier.weight(1f))
                            Text(
                                Format.agoMs(d.ts), style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        Spacer(Modifier.height(4.dp))
                        Text(
                            "score ${Format.price(d.score)} · verdict ${d.verdict ?: "n/a"}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        val top = d.factors.sortedByDescending { kotlin.math.abs(it.contribution) }.take(2)
                        top.forEach { f ->
                            Text(
                                "· ${f.name ?: f.key}: ${f.detail ?: ""}",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 2,
                            )
                        }
                    }
                }
            }
        }

        // Open positions
        item { SectionTitle("Open positions (${snap.openPositions.size})") }
        if (snap.openPositions.isEmpty()) {
            item { EmptyState(text = "No open positions right now. The engine only fires when its gates pass.") }
        } else {
            items(snap.openPositions, key = { it.symbol + (it.openedAt ?: "") }) { p ->
                Panel {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(p.symbol, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                            Text(
                                "${p.side ?: "LONG"} · ${Format.qty(p.qty)} @ ${Format.price(p.entryPrice)}",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        Column(horizontalAlignment = Alignment.End) {
                            Text(
                                "stop ${Format.price(p.stop)}",
                                style = MaterialTheme.typography.labelSmall, color = MarketColors.neg(),
                            )
                            Text(
                                "target ${Format.price(p.target)}",
                                style = MaterialTheme.typography.labelSmall, color = MarketColors.pos(),
                            )
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                    Row {
                        Pill("score ${Format.price(p.score)}")
                        Spacer(Modifier.width(6.dp))
                        Pill("RR ${Format.price(p.rr)}")
                        Spacer(Modifier.width(6.dp))
                        Pill("${Format.money(p.notionalUsd)} notional")
                        Spacer(Modifier.width(6.dp))
                        Pill("h${p.horizonMin ?: 30}m")
                    }
                }
            }
        }

        // Recent closed trades
        item { SectionTitle("Recent closed trades") }
        if (snap.recentClosed.isEmpty()) {
            item { EmptyState(text = "No closed trades yet. Every fill lands here with its honest net result.") }
        } else {
            items(snap.recentClosed.take(10), key = { (it.closedAt ?: "") + it.symbol }) { t ->
                val pnl = t.netPnlUsd
                Panel {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(t.symbol, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                            Text(
                                "${t.exitReason ?: "CLOSED"} · ${Format.ago(t.closedAt)}",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        Column(horizontalAlignment = Alignment.End) {
                            PnlText(pnl, style = MaterialTheme.typography.titleMedium)
                            Text(
                                Format.r(t.netR),
                                style = MaterialTheme.typography.labelSmall,
                                color = if ((t.netR ?: 0.0) >= 0) MarketColors.pos() else MarketColors.neg(),
                            )
                        }
                    }
                    Spacer(Modifier.height(6.dp))
                    Text(
                        "in ${Format.price(t.entryPrice)} → out ${Format.price(t.exitPrice)}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }

        // AI briefing
        item {
            Panel {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Rounded.Psychology, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                    Spacer(Modifier.width(8.dp))
                    Text("AI daily briefing", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                    AssistChip(onClick = { vm.loadBriefing() }, label = { Text(if (state.briefing == null) "Generate" else "Refresh") })
                }
                val b = state.briefing
                when {
                    state.briefingLoading -> {
                        Spacer(Modifier.height(8.dp))
                        Text("Writing a grounded briefing from live quotes…", style = MaterialTheme.typography.bodySmall)
                    }
                    b != null && b.ok && !b.briefing.isNullOrBlank() -> {
                        Spacer(Modifier.height(8.dp))
                        Text(b.briefing, style = MaterialTheme.typography.bodyMedium)
                    }
                    b != null && !b.message.isNullOrBlank() -> {
                        Spacer(Modifier.height(8.dp))
                        Text(
                            b.message,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    else -> {
                        Spacer(Modifier.height(8.dp))
                        Text(
                            "A short, grounded market read generated from live data only. Pro feature.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }

        item {
            Text(
                "Run ${snap.engine?.runLabel ?: "-"} · ${snap.engine?.elapsedHours ?: 0.0}h elapsed · " +
                    "fees ${Format.money(snap.account?.feesUsd)} · max DD ${Format.pct(snap.account?.maxDrawdownPct, signed = false)}",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

private fun shareEngineSummary(context: android.content.Context, snap: EngineSnapshotDto) {
    val acct = snap.account
    val text = buildString {
        append("DeeYoung Pro engine update\n")
        append("Equity: ${Format.money(acct?.settledEquityUsd)}")
        append(" (P&L ${Format.money(acct?.realizedPnlUsd, signed = true)})\n")
        append("Closed trades: ${acct?.closedCount ?: 0} · Win rate: ${acct?.winRatePct?.let { "$it%" } ?: "n/a"}\n")
        append("Open positions: ${acct?.openCount ?: 0} · Max drawdown: ${acct?.maxDrawdownPct ?: 0.0}%\n")
        append("Real fills at real market prices. deyoungpro.site")
    }
    val intent = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_TEXT, text)
    }
    context.startActivity(Intent.createChooser(intent, "Share engine performance"))
}
