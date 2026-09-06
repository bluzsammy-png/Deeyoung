package com.deeyoungs.pro.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.dp
import com.deeyoungs.pro.core.util.Format
import com.deeyoungs.pro.data.CandleDto
import com.deeyoungs.pro.data.EquityPointDto
import com.deeyoungs.pro.data.FactorDto
import com.deeyoungs.pro.ui.theme.Grotesk
import com.deeyoungs.pro.ui.theme.MarketColors
import kotlin.math.max
import kotlin.math.min

/**
 * Equity curve: brand area chart with hairline grid, value labels drawn on the
 * canvas (pure Compose Canvas, no chart dependency).
 */
@Composable
fun EquityChart(points: List<EquityPointDto>, modifier: Modifier = Modifier, height: Int = 160) {
    val line = MaterialTheme.colorScheme.primary
    val grid = MaterialTheme.colorScheme.outline
    val label = MaterialTheme.colorScheme.onSurfaceVariant
    val negative = MarketColors.neg()

    Column(modifier = modifier) {
        Canvas(Modifier.fillMaxWidth().height(height.dp)) {
            if (points.size < 2) return@Canvas
            val values = points.map { it.e }
            val minV = min(values.min(), points.first().e)
            val maxV = max(values.max(), points.first().e)
            val span = (maxV - minV).takeIf { it > 0.0001 } ?: 1.0
            val stepX = size.width / (points.size - 1)

            fun y(v: Double) = size.height - (((v - minV) / span).toFloat() * size.height * 0.92f) - size.height * 0.04f

            // grid lines
            for (i in 0..3) {
                val gy = size.height * i / 3f
                drawLine(grid, Offset(0f, gy), Offset(size.width, gy), strokeWidth = 1f)
            }

            val path = Path()
            points.forEachIndexed { i, p ->
                val x = i * stepX
                val py = y(p.e)
                if (i == 0) path.moveTo(x, py) else path.lineTo(x, py)
            }
            val isDown = values.last() < values.first()
            val strokeColor = if (isDown) negative else line
            drawPath(path, strokeColor, style = Stroke(width = 5f))

            val area = Path().apply {
                addPath(path)
                lineTo(size.width, size.height)
                lineTo(0f, size.height)
                close()
            }
            drawPath(
                area,
                Brush.verticalGradient(
                    colors = listOf(strokeColor.copy(alpha = 0.22f), Color.Transparent),
                ),
            )

            // last value label
            val lastY = y(values.last())
            drawLine(strokeColor, Offset(size.width - 2f, lastY), Offset(size.width, lastY), strokeWidth = 8f)
            drawContext.canvas.nativeCanvas.apply {
                val paint = android.graphics.Paint().apply {
                    color = label.toArgb()
                    textSize = 30f
                    isAntiAlias = true
                }
                val text = "$${"%,.2f".format(values.last())}"
                val w = paint.measureText(text)
                drawText(text, size.width - w - 8f, (lastY - 20f).coerceAtLeast(36f), paint)
            }
        }
        Row(Modifier.fillMaxWidth()) {
            Text("start $${"%,.2f".format(points.first().e)}", style = MaterialTheme.typography.labelSmall, color = label)
            Spacer(Modifier.weight(1f))
            Text("now $${"%,.2f".format(points.last().e)}", style = MaterialTheme.typography.labelSmall, color = label)
        }
    }
}

/** Simple candlestick chart with market-semantic colors. */
@Composable
fun CandleChart(candles: List<CandleDto>, modifier: Modifier = Modifier, height: Int = 220) {
    val pos = MarketColors.pos()
    val neg = MarketColors.neg()
    val grid = MaterialTheme.colorScheme.outline

    Canvas(modifier.fillMaxWidth().height(height.dp)) {
        if (candles.isEmpty()) return@Canvas
        val highs = candles.map { it.h }
        val lows = candles.map { it.l }
        val minV = lows.min()
        val maxV = highs.max()
        val span = (maxV - minV).takeIf { it > 0.0000001 } ?: 1.0

        for (i in 0..3) {
            val gy = size.height * i / 3f
            drawLine(grid, Offset(0f, gy), Offset(size.width, gy), strokeWidth = 1f)
        }

        val slot = size.width / candles.size
        val bodyW = max(2f, slot * 0.6f)
        candles.forEachIndexed { i, c ->
            val cx = i * slot + slot / 2f
            fun y(v: Double) = size.height - (((v - minV) / span).toFloat() * size.height * 0.94f) - size.height * 0.03f
            val color = if (c.c >= c.o) pos else neg
            // wick
            drawLine(color, Offset(cx, y(c.h)), Offset(cx, y(c.l)), strokeWidth = 2f)
            // body
            val top = y(max(c.o, c.c))
            val bottom = y(min(c.o, c.c))
            drawRoundRect(
                color,
                topLeft = Offset(cx - bodyW / 2f, top),
                size = Size(bodyW, max(2f, bottom - top)),
                cornerRadius = CornerRadius(2f, 2f),
            )
        }
    }
}

/** Signal factor breakdown: signed contribution bars with the plain-language detail. */
@Composable
fun FactorBar(factor: FactorDto, modifier: Modifier = Modifier) {
    val pos = MarketColors.pos()
    val neg = MarketColors.neg()
    val maxAbs = max(factor.max ?: 0.0, kotlin.math.abs(factor.contribution)).coerceAtLeast(0.0001)
    val ratio = (kotlin.math.abs(factor.contribution) / maxAbs).toFloat().coerceIn(0f, 1f)
    val color = if (factor.contribution >= 0) pos else neg

    Column(modifier = modifier.fillMaxWidth().padding(vertical = 6.dp)) {
        Row {
            Text(factor.name ?: factor.key ?: "Factor", style = MaterialTheme.typography.titleSmall)
            Spacer(Modifier.weight(1f))
            Text(
                (if (factor.contribution >= 0) "+" else "") + "%.1f".format(factor.contribution),
                style = MaterialTheme.typography.labelMedium,
                color = color,
            )
        }
        Spacer(Modifier.height(4.dp))
        Canvas(Modifier.fillMaxWidth().height(6.dp)) {
            drawRoundRect(
                color.copy(alpha = 0.15f),
                cornerRadius = CornerRadius(6f, 6f),
            )
            drawRoundRect(
                color,
                size = Size(size.width * ratio, size.height),
                cornerRadius = CornerRadius(6f, 6f),
            )
        }
        factor.detail?.let {
            Spacer(Modifier.height(3.dp))
            Text(
                it,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
