package com.robos.assistant.android

import android.Manifest
import android.app.Application
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.ContentProvider
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.database.Cursor
import android.net.Uri
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Bundle
import android.os.IBinder
import android.os.PowerManager
import android.os.SystemClock
import androidx.core.content.ContextCompat
import com.robos.assistant.R
import com.robos.assistant.core.ActionOutcomeStatus
import com.robos.assistant.core.AdaptiveVadSegmenter
import com.robos.assistant.core.AssistantConfig
import com.robos.assistant.core.AssistantNodeController
import com.robos.assistant.core.AssistantRuntimeStatus
import com.robos.assistant.core.AudioRecordingEntry
import com.robos.assistant.core.CapturedUtterance
import com.robos.assistant.core.FileConfigStore
import com.robos.assistant.core.HttpAssistantServer
import com.robos.assistant.core.ListeningState
import com.robos.assistant.core.LiveAudioHub
import com.robos.assistant.core.OfflineSttState
import com.robos.assistant.core.RecordingArchiveStore
import com.robos.assistant.core.RecordingFilter
import com.robos.assistant.core.RobosVoiceServerClient
import com.robos.assistant.core.ServerConnectionState
import com.robos.assistant.core.SurveillanceCoordinator
import com.robos.assistant.ui.MainActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.io.File
import java.time.Instant
import java.util.concurrent.CountDownLatch
import java.util.concurrent.atomic.AtomicBoolean

class AssistantApp : Application() {
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    val liveHub = LiveAudioHub()
    val serverClient = RobosVoiceServerClient()

    lateinit var configStore: FileConfigStore
        private set
    lateinit var authVault: KeystoreAuthVault
        private set
    lateinit var archiveStore: RecordingArchiveStore
        private set
    lateinit var voskEngine: OfflineVoskEngine
        private set
    lateinit var speakerPlayer: SpeakerPlayer
        private set
    lateinit var wifiMonitor: WifiMonitor
        private set
    lateinit var batteryMonitor: BatteryMonitor
        private set
    lateinit var coordinator: SurveillanceCoordinator
        private set

    private val _config = MutableStateFlow(AssistantConfig())
    val config: StateFlow<AssistantConfig> = _config

    private val _status = MutableStateFlow(AssistantRuntimeStatus())
    val status: StateFlow<AssistantRuntimeStatus> = _status

    private val _recordings = MutableStateFlow<List<AudioRecordingEntry>>(emptyList())
    val recordings: StateFlow<List<AudioRecordingEntry>> = _recordings

    @Volatile
    var echoCooldownUntilElapsedMs: Long = 0L

    @Volatile
    var cachedWakeAckWav: ByteArray? = null

    private val wakeAckFetchInProgress = AtomicBoolean(false)
    private val modelDownloadInProgress = AtomicBoolean(false)
    private var playbackJob: Job? = null
    val ready = CountDownLatch(1)

    override fun onCreate() {
        super.onCreate()
        val defaultName = "${Build.MODEL?.takeIf { it.isNotBlank() } ?: "RobOS Phone"} Assistant"
        configStore = FileConfigStore(File(filesDir, "assistant-config.json"))
        authVault = KeystoreAuthVault(File(noBackupFilesDir, "assistant-auth.bin"))
        archiveStore = RecordingArchiveStore(File(filesDir, "recordings"))
        voskEngine = OfflineVoskEngine(File(filesDir, "models"))
        speakerPlayer = SpeakerPlayer(this)
        wifiMonitor = WifiMonitor(this)
        batteryMonitor = BatteryMonitor(this)

        val initialCfg = configStore.load(defaultModelName = defaultName)
        _config.value = initialCfg
        _recordings.value = archiveStore.list(limit = 300)

        coordinator = SurveillanceCoordinator(
            archiveStore = archiveStore,
            serverGateway = { cfg, trigger, query, fullTranscript ->
                val host = _status.value.serverHost.ifBlank { cfg.robosServerHost }
                serverClient.executePhoneTurn(
                    hostIp = host,
                    port = cfg.robosServerPort,
                    config = cfg,
                    trigger = trigger,
                    query = query,
                    fullTranscript = fullTranscript,
                )
            },
            isServerConnected = { _status.value.serverState == ServerConnectionState.CONNECTED },
            serverAudioProcessor = { cfg, wavBytes, fallbackTranscript, followupArmed, armedTrigger ->
                val host = _status.value.serverHost.ifBlank { cfg.robosServerHost }
                serverClient.processUtteranceAudio(
                    hostIp = host,
                    port = cfg.robosServerPort,
                    config = cfg,
                    wavBytes = wavBytes,
                    fallbackTranscript = fallbackTranscript,
                    followupArmed = followupArmed,
                    armedTrigger = armedTrigger,
                )
            },
            onSpeakWav = { wavBytes, _ ->
                speakReplyWavWithEchoGate(wavBytes)
            },
            onEvent = { eventType, entry ->
                refreshArchiveSnapshot()
                when (eventType) {
                    "processing_action" -> updateStatus { it.copy(listeningState = ListeningState.PROCESSING_ACTION) }
                    "wake_armed" -> updateStatus { it.copy(listeningState = ListeningState.AWAITING_QUERY) }
                    else -> {
                        if (_status.value.running && !speakerPlayer.isPlaying) {
                            updateStatus { it.copy(listeningState = ListeningState.LISTENING) }
                        }
                    }
                }
                if (entry != null) {
                    val payload = buildJsonObject {
                        put("type", eventType)
                        put("id", entry.id)
                        put("transcript", entry.transcript)
                        put("actionStatus", entry.actionStatus.name)
                        put("assistantReply", entry.assistantReply)
                        put("createdAtIso", entry.createdAtIso)
                    }.toString()
                    liveHub.publishSseJson(payload)
                }
            },
        )

        val stats = archiveStore.stats()
        val wifi = wifiMonitor.state.value
        val batt = batteryMonitor.state.value
        val initServerState = if (!initialCfg.robosServerEnabled) {
            ServerConnectionState.DISABLED_RECORDER_ONLY
        } else {
            ServerConnectionState.OFFLINE_RECORDER_ONLY
        }
        _status.value = AssistantRuntimeStatus(
            running = false,
            listeningState = if (hasAudioPermission()) ListeningState.PAUSED else ListeningState.PERMISSION_NEEDED,
            wifiConnected = wifi.connected,
            wifiIp = wifi.ip,
            port = initialCfg.port,
            offlineSttState = if (voskEngine.isModelInstalled()) OfflineSttState.READY else OfflineSttState.NOT_INSTALLED,
            serverState = initServerState,
            serverHost = initialCfg.robosServerHost,
            serverPort = initialCfg.robosServerPort,
            totalRecordings = stats.totalRecordings,
            totalStorageBytes = stats.totalBytes,
            actionsExecutedCount = stats.actionsExecutedCount,
            offlineRecordedCommandsCount = stats.offlineRecordedCommandsCount,
            batteryPercent = batt.percent,
            charging = batt.charging,
            temperatureC = batt.temperatureC,
            batteryUnrestricted = batt.unrestricted,
        )

        scope.launch {
            // Check for staged model zip in external files dir (e.g. adb push) or load installed model
            val extZip = getExternalFilesDir("models")?.let { File(it, "${OfflineVoskEngine.MODEL_FOLDER_NAME}.zip") }
            if (!voskEngine.isModelInstalled() && extZip != null && extZip.exists()) {
                updateStatus {
                    it.copy(
                        offlineSttState = OfflineSttState.DOWNLOADING,
                        offlineSttProgressPct = 90,
                        offlineSttStatusDetail = "Installing staged offline model…",
                    )
                }
                if (voskEngine.installFromLocalZip(extZip)) {
                    extZip.delete()
                }
            }
            if (voskEngine.loadIfInstalled(initialCfg.sampleRate)) {
                updateStatus {
                    it.copy(
                        offlineSttState = OfflineSttState.READY,
                        offlineSttProgressPct = 100,
                        offlineSttStatusDetail = "Offline Vosk English acoustic model active",
                    )
                }
            } else if (wifiMonitor.state.value.connected) {
                // Auto-provision the 40 MB open-source Vosk model on first Wi-Fi launch
                downloadOfflineModel()
            }
        }

        scope.launch {
            wifiMonitor.state.collect { w ->
                _status.update { it.copy(wifiConnected = w.connected, wifiIp = w.ip) }
            }
        }
        scope.launch {
            batteryMonitor.state.collect { b ->
                _status.update {
                    it.copy(
                        batteryPercent = b.percent,
                        charging = b.charging,
                        temperatureC = b.temperatureC,
                        batteryUnrestricted = b.unrestricted,
                    )
                }
            }
        }
        ready.countDown()
    }

    fun hasAudioPermission(): Boolean =
        ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED

    fun updateStatus(transform: (AssistantRuntimeStatus) -> AssistantRuntimeStatus) {
        _status.update(transform)
    }

    fun refreshArchiveSnapshot() {
        val stats = archiveStore.stats()
        _recordings.value = archiveStore.list(limit = 300)
        _status.update {
            it.copy(
                totalRecordings = stats.totalRecordings,
                totalStorageBytes = stats.totalBytes,
                actionsExecutedCount = stats.actionsExecutedCount,
                offlineRecordedCommandsCount = stats.offlineRecordedCommandsCount,
            )
        }
    }

    fun updateConfig(transform: (AssistantConfig) -> AssistantConfig): AssistantConfig {
        val updated = configStore.save(transform(_config.value))
        _config.value = updated
        archiveStore.enforceRetention(updated.retentionMaxClips, updated.retentionMaxMb)
        refreshArchiveSnapshot()
        _status.update {
            it.copy(
                port = updated.port,
                serverPort = updated.robosServerPort,
                serverHost = updated.robosServerHost,
                serverState = if (!updated.robosServerEnabled) {
                    ServerConnectionState.DISABLED_RECORDER_ONLY
                } else if (it.serverState == ServerConnectionState.DISABLED_RECORDER_ONLY) {
                    ServerConnectionState.OFFLINE_RECORDER_ONLY
                } else {
                    it.serverState
                },
            )
        }
        if (updated.enabled && hasAudioPermission()) {
            startAssistantService(AssistantServerService.ACTION_APPLY_CONFIG)
        } else if (!updated.enabled) {
            stopAssistantService()
        }
        return updated
    }

    fun startAssistantService(action: String = AssistantServerService.ACTION_START) {
        if (!hasAudioPermission()) {
            _status.update {
                it.copy(
                    listeningState = ListeningState.PERMISSION_NEEDED,
                    errorMessage = "Grant Microphone permission to start 24/7 listening & recording.",
                )
            }
            return
        }
        try {
            ContextCompat.startForegroundService(this, Intent(this, AssistantServerService::class.java).setAction(action))
        } catch (e: Exception) {
            _status.update {
                it.copy(
                    listeningState = ListeningState.ERROR,
                    errorMessage = e.message ?: "Could not start microphone foreground service.",
                )
            }
        }
    }

    fun stopAssistantService() {
        try {
            stopService(Intent(this, AssistantServerService::class.java))
        } catch (_: Exception) {
        }
        _status.update {
            it.copy(
                running = false,
                listeningState = ListeningState.PAUSED,
                vadSpeechActive = false,
                livePartialTranscript = "",
                rmsDbFs = -90f,
            )
        }
    }

    fun downloadOfflineModel(onMessage: (String) -> Unit = {}) {
        if (!modelDownloadInProgress.compareAndSet(false, true)) return
        scope.launch {
            try {
                updateStatus {
                    it.copy(
                        offlineSttState = OfflineSttState.DOWNLOADING,
                        offlineSttProgressPct = 1,
                        offlineSttStatusDetail = "Starting download…",
                    )
                }
                val res = voskEngine.downloadAndInstallModel { pct, detail ->
                    updateStatus {
                        it.copy(
                            offlineSttState = OfflineSttState.DOWNLOADING,
                            offlineSttProgressPct = pct,
                            offlineSttStatusDetail = detail,
                        )
                    }
                }
                res.fold(
                    onSuccess = {
                        updateStatus {
                            it.copy(
                                offlineSttState = OfflineSttState.READY,
                                offlineSttProgressPct = 100,
                                offlineSttStatusDetail = "Offline Vosk English acoustic model active",
                            )
                        }
                        onMessage("Offline speech recognition model ready.")
                    },
                    onFailure = { err ->
                        updateStatus {
                            it.copy(
                                offlineSttState = OfflineSttState.ERROR,
                                offlineSttStatusDetail = err.message ?: "Download failed",
                            )
                        }
                        onMessage("Offline model download failed: ${err.message}")
                    },
                )
            } finally {
                modelDownloadInProgress.set(false)
            }
        }
    }

    fun playRecordingClip(id: String) {
        val wavFile = archiveStore.getWavFile(id) ?: return
        playbackJob?.cancel()
        playbackJob = scope.launch {
            echoCooldownUntilElapsedMs = Long.MAX_VALUE
            updateStatus { it.copy(activePlaybackId = id) }
            try {
                speakerPlayer.playWavFile(wavFile)
            } finally {
                echoCooldownUntilElapsedMs = SystemClock.elapsedRealtime() + 450L
                updateStatus { it.copy(activePlaybackId = "") }
            }
        }
    }

    fun stopPlayback() {
        playbackJob?.cancel()
        speakerPlayer.stop()
        echoCooldownUntilElapsedMs = SystemClock.elapsedRealtime() + 300L
        updateStatus {
            it.copy(
                activePlaybackId = "",
                listeningState = if (it.running) ListeningState.LISTENING else ListeningState.PAUSED,
            )
        }
    }

    suspend fun speakReplyWavWithEchoGate(wavBytes: ByteArray) {
        echoCooldownUntilElapsedMs = Long.MAX_VALUE
        updateStatus { it.copy(listeningState = ListeningState.SPEAKING_REPLY) }
        try {
            speakerPlayer.playWavBytes(wavBytes)
        } finally {
            voskEngine.resetStream()
            voskEngine.resetWakeSpotter()
            echoCooldownUntilElapsedMs = SystemClock.elapsedRealtime() + 260L
            updateStatus {
                it.copy(
                    listeningState = when {
                        !it.running -> ListeningState.PAUSED
                        coordinator.isAwaitingFollowup() -> ListeningState.AWAITING_QUERY
                        else -> ListeningState.LISTENING
                    },
                )
            }
        }
    }

    private fun ensureCachedWakeAckWav(hostIp: String, port: Int) {
        if (cachedWakeAckWav != null || hostIp.isBlank()) return
        if (!wakeAckFetchInProgress.compareAndSet(false, true)) return
        scope.launch {
            try {
                val wav = serverClient.fetchSynthesizedSpeechWav(
                    hostIp = hostIp,
                    port = port,
                    text = "Yes, Commander?",
                )
                if (wav != null && wav.size > 44) {
                    cachedWakeAckWav = wav
                }
            } finally {
                wakeAckFetchInProgress.set(false)
            }
        }
    }

    suspend fun checkOrDiscoverServer(forceSubnetScan: Boolean = false): AssistantRuntimeStatus {
        val cfg = _config.value
        if (!cfg.robosServerEnabled) {
            updateStatus {
                it.copy(
                    serverState = ServerConnectionState.DISABLED_RECORDER_ONLY,
                    serverLatencyMs = -1L,
                )
            }
            return _status.value
        }

        val currentHost = cfg.robosServerHost.ifBlank { _status.value.serverHost }
        if (!forceSubnetScan && currentHost.isNotBlank()) {
            val probe = serverClient.probeServer(
                hostIp = currentHost,
                port = cfg.robosServerPort,
                timeoutMs = 1_100,
                deviceUuid = cfg.deviceUuid,
                assistantName = cfg.assistantName,
                room = cfg.room,
                phonePort = cfg.port,
            )
            if (probe.reachable) {
                ensureCachedWakeAckWav(probe.hostIp, probe.port)
                updateStatus {
                    it.copy(
                        serverState = ServerConnectionState.CONNECTED,
                        serverHost = probe.hostIp,
                        serverPort = probe.port,
                        serverHostname = probe.hostname,
                        serverTtsEngine = probe.ttsEngine,
                        serverLatencyMs = probe.latencyMs,
                        lastServerCheckIso = Instant.now().toString(),
                    )
                }
                return _status.value
            }
        }

        val wifiIp = wifiMonitor.state.value.ip
        if (wifiIp.isNotBlank() && (forceSubnetScan || currentHost.isBlank())) {
            updateStatus {
                if (it.serverState != ServerConnectionState.CONNECTED) {
                    it.copy(serverState = ServerConnectionState.DISCOVERING)
                } else {
                    it
                }
            }
            val found = serverClient.discoverServerHostIp(
                wifiIp = wifiIp,
                port = cfg.robosServerPort,
                cachedHostIp = currentHost,
                deviceUuid = cfg.deviceUuid,
                assistantName = cfg.assistantName,
                room = cfg.room,
                phonePort = cfg.port,
            )
            if (found != null && found.reachable) {
                ensureCachedWakeAckWav(found.hostIp, found.port)
                if (cfg.robosServerHost != found.hostIp) {
                    val saved = configStore.save(cfg.copy(robosServerHost = found.hostIp))
                    _config.value = saved
                }
                updateStatus {
                    it.copy(
                        serverState = ServerConnectionState.CONNECTED,
                        serverHost = found.hostIp,
                        serverPort = found.port,
                        serverHostname = found.hostname,
                        serverTtsEngine = found.ttsEngine,
                        serverLatencyMs = found.latencyMs,
                        lastServerCheckIso = Instant.now().toString(),
                    )
                }
                return _status.value
            }
        }

        coordinator.disarmFollowup()
        updateStatus {
            it.copy(
                serverState = ServerConnectionState.OFFLINE_RECORDER_ONLY,
                serverLatencyMs = -1L,
                lastServerCheckIso = Instant.now().toString(),
            )
        }
        return _status.value
    }
}

/**
 * Always-on 24/7 Foreground Surveillance & Voice Assistant Service (`foregroundServiceType="microphone"`).
 */
class AssistantServerService : Service(), AssistantNodeController {
    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    private var cpuWakeLock: PowerManager.WakeLock? = null
    private var wifiLock: WifiManager.WifiLock? = null

    private var micEngine: MicrophoneEngine? = null
    private var vadSegmenter: AdaptiveVadSegmenter? = null
    private var httpServer: HttpAssistantServer? = null

    private var heartbeatJob: Job? = null
    private var watchdogJob: Job? = null
    private var startedElapsedMs: Long = 0L
    private var activeHttpPort: Int = -1
    private var lastNotificationText: String = ""

    @Volatile
    private var utteranceWakeSpotterMatched: Boolean = false

    private val app: AssistantApp
        get() = application as AssistantApp

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        startedElapsedMs = SystemClock.elapsedRealtime()
        ensureNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                app.updateConfig { it.copy(enabled = false) }
                stopSelf()
                return START_NOT_STICKY
            }
        }

        if (!app.hasAudioPermission()) {
            app.updateStatus {
                it.copy(
                    running = false,
                    listeningState = ListeningState.PERMISSION_NEEDED,
                    errorMessage = "Grant Microphone permission to run 24/7 audio surveillance.",
                )
            }
            stopSelf()
            return START_NOT_STICKY
        }

        val cfg = app.config.value
        val notification = buildForegroundNotification(cfg, app.status.value)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }

        acquireLocks()
        applyConfigAndEnsureRunning(cfg)
        ensureBackgroundLoops()
        return START_STICKY
    }

    override fun onDestroy() {
        heartbeatJob?.cancel()
        watchdogJob?.cancel()
        micEngine?.stop()
        micEngine = null
        httpServer?.stop()
        httpServer = null
        releaseLocks()
        serviceScope.cancel()
        app.updateStatus {
            it.copy(
                running = false,
                listeningState = ListeningState.PAUSED,
                vadSpeechActive = false,
                livePartialTranscript = "",
            )
        }
        super.onDestroy()
    }

    private fun applyConfigAndEnsureRunning(cfg: AssistantConfig) {
        val seg = vadSegmenter ?: AdaptiveVadSegmenter(
            sampleRate = cfg.sampleRate,
            sensitivity = cfg.vadSensitivity,
            silenceHangMs = cfg.silenceHangMs,
            preRollMs = cfg.preRollMs,
            maxClipSeconds = cfg.maxClipSeconds,
        ).also { vadSegmenter = it }

        seg.sensitivity = cfg.vadSensitivity
        seg.silenceHangMs = cfg.silenceHangMs
        seg.maxClipSeconds = cfg.maxClipSeconds

        if (httpServer == null || activeHttpPort != cfg.port) {
            httpServer?.stop()
            val srv = HttpAssistantServer(
                port = cfg.port,
                archiveStore = app.archiveStore,
                liveHub = app.liveHub,
                authVault = app.authVault,
                controller = this,
            )
            try {
                srv.start()
                httpServer = srv
                activeHttpPort = srv.boundPort
            } catch (e: Exception) {
                app.updateStatus {
                    it.copy(errorMessage = "HTTP server port ${cfg.port} unavailable: ${e.message}")
                }
            }
        }

        if (micEngine?.isRunning != true) {
            startMicrophonePipeline(cfg, seg)
        }
    }

    private fun startMicrophonePipeline(cfg: AssistantConfig, seg: AdaptiveVadSegmenter) {
        micEngine?.stop()
        app.updateStatus { it.copy(listeningState = ListeningState.STARTING, errorMessage = "") }
        val engine = MicrophoneEngine(
            sampleRate = cfg.sampleRate,
            onPcmFrame = { buf, len ->
                handleIncomingPcmFrame(buf, len, seg)
            },
            onError = { err ->
                app.updateStatus {
                    it.copy(listeningState = ListeningState.ERROR, errorMessage = err)
                }
            },
        )
        if (engine.start()) {
            micEngine = engine
            app.updateStatus {
                it.copy(
                    running = true,
                    listeningState = ListeningState.LISTENING,
                    errorMessage = "",
                )
            }
        }
    }

    private fun handleIncomingPcmFrame(buf: ByteArray, len: Int, seg: AdaptiveVadSegmenter) {
        // Always feed live `/audio.wav` stream listeners
        app.liveHub.publishPcm(buf, len)

        // Suppress VAD/STT ingestion while the phone is playing back audio or TTS reply
        if (SystemClock.elapsedRealtime() < app.echoCooldownUntilElapsedMs || app.speakerPlayer.isPlaying) {
            if (utteranceWakeSpotterMatched) {
                utteranceWakeSpotterMatched = false
                app.voskEngine.resetWakeSpotter()
            }
            seg.reset()
            return
        }

        val cfgSnapshot = app.config.value
        val serverOnlineNow = app.status.value.actionsArmed
        val spotterEligible = serverOnlineNow &&
            cfgSnapshot.wakeWordEnabled &&
            app.voskEngine.isLoaded &&
            !app.coordinator.isAwaitingFollowup()

        val wasInUtterance = seg.isInUtterance
        if (wasInUtterance && spotterEligible) {
            utteranceWakeSpotterMatched = app.voskEngine.feedWakeSpotterFrame(buf, len)
        } else if (!spotterEligible) {
            utteranceWakeSpotterMatched = false
        }

        val partial = if (!serverOnlineNow && app.voskEngine.isLoaded) {
            app.voskEngine.feedStreamingFrame(buf, len)
        } else {
            ""
        }

        var completedUtterance: CapturedUtterance? = null
        val telemetry = seg.processPcm16Le(
            pcm = buf,
            length = len,
            earlyFinalizeHint = (spotterEligible && utteranceWakeSpotterMatched),
        ) { utterance ->
            completedUtterance = utterance
        }

        if (!wasInUtterance && telemetry.inUtterance && spotterEligible) {
            app.voskEngine.resetWakeSpotter()
            val onsetBytes = seg.currentUtteranceBytes()
            utteranceWakeSpotterMatched = if (onsetBytes.isNotEmpty()) {
                app.voskEngine.feedWakeSpotterFrame(onsetBytes, onsetBytes.size)
            } else {
                false
            }
        }

        app.updateStatus { cur ->
            val nextState = when {
                cur.listeningState == ListeningState.PROCESSING_ACTION ||
                    cur.listeningState == ListeningState.SPEAKING_REPLY -> cur.listeningState
                telemetry.inUtterance -> ListeningState.RECORDING_SPEECH
                app.coordinator.isAwaitingFollowup() -> ListeningState.AWAITING_QUERY
                else -> ListeningState.LISTENING
            }
            val liveCaption = when {
                telemetry.inUtterance && utteranceWakeSpotterMatched -> "Commander…"
                telemetry.inUtterance && serverOnlineNow -> "Streaming speech to RobOS Server…"
                telemetry.inUtterance && partial.isNotBlank() -> partial
                telemetry.inUtterance -> cur.livePartialTranscript
                else -> ""
            }
            cur.copy(
                running = true,
                listeningState = nextState,
                rmsDbFs = telemetry.rmsDbFs,
                peakDbFs = telemetry.peakDbFs,
                noiseFloorDbFs = telemetry.noiseFloorDbFs,
                vadSpeechActive = telemetry.speechActive,
                waveformBars = telemetry.bars,
                livePartialTranscript = liveCaption,
                activeListeners = app.liveHub.activeAudioListeners,
                uptimeSeconds = ((SystemClock.elapsedRealtime() - startedElapsedMs) / 1000L).coerceAtLeast(0L),
            )
        }

        val captured = completedUtterance
        if (captured != null) {
            val wasWakeSpotterOnly = spotterEligible && utteranceWakeSpotterMatched
            utteranceWakeSpotterMatched = false
            app.voskEngine.resetWakeSpotter()
            val partialFallback = partial
            serviceScope.launch {
                val cfgNow = app.config.value
                val online = cfgNow.robosServerEnabled && app.status.value.actionsArmed
                app.updateStatus { it.copy(livePartialTranscript = "") }

                if (online && wasWakeSpotterOnly && captured.durationMs <= 1750L && !app.coordinator.isAwaitingFollowup()) {
                    val ackWav = app.cachedWakeAckWav ?: app.speakerPlayer.builtinWakeAckWav
                    app.coordinator.fastArmLocalCommanderWake(
                        config = cfgNow,
                        utterance = captured,
                        wakeAckWav = ackWav,
                    )
                    return@launch
                }

                val offlineText = if (!online) {
                    if (app.voskEngine.isLoaded) {
                        app.voskEngine.transcribeUtterancePcm(captured.pcm16le, captured.sampleRate)
                            .ifBlank { partialFallback }
                    } else {
                        partialFallback
                    }
                } else {
                    ""
                }
                val sttSource = when {
                    online -> "robos-server-moonshine"
                    app.voskEngine.isLoaded -> "vosk-offline"
                    else -> "audio-only"
                }
                app.coordinator.handleCapturedUtterance(
                    config = cfgNow,
                    utterance = captured,
                    rawTranscript = offlineText,
                    sttSource = sttSource,
                    fallbackOfflineTranscript = {
                        if (app.voskEngine.isLoaded) {
                            app.voskEngine.transcribeUtterancePcm(captured.pcm16le, captured.sampleRate)
                        } else {
                            partialFallback
                        }
                    },
                )
            }
        }
    }

    private fun ensureBackgroundLoops() {
        if (heartbeatJob?.isActive != true) {
            heartbeatJob = serviceScope.launch {
                var tick = 0
                while (isActive) {
                    val forceScan = (tick % 6 == 0) && app.status.value.serverState != ServerConnectionState.CONNECTED
                    val st = app.checkOrDiscoverServer(forceSubnetScan = forceScan)
                    maybeRefreshForegroundNotification(app.config.value, st)
                    tick++
                    delay(5_000L)
                }
            }
        }

        if (watchdogJob?.isActive != true) {
            watchdogJob = serviceScope.launch {
                while (isActive) {
                    delay(4_000L)
                    val cfg = app.config.value
                    if (!cfg.enabled || !app.hasAudioPermission()) continue
                    val engine = micEngine
                    val stalled = engine == null ||
                        !engine.isRunning ||
                        (SystemClock.elapsedRealtime() - engine.lastFrameElapsedMs > 6_000L)
                    if (stalled) {
                        vadSegmenter?.let { startMicrophonePipeline(cfg, it) }
                    }
                    app.updateStatus {
                        it.copy(
                            activeListeners = app.liveHub.activeAudioListeners,
                            uptimeSeconds = ((SystemClock.elapsedRealtime() - startedElapsedMs) / 1000L).coerceAtLeast(0L),
                        )
                    }
                }
            }
        }
    }

    override fun currentConfig(): AssistantConfig = app.config.value

    override fun currentStatus(): AssistantRuntimeStatus = app.status.value

    override fun connectServer(host: String, port: Int): AssistantRuntimeStatus {
        app.updateConfig {
            it.copy(
                robosServerEnabled = true,
                robosServerHost = host.trim(),
                robosServerPort = port.coerceIn(1, 65535),
            )
        }
        return kotlinx.coroutines.runBlocking {
            app.checkOrDiscoverServer(forceSubnetScan = false)
        }
    }

    override fun disconnectServer(): AssistantRuntimeStatus {
        app.coordinator.disarmFollowup()
        app.updateConfig { it.copy(robosServerEnabled = false) }
        app.updateStatus {
            it.copy(
                serverState = ServerConnectionState.DISABLED_RECORDER_ONLY,
                serverLatencyMs = -1L,
            )
        }
        return app.status.value
    }

    override suspend fun askWhenConnected(query: String): Result<AudioRecordingEntry> {
        val st = app.checkOrDiscoverServer(forceSubnetScan = false)
        if (!st.actionsArmed) {
            return Result.failure(
                IllegalStateException("RobOS Server is not connected — assistant is listening and recording audio + text only."),
            )
        }
        val cfg = app.config.value
        val pcm = HttpAssistantServer.synthesizeSpeechLikeTonePcm(durationMs = 800L, sampleRate = cfg.sampleRate)
        val now = System.currentTimeMillis()
        val utterance = CapturedUtterance(
            pcm16le = pcm,
            sampleRate = cfg.sampleRate,
            durationMs = 800L,
            peakDbFs = -18f,
            startedEpochMs = now - 800L,
            endedEpochMs = now,
        )
        val entry = app.coordinator.handleCapturedUtterance(
            config = cfg,
            utterance = utterance,
            rawTranscript = "Commander, $query",
            sttSource = "manual-ask",
        ) ?: return Result.failure(IllegalStateException("Could not record assistant turn"))
        return if (entry.actionStatus == ActionOutcomeStatus.ACTION_EXECUTED) {
            Result.success(entry)
        } else {
            Result.failure(IllegalStateException(entry.actionSummary.ifBlank { "RobOS Server action failed" }))
        }
    }

    override suspend fun simulateUtterance(
        text: String,
        pcm16le: ByteArray,
        sampleRate: Int,
    ): AudioRecordingEntry? {
        val cfg = app.config.value
        val durationMs = ((pcm16le.size * 1000L) / (sampleRate * 2)).coerceAtLeast(300L)
        val now = System.currentTimeMillis()
        val utterance = CapturedUtterance(
            pcm16le = pcm16le,
            sampleRate = sampleRate,
            durationMs = durationMs,
            peakDbFs = -15f,
            startedEpochMs = now - durationMs,
            endedEpochMs = now,
        )
        val online = cfg.robosServerEnabled && app.status.value.actionsArmed
        val resolvedText = when {
            text.isNotBlank() -> text
            !online && app.voskEngine.isLoaded -> app.voskEngine.transcribeUtterancePcm(pcm16le, sampleRate)
            else -> ""
        }
        return app.coordinator.handleCapturedUtterance(
            config = cfg,
            utterance = utterance,
            rawTranscript = resolvedText,
            sttSource = if (online && text.isBlank()) "robos-server-whisper" else "vosk-offline",
            fallbackOfflineTranscript = {
                if (app.voskEngine.isLoaded) app.voskEngine.transcribeUtterancePcm(pcm16le, sampleRate) else ""
            },
        )
    }

    override suspend fun playRemoteSpeechWav(wavBytes: ByteArray, caption: String) {
        app.speakReplyWavWithEchoGate(wavBytes)
    }

    private fun acquireLocks() {
        val pm = getSystemService(PowerManager::class.java)
        if (cpuWakeLock?.isHeld != true) {
            cpuWakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "RobosAssistant::MicSurveillanceLock").apply {
                setReferenceCounted(false)
                acquire()
            }
        }
        val wm = applicationContext.getSystemService(WifiManager::class.java)
        if (wifiLock?.isHeld != true) {
            val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                WifiManager.WIFI_MODE_FULL_LOW_LATENCY
            } else {
                @Suppress("DEPRECATION")
                WifiManager.WIFI_MODE_FULL_HIGH_PERF
            }
            wifiLock = wm.createWifiLock(mode, "RobosAssistant::LowLatencyWifi").apply {
                setReferenceCounted(false)
                acquire()
            }
        }
    }

    private fun releaseLocks() {
        try {
            if (cpuWakeLock?.isHeld == true) cpuWakeLock?.release()
        } catch (_: Exception) {
        }
        cpuWakeLock = null
        try {
            if (wifiLock?.isHeld == true) wifiLock?.release()
        } catch (_: Exception) {
        }
        wifiLock = null
    }

    private fun ensureNotificationChannel() {
        val nm = getSystemService(NotificationManager::class.java)
        val chan = NotificationChannel(
            CHANNEL_ID,
            "RobOS Assistant 24/7 Audio Surveillance",
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = "Keeps microphone listening, recording audio + text, and RobOS Voice Server actions active."
            setShowBadge(false)
        }
        nm.createNotificationChannel(chan)
    }

    private fun buildForegroundNotification(cfg: AssistantConfig, st: AssistantRuntimeStatus): Notification {
        val openIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val stopIntent = PendingIntent.getService(
            this,
            1,
            Intent(this, AssistantServerService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val modeText = if (st.actionsArmed) {
            "RobOS Server (${st.serverHost}) · Voice Actions + Recording"
        } else {
            "Recorder Only (Audio + Text) · Server Offline"
        }
        lastNotificationText = modeText
        return Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_tab_listen)
            .setContentTitle("${cfg.assistantName} · ${cfg.room}")
            .setContentText(modeText)
            .setOngoing(true)
            .setContentIntent(openIntent)
            .addAction(Notification.Action.Builder(null, "Pause", stopIntent).build())
            .build()
    }

    private fun maybeRefreshForegroundNotification(cfg: AssistantConfig, st: AssistantRuntimeStatus) {
        val modeText = if (st.actionsArmed) {
            "RobOS Server (${st.serverHost}) · Voice Actions + Recording"
        } else {
            "Recorder Only (Audio + Text) · Server Offline"
        }
        if (modeText == lastNotificationText) return
        val nm = getSystemService(NotificationManager::class.java)
        nm.notify(NOTIFICATION_ID, buildForegroundNotification(cfg, st))
    }

    companion object {
        const val CHANNEL_ID = "robos_assistant_channel"
        const val NOTIFICATION_ID = 8091
        const val ACTION_START = "com.robos.assistant.START"
        const val ACTION_STOP = "com.robos.assistant.STOP"
        const val ACTION_APPLY_CONFIG = "com.robos.assistant.APPLY_CONFIG"
    }
}

/**
 * Allows `RobOS Preferences for Android` to hand restored settings to `RobOS Assistant`.
 */
class SettingsProvider : ContentProvider() {
    private val json = Json { ignoreUnknownKeys = true }

    override fun onCreate(): Boolean = true

    override fun call(method: String, arg: String?, extras: Bundle?): Bundle {
        val app = context?.applicationContext as? AssistantApp ?: return Bundle()
        app.ready.await()
        if (method == "applySettings" && !arg.isNullOrBlank()) {
            try {
                val obj = json.decodeFromString(JsonObject.serializer(), arg)
                app.updateConfig { cur ->
                    cur.copy(
                        assistantName = obj["assistantName"]?.jsonPrimitive?.content ?: cur.assistantName,
                        room = obj["room"]?.jsonPrimitive?.content ?: cur.room,
                        robosServerHost = obj["robosServerHost"]?.jsonPrimitive?.content ?: cur.robosServerHost,
                        robosServerPort = obj["robosServerPort"]?.jsonPrimitive?.content?.toIntOrNull() ?: cur.robosServerPort,
                    )
                }
                return Bundle().apply { putBoolean("ok", true) }
            } catch (e: Exception) {
                return Bundle().apply {
                    putBoolean("ok", false)
                    putString("error", e.message)
                }
            }
        }
        return Bundle().apply { putBoolean("ok", false) }
    }

    override fun query(u: Uri, p: Array<out String>?, s: String?, a: Array<out String>?, o: String?): Cursor? = null
    override fun getType(uri: Uri): String? = null
    override fun insert(uri: Uri, values: ContentValues?): Uri? = null
    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?): Int = 0
    override fun update(uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<out String>?): Int = 0
}

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        val action = intent?.action ?: return
        if (action != Intent.ACTION_BOOT_COMPLETED && action != Intent.ACTION_MY_PACKAGE_REPLACED) return
        val app = context.applicationContext as? AssistantApp ?: return
        val cfg = app.config.value
        if (cfg.enabled && cfg.autoStartOnBoot && app.hasAudioPermission()) {
            app.startAssistantService(AssistantServerService.ACTION_START)
        }
    }
}
