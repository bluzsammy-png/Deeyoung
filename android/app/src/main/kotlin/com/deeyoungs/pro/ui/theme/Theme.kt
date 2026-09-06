package com.deeyoungs.pro.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

/**
 * App theme. Dark-first (the brand's home), with a light scheme built from the
 * same Crimson Luxe tokens. The user can force either or follow the system.
 */
private fun darkScheme() = darkColorScheme(
    primary = BrandRed,
    onPrimary = Color.White,
    primaryContainer = BrandDim,
    onPrimaryContainer = BrandRedHi,
    secondary = BrandRedHi,
    onSecondary = Color.White,
    tertiary = DarkPos,
    onTertiary = Color(0xFF052E22),
    background = DarkBg,
    onBackground = DarkText,
    surface = DarkCard,
    onSurface = DarkText,
    surfaceVariant = DarkPanel2,
    onSurfaceVariant = DarkMuted,
    surfaceContainerLowest = DarkBg,
    surfaceContainerLow = DarkCard,
    surfaceContainer = DarkPanel2,
    surfaceContainerHigh = DarkPanel3,
    surfaceContainerHighest = DarkPanel3,
    outline = DarkHairline,
    outlineVariant = DarkHairline,
    error = DarkNeg,
    onError = Color.White,
    errorContainer = DarkNegDim,
    onErrorContainer = DarkNeg,
    inverseSurface = LightCard,
    inverseOnSurface = LightText,
)

private fun lightScheme() = lightColorScheme(
    primary = BrandRed,
    onPrimary = Color.White,
    primaryContainer = LightAccentBg,
    onPrimaryContainer = Color(0xFFB91C1C),
    secondary = Color(0xFFB91C1C),
    onSecondary = Color.White,
    tertiary = LightPos,
    onTertiary = Color.White,
    background = LightBg,
    onBackground = LightText,
    surface = LightCard,
    onSurface = LightText,
    surfaceVariant = LightPanel2,
    onSurfaceVariant = LightMuted,
    surfaceContainerLowest = LightCard,
    surfaceContainerLow = LightCard,
    surfaceContainer = LightPanel2,
    surfaceContainerHigh = LightPanel3,
    surfaceContainerHighest = LightPanel3,
    outline = LightHairline,
    outlineVariant = LightHairline,
    error = LightNeg,
    onError = Color.White,
    errorContainer = LightNegDim,
    onErrorContainer = LightNeg,
    inverseSurface = DarkCard,
    inverseOnSurface = DarkText,
)

enum class ThemeMode { SYSTEM, DARK, LIGHT }

@Composable
fun DeeYoungTheme(mode: ThemeMode = ThemeMode.SYSTEM, content: @Composable () -> Unit) {
    val dark = when (mode) {
        ThemeMode.SYSTEM -> isSystemInDarkTheme()
        ThemeMode.DARK -> true
        ThemeMode.LIGHT -> false
    }
    MaterialTheme(
        colorScheme = if (dark) darkScheme() else lightScheme(),
        typography = DeeYoungTypography,
        content = content,
    )
}

/** True while the dark palette is active (used for market-semantic colors). */
@Composable
fun isDarkTheme(): Boolean = isSystemInDarkTheme()

/** Market semantics: green for gains, red for losses, exactly like the web. */
object MarketColors {
    @Composable fun pos() = if (isDarkTheme()) DarkPos else LightPos
    @Composable fun neg() = if (isDarkTheme()) DarkNeg else LightNeg
    @Composable fun warn() = if (isDarkTheme()) DarkWarn else LightWarn
    @Composable fun posDim() = if (isDarkTheme()) DarkPosDim else LightPosDim
    @Composable fun negDim() = if (isDarkTheme()) DarkNegDim else LightNegDim
}
