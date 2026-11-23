package com.robos.assistant.ui

import android.app.Application
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.robos.assistant.android.AssistantApp
import com.robos.assistant.core.ActionOutcomeStatus
import com.robos.assistant.core.AssistantConfig
import com.robos.assistant.core.AssistantRuntimeStatus
import com.robos.assistant.core.AudioRecordingEntry
import com.robos.assistant.core.CapturedUtterance
import com.robos.assistant.core.HttpAssistantServer
import com.robos.assistant.core.RecordingFilter
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class AssistantViewModel(application: Application) : AndroidViewModel(application) {
    private val app = application as AssistantApp

    val config: StateFlow<AssistantConfig> = app.config
    val status: StateFlow<AssistantRuntimeStatus> = app.status

    private val _searchQuery = MutableStateFlow("")
    val searchQuery: StateFlow<String> = _searchQuery

    private val _filter = MutableStateFlow(RecordingFilter.ALL)
    val filter: StateFlow<RecordingFilter> = _filter

    private val _messages = MutableSharedFlow<String>(extraBufferCapacity = 8)
    val messages: SharedFlow<String> = _messages

    val filteredRecordings: StateFlow<List<AudioRecordingEntry>> = combine(
        app.recordings,
        _searchQuery,
        _filter,
    ) { all, q, flt ->
        val query = q.trim().lowercase()
        all.filter { item ->
            val matchFilter = when (flt) {
                RecordingFilter.ALL -> true
                RecordingFilter.WAKE_COMMANDS -> item.wakeWordDetected
                RecordingFilter.ACTIONS_EXECUTED -> item.actionStatus == ActionOutcomeStatus.ACTION_EXECUTED
                RecordingFilter.OFFLINE_ONLY -> item.actionStatus == ActionOutcomeStatus.SERVER_OFFLINE_RECORDED_ONLY
            }
            val matchQuery = query.isEmpty() ||
                item.transcript.lowercase().contains(query) ||
                item.assistantReply.lowercase().contains(query) ||
                item.actionSummary.lowercase().contains(query) ||
                item.room.lowercase().contains(query)
            matchFilter && matchQuery
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    fun hasAudioPermission(): Boolean = app.hasAudioPermission()

    fun ensureRunningIfEnabled() {
        app.wifiMonitor.refreshNow()
        app.batteryMonitor.refresh()
        app.refreshArchiveSnapshot()
        if (app.config.value.enabled && app.hasAudioPermission()) {
            app.startAssistantService()
        }
    }

    fun refreshSystemState() {
        app.wifiMonitor.refreshNow()
        app.batteryMonitor.refresh()
        app.refreshArchiveSnapshot()
        viewModelScope.launch {
            app.checkOrDiscoverServer(forceSubnetScan = false)
        }
    }

    fun setListeningEnabled(enabled: Boolean) {
        app.updateConfig { it.copy(enabled = enabled) }
        _messages.tryEmit(if (enabled) "24/7 audio surveillance & listening started." else "Microphone listening paused.")
    }

    fun updateConfig(transform: (AssistantConfig) -> AssistantConfig) {
        app.updateConfig(transform)
    }

    fun setHttpPassword(password: String) {
        app.authVault.setPassword(password)
        _messages.tryEmit("HTTP authentication password updated.")
    }

    fun hasHttpPassword(): Boolean = app.authVault.getPassword().isNotEmpty()

    fun setSearchQuery(q: String) {
        _searchQuery.value = q
    }

    fun setFilter(f: RecordingFilter) {
        _filter.value = f
    }

    fun playOrStopClip(id: String) {
        if (app.status.value.activePlaybackId == id) {
            app.stopPlayback()
        } else {
            app.playRecordingClip(id)
        }
    }

    fun deleteClip(id: String) {
        if (app.status.value.activePlaybackId == id) {
            app.stopPlayback()
        }
        app.archiveStore.delete(id)
        app.refreshArchiveSnapshot()
        _messages.tryEmit("Recording deleted.")
    }

    fun clearAllRecordings() {
        app.stopPlayback()
        app.archiveStore.clearAll()
        app.refreshArchiveSnapshot()
        _messages.tryEmit("Cleared all recorded audio clips and transcripts.")
    }

    fun discoverRobosServer() {
        viewModelScope.launch {
            _messages.tryEmit("Scanning Wi-Fi for RobOS Voice Server (:19188)…")
            val st = app.checkOrDiscoverServer(forceSubnetScan = true)
            if (st.actionsArmed) {
                _messages.tryEmit("Connected to RobOS Server at ${st.serverHost}:${st.serverPort}.")
            } else {
                _messages.tryEmit("No RobOS Server found on Wi-Fi — continuing in Surveillance Recorder mode.")
            }
        }
    }

    fun connectToHost(host: String, port: Int) {
        app.updateConfig {
            it.copy(
                robosServerEnabled = true,
                robosServerHost = host.trim(),
                robosServerPort = port.coerceIn(1, 65535),
            )
        }
        viewModelScope.launch {
            val st = app.checkOrDiscoverServer(forceSubnetScan = false)
            if (st.actionsArmed) {
                _messages.tryEmit("Connected to RobOS Server (${st.serverHost}:${st.serverPort}).")
            } else {
                _messages.tryEmit("Could not reach ${host.trim()}:$port — staying in Recorder Only mode.")
            }
        }
    }

    fun sendManualAssistantCommand(query: String) {
        val clean = query.trim()
        if (clean.isEmpty()) return
        viewModelScope.launch {
            val st = app.checkOrDiscoverServer(forceSubnetScan = false)
            if (!st.actionsArmed) {
                _messages.tryEmit("Connect a RobOS Server first to run actions.")
                return@launch
            }
            val cfg = app.config.value
            val pcm = HttpAssistantServer.synthesizeSpeechLikeTonePcm(durationMs = 700L, sampleRate = cfg.sampleRate)
            val now = System.currentTimeMillis()
            val entry = app.coordinator.handleCapturedUtterance(
                config = cfg,
                utterance = CapturedUtterance(
                    pcm16le = pcm,
                    sampleRate = cfg.sampleRate,
                    durationMs = 700L,
                    peakDbFs = -18f,
                    startedEpochMs = now - 700L,
                    endedEpochMs = now,
                ),
                rawTranscript = "Commander, $clean",
                sttSource = "manual-ask",
            )
            if (entry?.actionStatus == ActionOutcomeStatus.ACTION_EXECUTED) {
                _messages.tryEmit(entry.assistantReply.ifBlank { "Action executed on RobOS Server." })
            } else {
                _messages.tryEmit(entry?.actionSummary?.ifBlank { "Action failed" } ?: "Action failed")
            }
        }
    }

    fun downloadOfflineSttModel() {
        app.downloadOfflineModel { msg ->
            _messages.tryEmit(msg)
        }
    }

    fun copyToClipboard(label: String, text: String) {
        val cm = app.getSystemService(ClipboardManager::class.java)
        cm.setPrimaryClip(ClipData.newPlainText(label, text))
        _messages.tryEmit("Copied $label")
    }

    fun requestUnrestrictedBatteryIntent(): Intent =
        Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
            data = Uri.parse("package:${app.packageName}")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
}
