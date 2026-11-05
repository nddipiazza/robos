package com.robos.smarthome.core

import kotlin.math.ln
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin

// Kotlin port of the color helpers in packages/robos-lib/smart-light-engine.js.
// ColorGoldenTest checks these against the JavaScript originals.

data class Rgb(val r: Int, val g: Int, val b: Int)
data class Hsv(val hue: Int, val saturation: Int, val value: Int)
data class CircadianTarget(val hour: Double, val kelvin: Int, val brightness: Int, val colorHex: String, val phase: String)

fun clamp(value: Int, low: Int, high: Int): Int = min(high, max(low, value))

/** Math.round rounds halves up, matching JavaScript. kotlin.math.round rounds them to even. */
internal fun jsRound(value: Double): Int = Math.round(value).toInt()

fun hexToRgb(hex: String): Rgb {
    val clean = hex.removePrefix("#").trim()
    if (clean.length == 3) {
        val part = { i: Int -> (clean[i].toString() + clean[i]).toIntOrNull(16) ?: 0 }
        return Rgb(part(0), part(1), part(2))
    }
    val num = clean.take(6).toIntOrNull(16) ?: return Rgb(0, 188, 212)
    return Rgb((num shr 16) and 255, (num shr 8) and 255, num and 255)
}

fun rgbToHex(rgb: Rgb): String {
    val two = { v: Int -> clamp(v, 0, 255).toString(16).padStart(2, '0') }
    return "#${two(rgb.r)}${two(rgb.g)}${two(rgb.b)}"
}

fun rgbToHsv(rgb: Rgb): Hsv {
    val r = clamp(rgb.r, 0, 255) / 255.0
    val g = clamp(rgb.g, 0, 255) / 255.0
    val b = clamp(rgb.b, 0, 255) / 255.0
    val high = max(r, max(g, b))
    val low = min(r, min(g, b))
    val d = high - low
    var h = 0.0
    if (high != low) {
        h = when (high) {
            r -> (g - b) / d + if (g < b) 6 else 0
            g -> (b - r) / d + 2
            else -> (r - g) / d + 4
        } / 6
    }
    val s = if (high == 0.0) 0.0 else d / high
    return Hsv(jsRound(h * 360), jsRound(s * 100), jsRound(high * 100))
}

/** A fully saturated color for the color slider. */
fun hueToHex(hue: Float): String {
    val h = ((hue % 360f) + 360f) % 360f / 60f
    val x = 1f - kotlin.math.abs(h % 2f - 1f)
    val (r, g, b) = when (h.toInt()) {
        0 -> Triple(1f, x, 0f)
        1 -> Triple(x, 1f, 0f)
        2 -> Triple(0f, 1f, x)
        3 -> Triple(0f, x, 1f)
        4 -> Triple(x, 0f, 1f)
        else -> Triple(1f, 0f, x)
    }
    return rgbToHex(Rgb(jsRound(r * 255.0), jsRound(g * 255.0), jsRound(b * 255.0)))
}

fun kelvinToHex(kelvin: Int): String {
    val k = clamp(kelvin, 1800, 9000) / 100.0
    val r: Double
    val g: Double
    val b: Double
    if (k <= 66) {
        r = 255.0
        g = 99.4708025861 * ln(k) - 161.1195681661
        b = if (k <= 19) 0.0 else 138.5177312231 * ln(k - 10) - 305.0447927307
    } else {
        r = 329.698727446 * (k - 60).pow(-0.1332047592)
        g = 288.1221695283 * (k - 60).pow(-0.0755148492)
        b = 255.0
    }
    return rgbToHex(Rgb(jsRound(r), jsRound(g), jsRound(b)))
}

/** The color temperature and brightness suited to an hour of the day (0 to 23.99). */
fun computeCircadianTarget(hourFloat: Double): CircadianTarget {
    val h = ((hourFloat % 24) + 24) % 24
    val kelvin: Int
    val brightness: Int
    val phase: String
    when {
        h >= 6 && h < 9 -> {
            val t = (h - 6) / 3
            kelvin = jsRound(2500 + t * 2500)
            brightness = jsRound(35 + t * 55)
            phase = "Morning"
        }
        h >= 9 && h < 15 -> {
            val t = sin(((h - 9) / 6) * Math.PI)
            kelvin = jsRound(5000 + t * 800)
            brightness = jsRound(88 + t * 12)
            phase = "Midday"
        }
        h >= 15 && h < 18.5 -> {
            val t = (h - 15) / 3.5
            kelvin = jsRound(5000 - t * 1800)
            brightness = jsRound(85 - t * 20)
            phase = "Afternoon"
        }
        h >= 18.5 && h < 22 -> {
            val t = (h - 18.5) / 3.5
            kelvin = jsRound(3200 - t * 900)
            brightness = jsRound(65 - t * 35)
            phase = "Evening"
        }
        else -> {
            kelvin = 2200
            brightness = 20
            phase = "Night"
        }
    }
    return CircadianTarget(jsRound(h * 10) / 10.0, kelvin, brightness, kelvinToHex(kelvin), phase)
}
