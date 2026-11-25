package com.robos.assistant.core

import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import java.io.ByteArrayOutputStream
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.UUID
import java.util.concurrent.CopyOnWriteArrayList
import kotlin.math.abs
import kotlin.math.log10
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

/**
 * Standard RIFF WAVE 16-bit mono little-endian codec.
 */
object WavCodec {
    data class DecodedWav(
        val pcm16le: ByteArray,
        val sampleRate: Int,
        val channels: Int,
        val bitsPerSample: Int,
        val durationMs: Long,
    )

    fun encodePcm16Mono(pcm16le: ByteArray, sampleRate: Int = 16000): ByteArray {
        val byteRate = sampleRate * 2
        val dataSize = pcm16le.size
        val out = ByteArray(44 + dataSize)
        val header = ByteBuffer.wrap(out, 0, 44).order(ByteOrder.LITTLE_ENDIAN)
        header.put("RIFF".toByteArray(Charsets.US_ASCII))
        header.putInt(36 + dataSize)
        header.put("WAVE".toByteArray(Charsets.US_ASCII))
        header.put("fmt ".toByteArray(Charsets.US_ASCII))
        header.putInt(16) // PCM fmt chunk size
        header.putShort(1) // PCM format = 1
        header.putShort(1) // Mono = 1 channel
        header.putInt(sampleRate)
        header.putInt(byteRate)
        header.putShort(2) // Block align = 2 bytes
        header.putShort(16) // 16 bits per sample
        header.put("data".toByteArray(Charsets.US_ASCII))
        header.putInt(dataSize)
        System.arraycopy(pcm16le, 0, out, 44, dataSize)
        return out
    }

    fun buildStreamingWavHeader(sampleRate: Int = 16000): ByteArray {
        val byteRate = sampleRate * 2
        val header = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN)
        header.put("RIFF".toByteArray(Charsets.US_ASCII))
        header.putInt(0x7FFFFFFF)
        header.put("WAVE".toByteArray(Charsets.US_ASCII))
        header.put("fmt ".toByteArray(Charsets.US_ASCII))
        header.putInt(16)
        header.putShort(1)
        header.putShort(1)
        header.putInt(sampleRate)
        header.putInt(byteRate)
        header.putShort(2)
        header.putShort(16)
        header.put("data".toByteArray(Charsets.US_ASCII))
        header.putInt(0x7FFFFFFF - 36)
        return header.array()
    }

    fun decodeWav(wavBytes: ByteArray): DecodedWav? {
        if (wavBytes.size < 44) return null
        val buf = ByteBuffer.wrap(wavBytes).order(ByteOrder.LITTLE_ENDIAN)
        val riff = String(wavBytes, 0, 4, Charsets.US_ASCII)
        val wave = String(wavBytes, 8, 4, Charsets.US_ASCII)
        if (riff != "RIFF" || wave != "WAVE") return null

        var offset = 12
        var channels = 1
        var sampleRate = 16000
        var bitsPerSample = 16
        while (offset <= wavBytes.size - 8) {
            val chunkId = String(wavBytes, offset, 4, Charsets.US_ASCII)
            val chunkSize = buf.getInt(offset + 4)
            val payloadStart = offset + 8
            if (chunkId == "fmt " && payloadStart + 16 <= wavBytes.size) {
                channels = (buf.getShort(payloadStart + 2).toInt() and 0xFFFF).coerceAtLeast(1)
                sampleRate = buf.getInt(payloadStart + 4).coerceAtLeast(8000)
                bitsPerSample = (buf.getShort(payloadStart + 14).toInt() and 0xFFFF).coerceAtLeast(8)
            } else if (chunkId == "data") {
                val safeLen = if (chunkSize in 1..(wavBytes.size - payloadStart)) {
                    chunkSize
                } else {
                    (wavBytes.size - payloadStart).coerceAtLeast(0)
                }
                val pcm = wavBytes.copyOfRange(payloadStart, payloadStart + safeLen)
                val bytesPerSecond = (sampleRate * channels * (bitsPerSample / 8)).coerceAtLeast(1)
                val durationMs = (pcm.size * 1000L) / bytesPerSecond
                return DecodedWav(
                    pcm16le = pcm,
                    sampleRate = sampleRate,
                    channels = channels,
                    bitsPerSample = bitsPerSample,
                    durationMs = durationMs,
                )
            }
            if (chunkSize <= 0) break
            offset = payloadStart + chunkSize + (chunkSize and 1)
        }
        return null
    }
}

data class FrameLevelTelemetry(
    val speechActive: Boolean,
    val inUtterance: Boolean,
    val rmsDbFs: Float,
    val peakDbFs: Float,
    val noiseFloorDbFs: Float,
    val bars: List<Float>,
)

data class CapturedUtterance(
    val pcm16le: ByteArray,
    val sampleRate: Int,
    val durationMs: Long,
    val peakDbFs: Float,
    val startedEpochMs: Long,
    val endedEpochMs: Long,
)

/**
 * Surveillance-grade Voice Activity Detector (VAD) & Utterance Segmenter.
 *
 * Maintains a circular pre-roll PCM buffer so the beginning of every spoken phrase
 * (e.g. "Commander...") is preserved intact without clipping initial consonants.
 */
class AdaptiveVadSegmenter(
    private val sampleRate: Int = 16000,
    sensitivity: Int = 60,
    silenceHangMs: Int = 1100,
    preRollMs: Int = 500,
    maxClipSeconds: Int = 45,
) {
    @Volatile
    var sensitivity: Int = sensitivity.coerceIn(1, 100)

    @Volatile
    var silenceHangMs: Int = silenceHangMs.coerceIn(200, 4000)

    @Volatile
    var maxClipSeconds: Int = maxClipSeconds.coerceIn(10, 300)

    private val preRollCapacityBytes: Int = ((sampleRate * 2 * preRollMs.coerceIn(200, 1500)) / 1000) and 0x7FFFFFFE
    private val preRollRing = ByteArray(preRollCapacityBytes.coerceAtLeast(3200))
    private var preRollWritePos = 0
    private var preRollFilled = 0

    private var noiseFloorRms = 0.0035f
    private var inUtterance = false
    private var utteranceStartedEpochMs = 0L
    private var utteranceSpeechFrames = 0
    private var silenceAccumulatedMs = 0L
    private var utterancePeakLinear = 0.0001f
    private val activeBuffer = ByteArrayOutputStream(64 * 1024)
    private val rollingBars = FloatArray(16) { 0.04f }
    private var barWriteIdx = 0

    @get:Synchronized
    val isInUtterance: Boolean
        get() = inUtterance

    @Synchronized
    fun currentUtteranceBytes(): ByteArray = activeBuffer.toByteArray()

    @Synchronized
    fun reset() {
        inUtterance = false
        utteranceSpeechFrames = 0
        silenceAccumulatedMs = 0L
        utterancePeakLinear = 0.0001f
        activeBuffer.reset()
        preRollWritePos = 0
        preRollFilled = 0
    }

    @Synchronized
    fun processPcm16Le(
        pcm: ByteArray,
        length: Int = pcm.size,
        nowEpochMs: Long = System.currentTimeMillis(),
        earlyFinalizeHint: Boolean = false,
        onUtteranceComplete: (CapturedUtterance) -> Unit,
    ): FrameLevelTelemetry {
        val validBytes = (length.coerceAtMost(pcm.size)) and 0x7FFFFFFE
        if (validBytes <= 0) {
            return FrameLevelTelemetry(
                speechActive = false,
                inUtterance = inUtterance,
                rmsDbFs = -90f,
                peakDbFs = -90f,
                noiseFloorDbFs = linearToDbFs(noiseFloorRms),
                bars = snapshotBars(),
            )
        }

        val sampleCount = validBytes / 2
        var sumSq = 0.0
        var peak = 0.00001f
        var i = 0
        while (i < validBytes) {
            val lo = pcm[i].toInt() and 0xFF
            val hi = pcm[i + 1].toInt()
            val sample = ((hi shl 8) or lo).toShort().toInt()
            val norm = abs(sample) / 32768f
            if (norm > peak) peak = norm
            sumSq += (norm * norm).toDouble()
            i += 2
        }
        val rms = sqrt(sumSq / sampleCount.coerceAtLeast(1)).toFloat()
        val frameDurationMs = ((sampleCount * 1000L) / sampleRate).coerceAtLeast(1L)

        // Sensitivity 1..100 -> lower multiplier & base floor at higher sensitivity
        val sensNorm = (100 - sensitivity) / 100f // 0.0 (most sensitive) .. 0.99 (least sensitive)
        val minSpeechRms = 0.008f + sensNorm * 0.040f
        val dynamicThreshold = max(minSpeechRms, noiseFloorRms * (2.3f + sensNorm * 2.4f) + 0.004f)
        val speechActive = rms >= dynamicThreshold

        if (!speechActive && !inUtterance && rms < 0.06f) {
            noiseFloorRms = (0.94f * noiseFloorRms + 0.06f * rms).coerceIn(0.0015f, 0.05f)
        }

        val barVal = ((linearToDbFs(rms) + 65f) / 55f).coerceIn(0.04f, 1.0f)
        rollingBars[barWriteIdx] = barVal
        barWriteIdx = (barWriteIdx + 1) % rollingBars.size

        if (!inUtterance) {
            if (speechActive) {
                inUtterance = true
                utteranceSpeechFrames = 1
                silenceAccumulatedMs = 0L
                utterancePeakLinear = peak
                activeBuffer.reset()
                val preRollBytes = drainPreRoll()
                val preRollDurationMs = (preRollBytes.size * 1000L) / (sampleRate * 2)
                utteranceStartedEpochMs = nowEpochMs - preRollDurationMs
                if (preRollBytes.isNotEmpty()) {
                    activeBuffer.write(preRollBytes)
                }
                activeBuffer.write(pcm, 0, validBytes)
            } else {
                appendPreRoll(pcm, validBytes)
            }
        } else {
            activeBuffer.write(pcm, 0, validBytes)
            if (peak > utterancePeakLinear) utterancePeakLinear = peak
            if (speechActive) {
                utteranceSpeechFrames += 1
                silenceAccumulatedMs = 0L
            } else {
                silenceAccumulatedMs += frameDurationMs
            }

            val totalBytes = activeBuffer.size()
            val totalDurationMs = (totalBytes * 1000L) / (sampleRate * 2)
            val maxDurationMs = maxClipSeconds * 1000L
            val fastWakeCut = earlyFinalizeHint && silenceAccumulatedMs >= 300L && totalDurationMs in 300L..1750L

            if (fastWakeCut || silenceAccumulatedMs >= silenceHangMs || totalDurationMs >= maxDurationMs) {
                val capturedBytes = activeBuffer.toByteArray()
                val hadRealSpeech = utteranceSpeechFrames >= 2 && totalDurationMs >= 280L
                val startMs = utteranceStartedEpochMs
                val peakDb = linearToDbFs(utterancePeakLinear)

                inUtterance = false
                utteranceSpeechFrames = 0
                silenceAccumulatedMs = 0L
                utterancePeakLinear = 0.0001f
                activeBuffer.reset()

                if (hadRealSpeech) {
                    onUtteranceComplete(
                        CapturedUtterance(
                            pcm16le = capturedBytes,
                            sampleRate = sampleRate,
                            durationMs = totalDurationMs,
                            peakDbFs = peakDb,
                            startedEpochMs = startMs,
                            endedEpochMs = nowEpochMs,
                        ),
                    )
                }
            }
        }

        return FrameLevelTelemetry(
            speechActive = speechActive,
            inUtterance = inUtterance,
            rmsDbFs = linearToDbFs(rms),
            peakDbFs = linearToDbFs(peak),
            noiseFloorDbFs = linearToDbFs(noiseFloorRms),
            bars = snapshotBars(),
        )
    }

    @Synchronized
    fun flushActiveUtterance(nowEpochMs: Long = System.currentTimeMillis()): CapturedUtterance? {
        if (!inUtterance || activeBuffer.size() == 0) return null
        val capturedBytes = activeBuffer.toByteArray()
        val totalDurationMs = (capturedBytes.size * 1000L) / (sampleRate * 2)
        val peakDb = linearToDbFs(utterancePeakLinear)
        val startMs = utteranceStartedEpochMs
        val hadRealSpeech = utteranceSpeechFrames >= 2 && totalDurationMs >= 280L
        reset()
        return if (hadRealSpeech) {
            CapturedUtterance(
                pcm16le = capturedBytes,
                sampleRate = sampleRate,
                durationMs = totalDurationMs,
                peakDbFs = peakDb,
                startedEpochMs = startMs,
                endedEpochMs = nowEpochMs,
            )
        } else {
            null
        }
    }

    private fun appendPreRoll(pcm: ByteArray, validBytes: Int) {
        val cap = preRollRing.size
        if (cap == 0) return
        val srcOffset = max(0, validBytes - cap)
        val count = min(validBytes, cap)
        var idx = 0
        while (idx < count) {
            preRollRing[preRollWritePos] = pcm[srcOffset + idx]
            preRollWritePos = (preRollWritePos + 1) % cap
            idx++
        }
        preRollFilled = min(cap, preRollFilled + count)
    }

    private fun drainPreRoll(): ByteArray {
        if (preRollFilled <= 0) return ByteArray(0)
        val cap = preRollRing.size
        val out = ByteArray(preRollFilled)
        val start = if (preRollFilled == cap) preRollWritePos else 0
        var i = 0
        while (i < preRollFilled) {
            out[i] = preRollRing[(start + i) % cap]
            i++
        }
        preRollWritePos = 0
        preRollFilled = 0
        return out
    }

    private fun snapshotBars(): List<Float> {
        val out = ArrayList<Float>(rollingBars.size)
        for (k in rollingBars.indices) {
            out.add(rollingBars[(barWriteIdx + k) % rollingBars.size])
        }
        return out
    }

    companion object {
        fun linearToDbFs(linear: Float): Float {
            if (linear <= 0.0000316f) return -90f
            return (20.0 * log10(linear.toDouble())).toFloat().coerceIn(-90f, 0f)
        }
    }
}

data class WakeWordMatch(
    val matched: Boolean,
    val trigger: String = "",
    val query: String = "",
) {
    val isGreetingOnly: Boolean
        get() = matched && (
            query.isBlank() ||
                GREETING_ONLY_REGEX.matches(query.trim())
            )

    companion object {
        private val GREETING_ONLY_REGEX = Regex("^(?:hi|hello|hey|howdy|what'?s\\s+up|there)[!.?\\s]*$", RegexOption.IGNORE_CASE)
    }
}

/**
 * Wake-word parser matching `packages/voice-prompt/lib/wake-word.js` ("Commander, <command>").
 * Anchored to the start of the utterance so mid-sentence mentions of "commander" in room
 * conversation, TV shows, or games never cause false positives.
 */
object WakeWordParser {
    private val PATTERNS = listOf(
        Regex(
            "^(?:(?:and|um|uh|so|well|oh)[,.\\s]+)?(?:hello|hey|hi|ok|okay|yo)[,\\s.-]*commander\\b",
            RegexOption.IGNORE_CASE,
        ),
        Regex(
            "^(?:(?:and|um|uh|so|well|oh)[,.\\s]+)?commander\\b",
            RegexOption.IGNORE_CASE,
        ),
    )

    fun parse(text: String): WakeWordMatch {
        val trimmed = text.trim()
        if (trimmed.isEmpty()) return WakeWordMatch(matched = false)
        for (pattern in PATTERNS) {
            val m = pattern.find(trimmed) ?: continue
            val trigger = m.value.trim().trim(',', '.', '!', '?', ' ', '-')
            val remainder = trimmed.substring(m.range.last + 1)
                .trim()
                .trimStart(',', '.', '!', '?', ':', ';', '-', ' ')
                .trim()
            return WakeWordMatch(
                matched = true,
                trigger = trigger,
                query = remainder,
            )
        }
        return WakeWordMatch(matched = false)
    }
}

/**
 * Surveillance Audio + Text Archive Store with FIFO retention limits (`maxClips`, `maxMb`).
 */
class RecordingArchiveStore(private val rootDir: File) {
    private val wavDir = File(rootDir, "wav")
    private val indexFile = File(rootDir, "recordings-index.json")
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
        prettyPrint = false
    }
    private val entries = ArrayList<AudioRecordingEntry>()

    init {
        wavDir.mkdirs()
        loadFromDisk()
    }

    @Synchronized
    private fun loadFromDisk() {
        entries.clear()
        if (!indexFile.exists()) return
        try {
            val loaded = json.decodeFromString(
                ListSerializer(AudioRecordingEntry.serializer()),
                indexFile.readText(),
            )
            entries.addAll(loaded.filter { File(wavDir, it.wavFileName).exists() })
        } catch (_: Exception) {
        }
    }

    @Synchronized
    private fun persistIndex() {
        rootDir.mkdirs()
        val tmp = File(rootDir, "recordings-index.json.tmp")
        tmp.writeText(json.encodeToString(ListSerializer(AudioRecordingEntry.serializer()), entries))
        tmp.renameTo(indexFile)
    }

    @Synchronized
    fun saveRecording(
        wavBytes: ByteArray,
        entryWithoutSize: AudioRecordingEntry,
        maxClips: Int = 500,
        maxMb: Int = 512,
    ): AudioRecordingEntry {
        wavDir.mkdirs()
        val wavFile = File(wavDir, entryWithoutSize.wavFileName)
        wavFile.writeBytes(wavBytes)
        val saved = entryWithoutSize.copy(sizeBytes = wavFile.length())
        entries.removeAll { it.id == saved.id }
        entries.add(0, saved)
        pruneLocked(maxClips = maxClips, maxBytes = maxMb.toLong() * 1024L * 1024L)
        persistIndex()
        return saved
    }

    @Synchronized
    fun updateRecording(id: String, transform: (AudioRecordingEntry) -> AudioRecordingEntry): AudioRecordingEntry? {
        val idx = entries.indexOfFirst { it.id == id }
        if (idx < 0) return null
        val updated = transform(entries[idx])
        entries[idx] = updated
        persistIndex()
        return updated
    }

    @Synchronized
    fun getRecording(id: String): AudioRecordingEntry? = entries.firstOrNull { it.id == id }

    @Synchronized
    fun getWavFile(idOrFileName: String): File? {
        val clean = idOrFileName.removeSuffix(".wav")
        val entry = entries.firstOrNull { it.id == clean || it.wavFileName == idOrFileName } ?: return null
        val f = File(wavDir, entry.wavFileName)
        return f.takeIf { it.exists() }
    }

    @Synchronized
    fun list(
        query: String = "",
        filter: RecordingFilter = RecordingFilter.ALL,
        limit: Int = 250,
    ): List<AudioRecordingEntry> {
        val q = query.trim().lowercase()
        return entries.asSequence()
            .filter { item ->
                when (filter) {
                    RecordingFilter.ALL -> true
                    RecordingFilter.IDENTIFIED_SPEAKERS -> item.speakerName.isNotBlank()
                    RecordingFilter.WAKE_COMMANDS -> item.wakeWordDetected
                    RecordingFilter.ACTIONS_EXECUTED -> item.actionStatus == ActionOutcomeStatus.ACTION_EXECUTED
                    RecordingFilter.OFFLINE_ONLY -> item.actionStatus == ActionOutcomeStatus.SERVER_OFFLINE_RECORDED_ONLY
                }
            }
            .filter { item ->
                if (q.isEmpty()) {
                    true
                } else {
                    item.transcript.lowercase().contains(q) ||
                        item.speakerName.lowercase().contains(q) ||
                        item.assistantReply.lowercase().contains(q) ||
                        item.actionSummary.lowercase().contains(q) ||
                        item.room.lowercase().contains(q)
                }
            }
            .take(limit.coerceIn(1, 2000))
            .toList()
    }

    @Synchronized
    fun delete(id: String): Boolean {
        val idx = entries.indexOfFirst { it.id == id }
        if (idx < 0) return false
        val removed = entries.removeAt(idx)
        File(wavDir, removed.wavFileName).delete()
        persistIndex()
        return true
    }

    @Synchronized
    fun clearAll() {
        entries.forEach { File(wavDir, it.wavFileName).delete() }
        entries.clear()
        persistIndex()
    }

    @Synchronized
    fun stats(): ArchiveStats {
        var totalBytes = 0L
        var actionsCount = 0
        var offlineWakeCount = 0
        for (e in entries) {
            totalBytes += e.sizeBytes
            if (e.actionStatus == ActionOutcomeStatus.ACTION_EXECUTED) actionsCount++
            if (e.actionStatus == ActionOutcomeStatus.SERVER_OFFLINE_RECORDED_ONLY) offlineWakeCount++
        }
        return ArchiveStats(
            totalRecordings = entries.size,
            totalBytes = totalBytes,
            actionsExecutedCount = actionsCount,
            offlineRecordedCommandsCount = offlineWakeCount,
        )
    }

    @Synchronized
    fun enforceRetention(maxClips: Int, maxMb: Int) {
        pruneLocked(maxClips = maxClips, maxBytes = maxMb.toLong() * 1024L * 1024L)
        persistIndex()
    }

    private fun pruneLocked(maxClips: Int, maxBytes: Long) {
        val safeMaxClips = maxClips.coerceAtLeast(1)
        val safeMaxBytes = maxBytes.coerceAtLeast(64 * 1024L)
        while (entries.size > safeMaxClips) {
            val oldest = entries.removeAt(entries.lastIndex)
            File(wavDir, oldest.wavFileName).delete()
        }
        var sumBytes = entries.sumOf { it.sizeBytes }
        while (entries.size > 1 && sumBytes > safeMaxBytes) {
            val oldest = entries.removeAt(entries.lastIndex)
            sumBytes -= oldest.sizeBytes
            File(wavDir, oldest.wavFileName).delete()
        }
    }
}

data class ArchiveStats(
    val totalRecordings: Int,
    val totalBytes: Long,
    val actionsExecutedCount: Int,
    val offlineRecordedCommandsCount: Int,
)

/**
 * Fan-out hub for live `/audio.wav` PCM listeners and `/api/stream` SSE event subscribers.
 */
class LiveAudioHub {
    private val pcmListeners = CopyOnWriteArrayList<(ByteArray, Int) -> Boolean>()
    private val sseListeners = CopyOnWriteArrayList<(String) -> Boolean>()

    val activeAudioListeners: Int
        get() = pcmListeners.size

    fun addPcmListener(listener: (ByteArray, Int) -> Boolean) {
        pcmListeners.add(listener)
    }

    fun removePcmListener(listener: (ByteArray, Int) -> Boolean) {
        pcmListeners.remove(listener)
    }

    fun publishPcm(pcm: ByteArray, length: Int) {
        if (pcmListeners.isEmpty()) return
        for (listener in pcmListeners) {
            val alive = try {
                listener(pcm, length)
            } catch (_: Exception) {
                false
            }
            if (!alive) {
                pcmListeners.remove(listener)
            }
        }
    }

    fun addSseListener(listener: (String) -> Boolean) {
        sseListeners.add(listener)
    }

    fun removeSseListener(listener: (String) -> Boolean) {
        sseListeners.remove(listener)
    }

    fun publishSseJson(payloadJson: String) {
        if (sseListeners.isEmpty()) return
        for (listener in sseListeners) {
            val alive = try {
                listener(payloadJson)
            } catch (_: Exception) {
                false
            }
            if (!alive) {
                sseListeners.remove(listener)
            }
        }
    }
}

data class ServerTurnResponse(
    val ok: Boolean,
    val response: String = "",
    val skill: String = "",
    val actionDone: String = "",
    val audioWavBytes: ByteArray? = null,
    val error: String = "",
)

fun interface RobosServerGateway {
    suspend fun executeTurn(
        config: AssistantConfig,
        trigger: String,
        query: String,
        fullTranscript: String,
    ): ServerTurnResponse
}

fun interface ServerAudioGateway {
    suspend fun processAudio(
        config: AssistantConfig,
        wavBytes: ByteArray,
        fallbackTranscript: String,
        followupArmed: Boolean,
        armedTrigger: String,
        onWakeAck: (trigger: String, query: String, transcript: String) -> Unit,
    ): ServerAudioProcessResult
}

/**
 * Core Surveillance + RobOS Server Gate Coordinator.
 *
 * Enforces the primary architectural invariant:
 * - When a RobOS Server is connected (`isServerConnected() == true`), raw `.wav` audio is processed
 *   by the server's Whisper model (`serverAudioProcessor`) and `"Commander"` commands execute live.
 * - When no RobOS Server is connected, the phone falls back to offline on-device Vosk transcription
 *   and strictly records `.wav` audio + text (`SERVER_OFFLINE_RECORDED_ONLY` / `AMBIENT_RECORDED`)
 *   with zero actions executed.
 */
class SurveillanceCoordinator(
    private val archiveStore: RecordingArchiveStore,
    private val serverGateway: RobosServerGateway,
    private val isServerConnected: () -> Boolean,
    private val serverAudioProcessor: ServerAudioGateway? = null,
    private val onWakeAck: (trigger: String, query: String, transcript: String) -> Unit = { _, _, _ -> },
    private val onSpeakWav: suspend (ByteArray, String) -> Unit = { _, _ -> },
    private val onEvent: (String, AudioRecordingEntry?) -> Unit = { _, _ -> },
) {
    @Volatile
    private var armedFollowupUntilEpochMs: Long = 0L

    @Volatile
    private var armedTrigger: String = ""

    @Volatile
    private var lastSpokenReplyLower: String = ""

    fun isAwaitingFollowup(nowEpochMs: Long = System.currentTimeMillis()): Boolean =
        nowEpochMs < armedFollowupUntilEpochMs

    fun disarmFollowup() {
        armedFollowupUntilEpochMs = 0L
        armedTrigger = ""
    }

    suspend fun handleCapturedUtterance(
        config: AssistantConfig,
        utterance: CapturedUtterance,
        rawTranscript: String,
        sttSource: String = "vosk-offline",
        fallbackOfflineTranscript: () -> String = { "" },
    ): AudioRecordingEntry? {
        val serverOnline = config.robosServerEnabled && isServerConnected()
        val nowMs = utterance.endedEpochMs
        val id = buildRecordingId(utterance.startedEpochMs)
        val wavBytes = WavCodec.encodePcm16Mono(utterance.pcm16le, utterance.sampleRate)

        // Primary path when connected to RobOS Server: offload `.wav` to server Moonshine ASR + "Commander, <command>" router!
        if (serverOnline && serverAudioProcessor != null && rawTranscript.isBlank() && sttSource != "manual-ask") {
            disarmFollowup()

            val srvRes = try {
                serverAudioProcessor.processAudio(
                    config = config,
                    wavBytes = wavBytes,
                    fallbackTranscript = "",
                    followupArmed = false,
                    armedTrigger = "",
                    onWakeAck = { trig, q, tr ->
                        onEvent("processing_action", null)
                        onWakeAck(trig, q, tr)
                    },
                )
            } catch (e: Exception) {
                ServerAudioProcessResult(ok = false, error = e.message ?: "Server audio processing failed")
            }

            if (srvRes.ok) {
                val whisperText = cleanTranscript(srvRes.transcript)
                if ((!srvRes.isSpeech || whisperText.isBlank()) && !config.saveNonSpeechNoise) {
                    onEvent("noise_ignored", null)
                    return null
                }

                if (whisperText.isNotBlank() && lastSpokenReplyLower.isNotBlank()) {
                    val prefix = lastSpokenReplyLower.take(18)
                    if (prefix.length >= 6 && whisperText.lowercase().contains(prefix)) {
                        onEvent("echo_ignored", null)
                        return null
                    }
                }

                val hasRealCommand = srvRes.wakeWordDetected && !srvRes.greetingOnly && srvRes.query.isNotBlank()
                if (!config.recordAllSpeech && !hasRealCommand) {
                    onEvent("ambient_skipped", null)
                    return null
                }

                val displayText = whisperText.ifBlank { "(audio event captured)" }

                // Standalone "Commander" without a command is treated strictly as quiet ambient speech (zero "Yes, Commander?", zero follow-up arming)
                if (srvRes.greetingOnly || !hasRealCommand) {
                    val saved = archiveStore.saveRecording(
                        wavBytes = wavBytes,
                        entryWithoutSize = AudioRecordingEntry(
                            id = id,
                            createdAtIso = Instant.ofEpochMilli(utterance.startedEpochMs).toString(),
                            epochMs = utterance.startedEpochMs,
                            room = config.room,
                            assistantName = config.assistantName,
                            wavFileName = "$id.wav",
                            durationMs = utterance.durationMs,
                            sizeBytes = wavBytes.size.toLong(),
                            peakDbFs = utterance.peakDbFs,
                            transcript = displayText,
                            sttSource = srvRes.sttSource,
                            wakeWordDetected = false,
                            wakeTrigger = "",
                            commandQuery = "",
                            serverConnectedAtCapture = true,
                            actionStatus = ActionOutcomeStatus.AMBIENT_RECORDED,
                            actionSummary = "",
                            assistantReply = "",
                            speakerId = srvRes.speakerId,
                            speakerName = srvRes.speakerName,
                            speakerConfidencePct = srvRes.speakerConfidencePct,
                        ),
                        maxClips = config.retentionMaxClips,
                        maxMb = config.retentionMaxMb,
                    )
                    onEvent("recorded_ambient", saved)
                    return saved
                }

                val outcome = when {
                    srvRes.actionExecuted && srvRes.skill != "unknown-command" -> ActionOutcomeStatus.ACTION_EXECUTED
                    srvRes.wakeWordDetected -> ActionOutcomeStatus.ACTION_FAILED
                    else -> ActionOutcomeStatus.AMBIENT_RECORDED
                }
                val summary = when {
                    outcome == ActionOutcomeStatus.ACTION_EXECUTED -> srvRes.actionDone.ifBlank { srvRes.skill.ifBlank { "Executed on RobOS Server" } }
                    srvRes.wakeWordDetected -> srvRes.actionDone.ifBlank { srvRes.error.ifBlank { "Action failed on RobOS Server" } }
                    else -> ""
                }

                val saved = archiveStore.saveRecording(
                    wavBytes = wavBytes,
                    entryWithoutSize = AudioRecordingEntry(
                        id = id,
                        createdAtIso = Instant.ofEpochMilli(utterance.startedEpochMs).toString(),
                        epochMs = utterance.startedEpochMs,
                        room = config.room,
                        assistantName = config.assistantName,
                        wavFileName = "$id.wav",
                        durationMs = utterance.durationMs,
                        sizeBytes = wavBytes.size.toLong(),
                        peakDbFs = utterance.peakDbFs,
                        transcript = displayText,
                        sttSource = srvRes.sttSource,
                        wakeWordDetected = srvRes.wakeWordDetected,
                        wakeTrigger = srvRes.trigger,
                        commandQuery = srvRes.query,
                        serverConnectedAtCapture = true,
                        actionStatus = outcome,
                        actionSkill = srvRes.skill,
                        actionSummary = summary,
                        assistantReply = srvRes.response,
                        speakerId = srvRes.speakerId,
                        speakerName = srvRes.speakerName,
                        speakerConfidencePct = srvRes.speakerConfidencePct,
                    ),
                    maxClips = config.retentionMaxClips,
                    maxMb = config.retentionMaxMb,
                )

                // Speak server reply out loud for both executed skills AND "No command {command}" feedback
                if ((srvRes.actionExecuted || srvRes.wakeWordDetected) && config.speakServerReplies && srvRes.audioWavBytes != null && srvRes.audioWavBytes.size > 44) {
                    lastSpokenReplyLower = srvRes.response.trim().lowercase()
                    onSpeakWav(srvRes.audioWavBytes, srvRes.response)
                }

                onEvent(if (outcome == ActionOutcomeStatus.ACTION_EXECUTED) "action_executed" else if (srvRes.wakeWordDetected) "action_failed" else "recorded_ambient", saved)
                return saved
            }
        }

        // Fallback / Offline path (or deterministic text turn): use local offline Vosk transcript
        val resolvedRaw = rawTranscript.ifBlank { fallbackOfflineTranscript() }
        val transcript = cleanTranscript(resolvedRaw)

        if (transcript.isBlank() && sttSource == "vosk-offline" && !config.saveNonSpeechNoise) {
            return null
        }

        if (transcript.isNotBlank() && lastSpokenReplyLower.isNotBlank()) {
            val prefix = lastSpokenReplyLower.take(18)
            if (prefix.length >= 6 && transcript.lowercase().contains(prefix)) {
                return null
            }
        }

        val directWake = if (config.wakeWordEnabled && transcript.isNotBlank()) {
            WakeWordParser.parse(transcript)
        } else {
            WakeWordMatch(matched = false)
        }

        // Require "Commander, <command>" together in a single phrase — ignore standalone "Commander"
        val wakeDetected = directWake.matched && !directWake.isGreetingOnly && directWake.query.length >= 2
        val effectiveTrigger = if (wakeDetected) directWake.trigger else ""
        val effectiveQuery = if (wakeDetected) directWake.query else ""
        disarmFollowup()

        if (!config.recordAllSpeech && !wakeDetected) {
            return null
        }

        val displayTranscript = transcript.ifBlank { "(speech audio captured — no intelligible words)" }

        val initialStatus = when {
            wakeDetected && !serverOnline -> ActionOutcomeStatus.SERVER_OFFLINE_RECORDED_ONLY
            else -> ActionOutcomeStatus.AMBIENT_RECORDED
        }
        val initialSummary = if (wakeDetected && !serverOnline) {
            "RobOS server disconnected — recorded audio & text only"
        } else {
            ""
        }

        var entry = archiveStore.saveRecording(
            wavBytes = wavBytes,
            entryWithoutSize = AudioRecordingEntry(
                id = id,
                createdAtIso = Instant.ofEpochMilli(utterance.startedEpochMs).toString(),
                epochMs = utterance.startedEpochMs,
                room = config.room,
                assistantName = config.assistantName,
                wavFileName = "$id.wav",
                durationMs = utterance.durationMs,
                sizeBytes = wavBytes.size.toLong(),
                peakDbFs = utterance.peakDbFs,
                transcript = displayTranscript,
                sttSource = sttSource,
                wakeWordDetected = wakeDetected,
                wakeTrigger = effectiveTrigger,
                commandQuery = effectiveQuery,
                serverConnectedAtCapture = serverOnline,
                actionStatus = initialStatus,
                actionSummary = initialSummary,
            ),
            maxClips = config.retentionMaxClips,
            maxMb = config.retentionMaxMb,
        )

        if (!wakeDetected || effectiveQuery.isBlank() || !serverOnline) {
            onEvent(if (wakeDetected && !serverOnline) "recorded_offline" else "recorded_ambient", entry)
            return entry
        }

        onEvent("processing_action", entry)
        if (sttSource != "manual-ask") {
            onWakeAck(effectiveTrigger, effectiveQuery, displayTranscript)
        }
        val turnRes = try {
            serverGateway.executeTurn(
                config = config,
                trigger = effectiveTrigger,
                query = effectiveQuery,
                fullTranscript = displayTranscript,
            )
        } catch (e: Exception) {
            ServerTurnResponse(ok = false, error = e.message ?: "RobOS server unreachable")
        }

        val recognizedSkill = turnRes.ok && turnRes.skill != "unknown-command"
        entry = if (turnRes.ok) {
            archiveStore.updateRecording(entry.id) {
                it.copy(
                    actionStatus = if (recognizedSkill) ActionOutcomeStatus.ACTION_EXECUTED else ActionOutcomeStatus.ACTION_FAILED,
                    actionSkill = turnRes.skill,
                    actionSummary = turnRes.actionDone.ifBlank { turnRes.skill.ifBlank { "Executed on RobOS Server" } },
                    assistantReply = turnRes.response,
                )
            } ?: entry
        } else {
            archiveStore.updateRecording(entry.id) {
                it.copy(
                    actionStatus = ActionOutcomeStatus.ACTION_FAILED,
                    actionSummary = turnRes.error.ifBlank { "RobOS server action failed — audio & text saved" },
                )
            } ?: entry
        }

        if (turnRes.ok && config.speakServerReplies && turnRes.audioWavBytes != null && turnRes.audioWavBytes.size > 44) {
            lastSpokenReplyLower = turnRes.response.trim().lowercase()
            onSpeakWav(turnRes.audioWavBytes, turnRes.response)
        }

        onEvent(if (recognizedSkill) "action_executed" else "action_failed", entry)
        return entry
    }

    companion object {
        private const val FOLLOWUP_WINDOW_MS = 8_000L
        private val FILE_TS_FMT = DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss").withZone(ZoneOffset.UTC)

        fun buildRecordingId(epochMs: Long): String {
            val ts = FILE_TS_FMT.format(Instant.ofEpochMilli(epochMs))
            val suffix = UUID.randomUUID().toString().substring(0, 6)
            return "rec-$ts-$suffix"
        }

        fun cleanTranscript(raw: String): String {
            return raw
                .replace(Regex("\\[(?:BLANK_AUDIO|silence|noise|unk)\\]", RegexOption.IGNORE_CASE), " ")
                .replace(Regex("\\s+"), " ")
                .trim()
        }
    }
}
