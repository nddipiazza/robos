package com.robos.assistant.core

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import java.io.BufferedInputStream
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.io.OutputStream
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.net.URLDecoder
import java.nio.charset.StandardCharsets
import java.util.Base64
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlin.math.PI
import kotlin.math.sin

interface AssistantNodeController {
    fun currentConfig(): AssistantConfig
    fun currentStatus(): AssistantRuntimeStatus
    fun connectServer(host: String, port: Int): AssistantRuntimeStatus
    fun disconnectServer(): AssistantRuntimeStatus
    suspend fun askWhenConnected(query: String): Result<AudioRecordingEntry>
    suspend fun simulateUtterance(text: String, pcm16le: ByteArray, sampleRate: Int = 16000): AudioRecordingEntry?
    suspend fun playRemoteSpeechWav(wavBytes: ByteArray, caption: String = "")
    suspend fun enrollRecordingSpeaker(recordingId: String, speakerName: String): Result<AudioRecordingEntry> =
        Result.failure(UnsupportedOperationException("Speaker enrollment requires an active RobOS Server"))
}

@Serializable
private data class EnrollClipReqDto(
    val name: String = "",
    val speakerName: String = "",
)

@Serializable
private data class ConnectReqDto(
    val host: String = "",
    val port: Int = 19188,
)

@Serializable
private data class AskReqDto(
    val query: String = "",
    val text: String = "",
    val message: String = "",
)

@Serializable
private data class SpeakReqDto(
    val audioWavBase64: String = "",
    val text: String = "",
)

@Serializable
private data class SimulateReqDto(
    val text: String = "",
    val audioWavBase64: String = "",
    val durationMs: Long = 1200L,
    val toneHz: Double = 220.0,
)

/**
 * Embedded LAN HTTP/1.1 Server (`:8090`) serving the RobOS Assistant Web Console,
 * recorded `.wav` surveillance clips + transcripts, live `/audio.wav` stream, SSE `/api/stream`,
 * and RobOS Server pairing/push endpoints.
 */
class HttpAssistantServer(
    private val port: Int,
    private val archiveStore: RecordingArchiveStore,
    private val liveHub: LiveAudioHub,
    private val authVault: AuthVault,
    private val controller: AssistantNodeController,
) {
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val pool = Executors.newCachedThreadPool()

    @Volatile
    private var serverSocket: ServerSocket? = null

    @Volatile
    private var running = false

    var boundPort: Int = port
        private set

    fun start() {
        if (running) return
        val ss = ServerSocket()
        ss.reuseAddress = true
        ss.bind(InetSocketAddress("0.0.0.0", port))
        boundPort = ss.localPort
        serverSocket = ss
        running = true

        scope.launch {
            while (running) {
                val client = try {
                    ss.accept()
                } catch (_: Exception) {
                    if (!running) break else continue
                }
                pool.execute { handleClient(client) }
            }
        }
    }

    fun stop() {
        running = false
        try {
            serverSocket?.close()
        } catch (_: Exception) {
        }
        serverSocket = null
        scope.cancel()
        pool.shutdownNow()
    }

    private fun handleClient(socket: Socket) {
        socket.use { sock ->
            sock.tcpNoDelay = true
            sock.soTimeout = 30_000
            val input = BufferedInputStream(sock.getInputStream())
            val output = sock.getOutputStream()

            val req = readHttpRequest(input) ?: return
            val cfg = controller.currentConfig()

            if (cfg.authEnabled && !checkBasicAuth(req.headers, cfg.username, authVault.getPassword())) {
                writeResponse(
                    output = output,
                    status = "401 Unauthorized",
                    contentType = "application/json; charset=utf-8",
                    body = """{"ok":false,"error":"Authentication required"}""".toByteArray(StandardCharsets.UTF_8),
                    extraHeaders = mapOf("WWW-Authenticate" to """Basic realm="RobOS Assistant""""),
                )
                return
            }

            if (req.method == "OPTIONS") {
                writeResponse(output, "204 No Content", "text/plain", ByteArray(0))
                return
            }

            when {
                req.path == "/" && req.method == "GET" -> {
                    writeResponse(
                        output = output,
                        status = "200 OK",
                        contentType = "text/html; charset=utf-8",
                        body = buildWebConsoleHtml(cfg, controller.currentStatus()).toByteArray(StandardCharsets.UTF_8),
                    )
                }

                req.path == "/api/status" && req.method == "GET" -> {
                    val st = controller.currentStatus()
                    val body = buildJsonObject {
                        put("ok", true)
                        put("service", "robos-assistant-android")
                        put("deviceUuid", cfg.deviceUuid)
                        put("assistantName", cfg.assistantName)
                        put("room", cfg.room)
                        put("running", st.running)
                        put("listeningState", st.listeningState.name)
                        put("listeningLabel", st.listeningState.label)
                        put("serverState", st.serverState.name)
                        put("serverLabel", st.serverState.label)
                        put("actionsArmed", st.actionsArmed)
                        put("serverHost", st.serverHost)
                        put("serverPort", st.serverPort)
                        put("serverHostname", st.serverHostname)
                        put("serverLatencyMs", st.serverLatencyMs)
                        put("offlineSttState", st.offlineSttState.name)
                        put("offlineSttLabel", st.offlineSttState.label)
                        put("rmsDbFs", st.rmsDbFs)
                        put("peakDbFs", st.peakDbFs)
                        put("vadSpeechActive", st.vadSpeechActive)
                        put("livePartialTranscript", st.livePartialTranscript)
                        put("totalRecordings", st.totalRecordings)
                        put("totalStorageBytes", st.totalStorageBytes)
                        put("actionsExecutedCount", st.actionsExecutedCount)
                        put("offlineRecordedCommandsCount", st.offlineRecordedCommandsCount)
                        put("batteryPercent", st.batteryPercent)
                        put("charging", st.charging)
                        put("temperatureC", st.temperatureC)
                        put("uptimeSeconds", st.uptimeSeconds)
                        putJsonArray("enrolledSpeakers") { st.enrolledSpeakers.forEach { add(JsonPrimitive(it)) } }
                        putJsonArray("robosPeople") { st.robosPeople.forEach { add(JsonPrimitive(it)) } }
                    }.toString()
                    writeJson(output, "200 OK", body)
                }

                req.path == "/api/recordings" && req.method == "GET" -> {
                    val q = req.queryParams["q"].orEmpty()
                    val filterName = req.queryParams["filter"].orEmpty()
                    val filter = RecordingFilter.entries.firstOrNull {
                        it.name.equals(filterName, ignoreCase = true)
                    } ?: RecordingFilter.ALL
                    val limit = req.queryParams["limit"]?.toIntOrNull() ?: 200
                    val items = archiveStore.list(query = q, filter = filter, limit = limit)
                    val itemsJson = json.encodeToString(ListSerializer(AudioRecordingEntry.serializer()), items)
                    val stats = archiveStore.stats()
                    val body = """{"ok":true,"count":${items.size},"totalRecordings":${stats.totalRecordings},"totalBytes":${stats.totalBytes},"recordings":$itemsJson}"""
                    writeJson(output, "200 OK", body)
                }

                req.path == "/api/recordings" && req.method == "DELETE" -> {
                    archiveStore.clearAll()
                    writeJson(output, "200 OK", """{"ok":true,"cleared":true}""")
                }

                req.path.startsWith("/api/recordings/") && req.path.endsWith("/enroll-speaker") && req.method == "POST" -> {
                    val id = req.path.removePrefix("/api/recordings/").removeSuffix("/enroll-speaker").trim()
                    val dto = try {
                        json.decodeFromString(EnrollClipReqDto.serializer(), req.bodyUtf8())
                    } catch (_: Exception) {
                        EnrollClipReqDto()
                    }
                    val chosen = dto.name.ifBlank { dto.speakerName }.trim()
                    if (id.isEmpty() || chosen.isEmpty()) {
                        writeJson(output, "400 Bad Request", """{"ok":false,"error":"recording id and speaker name are required"}""")
                        return
                    }
                    val res = runBlocking { controller.enrollRecordingSpeaker(id, chosen) }
                    res.fold(
                        onSuccess = { entry ->
                            val entryJson = json.encodeToString(AudioRecordingEntry.serializer(), entry)
                            writeJson(output, "200 OK", """{"ok":true,"recording":$entryJson}""")
                        },
                        onFailure = { err ->
                            val safe = jsonEscape(err.message ?: "Speaker enrollment failed")
                            writeJson(output, "409 Conflict", """{"ok":false,"error":"$safe"}""")
                        },
                    )
                }

                req.path.startsWith("/api/recordings/") && req.method == "DELETE" -> {
                    val id = req.path.removePrefix("/api/recordings/").trim()
                    val deleted = archiveStore.delete(id)
                    if (deleted) {
                        writeJson(output, "200 OK", """{"ok":true,"deletedId":"$id"}""")
                    } else {
                        writeJson(output, "404 Not Found", """{"ok":false,"error":"Recording not found"}""")
                    }
                }

                req.path.startsWith("/recordings/") && req.method == "GET" -> {
                    val name = req.path.removePrefix("/recordings/").trim()
                    val wavFile = archiveStore.getWavFile(name)
                    if (wavFile == null || !wavFile.exists()) {
                        writeJson(output, "404 Not Found", """{"ok":false,"error":"Audio clip not found"}""")
                        return
                    }
                    serveWavWithRange(output, wavFile.readBytes(), req.headers["range"])
                }

                req.path == "/audio.wav" && req.method == "GET" -> {
                    streamLiveAudioWav(sock, output, cfg.sampleRate)
                }

                req.path == "/api/stream" && req.method == "GET" -> {
                    streamSseEvents(sock, output)
                }

                req.path == "/api/server/connect" && req.method == "POST" -> {
                    val dto = try {
                        json.decodeFromString(ConnectReqDto.serializer(), req.bodyUtf8())
                    } catch (_: Exception) {
                        ConnectReqDto()
                    }
                    if (dto.host.isBlank()) {
                        writeJson(output, "400 Bad Request", """{"ok":false,"error":"host is required"}""")
                        return
                    }
                    val st = controller.connectServer(dto.host.trim(), dto.port)
                    val body = buildJsonObject {
                        put("ok", true)
                        put("serverState", st.serverState.name)
                        put("actionsArmed", st.actionsArmed)
                        put("serverHost", st.serverHost)
                        put("serverPort", st.serverPort)
                    }.toString()
                    writeJson(output, "200 OK", body)
                }

                req.path == "/api/server/disconnect" && req.method == "POST" -> {
                    val st = controller.disconnectServer()
                    val body = buildJsonObject {
                        put("ok", true)
                        put("serverState", st.serverState.name)
                        put("actionsArmed", st.actionsArmed)
                    }.toString()
                    writeJson(output, "200 OK", body)
                }

                req.path == "/api/ask" && req.method == "POST" -> {
                    val dto = try {
                        json.decodeFromString(AskReqDto.serializer(), req.bodyUtf8())
                    } catch (_: Exception) {
                        AskReqDto()
                    }
                    val q = dto.query.ifBlank { dto.text.ifBlank { dto.message } }.trim()
                    if (q.isEmpty()) {
                        writeJson(output, "400 Bad Request", """{"ok":false,"error":"query is required"}""")
                        return
                    }
                    val res = runBlocking { controller.askWhenConnected(q) }
                    res.fold(
                        onSuccess = { entry ->
                            val entryJson = json.encodeToString(AudioRecordingEntry.serializer(), entry)
                            writeJson(output, "200 OK", """{"ok":true,"recording":$entryJson}""")
                        },
                        onFailure = { err ->
                            val msg = err.message ?: "RobOS server is not connected"
                            val safe = jsonEscape(msg)
                            writeJson(output, "409 Conflict", """{"ok":false,"error":"$safe"}""")
                        },
                    )
                }

                req.path == "/api/speak" && req.method == "POST" -> {
                    val dto = try {
                        json.decodeFromString(SpeakReqDto.serializer(), req.bodyUtf8())
                    } catch (_: Exception) {
                        SpeakReqDto()
                    }
                    if (dto.audioWavBase64.isBlank()) {
                        writeJson(output, "400 Bad Request", """{"ok":false,"error":"audioWavBase64 is required"}""")
                        return
                    }
                    val wavBytes = try {
                        Base64.getDecoder().decode(dto.audioWavBase64)
                    } catch (_: Exception) {
                        writeJson(output, "400 Bad Request", """{"ok":false,"error":"Invalid base64 WAV"}""")
                        return
                    }
                    runBlocking { controller.playRemoteSpeechWav(wavBytes, dto.text) }
                    writeJson(output, "200 OK", """{"ok":true,"played":true}""")
                }

                req.path == "/api/simulate-utterance" && req.method == "POST" -> {
                    val dto = try {
                        json.decodeFromString(SimulateReqDto.serializer(), req.bodyUtf8())
                    } catch (_: Exception) {
                        SimulateReqDto()
                    }
                    val (pcm, sr) = if (dto.audioWavBase64.isNotBlank()) {
                        val decodedWav = try {
                            WavCodec.decodeWav(Base64.getDecoder().decode(dto.audioWavBase64))
                        } catch (_: Exception) {
                            null
                        }
                        if (decodedWav != null) {
                            decodedWav.pcm16le to decodedWav.sampleRate
                        } else {
                            synthesizeSpeechLikeTonePcm(dto.durationMs.coerceIn(400L, 10_000L), cfg.sampleRate, dto.toneHz) to cfg.sampleRate
                        }
                    } else {
                        synthesizeSpeechLikeTonePcm(dto.durationMs.coerceIn(400L, 10_000L), cfg.sampleRate, dto.toneHz) to cfg.sampleRate
                    }
                    val entry = runBlocking {
                        controller.simulateUtterance(dto.text, pcm, sr)
                    }
                    if (entry == null) {
                        writeJson(output, "200 OK", """{"ok":true,"saved":false}""")
                    } else {
                        val entryJson = json.encodeToString(AudioRecordingEntry.serializer(), entry)
                        writeJson(output, "200 OK", """{"ok":true,"saved":true,"recording":$entryJson}""")
                    }
                }

                else -> {
                    writeJson(output, "404 Not Found", """{"ok":false,"error":"Not found"}""")
                }
            }
        }
    }

    private fun serveWavWithRange(output: OutputStream, wavBytes: ByteArray, rangeHeader: String?) {
        val total = wavBytes.size
        if (!rangeHeader.isNullOrBlank() && rangeHeader.startsWith("bytes=")) {
            val spec = rangeHeader.removePrefix("bytes=").trim()
            val parts = spec.split('-', limit = 2)
            val start = parts.getOrNull(0)?.toIntOrNull()?.coerceIn(0, (total - 1).coerceAtLeast(0)) ?: 0
            val end = parts.getOrNull(1)?.takeIf { it.isNotBlank() }?.toIntOrNull()?.coerceIn(start, total - 1)
                ?: (total - 1)
            val slice = if (total > 0 && start <= end) wavBytes.copyOfRange(start, end + 1) else ByteArray(0)
            writeResponse(
                output = output,
                status = "206 Partial Content",
                contentType = "audio/wav",
                body = slice,
                extraHeaders = mapOf(
                    "Accept-Ranges" to "bytes",
                    "Content-Range" to "bytes $start-$end/$total",
                ),
            )
            return
        }
        writeResponse(
            output = output,
            status = "200 OK",
            contentType = "audio/wav",
            body = wavBytes,
            extraHeaders = mapOf("Accept-Ranges" to "bytes"),
        )
    }

    private fun streamLiveAudioWav(sock: Socket, output: OutputStream, sampleRate: Int) {
        sock.soTimeout = 0
        val head = buildString {
            append("HTTP/1.1 200 OK\r\n")
            append("Content-Type: audio/wav\r\n")
            append("Cache-Control: no-store, no-cache\r\n")
            append("Connection: close\r\n")
            append("Access-Control-Allow-Origin: *\r\n\r\n")
        }.toByteArray(StandardCharsets.US_ASCII)
        output.write(head)
        output.write(WavCodec.buildStreamingWavHeader(sampleRate))
        output.flush()

        val closed = CountDownLatch(1)
        val listener: (ByteArray, Int) -> Boolean = { pcm, len ->
            try {
                output.write(pcm, 0, len)
                output.flush()
                true
            } catch (_: Exception) {
                closed.countDown()
                false
            }
        }
        liveHub.addPcmListener(listener)
        try {
            while (running && !sock.isClosed) {
                if (closed.await(2, TimeUnit.SECONDS)) break
            }
        } catch (_: Exception) {
        } finally {
            liveHub.removePcmListener(listener)
        }
    }

    private fun streamSseEvents(sock: Socket, output: OutputStream) {
        sock.soTimeout = 0
        val head = buildString {
            append("HTTP/1.1 200 OK\r\n")
            append("Content-Type: text/event-stream; charset=utf-8\r\n")
            append("Cache-Control: no-cache\r\n")
            append("Connection: keep-alive\r\n")
            append("Access-Control-Allow-Origin: *\r\n\r\n")
        }.toByteArray(StandardCharsets.US_ASCII)
        output.write(head)
        output.write(": connected\n\n".toByteArray(StandardCharsets.UTF_8))
        output.flush()

        val closed = CountDownLatch(1)
        val listener: (String) -> Boolean = { payload ->
            try {
                output.write("data: $payload\n\n".toByteArray(StandardCharsets.UTF_8))
                output.flush()
                true
            } catch (_: Exception) {
                closed.countDown()
                false
            }
        }
        liveHub.addSseListener(listener)
        try {
            while (running && !sock.isClosed) {
                if (closed.await(10, TimeUnit.SECONDS)) break
                try {
                    output.write(": keepalive\n\n".toByteArray(StandardCharsets.UTF_8))
                    output.flush()
                } catch (_: Exception) {
                    break
                }
            }
        } catch (_: Exception) {
        } finally {
            liveHub.removeSseListener(listener)
        }
    }

    private fun checkBasicAuth(headers: Map<String, String>, expectedUser: String, expectedPass: String): Boolean {
        if (expectedPass.isEmpty()) return true
        val auth = headers["authorization"] ?: return false
        if (!auth.startsWith("Basic ", ignoreCase = true)) return false
        val decoded = try {
            String(Base64.getDecoder().decode(auth.substring(6).trim()), StandardCharsets.UTF_8)
        } catch (_: Exception) {
            return false
        }
        val sep = decoded.indexOf(':')
        if (sep < 0) return false
        return decoded.substring(0, sep) == expectedUser && decoded.substring(sep + 1) == expectedPass
    }

    private fun writeJson(output: OutputStream, status: String, bodyJson: String) {
        writeResponse(
            output = output,
            status = status,
            contentType = "application/json; charset=utf-8",
            body = bodyJson.toByteArray(StandardCharsets.UTF_8),
        )
    }

    private fun writeResponse(
        output: OutputStream,
        status: String,
        contentType: String,
        body: ByteArray,
        extraHeaders: Map<String, String> = emptyMap(),
    ) {
        val head = buildString {
            append("HTTP/1.1 $status\r\n")
            append("Content-Type: $contentType\r\n")
            append("Content-Length: ${body.size}\r\n")
            append("Connection: close\r\n")
            append("Access-Control-Allow-Origin: *\r\n")
            append("Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS\r\n")
            append("Access-Control-Allow-Headers: Content-Type, Authorization\r\n")
            for ((k, v) in extraHeaders) {
                append("$k: $v\r\n")
            }
            append("\r\n")
        }
        output.write(head.toByteArray(StandardCharsets.ISO_8859_1))
        if (body.isNotEmpty()) {
            output.write(body)
        }
        output.flush()
    }

    private data class RawHttpReq(
        val method: String,
        val path: String,
        val queryParams: Map<String, String>,
        val headers: Map<String, String>,
        val body: ByteArray,
    ) {
        fun bodyUtf8(): String = String(body, StandardCharsets.UTF_8)
    }

    private fun readHttpRequest(input: InputStream): RawHttpReq? {
        val headerBuf = ByteArrayOutputStream()
        var state = 0
        while (headerBuf.size() < 32_768) {
            val b = input.read()
            if (b < 0) break
            headerBuf.write(b)
            state = when {
                state == 0 && b == '\r'.code -> 1
                state == 1 && b == '\n'.code -> 2
                state == 2 && b == '\r'.code -> 3
                state == 3 && b == '\n'.code -> 4
                b == '\r'.code -> 1
                else -> 0
            }
            if (state == 4) break
        }
        if (headerBuf.size() == 0) return null
        val headerText = String(headerBuf.toByteArray(), StandardCharsets.ISO_8859_1)
        val lines = headerText.split("\r\n")
        val reqLine = lines.firstOrNull()?.trim().orEmpty()
        val parts = reqLine.split(' ')
        if (parts.size < 2) return null
        val method = parts[0].uppercase()
        val rawTarget = parts[1]
        val qIdx = rawTarget.indexOf('?')
        val path = if (qIdx >= 0) rawTarget.substring(0, qIdx) else rawTarget
        val queryStr = if (qIdx >= 0) rawTarget.substring(qIdx + 1) else ""

        val queryParams = LinkedHashMap<String, String>()
        if (queryStr.isNotEmpty()) {
            for (pair in queryStr.split('&')) {
                if (pair.isEmpty()) continue
                val eq = pair.indexOf('=')
                if (eq >= 0) {
                    val k = urlDecode(pair.substring(0, eq))
                    val v = urlDecode(pair.substring(eq + 1))
                    queryParams[k] = v
                } else {
                    queryParams[urlDecode(pair)] = ""
                }
            }
        }

        val headers = LinkedHashMap<String, String>()
        for (i in 1 until lines.size) {
            val line = lines[i]
            if (line.isEmpty()) break
            val colon = line.indexOf(':')
            if (colon > 0) {
                headers[line.substring(0, colon).trim().lowercase()] = line.substring(colon + 1).trim()
            }
        }

        val contentLength = headers["content-length"]?.toIntOrNull()?.coerceIn(0, 4 * 1024 * 1024) ?: 0
        val body = ByteArray(contentLength)
        var readTotal = 0
        while (readTotal < contentLength) {
            val n = input.read(body, readTotal, contentLength - readTotal)
            if (n <= 0) break
            readTotal += n
        }
        return RawHttpReq(
            method = method,
            path = path,
            queryParams = queryParams,
            headers = headers,
            body = if (readTotal == contentLength) body else body.copyOf(readTotal),
        )
    }

    private fun urlDecode(s: String): String =
        try {
            URLDecoder.decode(s, StandardCharsets.UTF_8.name())
        } catch (_: Exception) {
            s
        }

    private fun jsonEscape(s: String): String =
        s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n")

    private fun buildWebConsoleHtml(cfg: AssistantConfig, st: AssistantRuntimeStatus): String {
        val safeName = htmlEscape(cfg.assistantName)
        val safeRoom = htmlEscape(cfg.room)
        val connected = st.actionsArmed
        return """
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>$safeName · RobOS Assistant</title>
<style>
  :root { --bg:#0d1117; --card:#161b22; --border:#30363d; --fg:#e6edf3; --muted:#8b949e; --accent:#00bcd4; --ok:#22c55e; --warn:#f59e0b; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font:14px/1.45 system-ui,-apple-system,sans-serif; padding:20px; }
  .wrap { max-width:960px; margin:0 auto; display:grid; gap:16px; }
  .card { background:var(--card); border:1px solid var(--border); border-radius:12px; padding:16px; }
  .row { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }
  .pill { display:inline-flex; align-items:center; gap:8px; padding:5px 11px; border-radius:999px; font-weight:600; font-size:12px; border:1px solid var(--border); }
  .pill.ok { color:var(--ok); border-color:rgba(34,197,94,.4); background:rgba(34,197,94,.1); }
  .pill.warn { color:var(--warn); border-color:rgba(245,158,11,.4); background:rgba(245,158,11,.1); }
  h1 { margin:0; font-size:20px; }
  .muted { color:var(--muted); font-size:13px; }
  input, button { background:#0d1117; color:var(--fg); border:1px solid var(--border); border-radius:8px; padding:8px 12px; font:inherit; }
  button.primary { background:var(--accent); color:#04222a; border-color:var(--accent); font-weight:700; cursor:pointer; }
  button:disabled { opacity:.45; cursor:not-allowed; }
  .rec { border-top:1px solid var(--border); padding:12px 0; display:grid; gap:6px; }
  .rec:first-child { border-top:0; }
  audio { width:100%; height:34px; }
</style>
</head>
<body>
<div class="wrap">
  <div class="card">
    <div class="row">
      <div>
        <h1>🎙️ $safeName <span class="muted">· $safeRoom</span></h1>
        <div class="muted" id="sub-line">24/7 Audio &amp; Text Surveillance + RobOS Voice Assistant</div>
      </div>
      <div id="srv-pill" class="pill ${if (connected) "ok" else "warn"}">${htmlEscape(st.serverState.label)}</div>
    </div>
    <div style="margin-top:12px" class="row">
      <div class="muted">Live Monitor Stream: <a href="/audio.wav" style="color:var(--accent)">/audio.wav</a></div>
      <div class="muted" id="live-partial">Listening…</div>
    </div>
  </div>
  <div class="card">
    <div class="row" style="margin-bottom:8px">
      <strong>Ask RobOS Assistant</strong>
      <span class="muted" id="ask-hint">${if (connected) "RobOS Server connected — commands execute live" else "Connect a RobOS Server (:19188) to run actions"}</span>
    </div>
    <div class="row" style="gap:6px;margin-bottom:8px;flex-wrap:wrap">
      <button type="button" onclick="runQuick('Play a random episode of House on the Roku TV')">🎲 Random House on Roku TV</button>
      <button type="button" onclick="runQuick('Play a random unwatched episode of House on the Roku TV')">✨ Unwatched House</button>
      <button type="button" onclick="runQuick('Continue watching Ghosts US on the Roku TV')">▶ Continue Ghosts US</button>
      <button type="button" onclick="runQuick('Play a random 90s movie on the Roku TV')">🎬 Random 90s Movie</button>
      <button type="button" onclick="runQuick('What is on my watch list?')">📋 Watchlist</button>
      <button type="button" onclick="runQuick('Pause on the Roku TV')">⏸ Pause TV</button>
      <button type="button" onclick="runQuick('Stop casting')">⏹ Stop Cast</button>
    </div>
    <div class="row">
      <input id="ask-input" style="flex:1" placeholder="e.g. Play a random episode of House on the Roku TV" ${if (!connected) "disabled" else ""}/>
      <button id="ask-btn" class="primary" ${if (!connected) "disabled" else ""}>Run Action</button>
    </div>
  </div>
  <div class="card">
    <div class="row" style="margin-bottom:8px">
      <strong>Recorded Audio &amp; Text Archive</strong>
      <div class="row" style="gap:8px">
        <span class="muted" id="speakers-summary"></span>
        <button id="refresh-btn">Refresh</button>
      </div>
    </div>
    <div id="rec-list" class="muted">Loading recordings…</div>
  </div>
</div>
<script>
let knownPeople = [];
function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
async function refresh() {
  const st = await (await fetch('/api/status')).json();
  knownPeople = Array.isArray(st.robosPeople) ? st.robosPeople : [];
  const enrolled = Array.isArray(st.enrolledSpeakers) ? st.enrolledSpeakers : [];
  const pill = document.getElementById('srv-pill');
  pill.textContent = st.serverLabel;
  pill.className = 'pill ' + (st.actionsArmed ? 'ok' : 'warn');
  document.getElementById('ask-input').disabled = !st.actionsArmed;
  document.getElementById('ask-btn').disabled = !st.actionsArmed;
  document.getElementById('live-partial').textContent = st.livePartialTranscript ? ('Live: "' + st.livePartialTranscript + '"') : (st.listeningLabel + ' (' + Math.round(st.rmsDbFs) + ' dBFS)');
  document.getElementById('speakers-summary').textContent = enrolled.length ? ('Enrolled voices: ' + enrolled.join(', ')) : 'Say "Commander, remember my voice as <Name>" or click Enroll Voice below';

  const rec = await (await fetch('/api/recordings?limit=50')).json();
  const list = document.getElementById('rec-list');
  if (!rec.recordings || !rec.recordings.length) {
    list.innerHTML = '<div class="muted">No speech clips recorded yet.</div>';
    return;
  }
  const peopleOpts = knownPeople.map(p => `<option value="${'$'}{esc(p)}">${'$'}{esc(p)}</option>`).join('');
  list.innerHTML = rec.recordings.map(r => `
    <div class="rec">
      <div class="row">
        <strong>${'$'}{esc(r.transcript)}</strong>
        <div class="row" style="gap:6px">
          ${'$'}{r.speakerName ? '<span class="pill ok">🗣️ ' + esc(r.speakerName) + (r.speakerConfidencePct ? ' · ' + r.speakerConfidencePct + '%' : '') + '</span>' : ''}
          <span class="pill ${'$'}{r.actionStatus === 'ACTION_EXECUTED' ? 'ok' : 'warn'}">${'$'}{esc(r.actionStatus)}</span>
        </div>
      </div>
      ${'$'}{r.assistantReply ? '<div style="color:#00bcd4">Reply: ' + esc(r.assistantReply) + '</div>' : ''}
      ${'$'}{r.actionSummary ? '<div class="muted">' + esc(r.actionSummary) + '</div>' : ''}
      <div class="row">
        <div class="muted">${'$'}{esc(r.createdAtIso)} · ${'$'}{(r.durationMs/1000).toFixed(1)}s · ${'$'}{Math.round(r.peakDbFs)} dBFS</div>
        ${'$'}{st.actionsArmed ? `
          <div class="row" style="gap:4px">
            ${'$'}{peopleOpts ? `<select id="spk-${'$'}{esc(r.id)}" style="background:#0d1117;color:var(--fg);border:1px solid var(--border);border-radius:6px;padding:4px 8px;font-size:12px"><option value="">Enroll voice as…</option>${'$'}{peopleOpts}<option value="__custom__">+ Custom name…</option></select><button type="button" style="padding:4px 8px;font-size:12px;cursor:pointer" onclick="enrollFromSelect('${'$'}{esc(r.id)}')">Enroll Voice</button>` : `<button type="button" style="padding:4px 8px;font-size:12px;cursor:pointer" onclick="enrollCustom('${'$'}{esc(r.id)}')">Enroll Voice</button>`}
          </div>` : ''}
      </div>
      <audio controls preload="none" src="/recordings/${'$'}{r.id}.wav"></audio>
    </div>
  `).join('');
}
async function enrollClip(id, name) {
  if (!name || !name.trim()) return;
  const res = await fetch('/api/recordings/' + encodeURIComponent(id) + '/enroll-speaker', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name.trim() }),
  });
  const data = await res.json();
  if (!data.ok) alert(data.error || 'Failed to enroll voiceprint');
  refresh();
}
function enrollFromSelect(id) {
  const sel = document.getElementById('spk-' + id);
  if (!sel || !sel.value) return;
  if (sel.value === '__custom__') return enrollCustom(id);
  enrollClip(id, sel.value);
}
function enrollCustom(id) {
  const name = prompt('Enter speaker name (e.g. Nick, Diana, Leo):');
  if (name && name.trim()) enrollClip(id, name.trim());
}
async function runQuick(q) {
  await fetch('/api/ask', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({query:q}) });
  setTimeout(refresh, 500);
}
document.getElementById('refresh-btn').onclick = refresh;
document.getElementById('ask-btn').onclick = async () => {
  const inp = document.getElementById('ask-input');
  if (!inp.value.trim()) return;
  await fetch('/api/ask', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({query:inp.value}) });
  inp.value = '';
  refresh();
};
refresh();
setInterval(refresh, 4000);
</script>
</body>
</html>
        """.trimIndent()
    }

    private fun htmlEscape(s: String): String =
        s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;")

    companion object {
        fun synthesizeSpeechLikeTonePcm(
            durationMs: Long,
            sampleRate: Int = 16000,
            freqHz: Double = 220.0,
        ): ByteArray {
            val totalSamples = ((sampleRate * durationMs) / 1000L).toInt().coerceAtLeast(320)
            val pcm = ByteArray(totalSamples * 2)
            for (i in 0 until totalSamples) {
                val t = i.toDouble() / sampleRate.toDouble()
                val v = (sin(2.0 * PI * freqHz * t) * 9000.0).toInt().coerceIn(-32767, 32767)
                pcm[i * 2] = (v and 0xFF).toByte()
                pcm[i * 2 + 1] = ((v shr 8) and 0xFF).toByte()
            }
            return pcm
        }
    }
}
