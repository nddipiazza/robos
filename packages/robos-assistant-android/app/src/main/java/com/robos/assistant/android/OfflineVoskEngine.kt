package com.robos.assistant.android

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import org.vosk.Model
import org.vosk.Recognizer
import java.io.BufferedInputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.zip.ZipInputStream

@Serializable
private data class VoskJsonDto(
    val text: String = "",
    val partial: String = "",
)

/**
 * 100% Offline Open-Source Speech-to-Text Engine backed by Vosk (`vosk-model-small-en-us-0.15`).
 *
 * Requires zero Google Play Services and zero cloud/server connectivity so the phone always
 * transcribes surveillance audio locally even when air-gapped or disconnected from a RobOS Server.
 */
class OfflineVoskEngine(private val modelsRootDir: File) {
    private val json = Json { ignoreUnknownKeys = true }
    private val lock = Any()

    @Volatile
    private var model: Model? = null

    private var streamRecognizer: Recognizer? = null

    val modelDir: File
        get() = File(modelsRootDir, MODEL_FOLDER_NAME)

    fun isModelInstalled(): Boolean =
        File(modelDir, "conf/model.conf").exists() && File(modelDir, "am/final.mdl").exists()

    val isLoaded: Boolean
        get() = model != null

    fun loadIfInstalled(sampleRate: Int = 16000): Boolean {
        synchronized(lock) {
            if (model != null) return true
            if (!isModelInstalled()) return false
            return try {
                val loaded = Model(modelDir.absolutePath)
                model = loaded
                streamRecognizer?.close()
                streamRecognizer = Recognizer(loaded, sampleRate.toFloat())
                true
            } catch (_: Throwable) {
                model = null
                streamRecognizer = null
                false
            }
        }
    }

    /**
     * Feeds a live PCM16LE frame into the streaming recognizer and returns the current partial words.
     */
    fun feedStreamingFrame(pcm16le: ByteArray, length: Int): String {
        synchronized(lock) {
            val rec = streamRecognizer ?: return ""
            return try {
                val acceptedFinal = rec.acceptWaveForm(pcm16le, length)
                val rawJson = if (acceptedFinal) rec.result else rec.partialResult
                val dto = json.decodeFromString(VoskJsonDto.serializer(), rawJson)
                dto.partial.ifBlank { dto.text }.trim()
            } catch (_: Throwable) {
                ""
            }
        }
    }

    fun resetStream() {
        synchronized(lock) {
            try {
                streamRecognizer?.reset()
            } catch (_: Throwable) {
            }
        }
    }

    /**
     * Transcribes a complete isolated utterance (including its 500ms pre-roll buffer) deterministically.
     */
    fun transcribeUtterancePcm(pcm16le: ByteArray, sampleRate: Int = 16000): String {
        val loadedModel = model ?: run {
            if (!loadIfInstalled(sampleRate)) return ""
            model ?: return ""
        }
        return try {
            val sb = StringBuilder()
            Recognizer(loadedModel, sampleRate.toFloat()).use { rec ->
                var offset = 0
                val chunk = 4096
                while (offset < pcm16le.size) {
                    val len = minOf(chunk, pcm16le.size - offset)
                    val slice = if (offset == 0 && len == pcm16le.size) {
                        pcm16le
                    } else {
                        pcm16le.copyOfRange(offset, offset + len)
                    }
                    if (rec.acceptWaveForm(slice, slice.size)) {
                        val seg = json.decodeFromString(VoskJsonDto.serializer(), rec.result).text.trim()
                        if (seg.isNotEmpty()) {
                            if (sb.isNotEmpty()) sb.append(' ')
                            sb.append(seg)
                        }
                    }
                    offset += len
                }
                val tail = json.decodeFromString(VoskJsonDto.serializer(), rec.finalResult).text.trim()
                if (tail.isNotEmpty()) {
                    if (sb.isNotEmpty()) sb.append(' ')
                    sb.append(tail)
                }
            }
            resetStream()
            sb.toString().trim()
        } catch (_: Throwable) {
            ""
        }
    }

    suspend fun downloadAndInstallModel(onProgress: (Int, String) -> Unit = { _, _ -> }): Result<Unit> =
        withContext(Dispatchers.IO) {
            runCatching {
                modelsRootDir.mkdirs()
                val tmpZip = File(modelsRootDir, "$MODEL_FOLDER_NAME.zip.part")
                onProgress(2, "Connecting to model mirror…")

                val conn = (URL(MODEL_DOWNLOAD_URL).openConnection() as HttpURLConnection).apply {
                    connectTimeout = 15_000
                    readTimeout = 60_000
                    instanceFollowRedirects = true
                }
                val totalBytes = conn.contentLengthLong.coerceAtLeast(1L)
                conn.inputStream.use { input ->
                    FileOutputStream(tmpZip).use { out ->
                        val buf = ByteArray(32 * 1024)
                        var readSoFar = 0L
                        var lastPct = -1
                        while (true) {
                            val n = input.read(buf)
                            if (n <= 0) break
                            out.write(buf, 0, n)
                            readSoFar += n
                            val pct = ((readSoFar * 88L) / totalBytes).toInt().coerceIn(2, 88)
                            if (pct != lastPct) {
                                lastPct = pct
                                onProgress(pct, "Downloading offline English model (${readSoFar / (1024 * 1024)} MB)…")
                            }
                        }
                    }
                }

                onProgress(90, "Extracting acoustic model…")
                extractModelZip(tmpZip)
                tmpZip.delete()

                check(isModelInstalled()) { "Extracted model archive was incomplete." }
                onProgress(97, "Initializing offline recognizer…")
                check(loadIfInstalled()) { "Could not initialize Vosk JNI recognizer." }
                onProgress(100, "Offline STT ready")
            }
        }

    fun installFromLocalZip(zipFile: File): Boolean {
        return try {
            modelsRootDir.mkdirs()
            extractModelZip(zipFile)
            loadIfInstalled()
        } catch (_: Throwable) {
            false
        }
    }

    private fun extractModelZip(zipFile: File) {
        val stagingDir = File(modelsRootDir, "staging-${System.currentTimeMillis()}")
        stagingDir.mkdirs()
        ZipInputStream(BufferedInputStream(FileInputStream(zipFile))).use { zis ->
            var entry = zis.nextEntry
            val buf = ByteArray(32 * 1024)
            while (entry != null) {
                val outFile = File(stagingDir, entry.name)
                val canonicalRoot = stagingDir.canonicalPath + File.separator
                check(outFile.canonicalPath.startsWith(canonicalRoot)) { "Unsafe zip entry: ${entry.name}" }
                if (entry.isDirectory) {
                    outFile.mkdirs()
                } else {
                    outFile.parentFile?.mkdirs()
                    FileOutputStream(outFile).use { fos ->
                        while (true) {
                            val n = zis.read(buf)
                            if (n <= 0) break
                            fos.write(buf, 0, n)
                        }
                    }
                }
                zis.closeEntry()
                entry = zis.nextEntry
            }
        }
        val extractedInner = File(stagingDir, MODEL_FOLDER_NAME)
        val sourceDir = if (extractedInner.isDirectory) extractedInner else stagingDir
        if (modelDir.exists()) modelDir.deleteRecursively()
        sourceDir.renameTo(modelDir)
        if (stagingDir.exists()) stagingDir.deleteRecursively()
    }

    fun close() {
        synchronized(lock) {
            try {
                streamRecognizer?.close()
            } catch (_: Throwable) {
            }
            streamRecognizer = null
            try {
                model?.close()
            } catch (_: Throwable) {
            }
            model = null
        }
    }

    companion object {
        const val MODEL_FOLDER_NAME = "vosk-model-small-en-us-0.15"
        const val MODEL_DOWNLOAD_URL = "https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip"
    }
}
