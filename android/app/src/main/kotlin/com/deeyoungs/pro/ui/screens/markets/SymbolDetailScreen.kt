package com.deeyoungs.pro.ui.screens.markets

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
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.ShoppingCart
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import com.deeyoungs.pro.ProApp
import com.deeyoungs.pro.core.util.Format
import com.deeyoungs.pro.data.ApiResult
import com.deeyoungs.pro.data.CandleSeriesDto
import com.deeyoungs.pro.data.QuoteDto
import com.deeyoungs.pro.data.TradeResponseDto
import com.deeyoungs.pro.ui.components.CandleChart
import com.deeyoungs.pro.ui.components.DataStateBadge
import com.deeyoungs.pro.ui.components.Panel
import com.deeyoungs.pro.ui.components.StatTile
import com.deeyoungs.pro.ui.screens.auth.simpleFactory
import com.deeyoungs.pro.ui.theme.Grotesk
import com.deeyoungs.pro.ui.theme.MarketColors
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

private val TIMEFRAMES = listOf("1D", "5D", "1M", "6M", "1Y")

data class SymbolUiState(
    val loading: Boolean = true,
    val quote: QuoteDto? = null,
    val candles: CandleSeriesDto? = null,
    val timeframe: String = "1M",
    val error: String? = null,
    val paywalled: String? = null,
    // trade sheet
    val tradeSide: String = "BUY",
    val tradeQty: String = "",
    val tradeSubmitting: Boolean = false,
    val tradeResult: TradeResponseDto? = null,
    val tradeError: String? = null,
)

class SymbolViewModel(
    private val marketRepo: com.deeyoungs.pro.data.MarketRepository,
    private val portfolioRepo: com.deeyoungs.pro.data.PortfolioRepository,
    private val symbol: String,
) : ViewModel() {

    private val _state = MutableStateFlow(SymbolUiState())
    val state: StateFlow<SymbolUiState> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = _state.value.quote == null, error = null)
            when (val res = marketRepo.quote(symbol)) {
                is ApiResult.Success -> _state.value = _state.value.copy(loading = false, quote = res.data.quotes.firstOrNull())
                is ApiResult.Offline -> _state.value = _state.value.copy(loading = false, error = "You are offline. Connect and retry.")
                else -> _state.value = _state.value.copy(loading = false, error = "Could not load this symbol right now.")
            }
            loadCandles(_state.value.timeframe)
        }
    }

    fun setTimeframe(tf: String) {
        _state.value = _state.value.copy(timeframe = tf)
        loadCandles(tf)
    }

    fun loadCandles(tf: String) {
        viewModelScope.launch {
            when (val res = marketRepo.candles(symbol, tf)) {
                is ApiResult.Success -> _state.value = _state.value.copy(candles = res.data, paywalled = null)
                is ApiResult.Paywalled -> _state.value = _state.value.copy(paywalled = res.message)
                is ApiResult.Offline -> _state.value = _state.value.copy(paywalled = null)
                else -> _state.value = _state.value.copy(paywalled = null)
            }
        }
    }

    fun setTradeSide(side: String) {
        _state.value = _state.value.copy(tradeSide = side)
    }

    fun setTradeQty(qty: String) {
        _state.value = _state.value.copy(tradeQty = qty)
    }

    fun submitTrade() {
        val qty = _state.value.tradeQty.toDoubleOrNull() ?: return
        viewModelScope.launch {
            _state.value = _state.value.copy(tradeSubmitting = true, tradeError = null, tradeResult = null)
            when (val res = portfolioRepo.placeTrade(symbol, _state.value.tradeSide, qty)) {
                is ApiResult.Success -> _state.value = _state.value.copy(tradeSubmitting = false, tradeResult = res.data)
                is ApiResult.Paywalled -> _state.value = _state.value.copy(tradeSubmitting = false, tradeError = res.message)
                is ApiResult.Offline -> _state.value = _state.value.copy(tradeSubmitting = false, tradeError = "No connection: the order was NOT sent.")
                is ApiResult.HttpError -> _state.value = _state.value.copy(tradeSubmitting = false, tradeError = res.message)
                else -> _state.value = _state.value.copy(tradeSubmitting = false, tradeError = "Order failed. Nothing was filled.")
            }
        }
    }

    fun dismissTradeResult() {
        _state.value = _state.value.copy(tradeResult = null, tradeError = null)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SymbolDetailScreen(nav: NavHostController, symbol: String) {
    val container = ProApp.container(LocalContext.current)
    val vm: SymbolViewModel = viewModel(key = "symbol-$symbol", factory = simpleFactory {
        SymbolViewModel(container.marketRepository, container.portfolioRepository, symbol)
    })
    val state by vm.state.collectAsState()
    var showTradeSheet by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(symbol, style = MaterialTheme.typography.titleLarge, fontFamily = Grotesk, fontWeight = FontWeight.SemiBold) },
                navigationIcon = {
                    IconButton(onClick = { nav.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(onClick = { showTradeSheet = true }) {
                        Icon(Icons.Rounded.ShoppingCart, contentDescription = "Paper trade $symbol")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
            )
        },
    ) { padding ->
        if (state.loading) {
            com.deeyoungs.pro.ui.components.LoadingState(Modifier.padding(padding), label = "Loading $symbol")
            return@Scaffold
        }
        val quote = state.quote
        if (quote == null) {
            com.deeyoungs.pro.ui.components.ErrorState(
                Modifier.padding(padding),
                message = state.error ?: "Symbol not found or market data is unavailable.",
                onRetry = { vm.load() },
            )
            return@Scaffold
        }

        Column(
            Modifier.padding(padding).fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(Format.price(quote.price), style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.width(10.dp))
                Text(
                    Format.pct(quote.changePct),
                    color = if (quote.changePct >= 0) MarketColors.pos() else MarketColors.neg(),
                    style = MaterialTheme.typography.titleMedium,
                )
                Spacer(Modifier.weight(1f))
                DataStateBadge(quote.dataState)
            }
            Text(
                "${quote.name} · ${quote.exchange} · ${quote.marketState ?: ""}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(14.dp))

            // Timeframe chips + candle chart
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                TIMEFRAMES.forEach { tf ->
                    FilterChip(
                        selected = state.timeframe == tf,
                        onClick = { vm.setTimeframe(tf) },
                        label = { Text(tf) },
                    )
                }
            }
            Spacer(Modifier.height(10.dp))
            Panel {
                val candles = state.candles?.candles ?: emptyList()
                val paywallText = state.paywalled
                if (candles.isNotEmpty()) {
                    CandleChart(candles = candles.takeLast(90))
                } else if (paywallText != null) {
                    Text(
                        paywallText,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(8.dp))
                    Button(onClick = { nav.navigate(com.deeyoungs.pro.ui.navigation.Routes.pricing()) }) { Text("See plans") }
                } else {
                    Text(
                        "Candles are not available for this symbol right now.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            Spacer(Modifier.height(12.dp))

            Panel {
                Row(Modifier.fillMaxWidth()) {
                    StatTile("Open", Format.price(quote.open), Modifier.weight(1f))
                    StatTile("High", Format.price(quote.dayHigh), Modifier.weight(1f))
                    StatTile("Low", Format.price(quote.dayLow), Modifier.weight(1f))
                }
                Spacer(Modifier.height(10.dp))
                Row(Modifier.fillMaxWidth()) {
                    StatTile("Prev close", Format.price(quote.prevClose), Modifier.weight(1f))
                    StatTile("Volume", Format.compact(quote.volume), Modifier.weight(1f))
                    StatTile("Avg vol", Format.compact(quote.avgVolume), Modifier.weight(1f))
                }
            }

            Text(
                "Prices are ${quote.dataState.lowercase()} from ${quote.provider}. DeeYoung never fabricates market data.",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 10.dp),
            )
        }

        if (showTradeSheet) {
            TradeSheet(
                state = state,
                symbol = symbol,
                onSide = vm::setTradeSide,
                onQty = vm::setTradeQty,
                onSubmit = vm::submitTrade,
                onDismiss = {
                    showTradeSheet = false
                    vm.dismissTradeResult()
                },
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TradeSheet(
    state: SymbolUiState,
    symbol: String,
    onSide: (String) -> Unit,
    onQty: (String) -> Unit,
    onSubmit: () -> Unit,
    onDismiss: () -> Unit,
) {
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(Modifier.padding(horizontal = 20.dp).padding(bottom = 28.dp)) {
            Text("Paper trade $symbol", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
            Text(
                "Simulated execution on the paper brokerage. Fills use the live observed price.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(16.dp))
            SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                SegmentedButton(
                    selected = state.tradeSide == "BUY",
                    onClick = { onSide("BUY") },
                    shape = SegmentedButtonDefaults.itemShape(0, 2),
                ) { Text("BUY") }
                SegmentedButton(
                    selected = state.tradeSide == "SELL",
                    onClick = { onSide("SELL") },
                    shape = SegmentedButtonDefaults.itemShape(1, 2),
                ) { Text("SELL") }
            }
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = state.tradeQty,
                onValueChange = onQty,
                label = { Text("Quantity") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(16.dp))
            Button(
                onClick = onSubmit,
                enabled = !state.tradeSubmitting && (state.tradeQty.toDoubleOrNull() ?: 0.0) > 0,
                modifier = Modifier.fillMaxWidth().height(48.dp),
            ) {
                if (state.tradeSubmitting) {
                    CircularProgressIndicator(Modifier.width(18.dp).height(18.dp), strokeWidth = 2.dp)
                } else {
                    Text("Submit ${state.tradeSide} order")
                }
            }
            state.tradeError?.let {
                Spacer(Modifier.height(10.dp))
                Text(it, color = MarketColors.neg(), style = MaterialTheme.typography.bodyMedium)
            }
            state.tradeResult?.let { result ->
                Spacer(Modifier.height(14.dp))
                Panel(Modifier.fillMaxWidth()) {
                    val exec = result.execution
                    when {
                        result.deduped == true -> Text("This order was already processed.", style = MaterialTheme.typography.bodyMedium)
                        result.ok == true -> {
                            Text(
                                "Filled: ${exec?.filledQty?.let { Format.qty(it) } ?: "?"} @ ${Format.price(exec?.avgFillPrice)}",
                                style = MaterialTheme.typography.titleMedium,
                                color = MarketColors.pos(),
                                fontWeight = FontWeight.SemiBold,
                            )
                            Text(
                                "${exec?.brokerLabel ?: "paper"} · status ${exec?.status ?: "?"}",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        else -> {
                            Text(
                                "Rejected: ${exec?.rejectReason ?: result.error ?: result.message ?: "order not accepted"}",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MarketColors.neg(),
                            )
                        }
                    }
                }
            }
        }
    }
}
