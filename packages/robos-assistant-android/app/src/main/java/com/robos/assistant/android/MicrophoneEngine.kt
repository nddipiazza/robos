package com.robos.assistant.android

import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Process
import android.os.SystemClock

/**
 * Dedicated 24/7 off-screen 16 kHz mono PCM16LE microphone capture engine.
 *
 * Operates inside `AssistantServerService` with zero Activity dependency so screen-off,
 * lock screen, app switching, or OLED Blackout mode never interrupt audio capture.
 */
class MicrophoneEngine(
    private val sampleRate: Int = 16000,
    private val onPcmFrame: (ByteArray, Int) -> Unit,
    private val onError: (String) -> Unit,
) {
    @Volatile
    private var running = false

    @Volatile
    var lastFrameElapsedMs: Long = 0L
        private set

    private var thread: Thread? = null
    private var audioRecord: AudioRecord? = null

    val isRunning: Boolean
        get() = running

    @SuppressLint("MissingPermission")
    @Synchronized
    fun start(): Boolean {
        if (running) return true
        val minBuf = AudioRecord.getMinBufferSize(
            sampleRate,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
        )
        if (minBuf <= 0) {
            onError("Microphone hardware returned invalid buffer size ($minBuf).")
            return false
        }
        val bufferSize = maxOf(minBuf * 2, sampleRate) // >= 0.5s ring capacity

        val sources = intArrayOf(
            MediaRecorder.AudioSource.VOICE_RECOGNITION,
            MediaRecorder.AudioSource.MIC,
            MediaRecorder.AudioSource.DEFAULT,
        )
        var opened: AudioRecord? = null
        for (src in sources) {
            try {
                val candidate = AudioRecord(
                    src,
                    sampleRate,
                    AudioFormat.CHANNEL_IN_MONO,
                    AudioFormat.ENCODING_PCM_16BIT,
                    bufferSize,
                )
                if (candidate.state == AudioRecord.STATE_INITIALIZED) {
                    opened = candidate
                    break
                } else {
                    candidate.release()
                }
            } catch (_: Throwable) {
            }
        }

        if (opened == null) {
            onError("Could not initialize Android AudioRecord microphone session.")
            return false
        }

        try {
            opened.startRecording()
        } catch (t: Throwable) {
            opened.release()
            onError("Failed to start microphone recording: ${t.message}")
            return false
        }

        audioRecord = opened
        running = true
        lastFrameElapsedMs = SystemClock.elapsedRealtime()

        // 160ms PCM frames (2560 samples = 5120 bytes at 16 kHz mono 16-bit)
        val frameBytes = (sampleRate / 6) * 2
        thread = Thread({
            Process.setThreadPriority(Process.THREAD_PRIORITY_AUDIO)
            val buf = ByteArray(frameBytes)
            while (running) {
                val rec = audioRecord ?: break
                val readBytes = try {
                    rec.read(buf, 0, buf.size)
                } catch (t: Throwable) {
                    if (running) onError("Microphone read error: ${t.message}")
                    break
                }
                if (readBytes > 0) {
                    lastFrameElapsedMs = SystemClock.elapsedRealtime()
                    val evenBytes = readBytes and 0x7FFFFFFE
                    if (evenBytes > 0) {
                        onPcmFrame(buf, evenBytes)
                    }
                } else if (readBytes < 0) {
                    if (running) onError("AudioRecord error code $readBytes")
                    break
                }
            }
        }, "RobosAssistantMic").apply {
            isDaemon = true
            start()
        }
        return true
    }

    @Synchronized
    fun stop() {
        running = false
        val rec = audioRecord
        audioRecord = null
        try {
            rec?.stop()
        } catch (_: Throwable) {
        }
        try {
            rec?.release()
        } catch (_: Throwable) {
        }
        try {
            thread?.join(600)
        } catch (_: InterruptedException) {
        }
        thread = null
    }
}
