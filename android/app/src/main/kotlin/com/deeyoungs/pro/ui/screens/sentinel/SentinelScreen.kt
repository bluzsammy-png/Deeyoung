package com.deeyoungs.pro.ui.screens.sentinel

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import com.deeyoungs.pro.data.ApprovalDto
import com.deeyoungs.pro.data.SentinelConfigUpdateBody
import com.deeyoungs.pro.data.SentinelStateDto
import com.deeyoungs.pro.ui.components.EmptyState
import com.deeyoungs.pro.ui.components.ErrorState
import com.deeyoungs.pro.ui.components.LoadingState
import com.deeyoungs.pro.ui.components.Panel
import com.deeyoungs.pro.ui.components.PaywallCard
import com.deeyoungs.pro.ui.components.Pill
import com.deeyoungs.pro.ui.components.SectionTitle
import com.deeyoungs.pro.ui.components.StatTile
import com.deeyoungs.pro.ui.components.StaleBadge
import com.deeyoungs.pro.ui.navigation.Routes
import com.deeyoungs.pro.ui.screens.auth.simpleFactory
import com.deeyoungs.pro.ui.theme.Grotesk
import com.deeyoungs.pro.ui.theme.MarketColors
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class SentinelUiState(
    val loading: Boolean = true,
    val state: SentinelStateDto? = null,
    val error: String? = null,
    val paywalled: String? = null,
    val stale: Boolean = false,
    val busy: Boolean = false,
    val message: String? = null,
)

class SentinelViewModel(private val repo: com.deeyoungs.pro.data.SentinelRepository) : ViewModel() {

    private val _state = MutableStateFlow(SentinelUiState())
    val state: StateFlow<SentinelUiState> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = _state.value.state == null, error = null, message = null)
            when (val res = repo.state()) {
                is ApiResult.Success -> _state.value = _state.value.copy(loading = false, state = res.data, stale = res.stale, error = null)
                is ApiResult.Paywalled -> _state.value = _state.value.copy(loading = false, paywalled = res.message)
                is ApiResult.Offline -> _state.value = _state.value.copy(
                    loading = false,
                    error = if (_state.value.state == null) "You are offline and we have nothing cached yet." else null,
                )
                else -> _state.value = _state.value.copy(loading = false, error = "SENTINEL state is not reachable right now.")
            }
        }
    }

    fun decide(approval: ApprovalDto, approve: Boolean) {
        viewModelScope.launch {
            _state.value = _state.value.copy(busy = true, message = null)
            val res = repo.decide(approval.id, approve)
            val msg: String? = when (res) {
                is ApiResult.Success -> if (approve) "Approved. The order went to execution." else "Rejected. No order was sent."
                is ApiResult.Paywalled -> res.message
                is ApiResult.Offline -> "No connection: the decision was NOT recorded."
                is ApiResult.AuthRequired -> "Your session ended. Sign in again."
                is ApiResult.RateLimited -> "Too many actions. Slow down and retry."
                is ApiResult.HttpError -> res.message
                is ApiResult.Failure -> res.message
                is ApiResult.VerifyEmail -> null // unreachable here: approvals need a live session
            }
            _state.value = _state.value.copy(busy = false, message = msg)
            if (res is ApiResult.Success) load()
        }
    }

    fun saveConfig(riskPerTradePct: Double, minRR: Double, minScore: Double, maxDailyLossPct: Double, maxOpen: Int) {
        val cfg = _state.value.state?.config ?: return
        viewModelScope.launch {
            _state.value = _state.value.copy(busy = true, message = null)
            val res = repo.updateConfig(
                SentinelConfigUpdateBody(
                    riskPerTradePct = riskPerTradePct.takeIf { it != cfg.riskPerTradePct },
                    minRR = minRR.takeIf { it != cfg.minRR },
                    minSignalScore = minScore.takeIf { it != cfg.minSignalScore },
                    maxDailyLossPct = maxDailyLossPct.takeIf { it != cfg.maxDailyLossPct },
                    maxOpenPositions = maxOpen.takeIf { it != cfg.maxOpenPositions },
                ),
            )
            val msg: String? = when (res) {
                is ApiResult.Success -> if (res.data.changes.isEmpty()) "No changes to save." else "Saved: ${res.data.changes.joinToString()}"
                is ApiResult.Paywalled -> res.message
                is ApiResult.Offline -> "No connection: limits were NOT saved."
                is ApiResult.AuthRequired -> "Your session ended. Sign in again."
                is ApiResult.RateLimited -> "Too many actions. Slow down and retry."
                is ApiResult.HttpError -> res.message
                is ApiResult.Failure -> res.message
                is ApiResult.VerifyEmail -> null // unreachable here: config needs a live session
            }
            _state.value = _state.value.copy(busy = false, message = msg)
            if (res is ApiResult.Success) load()
        }
    }

    fun setKillSwitch(engaged: Boolean) {
        viewModelScope.launch {
            _state.value = _state.value.copy(busy = true, message = null)
            val res = repo.killSwitch(engaged)
            val msg: String? = when (res) {
                is ApiResult.Success -> if (engaged) "EMERGENCY STOP engaged. Automation blocked." else "Emergency stop released."
                is ApiResult.Paywalled -> res.message
                is ApiResult.Offline -> "No connection: the switch was NOT moved."
                is ApiResult.AuthRequired -> "Your session ended. Sign in again."
                is ApiResult.RateLimited -> "Too many actions. Slow down and retry."
                is ApiResult.HttpError -> res.message
                is ApiResult.Failure -> res.message
                is ApiResult.VerifyEmail -> null // unreachable here: the kill switch needs a live session
            }
            _state.value = _state.value.copy(busy = false, message = msg)
            if (res is ApiResult.Success) load()
        }
    }
}

@Composable
fun SentinelScreen(nav: NavHostController) {
    val container = ProApp.container(LocalContext.current)
    val vm: SentinelViewModel = viewModel(factory = simpleFactory { SentinelViewModel(container.sentinelRepository) })
    val state by vm.state.collectAsState()

    Text(
        "SENTINEL",
        style = MaterialTheme.typography.headlineSmall,
        fontFamily = Grotesk,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
    )

    if (state.loading) {
        LoadingState(label = "Loading SENTINEL")
        return
    }
    state.paywalled?.let {
        Column(Modifier.padding(16.dp)) {
            PaywallCard(message = it, onUpgrade = { nav.navigate(Routes.pricing()) })
        }
        return
    }
    val s = state.state
    if (s == null) {
        ErrorState(message = state.error ?: "SENTINEL unavailable.", onRetry = { vm.load() })
        return
    }

    var releaseConfirm by remember { mutableStateOf(false) }
    var engageConfirm by remember { mutableStateOf(false) }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        StaleBadge(state.stale)
        state.message?.let {
            Panel { Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary) }
        }

        // Mode + state panel
        Panel {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("Mode: ${s.mode}", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Text(
                        when (s.mode) {
                            "OBSERVE" -> "It watches and drafts. It never trades."
                            "APPROVE" -> "It drafts proposals, you decide. Pro."
                            "DELEGATE" -> "It executes inside your hard limits. Elite."
                            else -> s.mode
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Pill(
                    s.state,
                    container = if (s.state == "ACTIVE") MarketColors.posDim() else MarketColors.warn().copy(alpha = 0.15f),
                    content = if (s.state == "ACTIVE") MarketColors.pos() else MarketColors.warn(),
                )
            }
            Spacer(Modifier.height(10.dp))
            Row(Modifier.fillMaxWidth()) {
                StatTile("Equity", Format.money(s.account?.equity), Modifier.weight(1f))
                StatTile("Cash", Format.money(s.account?.cash), Modifier.weight(1f))
                StatTile("Broker", s.account?.broker ?: "—", Modifier.weight(1f))
            }
        }

        // Emergency stop
        Panel {
            SectionTitle("Emergency stop")
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(
                        if (s.killSwitch) "ENGAGED: all automation is blocked" else "Arm the switch to block every automated action",
                        style = MaterialTheme.typography.bodyMedium,
                        color = if (s.killSwitch) MarketColors.neg() else MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Switch(checked = s.killSwitch, onCheckedChange = { if (it) engageConfirm = true else releaseConfirm = true })
            }
        }

        // Pending approvals
        val pending = s.approvals.filter { it.status == "PENDING" }
        SectionTitle("Pending approvals (${pending.size})")
        if (pending.isEmpty()) {
            Panel { EmptyState(text = "No proposals waiting on you.") }
        } else {
            pending.forEach { approval ->
                ApprovalCard(approval, busy = state.busy, onApprove = { vm.decide(approval, true) }, onReject = { vm.decide(approval, false) })
            }
        }

        // Limits editor (server-clamped, server-validated)
        ConfigEditor(s, busy = state.busy, onSave = { risk, rr, score, ddl, maxOpen ->
            vm.saveConfig(risk, rr, score, ddl, maxOpen)
        })

        // Audit tail
        if (s.auditEvents.isNotEmpty()) {
            SectionTitle("Audit trail (recent)")
            Panel {
                s.auditEvents.take(8).forEach { ev ->
                    Row(Modifier.fillMaxWidth().padding(vertical = 3.dp)) {
                        Text(
                            "${ev.action ?: ""}",
                            style = MaterialTheme.typography.labelMedium,
                            modifier = Modifier.weight(1f),
                        )
                        Text(
                            Format.ago(ev.createdAt),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
        Spacer(Modifier.height(24.dp))
    }

    if (engageConfirm) {
        AlertDialog(
            onDismissRequest = { engageConfirm = false },
            title = { Text("Engage the emergency stop?") },
            text = { Text("All SENTINEL automation is blocked and pending approvals are cancelled. Open positions are unaffected. You can release it later.") },
            confirmButton = {
                TextButton(onClick = { engageConfirm = false; vm.setKillSwitch(true) }) {
                    Text("Engage", color = MarketColors.neg())
                }
            },
            dismissButton = { TextButton(onClick = { engageConfirm = false }) { Text("Cancel") } },
        )
    }
    if (releaseConfirm) {
        AlertDialog(
            onDismissRequest = { releaseConfirm = false },
            title = { Text("Release the emergency stop?") },
            text = { Text("SENTINEL re-arms with the same mode and limits. Observe mode remains the safe default.") },
            confirmButton = {
                TextButton(onClick = { releaseConfirm = false; vm.setKillSwitch(false) }) { Text("Release") }
            },
            dismissButton = { TextButton(onClick = { releaseConfirm = false }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun ApprovalCard(approval: ApprovalDto, busy: Boolean, onApprove: () -> Unit, onReject: () -> Unit) {
    Panel {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(approval.symbol, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                Text(
                    "BUY ${Format.qty(approval.qty)} @ ${Format.price(approval.entry)} · score ${Format.price(approval.score)} · RR ${Format.price(approval.rr)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    "risk ${Format.money(approval.riskUsd)} · stop ${Format.price(approval.stop)} · target ${Format.price(approval.target)} · expires ${Format.time(approval.expiresAt)}",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        Spacer(Modifier.height(10.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = onApprove, enabled = !busy, modifier = Modifier.weight(1f)) { Text("Approve") }
            OutlinedButton(
                onClick = onReject,
                enabled = !busy,
                colors = ButtonDefaults.outlinedButtonColors(contentColor = MarketColors.neg()),
                modifier = Modifier.weight(1f),
            ) { Text("Reject") }
        }
    }
}

@Composable
private fun ConfigEditor(
    s: SentinelStateDto,
    busy: Boolean,
    onSave: (Double, Double, Double, Double, Int) -> Unit,
) {
    val cfg = s.config ?: return
    var risk by remember(cfg.riskPerTradePct) { mutableStateOf(cfg.riskPerTradePct.toFloat()) }
    var minRR by remember(cfg.minRR) { mutableStateOf(cfg.minRR.toFloat()) }
    var minScore by remember(cfg.minSignalScore) { mutableStateOf(cfg.minSignalScore.toFloat()) }
    var dailyLoss by remember(cfg.maxDailyLossPct) { mutableStateOf(cfg.maxDailyLossPct.toFloat()) }
    var maxOpen by remember(cfg.maxOpenPositions) { mutableStateOf(cfg.maxOpenPositions.toFloat()) }

    Panel {
        SectionTitle("Limits (server-validated)")
        LimitSlider("Risk per trade", "${"%.1f".format(risk)}%", risk, 0.1f, 5f) { risk = it }
        LimitSlider("Min RR", "%.1f".format(minRR), minRR, 0.5f, 10f) { minRR = it }
        LimitSlider("Min signal score", "%.0f".format(minScore), minScore, 40f, 95f) { minScore = it }
        LimitSlider("Max daily loss", "${"%.1f".format(dailyLoss)}%", dailyLoss, 0.5f, 20f) { dailyLoss = it }
        LimitSlider("Max open positions", "%.0f".format(maxOpen), maxOpen, 1f, 50f) { maxOpen = it }
        Spacer(Modifier.height(8.dp))
        Button(
            onClick = { onSave(risk.toDouble(), minRR.toDouble(), minScore.toDouble(), dailyLoss.toDouble(), maxOpen.toInt()) },
            enabled = !busy,
            modifier = Modifier.fillMaxWidth(),
        ) { Text("Save limits") }
    }
}

@Composable
private fun LimitSlider(
    label: String,
    valueLabel: String,
    value: Float,
    min: Float,
    max: Float,
    onChange: (Float) -> Unit,
) {
    Column(Modifier.fillMaxWidth().padding(vertical = 2.dp)) {
        Row {
            Text(label, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
            Text(valueLabel, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold)
        }
        Slider(value = value, onValueChange = onChange, valueRange = min..max, enabled = true)
    }
}
