package com.robos.ipcamera.core

import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Computes the clockwise rotation (0, 90, 180, 270) needed to make a Camera2 sensor
 * frame upright for network viewers.
 *
 * `deviceDegrees` uses Android's `OrientationEventListener` convention (0..359 clockwise from
 * natural portrait: 0 = portrait, 270 = standard landscape with top on the left, 180 = inverted,
 * 90 = reverse landscape with top on the right).
 */
fun computeRotationDegrees(
    sensorOrientation: Int,
    isFrontFacing: Boolean,
    deviceDegrees: Int,
    mode: RotationMode = RotationMode.AUTO,
): Int {
    val dev = ((mode.fixedOrientationDegrees ?: deviceDegrees) % 360 + 360) % 360
    val snapped = ((dev + 45) / 90 * 90) % 360
    return if (isFrontFacing) {
        (sensorOrientation - snapped + 360) % 360
    } else {
        (sensorOrientation + snapped) % 360
    }
}

data class Nv21Frame(
    val bytes: ByteArray,
    val width: Int,
    val height: Int,
)

/**
 * Reusable zero-churn converter from 3-plane YUV_420_888 bytes into upright NV21 (Y + interleaved VU),
 * supporting 0/90/180/270 clockwise rotation and optional digital zoom/pan/tilt crop.
 */
class YuvToNv21Converter {
    private var mainBuf = ByteArray(0)
    private var subBuf = ByteArray(0)

    fun convert(
        yPlane: ByteArray,
        yRowStride: Int,
        uPlane: ByteArray,
        uRowStride: Int,
        uPixelStride: Int,
        vPlane: ByteArray,
        vRowStride: Int,
        vPixelStride: Int,
        srcWidth: Int,
        srcHeight: Int,
        rotationDegrees: Int,
        softwareZoom: Float = 1.0f,
        panX: Float = 0.0f,
        tiltY: Float = 0.0f,
    ): Nv21Frame {
        val rot = ((rotationDegrees % 360) + 360) % 360
        // Optional software crop in source coordinates (even boundaries for 4:2:0 chroma).
        val z = softwareZoom.coerceIn(1.0f, 8.0f)
        val cropW = ((srcWidth / z).toInt() and -2).coerceAtLeast(16).coerceAtMost(srcWidth and -2)
        val cropH = ((srcHeight / z).toInt() and -2).coerceAtLeast(16).coerceAtMost(srcHeight and -2)
        val maxShiftX = (srcWidth - cropW) / 2
        val maxShiftY = (srcHeight - cropH) / 2
        // Map viewer-space pan/tilt onto sensor crop coordinates.
        val (sensorPan, sensorTilt) = when (rot) {
            90 -> -tiltY to panX
            180 -> -panX to tiltY
            270 -> tiltY to -panX
            else -> panX to -tiltY
        }
        val cropX = (((srcWidth - cropW) / 2 + (sensorPan.coerceIn(-1f, 1f) * maxShiftX).roundToInt()) and -2)
            .coerceIn(0, (srcWidth - cropW).coerceAtLeast(0))
        val cropY = (((srcHeight - cropH) / 2 + (sensorTilt.coerceIn(-1f, 1f) * maxShiftY).roundToInt()) and -2)
            .coerceIn(0, (srcHeight - cropH).coerceAtLeast(0))

        val outW = if (rot == 90 || rot == 270) cropH else cropW
        val outH = if (rot == 90 || rot == 270) cropW else cropH
        val ySize = outW * outH
        val totalSize = ySize + (ySize / 2)
        if (mainBuf.size != totalSize) {
            mainBuf = ByteArray(totalSize)
        }
        val out = mainBuf

        // 1. Copy & rotate Y plane
        var dstY = 0
        when (rot) {
            0 -> {
                for (ry in 0 until cropH) {
                    System.arraycopy(yPlane, (cropY + ry) * yRowStride + cropX, out, dstY, cropW)
                    dstY += cropW
                }
            }
            90 -> {
                for (ox in 0 until outW) {
                    val sy = cropY + (cropH - 1 - ox)
                    val rowOff = sy * yRowStride + cropX
                    var writeIdx = ox
                    for (oy in 0 until outH) {
                        out[writeIdx] = yPlane[rowOff + oy]
                        writeIdx += outW
                    }
                }
            }
            180 -> {
                for (oy in 0 until outH) {
                    val sy = cropY + (cropH - 1 - oy)
                    val rowOff = sy * yRowStride + cropX
                    for (ox in 0 until outW) {
                        out[dstY++] = yPlane[rowOff + (cropW - 1 - ox)]
                    }
                }
            }
            270 -> {
                for (oy in 0 until outH) {
                    val sx = cropX + (cropW - 1 - oy)
                    for (ox in 0 until outW) {
                        val sy = cropY + ox
                        out[dstY++] = yPlane[sy * yRowStride + sx]
                    }
                }
            }
        }

        // 2. Copy & rotate UV planes into interleaved VU (NV21)
        val uvOutW = outW / 2
        val uvOutH = outH / 2
        val uvCropX = cropX / 2
        val uvCropY = cropY / 2
        val uvCropW = cropW / 2
        val uvCropH = cropH / 2
        var dstUv = ySize

        for (oy in 0 until uvOutH) {
            for (ox in 0 until uvOutW) {
                val scx: Int
                val scy: Int
                when (rot) {
                    90 -> {
                        scx = uvCropX + oy
                        scy = uvCropY + (uvCropH - 1 - ox)
                    }
                    180 -> {
                        scx = uvCropX + (uvCropW - 1 - ox)
                        scy = uvCropY + (uvCropH - 1 - oy)
                    }
                    270 -> {
                        scx = uvCropX + (uvCropW - 1 - oy)
                        scy = uvCropY + ox
                    }
                    else -> {
                        scx = uvCropX + ox
                        scy = uvCropY + oy
                    }
                }
                val uIdx = scy * uRowStride + scx * uPixelStride
                val vIdx = scy * vRowStride + scx * vPixelStride
                out[dstUv++] = vPlane[vIdx]
                out[dstUv++] = uPlane[uIdx]
            }
        }

        return Nv21Frame(out, outW, outH)
    }

    /** Fast 2x downsampler for the ONVIF `sub` stream so mobile/grid viewers save bandwidth. */
    fun downsampleHalf(src: Nv21Frame): Nv21Frame {
        val subW = ((src.width / 2) and -2).coerceAtLeast(16)
        val subH = ((src.height / 2) and -2).coerceAtLeast(16)
        val ySize = subW * subH
        val total = ySize + (ySize / 2)
        if (subBuf.size != total) {
            subBuf = ByteArray(total)
        }
        val out = subBuf
        val inBytes = src.bytes
        val inW = src.width
        val inYSize = inW * src.height

        var dst = 0
        for (y in 0 until subH) {
            val r0 = (y * 2) * inW
            val r1 = r0 + inW
            for (x in 0 until subW) {
                val c0 = x * 2
                val sum = (inBytes[r0 + c0].toInt() and 0xff) +
                    (inBytes[r0 + c0 + 1].toInt() and 0xff) +
                    (inBytes[r1 + c0].toInt() and 0xff) +
                    (inBytes[r1 + c0 + 1].toInt() and 0xff)
                out[dst++] = (sum ushr 2).toByte()
            }
        }

        val uvW = subW / 2
        val uvH = subH / 2
        var dstUv = ySize
        for (cy in 0 until uvH) {
            val srcCy = cy * 2
            val rowOff = inYSize + srcCy * inW
            for (cx in 0 until uvW) {
                val srcCol = (cx * 2) * 2
                out[dstUv++] = inBytes[rowOff + srcCol]
                out[dstUv++] = inBytes[rowOff + srcCol + 1]
            }
        }
        return Nv21Frame(out, subW, subH)
    }
}

// ── Zero-Allocation NV21 OSD Timestamp Overlay ───────────────────────────────

object Nv21Overlay {
    // Compact 5x7 bitmap glyphs (each Int holds 7 rows of 5 bits, MSB on the left).
    private val GLYPHS: Map<Char, IntArray> = mapOf(
        '0' to intArrayOf(0x0E, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0E),
        '1' to intArrayOf(0x04, 0x0C, 0x04, 0x04, 0x04, 0x04, 0x0E),
        '2' to intArrayOf(0x0E, 0x11, 0x01, 0x02, 0x04, 0x08, 0x1F),
        '3' to intArrayOf(0x1F, 0x02, 0x04, 0x02, 0x01, 0x11, 0x0E),
        '4' to intArrayOf(0x02, 0x06, 0x0A, 0x12, 0x1F, 0x02, 0x02),
        '5' to intArrayOf(0x1F, 0x10, 0x1E, 0x01, 0x01, 0x11, 0x0E),
        '6' to intArrayOf(0x06, 0x08, 0x10, 0x1E, 0x11, 0x11, 0x0E),
        '7' to intArrayOf(0x1F, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08),
        '8' to intArrayOf(0x0E, 0x11, 0x11, 0x0E, 0x11, 0x11, 0x0E),
        '9' to intArrayOf(0x0E, 0x11, 0x11, 0x0F, 0x01, 0x02, 0x0C),
        ':' to intArrayOf(0x00, 0x04, 0x04, 0x00, 0x04, 0x04, 0x00),
        '-' to intArrayOf(0x00, 0x00, 0x00, 0x1F, 0x00, 0x00, 0x00),
        '.' to intArrayOf(0x00, 0x00, 0x00, 0x00, 0x00, 0x06, 0x06),
        '/' to intArrayOf(0x01, 0x02, 0x02, 0x04, 0x08, 0x08, 0x10),
        '|' to intArrayOf(0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04),
        ' ' to intArrayOf(0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00),
        'A' to intArrayOf(0x0E, 0x11, 0x11, 0x1F, 0x11, 0x11, 0x11),
        'B' to intArrayOf(0x1E, 0x11, 0x11, 0x1E, 0x11, 0x11, 0x1E),
        'C' to intArrayOf(0x0E, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0E),
        'D' to intArrayOf(0x1C, 0x12, 0x11, 0x11, 0x11, 0x12, 0x1C),
        'E' to intArrayOf(0x1F, 0x10, 0x10, 0x1E, 0x10, 0x10, 0x1F),
        'F' to intArrayOf(0x1F, 0x10, 0x10, 0x1E, 0x10, 0x10, 0x10),
        'G' to intArrayOf(0x0E, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0F),
        'H' to intArrayOf(0x11, 0x11, 0x11, 0x1F, 0x11, 0x11, 0x11),
        'I' to intArrayOf(0x0E, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0E),
        'J' to intArrayOf(0x07, 0x02, 0x02, 0x02, 0x12, 0x12, 0x0C),
        'K' to intArrayOf(0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11),
        'L' to intArrayOf(0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1F),
        'M' to intArrayOf(0x11, 0x1B, 0x15, 0x15, 0x11, 0x11, 0x11),
        'N' to intArrayOf(0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11),
        'O' to intArrayOf(0x0E, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0E),
        'P' to intArrayOf(0x1E, 0x11, 0x11, 0x1E, 0x10, 0x10, 0x10),
        'Q' to intArrayOf(0x0E, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0D),
        'R' to intArrayOf(0x1E, 0x11, 0x11, 0x1E, 0x14, 0x12, 0x11),
        'S' to intArrayOf(0x0F, 0x10, 0x10, 0x0E, 0x01, 0x01, 0x1E),
        'T' to intArrayOf(0x1F, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04),
        'U' to intArrayOf(0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0E),
        'V' to intArrayOf(0x11, 0x11, 0x11, 0x11, 0x11, 0x0A, 0x04),
        'W' to intArrayOf(0x11, 0x11, 0x11, 0x15, 0x15, 0x1B, 0x11),
        'X' to intArrayOf(0x11, 0x11, 0x0A, 0x04, 0x0A, 0x11, 0x11),
        'Y' to intArrayOf(0x11, 0x11, 0x0A, 0x04, 0x04, 0x04, 0x04),
        'Z' to intArrayOf(0x1F, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1F),
    )

    fun stamp(frame: Nv21Frame, label: String) {
        if (label.isBlank() || frame.width < 160 || frame.height < 60) return
        val scale = if (frame.width >= 960) 2 else 1
        val pad = 6 * scale
        val charStep = 6 * scale
        val maxChars = ((frame.width - pad * 4) / charStep).coerceAtLeast(1)
        val text = label.uppercase().take(maxChars)
        val boxW = min(frame.width - pad * 2, text.length * charStep + pad * 2)
        val boxH = 7 * scale + pad * 2
        val startX = pad
        val startY = pad
        val bytes = frame.bytes
        val w = frame.width
        val ySize = w * frame.height

        // Darken background strip for high legibility on bright walls/windows.
        for (y in startY until min(frame.height, startY + boxH)) {
            val row = y * w
            for (x in startX until min(w, startX + boxW)) {
                val cur = bytes[row + x].toInt() and 0xff
                bytes[row + x] = (cur / 3).toByte()
            }
        }

        // Render crisp white characters (Y=235, neutral chroma U=128, V=128).
        var cursorX = startX + pad
        val textY = startY + pad
        for (ch in text) {
            val glyph = GLYPHS[ch] ?: GLYPHS[' ']!!
            for (gy in 0 until 7) {
                val bits = glyph[gy]
                for (gx in 0 until 5) {
                    if (((bits ushr (4 - gx)) and 1) == 1) {
                        for (sy in 0 until scale) {
                            val py = textY + gy * scale + sy
                            if (py >= frame.height) continue
                            val yRow = py * w
                            val uvRow = ySize + (py / 2) * w
                            for (sx in 0 until scale) {
                                val px = cursorX + gx * scale + sx
                                if (px >= w) continue
                                bytes[yRow + px] = 235.toByte()
                                val uvCol = (px / 2) * 2
                                bytes[uvRow + uvCol] = 128.toByte()
                                bytes[uvRow + uvCol + 1] = 128.toByte()
                            }
                        }
                    }
                }
            }
            cursorX += charStep
        }
    }
}

// ── Luma Motion Detector (matches packages/camera-watch/lib/motion-detector.js) ──

data class MotionResult(
    val motion: Boolean,
    val started: Boolean,
    val ended: Boolean,
    val score: Float,
    val peakScore: Float,
    val lightingChange: Boolean = false,
)

fun pixelThreshold(sensitivity: Int): Int {
    val s = sensitivity.coerceIn(1, 100)
    return (55.0 - (s - 1) * (45.0 / 99.0)).roundToInt().coerceAtLeast(6)
}

class LumaMotionDetector(
    val sampleWidth: Int = 96,
    val sampleHeight: Int = 54,
    sensitivity: Int = 60,
    minAreaPercent: Float = 1.5f,
    cooldownMs: Long = 5_000L,
) {
    private val sampleCount = sampleWidth * sampleHeight
    private val sample = ByteArray(sampleCount)
    private var bg: FloatArray? = null
    private var streak = 0
    private var lastMotionAt = -1L
    private var peak = 0f

    var active: Boolean = false
        private set

    @Volatile
    var threshold: Int = pixelThreshold(sensitivity)
        private set

    @Volatile
    var minAreaPercent: Float = minAreaPercent.coerceIn(0.1f, 50f)
        private set

    @Volatile
    var cooldownMs: Long = cooldownMs.coerceIn(500L, 120_000L)
        private set

    fun configure(sensitivity: Int, minAreaPercent: Float = this.minAreaPercent, cooldownMs: Long = this.cooldownMs) {
        this.threshold = pixelThreshold(sensitivity)
        this.minAreaPercent = minAreaPercent.coerceIn(0.1f, 50f)
        this.cooldownMs = cooldownMs.coerceIn(500L, 120_000L)
    }

    fun reset() {
        bg = null
        streak = 0
        active = false
        peak = 0f
        lastMotionAt = -1L
    }

    /** Samples the Y plane of an upright NV21 frame onto the 96x54 grid and evaluates motion. */
    fun feedNv21(frame: Nv21Frame, nowMs: Long): MotionResult {
        val w = frame.width
        val h = frame.height
        val yBytes = frame.bytes
        var idx = 0
        for (sy in 0 until sampleHeight) {
            val srcY = (sy * h) / sampleHeight
            val rowOff = srcY * w
            for (sx in 0 until sampleWidth) {
                val srcX = (sx * w) / sampleWidth
                sample[idx++] = yBytes[rowOff + srcX]
            }
        }
        return feedGray(sample, nowMs)
    }

    fun feedGray(gray: ByteArray, nowMs: Long): MotionResult {
        val currentBg = bg
        if (currentBg == null || currentBg.size != gray.size) {
            bg = FloatArray(gray.size) { (gray[it].toInt() and 0xff).toFloat() }
            return MotionResult(motion = false, started = false, ended = false, score = 0f, peakScore = 0f)
        }

        val thresh = threshold
        var changed = 0
        for (i in gray.indices) {
            val v = (gray[i].toInt() and 0xff).toFloat()
            val diff = abs(v - currentBg[i])
            if (diff >= thresh) changed++
            // Slowly adapt background model.
            currentBg[i] += (v - currentBg[i]) * 0.08f
        }

        val score = ((changed * 1000f) / max(1, gray.size)).roundToInt() / 10f

        // Whole-room brightness jump (sun/cloud or light switch) resets background without false alarm.
        if (score >= 65f) {
            for (i in gray.indices) {
                currentBg[i] = (gray[i].toInt() and 0xff).toFloat()
            }
            streak = 0
            return MotionResult(motion = active, started = false, ended = false, score = 0f, peakScore = peak, lightingChange = true)
        }

        if (score >= minAreaPercent) {
            streak++
            if (streak >= 2) {
                lastMotionAt = nowMs
                peak = max(peak, score)
                if (!active) {
                    active = true
                    peak = score
                    return MotionResult(motion = true, started = true, ended = false, score = score, peakScore = peak)
                }
            }
        } else {
            streak = 0
        }

        if (active && lastMotionAt >= 0 && nowMs - lastMotionAt >= cooldownMs) {
            active = false
            val finishedPeak = peak
            peak = 0f
            return MotionResult(motion = false, started = false, ended = true, score = score, peakScore = finishedPeak)
        }

        return MotionResult(motion = active, started = false, ended = false, score = score, peakScore = peak)
    }
}
