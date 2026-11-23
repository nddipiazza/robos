package com.robos.assistant.android

import android.content.Context
import android.media.AudioAttributes
import android.media.MediaPlayer
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import java.io.File
import kotlin.coroutines.resume

/**
 * Plays recorded surveillance `.wav` clips and synthesized RobOS Voice TTS `.wav` responses
 * while signaling active playback so `AssistantServerService` suppresses microphone echo.
 */
class SpeakerPlayer(context: Context) {
    private val appContext = context.applicationContext
    private val lock = Any()

    @Volatile
    private var currentPlayer: MediaPlayer? = null

    @Volatile
    var isPlaying: Boolean = false
        private set

    suspend fun playWavBytes(
        wavBytes: ByteArray,
        onStateChanged: (Boolean) -> Unit = {},
    ) = withContext(Dispatchers.IO) {
        val tmpFile = File(appContext.cacheDir, "tts-reply-${System.currentTimeMillis()}.wav")
        try {
            tmpFile.writeBytes(wavBytes)
            playWavFile(tmpFile, onStateChanged)
        } finally {
            tmpFile.delete()
        }
    }

    suspend fun playWavFile(
        wavFile: File,
        onStateChanged: (Boolean) -> Unit = {},
    ) = withContext(Dispatchers.Main) {
        stop()
        if (!wavFile.exists()) return@withContext
        suspendCancellableCoroutine { cont ->
            val mp = MediaPlayer()
            synchronized(lock) {
                currentPlayer = mp
                isPlaying = true
            }
            onStateChanged(true)

            val finish = {
                synchronized(lock) {
                    if (currentPlayer === mp) {
                        currentPlayer = null
                        isPlaying = false
                    }
                }
                try {
                    mp.release()
                } catch (_: Throwable) {
                }
                onStateChanged(false)
                if (cont.isActive) cont.resume(Unit)
            }

            try {
                mp.setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build(),
                )
                mp.setDataSource(wavFile.absolutePath)
                mp.setOnCompletionListener { finish() }
                mp.setOnErrorListener { _, _, _ ->
                    finish()
                    true
                }
                mp.prepare()
                mp.start()
            } catch (_: Throwable) {
                finish()
            }

            cont.invokeOnCancellation {
                stop()
                onStateChanged(false)
            }
        }
    }

    fun stop() {
        val mp = synchronized(lock) {
            val p = currentPlayer
            currentPlayer = null
            isPlaying = false
            p
        }
        if (mp != null) {
            try {
                if (mp.isPlaying) mp.stop()
            } catch (_: Throwable) {
            }
            try {
                mp.release()
            } catch (_: Throwable) {
            }
        }
    }
}
