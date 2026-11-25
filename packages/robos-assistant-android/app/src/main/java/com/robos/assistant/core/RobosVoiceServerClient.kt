package com.robos.assistant.core

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.supervisorScope
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.net.InetSocketAddress
import java.net.Socket
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.util.Base64

@Serializable
data class HubProbeDto(
    val ok: Boolean = false,
    val service: String = "",
    val hostname: String = "",
    val port: Int = 19188,
    val assistantState: String = "",
    val ttsEngine: String = "",
    val voice: String = "",
    val activeApp: String = "",
)

@Serializable
data class PhoneTurnDto(
    val ok: Boolean = false,
    val error: String = "",
    val response: String = "",
    val skill: String = "",
    val actionDone: String = "",
    val audioWavBase64: String = "",
    val audioDurationMs: Long = 0L,
    val turn: PhoneTurnInnerDto? = null,
)

@Serializable
data class PhoneTurnInnerDto(
    val response: String = "",
    val skill: String = "",
    val actionDone: String = "",
)

@Serializable
data class ProcessAudioDto(
    val ok: Boolean = false,
    val error: String = "",
    val isSpeech: Boolean = false,
    val transcript: String = "",
    val sttSource: String = "robos-server-whisper",
    val wakeWordDetected: Boolean = false,
    val greetingOnly: Boolean = false,
    val actionExecuted: Boolean = false,
    val trigger: String = "",
    val query: String = "",
    val response: String = "",
    val skill: String = "",
    val actionDone: String = "",
    val speakerId: String = "",
    val speakerName: String = "",
    val speakerFullName: String = "",
    val speakerConfidencePct: Int = 0,
    val audioWavBase64: String = "",
    val audioDurationMs: Long = 0L,
)

@Serializable
data class EnrolledSpeakerDto(
    val speakerId: String = "",
    val name: String = "",
    val shortName: String = "",
    val sampleCount: Int = 0,
)

@Serializable
data class RobosPersonDto(
    val uid: String = "",
    val name: String = "",
    val shortName: String = "",
)

@Serializable
data class SpeakersInfoDto(
    val ok: Boolean = false,
    val engine: String = "",
    val speakers: List<EnrolledSpeakerDto> = emptyList(),
    val robosPeople: List<RobosPersonDto> = emptyList(),
)

@Serializable
data class EnrollSpeakerDto(
    val ok: Boolean = false,
    val error: String = "",
    val speakerId: String = "",
    val speakerName: String = "",
    val fullName: String = "",
    val sampleCount: Int = 0,
)

data class ServerSpeakersInfo(
    val ok: Boolean,
    val engine: String = "",
    val enrolledNames: List<String> = emptyList(),
    val robosPeopleNames: List<String> = emptyList(),
)

data class ServerSpeakerEnrollResult(
    val ok: Boolean,
    val speakerId: String = "",
    val speakerName: String = "",
    val fullName: String = "",
    val sampleCount: Int = 0,
    val error: String = "",
)

data class ServerAudioProcessResult(
    val ok: Boolean,
    val isSpeech: Boolean = false,
    val transcript: String = "",
    val sttSource: String = "robos-server-whisper",
    val wakeWordDetected: Boolean = false,
    val greetingOnly: Boolean = false,
    val actionExecuted: Boolean = false,
    val trigger: String = "",
    val query: String = "",
    val response: String = "",
    val skill: String = "",
    val actionDone: String = "",
    val speakerId: String = "",
    val speakerName: String = "",
    val speakerFullName: String = "",
    val speakerConfidencePct: Int = 0,
    val audioWavBytes: ByteArray? = null,
    val error: String = "",
)

data class ServerProbeResult(
    val reachable: Boolean,
    val hostIp: String = "",
    val port: Int = 19188,
    val hostname: String = "",
    val ttsEngine: String = "",
    val latencyMs: Long = -1L,
)

/**
 * Deterministic raw-TCP HTTP/1.0 client for discovering and communicating with the
 * RobOS Voice Server (`:19188` in `packages/voice-prompt`), including full server-side
 * Whisper audio transcription + `"Commander"` wake-word & skill execution.
 */
class RobosVoiceServerClient {
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    suspend fun discoverServerHostIp(
        wifiIp: String,
        port: Int = DEFAULT_SERVER_PORT,
        cachedHostIp: String = "",
        deviceUuid: String = "",
        assistantName: String = "",
        room: String = "",
        phonePort: Int = 8090,
    ): ServerProbeResult? = withContext(Dispatchers.IO) {
        if (cachedHostIp.isNotBlank()) {
            val cachedProbe = probeServer(
                hostIp = cachedHostIp,
                port = port,
                timeoutMs = 750,
                deviceUuid = deviceUuid,
                assistantName = assistantName,
                room = room,
                phonePort = phonePort,
            )
            if (cachedProbe.reachable) return@withContext cachedProbe
        }

        val parts = wifiIp.trim().split('.')
        if (parts.size != 4) return@withContext null
        val prefix = "${parts[0]}.${parts[1]}.${parts[2]}."
        val myLastOctet = parts[3].toIntOrNull()

        val found = CompletableDeferred<ServerProbeResult?>()
        val gate = Semaphore(40)
        supervisorScope {
            val jobs = (1..254).filter { it != myLastOctet }.map { octet ->
                val candidate = "$prefix$octet"
                launch {
                    gate.withPermit {
                        if (!found.isCompleted) {
                            val probe = probeServer(
                                hostIp = candidate,
                                port = port,
                                timeoutMs = 420,
                                deviceUuid = deviceUuid,
                                assistantName = assistantName,
                                room = room,
                                phonePort = phonePort,
                            )
                            if (probe.reachable) {
                                found.complete(probe)
                            }
                        }
                    }
                }
            }
            launch {
                jobs.forEach { it.join() }
                if (!found.isCompleted) found.complete(null)
            }
            val winner = found.await()
            jobs.forEach { it.cancel() }
            winner
        }
    }

    fun probeServer(
        hostIp: String,
        port: Int = DEFAULT_SERVER_PORT,
        timeoutMs: Int = 900,
        deviceUuid: String = "",
        assistantName: String = "",
        room: String = "",
        phonePort: Int = 8090,
    ): ServerProbeResult {
        val cleanHost = hostIp.trim()
        if (cleanHost.isEmpty()) return ServerProbeResult(reachable = false)
        val t0 = System.nanoTime()
        return try {
            val querySuffix = if (deviceUuid.isNotBlank()) {
                "?deviceUuid=${enc(deviceUuid)}&assistantName=${enc(assistantName)}&room=${enc(room)}&phonePort=$phonePort"
            } else {
                ""
            }
            val (hubCode, hubBody) = rawHttp(
                hostIp = cleanHost,
                port = port,
                method = "GET",
                path = "/api/robos-assistant-hub$querySuffix",
                connectTimeoutMs = timeoutMs,
                readTimeoutMs = timeoutMs,
            )
            val latency = ((System.nanoTime() - t0) / 1_000_000L).coerceAtLeast(1L)
            if (hubCode == 200 && hubBody.contains("robos-voice-server")) {
                val dto = json.decodeFromString(HubProbeDto.serializer(), hubBody)
                return ServerProbeResult(
                    reachable = dto.ok,
                    hostIp = cleanHost,
                    port = port,
                    hostname = dto.hostname,
                    ttsEngine = dto.ttsEngine,
                    latencyMs = latency,
                )
            }

            val (statusCode, statusBody) = rawHttp(
                hostIp = cleanHost,
                port = port,
                method = "GET",
                path = "/api/status",
                connectTimeoutMs = timeoutMs,
                readTimeoutMs = timeoutMs,
            )
            val statusLatency = ((System.nanoTime() - t0) / 1_000_000L).coerceAtLeast(1L)
            if (statusCode == 200 && statusBody.contains("assistantState")) {
                val dto = json.decodeFromString(HubProbeDto.serializer(), statusBody)
                ServerProbeResult(
                    reachable = dto.ok,
                    hostIp = cleanHost,
                    port = port,
                    hostname = cleanHost,
                    ttsEngine = dto.ttsEngine,
                    latencyMs = statusLatency,
                )
            } else {
                ServerProbeResult(reachable = false)
            }
        } catch (_: Exception) {
            ServerProbeResult(reachable = false)
        }
    }

    /**
     * Offloads raw `.wav` utterance processing to the connected RobOS Server's Whisper engine
     * (`POST /api/assistant/process-audio`) for high-accuracy speech recognition + `"Commander"` execution.
     */
    suspend fun processUtteranceAudio(
        hostIp: String,
        port: Int = DEFAULT_SERVER_PORT,
        config: AssistantConfig,
        wavBytes: ByteArray,
        fallbackTranscript: String = "",
        followupArmed: Boolean = false,
        armedTrigger: String = "",
    ): ServerAudioProcessResult = withContext(Dispatchers.IO) {
        val cleanHost = hostIp.trim()
        if (cleanHost.isEmpty()) {
            return@withContext ServerAudioProcessResult(ok = false, error = "No RobOS Server host configured")
        }

        val payload = buildJsonObject {
            put("deviceUuid", config.deviceUuid)
            put("assistantName", config.assistantName)
            put("room", config.room)
            put("phonePort", config.port)
            put("audioWavBase64", Base64.getEncoder().encodeToString(wavBytes))
            if (fallbackTranscript.isNotBlank()) put("fallbackTranscript", fallbackTranscript)
            put("wakeWordEnabled", config.wakeWordEnabled)
            put("followupArmed", followupArmed)
            if (armedTrigger.isNotBlank()) put("armedTrigger", armedTrigger)
            put("returnAudio", config.speakServerReplies)
            put("speakOnServer", false)
        }.toString()

        val (code, body) = rawHttp(
            hostIp = cleanHost,
            port = port,
            method = "POST",
            path = "/api/assistant/process-audio",
            bodyJson = payload,
            connectTimeoutMs = 3_000,
            readTimeoutMs = 45_000,
        )

        val dto = try {
            json.decodeFromString(ProcessAudioDto.serializer(), body)
        } catch (_: Exception) {
            return@withContext ServerAudioProcessResult(ok = false, error = "Invalid response from RobOS Server (HTTP $code)")
        }

        if (code !in 200..299 || !dto.ok) {
            return@withContext ServerAudioProcessResult(
                ok = false,
                error = dto.error.ifBlank { "RobOS Server returned HTTP $code" },
            )
        }

        val replyWav = if (dto.audioWavBase64.isNotBlank()) {
            try {
                Base64.getDecoder().decode(dto.audioWavBase64)
            } catch (_: Exception) {
                null
            }
        } else {
            null
        }

        ServerAudioProcessResult(
            ok = true,
            isSpeech = dto.isSpeech,
            transcript = dto.transcript,
            sttSource = dto.sttSource.ifBlank { "robos-server-whisper" },
            wakeWordDetected = dto.wakeWordDetected,
            greetingOnly = dto.greetingOnly,
            actionExecuted = dto.actionExecuted,
            trigger = dto.trigger,
            query = dto.query,
            response = dto.response,
            skill = dto.skill,
            actionDone = dto.actionDone,
            speakerId = dto.speakerId,
            speakerName = dto.speakerName,
            speakerFullName = dto.speakerFullName,
            speakerConfidencePct = dto.speakerConfidencePct,
            audioWavBytes = replyWav,
            error = dto.error,
        )
    }

    suspend fun fetchSpeakersInfo(
        hostIp: String,
        port: Int = DEFAULT_SERVER_PORT,
    ): ServerSpeakersInfo = withContext(Dispatchers.IO) {
        val cleanHost = hostIp.trim()
        if (cleanHost.isEmpty()) return@withContext ServerSpeakersInfo(ok = false)
        try {
            val (code, body) = rawHttp(
                hostIp = cleanHost,
                port = port,
                method = "GET",
                path = "/api/speakers",
                connectTimeoutMs = 1_500,
                readTimeoutMs = 3_000,
            )
            if (code !in 200..299) return@withContext ServerSpeakersInfo(ok = false)
            val dto = json.decodeFromString(SpeakersInfoDto.serializer(), body)
            if (!dto.ok) return@withContext ServerSpeakersInfo(ok = false)
            ServerSpeakersInfo(
                ok = true,
                engine = dto.engine,
                enrolledNames = dto.speakers.map { it.shortName.ifBlank { it.name } }.filter { it.isNotBlank() },
                robosPeopleNames = dto.robosPeople.map { it.shortName.ifBlank { it.name } }.filter { it.isNotBlank() },
            )
        } catch (_: Exception) {
            ServerSpeakersInfo(ok = false)
        }
    }

    suspend fun enrollSpeakerWav(
        hostIp: String,
        port: Int = DEFAULT_SERVER_PORT,
        speakerName: String,
        wavBytes: ByteArray,
    ): ServerSpeakerEnrollResult = withContext(Dispatchers.IO) {
        val cleanHost = hostIp.trim()
        val cleanName = speakerName.trim()
        if (cleanHost.isEmpty()) return@withContext ServerSpeakerEnrollResult(ok = false, error = "No RobOS Server host configured")
        if (cleanName.isEmpty()) return@withContext ServerSpeakerEnrollResult(ok = false, error = "Speaker name is required")
        try {
            val payload = buildJsonObject {
                put("name", cleanName)
                put("audioWavBase64", Base64.getEncoder().encodeToString(wavBytes))
            }.toString()
            val (code, body) = rawHttp(
                hostIp = cleanHost,
                port = port,
                method = "POST",
                path = "/api/speakers/enroll",
                bodyJson = payload,
                connectTimeoutMs = 2_500,
                readTimeoutMs = 15_000,
            )
            val dto = try {
                json.decodeFromString(EnrollSpeakerDto.serializer(), body)
            } catch (_: Exception) {
                return@withContext ServerSpeakerEnrollResult(ok = false, error = "Invalid response from RobOS Server (HTTP $code)")
            }
            if (code !in 200..299 || !dto.ok) {
                return@withContext ServerSpeakerEnrollResult(
                    ok = false,
                    error = dto.error.ifBlank { "Speaker enrollment failed (HTTP $code)" },
                )
            }
            ServerSpeakerEnrollResult(
                ok = true,
                speakerId = dto.speakerId,
                speakerName = dto.speakerName.ifBlank { cleanName },
                fullName = dto.fullName.ifBlank { dto.speakerName.ifBlank { cleanName } },
                sampleCount = dto.sampleCount,
            )
        } catch (e: Exception) {
            ServerSpeakerEnrollResult(ok = false, error = e.message ?: "Speaker enrollment failed")
        }
    }

    suspend fun executePhoneTurn(
        hostIp: String,
        port: Int = DEFAULT_SERVER_PORT,
        config: AssistantConfig,
        trigger: String,
        query: String,
        fullTranscript: String,
    ): ServerTurnResponse = withContext(Dispatchers.IO) {
        val cleanHost = hostIp.trim()
        if (cleanHost.isEmpty()) {
            return@withContext ServerTurnResponse(ok = false, error = "No RobOS Server host configured")
        }

        val payload = buildJsonObject {
            put("deviceUuid", config.deviceUuid)
            put("assistantName", config.assistantName)
            put("room", config.room)
            put("phonePort", config.port)
            put("trigger", trigger)
            put("query", query)
            put("message", query)
            put("fullTranscript", fullTranscript)
            put("returnAudio", config.speakServerReplies)
            put("speakOnServer", false)
        }.toString()

        val (code, body) = rawHttp(
            hostIp = cleanHost,
            port = port,
            method = "POST",
            path = "/api/assistant/phone-turn",
            bodyJson = payload,
            connectTimeoutMs = 3_000,
            readTimeoutMs = 45_000,
        )

        if (code == 404) {
            val (chatCode, chatBody) = rawHttp(
                hostIp = cleanHost,
                port = port,
                method = "POST",
                path = "/api/assistant/chat",
                bodyJson = payload,
                connectTimeoutMs = 3_000,
                readTimeoutMs = 45_000,
            )
            return@withContext parseTurnDto(chatCode, chatBody)
        }

        parseTurnDto(code, body)
    }

    private fun parseTurnDto(code: Int, body: String): ServerTurnResponse {
        val dto = try {
            json.decodeFromString(PhoneTurnDto.serializer(), body)
        } catch (_: Exception) {
            return ServerTurnResponse(ok = false, error = "Invalid response from RobOS Server (HTTP $code)")
        }
        if (code !in 200..299 || !dto.ok) {
            return ServerTurnResponse(
                ok = false,
                error = dto.error.ifBlank { "RobOS Server returned HTTP $code" },
            )
        }
        val wavBytes = if (dto.audioWavBase64.isNotBlank()) {
            try {
                Base64.getDecoder().decode(dto.audioWavBase64)
            } catch (_: Exception) {
                null
            }
        } else {
            null
        }
        val responseText = dto.response.ifBlank { dto.turn?.response.orEmpty() }
        val skill = dto.skill.ifBlank { dto.turn?.skill.orEmpty() }
        val actionDone = dto.actionDone.ifBlank { dto.turn?.actionDone.orEmpty() }
        return ServerTurnResponse(
            ok = true,
            response = responseText,
            skill = skill,
            actionDone = actionDone,
            audioWavBytes = wavBytes,
        )
    }

    private fun enc(value: String): String =
        URLEncoder.encode(value, StandardCharsets.UTF_8.name())

    private fun rawHttp(
        hostIp: String,
        port: Int,
        method: String,
        path: String,
        headers: Map<String, String> = emptyMap(),
        bodyJson: String? = null,
        connectTimeoutMs: Int = 2_000,
        readTimeoutMs: Int = 10_000,
    ): Pair<Int, String> {
        val bodyBytes = bodyJson?.toByteArray(StandardCharsets.UTF_8)
        Socket().use { sock ->
            sock.tcpNoDelay = true
            sock.soTimeout = readTimeoutMs
            sock.connect(InetSocketAddress(hostIp, port), connectTimeoutMs)
            val reqHead = buildString {
                append("$method $path HTTP/1.0\r\n")
                append("Host: $hostIp:$port\r\n")
                append("Connection: close\r\n")
                append("Accept: application/json\r\n")
                for ((k, v) in headers) {
                    append("$k: $v\r\n")
                }
                if (bodyBytes != null) {
                    append("Content-Type: application/json; charset=utf-8\r\n")
                    append("Content-Length: ${bodyBytes.size}\r\n")
                }
                append("\r\n")
            }
            val out = sock.getOutputStream()
            out.write(reqHead.toByteArray(StandardCharsets.UTF_8))
            if (bodyBytes != null) {
                out.write(bodyBytes)
            }
            out.flush()

            val rawResp = sock.getInputStream().readBytes()
            val sep = findHeaderEnd(rawResp)
            val headerStr = if (sep >= 0) {
                String(rawResp, 0, sep, StandardCharsets.ISO_8859_1)
            } else {
                String(rawResp, StandardCharsets.UTF_8)
            }
            val statusLine = headerStr.lineSequence().firstOrNull().orEmpty()
            val code = statusLine.split(' ').getOrNull(1)?.toIntOrNull() ?: 0
            val bodyStr = if (sep >= 0 && sep + 4 <= rawResp.size) {
                String(rawResp, sep + 4, rawResp.size - (sep + 4), StandardCharsets.UTF_8)
            } else {
                ""
            }
            return code to bodyStr
        }
    }

    private fun findHeaderEnd(buf: ByteArray): Int {
        var i = 0
        while (i <= buf.size - 4) {
            if (buf[i] == '\r'.code.toByte() &&
                buf[i + 1] == '\n'.code.toByte() &&
                buf[i + 2] == '\r'.code.toByte() &&
                buf[i + 3] == '\n'.code.toByte()
            ) {
                return i
            }
            i++
        }
        return -1
    }

    companion object {
        const val DEFAULT_SERVER_PORT = 19188
    }

    suspend fun fetchSynthesizedSpeechWav(
        hostIp: String,
        port: Int = DEFAULT_SERVER_PORT,
        text: String,
    ): ByteArray? = withContext(Dispatchers.IO) {
        val cleanHost = hostIp.trim()
        if (cleanHost.isEmpty()) return@withContext null
        try {
            val payload = buildJsonObject { put("text", text) }.toString()
            val (code, body) = rawHttp(
                hostIp = cleanHost,
                port = port,
                method = "POST",
                path = "/api/tts/synthesize",
                bodyJson = payload,
                connectTimeoutMs = 2_000,
                readTimeoutMs = 8_000,
            )
            if (code !in 200..299) return@withContext null
            val dto = json.decodeFromString(PhoneTurnDto.serializer(), body)
            if (dto.ok && dto.audioWavBase64.isNotBlank()) {
                Base64.getDecoder().decode(dto.audioWavBase64)
            } else {
                null
            }
        } catch (_: Exception) {
            null
        }
    }
}
