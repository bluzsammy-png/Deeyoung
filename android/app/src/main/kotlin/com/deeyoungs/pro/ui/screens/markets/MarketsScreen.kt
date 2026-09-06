package com.deeyoungs.pro.ui.screens.markets

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
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
import com.deeyoungs.pro.data.QuoteDto
import com.deeyoungs.pro.data.SearchHitDto
import com.deeyoungs.pro.ui.components.DataStateBadge
import com.deeyoungs.pro.ui.components.EmptyState
import com.deeyoungs.pro.ui.components.ErrorState
import com.deeyoungs.pro.ui.components.LoadingState
import com.deeyoungs.pro.ui.components.Panel
import com.deeyoungs.pro.ui.components.PullRefreshList
import com.deeyoungs.pro.ui.components.StaleBadge
import com.deeyoungs.pro.ui.navigation.Routes
import com.deeyoungs.pro.ui.screens.auth.simpleFactory
import com.deeyoungs.pro.ui.theme.Grotesk
import com.deeyoungs.pro.ui.theme.MarketColors
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.launch

val MARKET_CLASSES = listOf("ALL", "EQUITY", "ETF", "CRYPTO", "FX", "METAL", "INDEX")

data class MarketsUiState(
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val assetClass: String = "ALL",
    val quotes: List<QuoteDto> = emptyList(),
    val provider: String? = null,
    val query: String = "",
    val searching: Boolean = false,
    val results: List<SearchHitDto> = emptyList(),
    val error: String? = null,
    val paywalled: String? = null,
    val stale: Boolean = false,
)

class MarketsViewModel(
    private val marketRepo: com.deeyoungs.pro.data.MarketRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(MarketsUiState())
    val state: StateFlow<MarketsUiState> = _state.asStateFlow()
    private val queryFlow = MutableStateFlow("")

    init {
        load("ALL")
        viewModelScope.launch {
            @OptIn(FlowPreview::class)
            queryFlow.debounce(350).collect { q ->
                if (q.length >= 2) doSearch(q)
            }
        }
    }

    fun load(assetClass: String) {
        _state.value = _state.value.copy(assetClass = assetClass, loading = _state.value.quotes.isEmpty())
        viewModelScope.launch {
            val res = marketRepo.quotesByClass(assetClass)
            _state.value = when (res) {
                is ApiResult.Success -> _state.value.copy(
                    loading = false, refreshing = false, quotes = res.data.quotes,
                    provider = res.data.provider, stale = res.stale, error = null,
                )
                is ApiResult.Offline -> _state.value.copy(
                    loading = false, refreshing = false,
                    error = if (_state.value.quotes.isEmpty()) "You are offline and we have nothing cached yet." else null,
                )
                else -> _state.value.copy(loading = false, refreshing = false, error = "Market quotes are not reachable right now.")
            }
        }
    }

    fun refresh() {
        _state.value = _state.value.copy(refreshing = true)
        load(_state.value.assetClass)
    }

    fun onQueryChange(q: String) {
        _state.value = _state.value.copy(query = q)
        queryFlow.value = q
        if (q.length < 2) _state.value = _state.value.copy(results = emptyList(), searching = false)
    }

    private fun doSearch(q: String) {
        viewModelScope.launch {
            _state.value = _state.value.copy(searching = true)
            when (val res = marketRepo.search(q)) {
                is ApiResult.Success -> _state.value = _state.value.copy(searching = false, results = res.data.results)
                is ApiResult.Paywalled -> _state.value = _state.value.copy(searching = false, paywalled = res.message)
                else -> _state.value = _state.value.copy(searching = false, results = emptyList())
            }
        }
    }

    fun clearPaywall() {
        _state.value = _state.value.copy(paywalled = null)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MarketsScreen(nav: NavHostController) {
    val container = ProApp.container(LocalContext.current)
    val vm: MarketsViewModel = viewModel(factory = simpleFactory { MarketsViewModel(container.marketRepository) })
    val state by vm.state.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Markets", style = MaterialTheme.typography.headlineSmall, fontFamily = Grotesk, fontWeight = FontWeight.SemiBold) },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
            )
        },
    ) { padding ->
        Column(Modifier.padding(padding)) {
            TabRow(selectedTabIndex = MARKET_CLASSES.indexOf(state.assetClass)) {
                MARKET_CLASSES.forEach { cls ->
                    Tab(
                        selected = state.assetClass == cls,
                        onClick = { vm.load(cls) },
                        text = { Text(cls, style = MaterialTheme.typography.labelMedium) },
                    )
                }
            }
            Spacer(Modifier.height(10.dp))
            OutlinedTextField(
                value = state.query,
                onValueChange = vm::onQueryChange,
                placeholder = { Text("Search any market: stocks, FX, crypto…") },
                leadingIcon = { Icon(Icons.Rounded.Search, contentDescription = null) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
            )
            Spacer(Modifier.height(8.dp))

            if (state.results.isNotEmpty()) {
                LazyColumn(contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp)) {
                    items(state.results, key = { it.symbol + it.exchange }) { hit ->
                        Column(
                            Modifier.fillMaxWidth().clickable {
                                nav.navigate(Routes.symbol(hit.symbol))
                            }.padding(vertical = 10.dp),
                        ) {
                            Text(hit.symbol, fontWeight = FontWeight.SemiBold)
                            Text(
                                "${hit.name} · ${hit.exchange}",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
                return@Column
            }

            if (state.loading) {
                LoadingState(label = "Loading quotes")
                return@Column
            }
            state.error?.let {
                ErrorState(message = it, onRetry = { vm.refresh() })
                return@Column
            }

            PullRefreshList(
                refreshing = state.refreshing,
                onRefresh = { vm.refresh() },
                items = state.quotes,
                key = { it.symbol },
                emptyText = "No quotes in this class right now.",
                itemContent = { quote ->
                    QuoteRow(quote) { nav.navigate(Routes.symbol(quote.symbol)) }
                },
                header = {
                    Row(
                        Modifier.fillMaxWidth().padding(horizontal = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        StaleBadge(state.stale)
                        Spacer(Modifier.weight(1f))
                        state.provider?.let {
                            Text(
                                "data: $it",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                },
            )
        }
    }
}

@Composable
fun QuoteRow(quote: QuoteDto, onClick: () -> Unit) {
    val up = quote.changePct >= 0
    Panel(Modifier.fillMaxWidth().padding(vertical = 4.dp).clickable(onClick = onClick)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(quote.symbol, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.width(8.dp))
                    DataStateBadge(quote.dataState)
                }
                Text(
                    quote.name,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                )
            }
            Column(horizontalAlignment = Alignment.End) {
                Text(Format.price(quote.price), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                Text(
                    "${Format.pct(quote.changePct)} (${Format.money(quote.change, signed = true)})",
                    style = MaterialTheme.typography.labelMedium,
                    color = if (up) MarketColors.pos() else MarketColors.neg(),
                )
            }
        }
    }
}
