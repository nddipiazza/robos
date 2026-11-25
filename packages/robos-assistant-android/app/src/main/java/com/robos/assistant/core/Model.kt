package com.robos.assistant.core

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.File
import java.util.UUID

val DEFAULT_ROOMS = listOf(
    "Living Room",
    "Office",
    "Kitchen",
    "Bedroom",
    "Entryway",
    "Studio",
    "Nursery",
    "Garage",
    "Workshop",
)

@Serializable
data class AssistantConfig(
    val deviceUuid: String = UUID.randomUUID().toString(),
    val assistantName: String = "RobOS Phone Assistant",
    val room: String = "Living Room",
    val enabled: Boolean = true,
    val port: Int = 8090,
    val sampleRate: Int = 16000,
    val vadSensitivity: Int = 60,
    val silenceHangMs: Int = 1050,
    val preRollMs: Int = 400,
    val maxClipSeconds: Int = 45,
    val recordAllSpeech: Boolean = true,
    val saveNonSpeechNoise: Boolean = false,
    val wakeWordEnabled: Boolean = true,
    val robosServerEnabled: Boolean = true,
    val robosServerHost: String = "",
    val robosServerPort: Int = 19188,
    val speakServerReplies: Boolean = true,
    val retentionMaxClips: Int = 500,
    val retentionMaxMb: Int = 512,
    val authEnabled: Boolean = false,
    val username: String = "admin",
    val autoStartOnBoot: Boolean = true,
    val keepScreenAwake: Boolean = false,
) {
    fun sanitized(): AssistantConfig = copy(
        deviceUuid = deviceUuid.ifBlank { UUID.randomUUID().toString() },
        assistantName = assistantName.trim().take(64).ifBlank { "RobOS Phone Assistant" },
        room = room.trim().take(48).ifBlank { "Living Room" },
        port = port.coerceIn(1024, 65535),
        sampleRate = 16000,
        vadSensitivity = vadSensitivity.coerceIn(1, 100),
        silenceHangMs = silenceHangMs.coerceIn(200, 4000),
        preRollMs = preRollMs.coerceIn(160, 1500),
        maxClipSeconds = maxClipSeconds.coerceIn(10, 300),
        robosServerHost = robosServerHost.trim().take(128),
        robosServerPort = robosServerPort.coerceIn(1, 65535),
        retentionMaxClips = retentionMaxClips.coerceIn(10, 5000),
        retentionMaxMb = retentionMaxMb.coerceIn(32, 8192),
        username = username.trim().take(64).ifBlank { "admin" },
    )
}

interface ConfigStore {
    fun load(defaultModelName: String = "RobOS Phone Assistant"): AssistantConfig
    fun save(config: AssistantConfig): AssistantConfig
}

class FileConfigStore(private val file: File) : ConfigStore {
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
        prettyPrint = true
    }

    override fun load(defaultModelName: String): AssistantConfig {
        if (!file.exists()) {
            val initial = AssistantConfig(assistantName = defaultModelName).sanitized()
            save(initial)
            return initial
        }
        return try {
            val loaded = json.decodeFromString(AssistantConfig.serializer(), file.readText()).sanitized()
            // Migrate aggressive 420ms cutoff to 1050ms so natural mid-sentence pauses after "Commander," stay in a single utterance
            if (loaded.silenceHangMs == 420) {
                save(loaded.copy(silenceHangMs = 1050, preRollMs = 400))
            } else {
                loaded
            }
        } catch (_: Exception) {
            AssistantConfig(assistantName = defaultModelName).sanitized()
        }
    }

    override fun save(config: AssistantConfig): AssistantConfig {
        val clean = config.sanitized()
        file.parentFile?.mkdirs()
        val tmp = File(file.parentFile, "${file.name}.tmp")
        tmp.writeText(json.encodeToString(AssistantConfig.serializer(), clean))
        tmp.renameTo(file)
        return clean
    }
}

interface AuthVault {
    fun getPassword(): String
    fun setPassword(password: String)
}

class MemoryAuthVault(initial: String = "") : AuthVault {
    @Volatile
    private var pw: String = initial
    override fun getPassword(): String = pw
    override fun setPassword(password: String) {
        pw = password
    }
}

enum class ListeningState(val label: String) {
    LISTENING("Listening 24/7"),
    RECORDING_SPEECH("Recording Speech"),
    AWAITING_QUERY("Wake Word — Listening for Command"),
    PROCESSING_ACTION("Running RobOS Action…"),
    SPEAKING_REPLY("Speaking Reply"),
    STARTING("Starting Microphone…"),
    PERMISSION_NEEDED("Microphone Permission Needed"),
    PAUSED("Paused"),
    ERROR("Microphone Error"),
}

enum class ServerConnectionState(val label: String) {
    CONNECTED("RobOS Server Connected — Actions Active"),
    DISCOVERING("Searching for RobOS Server…"),
    OFFLINE_RECORDER_ONLY("RobOS Server Offline — Recording Audio & Text Only"),
    DISABLED_RECORDER_ONLY("Server Disabled — Recording Audio & Text Only"),
}

enum class OfflineSttState(val label: String) {
    READY("Offline STT Ready (Vosk en-US)"),
    DOWNLOADING("Downloading Offline STT Model…"),
    NOT_INSTALLED("Offline Model Needed"),
    ERROR("Offline STT Error"),
}

@Serializable
enum class ActionOutcomeStatus(val label: String) {
    AMBIENT_RECORDED("Audio + Text Saved"),
    SERVER_OFFLINE_RECORDED_ONLY("Server Offline — Recorded Only (No Action)"),
    ACTION_EXECUTED("Action Executed on RobOS Server"),
    ACTION_FAILED("Server Error — Audio + Text Saved"),
}

@Serializable
enum class RecordingFilter(val label: String) {
    ALL("All"),
    WAKE_COMMANDS("Wake Word"),
    ACTIONS_EXECUTED("Actions Run"),
    OFFLINE_ONLY("Offline Recorded"),
}

@Serializable
data class AudioRecordingEntry(
    val id: String,
    val createdAtIso: String,
    val epochMs: Long,
    val room: String,
    val assistantName: String,
    val wavFileName: String,
    val durationMs: Long,
    val sizeBytes: Long,
    val peakDbFs: Float,
    val transcript: String,
    val sttSource: String = "vosk-offline",
    val wakeWordDetected: Boolean = false,
    val wakeTrigger: String = "",
    val commandQuery: String = "",
    val serverConnectedAtCapture: Boolean = false,
    val actionStatus: ActionOutcomeStatus = ActionOutcomeStatus.AMBIENT_RECORDED,
    val actionSkill: String = "",
    val actionSummary: String = "",
    val assistantReply: String = "",
)

data class AssistantRuntimeStatus(
    val running: Boolean = false,
    val listeningState: ListeningState = ListeningState.PAUSED,
    val errorMessage: String = "",
    val wifiConnected: Boolean = false,
    val wifiIp: String = "",
    val port: Int = 8090,
    val rmsDbFs: Float = -90f,
    val peakDbFs: Float = -90f,
    val noiseFloorDbFs: Float = -72f,
    val vadSpeechActive: Boolean = false,
    val waveformBars: List<Float> = List(16) { 0.04f },
    val livePartialTranscript: String = "",
    val offlineSttState: OfflineSttState = OfflineSttState.NOT_INSTALLED,
    val offlineSttProgressPct: Int = 0,
    val offlineSttStatusDetail: String = "",
    val serverState: ServerConnectionState = ServerConnectionState.OFFLINE_RECORDER_ONLY,
    val serverHost: String = "",
    val serverPort: Int = 19188,
    val serverHostname: String = "",
    val serverTtsEngine: String = "",
    val serverLatencyMs: Long = -1L,
    val lastServerCheckIso: String = "",
    val totalRecordings: Int = 0,
    val totalStorageBytes: Long = 0L,
    val actionsExecutedCount: Int = 0,
    val offlineRecordedCommandsCount: Int = 0,
    val activeListeners: Int = 0,
    val uptimeSeconds: Long = 0L,
    val batteryPercent: Int = -1,
    val charging: Boolean = false,
    val temperatureC: Float = 0f,
    val batteryUnrestricted: Boolean = false,
    val activePlaybackId: String = "",
) {
    val actionsArmed: Boolean
        get() = serverState == ServerConnectionState.CONNECTED

    val baseUrl: String?
        get() = wifiIp.takeIf { it.isNotBlank() }?.let { "http://$it:$port" }

    val audioStreamUrl: String?
        get() = baseUrl?.let { "$it/audio.wav" }

    val sseStreamUrl: String?
        get() = baseUrl?.let { "$it/api/stream" }
}
