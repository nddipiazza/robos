package com.robos.assistant.android

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import com.robos.assistant.core.WavCodec
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.withContext
import java.io.File
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.sin

/**
 * Zero-disk Low-Latency `AudioTrack` PCM player.
 *
 * Writes decoded 16-bit PCM directly into Android AudioFlinger shared buffers
 * (`PERFORMANCE_MODE_LOW_LATENCY`) so `"Yes, Commander?"` and RobOS Server replies
 * start playing in < 12 milliseconds with zero temp-file or `MediaPlayer.prepare()` overhead.
 */
class SpeakerPlayer(context: Context) {
    private val appContext = context.applicationContext
    private val lock = Any()

    @Volatile
    private var currentTrack: AudioTrack? = null

    @Volatile
    var isPlaying: Boolean = false
        private set

    val builtinWakeAckWav: ByteArray by lazy {
        // Crisp 190ms two-note ascending fifth (E5 659.25 Hz -> B5 987.77 Hz) acknowledgment ping
        // played immediately when "Commander, <command>" is read so the user knows it heard them and is working on it.
        val sr = 24000
        val durationMs = 190
        val totalSamples = (sr * durationMs) / 1000
        val splitSample = (sr * 75) / 1000
        val attackSamples = ((sr * 6) / 1000).coerceAtLeast(1)
        val pcm = ByteArray(totalSamples * 2)
        for (i in 0 until totalSamples) {
            val inNote2 = i >= splitSample
            val localIdx = if (inNote2) (i - splitSample) else i
            val noteLen = if (inNote2) (totalSamples - splitSample) else splitSample
            val freq = if (inNote2) 987.77 else 659.25 // E5 -> B5
            val t = localIdx.toDouble() / sr
            val attack = if (localIdx < attackSamples) {
                0.5 * (1.0 - cos((PI * localIdx) / attackSamples))
            } else {
                1.0
            }
            val decay = exp((-3.2 * localIdx.toDouble()) / noteLen.toDouble())
            val wave = 0.84 * sin(2.0 * PI * freq * t) + 0.16 * sin(2.0 * PI * (freq * 2.0) * t)
            val v = (wave * attack * decay * 21000.0).toInt().coerceIn(-32767, 32767)
            pcm[i * 2] = (v and 0xFF).toByte()
            pcm[i * 2 + 1] = ((v shr 8) and 0xFF).toByte()
        }
        WavCodec.encodePcm16Mono(pcm, sr)
    }

    suspend fun playWavFile(
        wavFile: File,
        onStateChanged: (Boolean) -> Unit = {},
    ) = withContext(Dispatchers.IO) {
        if (!wavFile.exists()) return@withContext
        playWavBytes(wavFile.readBytes(), onStateChanged)
    }

    suspend fun playWavBytes(
        wavBytes: ByteArray,
        onStateChanged: (Boolean) -> Unit = {},
    ) = withContext(Dispatchers.IO) {
        stop()
        val decoded = WavCodec.decodeWav(wavBytes) ?: return@withContext
        if (decoded.pcm16le.isEmpty()) return@withContext

        val channelMask = if (decoded.channels >= 2) {
            AudioFormat.CHANNEL_OUT_STEREO
        } else {
            AudioFormat.CHANNEL_OUT_MONO
        }
        val minBuf = AudioTrack.getMinBufferSize(
            decoded.sampleRate,
            channelMask,
            AudioFormat.ENCODING_PCM_16BIT,
        ).coerceAtLeast(2048)

        val pcm = decoded.pcm16le
        val useStatic = pcm.size <= 384_000 // <= ~8s at 24kHz mono -> single zero-latency shared-memory write!
        val track = try {
            AudioTrack.Builder()
                .setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build(),
                )
                .setAudioFormat(
                    AudioFormat.Builder()
                        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                        .setSampleRate(decoded.sampleRate)
                        .setChannelMask(channelMask)
                        .build(),
                )
                .setPerformanceMode(AudioTrack.PERFORMANCE_MODE_LOW_LATENCY)
                .setTransferMode(if (useStatic) AudioTrack.MODE_STATIC else AudioTrack.MODE_STREAM)
                .setBufferSizeInBytes(if (useStatic) pcm.size.coerceAtLeast(minBuf) else maxOf(minBuf, 8192))
                .build()
        } catch (_: Throwable) {
            return@withContext
        }

        synchronized(lock) {
            currentTrack = track
            isPlaying = true
        }
        onStateChanged(true)

        try {
            if (useStatic) {
                track.write(pcm, 0, pcm.size)
                track.play()
                val waitMs = decoded.durationMs.coerceIn(40L, 12_000L)
                var elapsed = 0L
                while (isActive && currentTrack === track && elapsed < waitMs) {
                    val step = minOf(30L, waitMs - elapsed)
                    delay(step)
                    elapsed += step
                }
            } else {
                track.play()
                var offset = 0
                val chunk = 4096
                while (isActive && currentTrack === track && offset < pcm.size) {
                    val toWrite = minOf(chunk, pcm.size - offset)
                    val written = track.write(pcm, offset, toWrite)
                    if (written <= 0) break
                    offset += written
                }
                delay(80L)
            }
        } catch (_: Throwable) {
        } finally {
            synchronized(lock) {
                if (currentTrack === track) {
                    currentTrack = null
                    isPlaying = false
                }
            }
            try {
                track.stop()
            } catch (_: Throwable) {
            }
            try {
                track.release()
            } catch (_: Throwable) {
            }
            onStateChanged(false)
        }
    }

    fun stop() {
        val trk = synchronized(lock) {
            val t = currentTrack
            currentTrack = null
            isPlaying = false
            t
        }
        if (trk != null) {
            try {
                trk.pause()
                trk.flush()
                trk.stop()
            } catch (_: Throwable) {
            }
            try {
                trk.release()
            } catch (_: Throwable) {
            }
        }
    }
}
