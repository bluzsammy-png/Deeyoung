package com.deeyoungs.pro.ui.components

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/**
 * Pull-to-refresh list container (Material 3 native). Wraps the screen's
 * LazyColumn with the standard M3 refresh indicator; `header` renders once at
 * the top of the list.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun <T> PullRefreshList(
    refreshing: Boolean,
    onRefresh: () -> Unit,
    items: List<T>,
    key: (T) -> String,
    emptyText: String,
    modifier: Modifier = Modifier,
    header: (@Composable () -> Unit)? = null,
    itemContent: @Composable (T) -> Unit,
) {
    PullToRefreshBox(
        isRefreshing = refreshing,
        onRefresh = onRefresh,
        modifier = modifier.fillMaxSize(),
    ) {
        LazyColumn(
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
            modifier = Modifier.fillMaxSize(),
        ) {
            header?.let { item { it() } }
            if (items.isEmpty()) {
                item { EmptyState(text = emptyText) }
            } else {
                items(items, key = key) { itemContent(it) }
            }
        }
    }
}
