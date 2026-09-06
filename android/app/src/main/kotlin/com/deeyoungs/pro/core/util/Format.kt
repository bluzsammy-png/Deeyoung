package com.deeyoungs.pro.core.util

import java.math.BigDecimal
import java.math.RoundingMode
import java.text.DecimalFormat
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/** Number formatting shared by every screen. All money is USD (the engine's book). */
object Format {

    private val intFmt = DecimalFormat("#,##0").apply { isGroupingUsed = true }
    private val decFmt = DecimalFormat("#,##0.00").apply { isGroupingUsed = true }
    private val smallFmt = DecimalFormat("#,##0.0000").apply { isGroupingUsed = true }

    fun money(v: Double?, signed: Boolean = false, dashForNull: Boolean = true): String {
        if (v == null) return if (dashForNull) "—" else ""
        val abs = decFmt.format(BigDecimal.valueOf(v).abs().setScale(2, RoundingMode.HALF_UP))
        val sign = when {
            signed && v > 0 -> "+"
            v < 0 -> "-"
            else -> ""
        }
        return "$sign$$abs"
    }

    fun price(v: Double?): String {
        if (v == null) return "—"
        return if (v < 10) smallFmt.format(BigDecimal.valueOf(v).setScale(4, RoundingMode.HALF_UP))
        else decFmt.format(BigDecimal.valueOf(v).setScale(2, RoundingMode.HALF_UP))
    }

    fun pct(v: Double?, signed: Boolean = true): String {
        if (v == null) return "—"
        val s = decFmt.format(BigDecimal.valueOf(v).abs().setScale(2, RoundingMode.HALF_UP))
        val sign = when {
            signed && v > 0 -> "+"
            v < 0 -> "-"
            else -> ""
        }
        return "$sign$s%"
    }

    fun r(v: Double?): String {
        if (v == null) return "—"
        val s = decFmt.format(BigDecimal.valueOf(v).abs().setScale(2, RoundingMode.HALF_UP))
        val sign = when {
            v > 0 -> "+"
            v < 0 -> "-"
            else -> ""
        }
        return "${sign}$s R"
    }

    fun compact(v: Double?): String {
        if (v == null) return "—"
        val a = kotlin.math.abs(v)
        val sign = if (v < 0) "-" else ""
        return when {
            a >= 1_000_000_000 -> "${sign}${dec(a / 1_000_000_000)}B"
            a >= 1_000_000 -> "${sign}${dec(a / 1_000_000)}M"
            a >= 1_000 -> "${sign}${dec(a / 1_000)}K"
            else -> intFmt.format(v)
        }
    }

    private fun dec(v: Double): String {
        val f = DecimalFormat("#,##0.0")
        var s = f.format(BigDecimal.valueOf(v).setScale(1, RoundingMode.HALF_UP))
        if (s.endsWith(".0")) s = s.dropLast(2)
        return s
    }

    private val timeFmt = DateTimeFormatter.ofPattern("MMM d, HH:mm", Locale.US)
    private val dateFmt = DateTimeFormatter.ofPattern("MMM d, yyyy", Locale.US)

    fun time(iso: String?): String {
        val t = parseIso(iso) ?: return "—"
        return timeFmt.format(t.atZone(ZoneId.systemDefault()))
    }

    fun date(iso: String?): String {
        val t = parseIso(iso) ?: return "—"
        return dateFmt.format(t.atZone(ZoneId.systemDefault()))
    }

    fun ago(iso: String?, nowMs: Long = System.currentTimeMillis()): String {
        val t = parseIso(iso) ?: return "—"
        val d = Duration.between(t, Instant.ofEpochMilli(nowMs))
        val mins = d.toMinutes()
        return when {
            mins < 1 -> "just now"
            mins < 60 -> "${mins}m ago"
            mins < 60 * 24 -> "${d.toHours()}h ago"
            else -> "${d.toDays()}d ago"
        }
    }

    fun agoMs(ms: Long?, nowMs: Long = System.currentTimeMillis()): String {
        if (ms == null || ms <= 0) return "—"
        val d = nowMs - ms
        val mins = d / 60_000
        return when {
            mins < 1 -> "just now"
            mins < 60 -> "${mins}m ago"
            mins < 60 * 24 -> "${d / 3_600_000}h ago"
            else -> "${d / 86_400_000}d ago"
        }
    }

    fun parseIso(iso: String?): Instant? = try {
        Instant.parse(iso)
    } catch (_: Exception) {
        null
    }

    fun qty(v: Double?): String {
        if (v == null) return "—"
        return if (v % 1.0 == 0.0) intFmt.format(v) else smallFmt.format(v)
    }
}
