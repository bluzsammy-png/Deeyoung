@file:OptIn(androidx.compose.ui.text.ExperimentalTextApi::class)

package com.deeyoungs.pro.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.deeyoungs.pro.R

/**
 * Brand typography: Space Grotesk display + JetBrains Mono numerics
 * (variable TTFs, OFL licensed). Body text stays on the platform sans so
 * paragraphs read like an Android app, not a squeezed website.
 */
private fun grotesk(weight: FontWeight) = Font(
    resId = R.font.spacegrotesk_variable,
    weight = weight,
    variationSettings = FontVariation.Settings(FontVariation.weight(weight.weight)),
)

private fun mono(weight: FontWeight) = Font(
    resId = R.font.jetbrainsmono_variable,
    weight = weight,
    variationSettings = FontVariation.Settings(FontVariation.weight(weight.weight)),
)

val Grotesk = FontFamily(
    grotesk(FontWeight.Normal),
    grotesk(FontWeight.Medium),
    grotesk(FontWeight.SemiBold),
    grotesk(FontWeight.Bold),
)

val Mono = FontFamily(
    mono(FontWeight.Normal),
    mono(FontWeight.Medium),
    mono(FontWeight.SemiBold),
    mono(FontWeight.Bold),
)

/** Tabular numerics: every number in the terminal renders in JetBrains Mono. */
val NumStyle = TextStyle(
    fontFamily = Mono,
    fontFeatureSettings = "tnum",
    letterSpacing = (-0.01).sp,
)

val DeeYoungTypography = Typography(
    displaySmall = TextStyle(
        fontFamily = Grotesk, fontWeight = FontWeight.SemiBold,
        fontSize = 34.sp, letterSpacing = (-0.03).sp,
    ),
    headlineLarge = TextStyle(
        fontFamily = Grotesk, fontWeight = FontWeight.SemiBold,
        fontSize = 30.sp, letterSpacing = (-0.03).sp,
    ),
    headlineMedium = TextStyle(
        fontFamily = Grotesk, fontWeight = FontWeight.SemiBold,
        fontSize = 26.sp, letterSpacing = (-0.03).sp,
    ),
    headlineSmall = TextStyle(
        fontFamily = Grotesk, fontWeight = FontWeight.SemiBold,
        fontSize = 22.sp, letterSpacing = (-0.02).sp,
    ),
    titleLarge = TextStyle(
        fontFamily = Grotesk, fontWeight = FontWeight.SemiBold,
        fontSize = 19.sp, letterSpacing = (-0.02).sp,
    ),
    titleMedium = TextStyle(
        fontFamily = Grotesk, fontWeight = FontWeight.Medium,
        fontSize = 16.sp, letterSpacing = (-0.01).sp,
    ),
    titleSmall = TextStyle(
        fontFamily = Grotesk, fontWeight = FontWeight.Medium,
        fontSize = 14.sp,
    ),
    bodyLarge = TextStyle(fontSize = 16.sp, lineHeight = 23.sp),
    bodyMedium = TextStyle(fontSize = 14.sp, lineHeight = 20.sp),
    bodySmall = TextStyle(fontSize = 12.sp, lineHeight = 17.sp),
    labelLarge = TextStyle(
        fontFamily = Grotesk, fontWeight = FontWeight.SemiBold,
        fontSize = 14.sp, letterSpacing = 0.1.sp,
    ),
    labelMedium = TextStyle(
        fontFamily = Grotesk, fontWeight = FontWeight.SemiBold,
        fontSize = 12.sp, letterSpacing = 0.4.sp,
    ),
    labelSmall = TextStyle(
        fontFamily = Mono, fontWeight = FontWeight.Medium,
        fontSize = 10.sp, letterSpacing = 0.5.sp,
    ),
)
