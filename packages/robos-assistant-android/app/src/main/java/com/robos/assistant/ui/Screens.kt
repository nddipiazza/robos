package com.robos.assistant.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.robos.assistant.core.ActionOutcomeStatus
import com.robos.assistant.core.AssistantConfig
import com.robos.assistant.core.AssistantRuntimeStatus
import com.robos.assistant.core.AudioRecordingEntry
import com.robos.assistant.core.DEFAULT_ROOMS
import com.robos.assistant.core.ListeningState
import com.robos.assistant.core.OfflineSttState
import com.robos.assistant.core.RecordingFilter
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

private val LOCAL_TIME_FMT: DateTimeFormatter = DateTimeFormatter.ofPattern("MMM d, h:mm:ss a")

private fun formatTimestamp(iso: String): String =
    try {
        LOCAL_TIME_FMT.format(Instant.parse(iso).atZone(ZoneId.systemDefault()))
    } catch (_: Exception) {
        iso
    }

private fun formatBytes(bytes: Long): String {
    if (bytes < 1024L) return "$bytes B"
    val kb = bytes / 1024.0
    if (kb < 1024.0) return "%.1f KB".format(kb)
    return "%.1f MB".format(kb / 1024.0)
}

@Composable
fun ListenTabScreen(
    config: AssistantConfig,
    status: AssistantRuntimeStatus,
    latestRecording: AudioRecordingEntry?,
    onRequestPermission: () -> Unit,
    onToggleEnabled: (Boolean) -> Unit,
    onDiscoverServer: () -> Unit,
    onOpenServerTab: () -> Unit,
    onOpenRecordingsTab: () -> Unit,
    onSendCommand: (String) -> Unit,
    onPlayClip: (String) -> Unit,
    onDownloadModel: () -> Unit,
    onCopyUrl: (String, String) -> Unit,
    onRequestUnrestrictedBattery: () -> Unit,
) {
    var askText by rememberSaveable { mutableStateOf("") }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        // 1. RobOS Server Connection Gate Banner (Core Architectural Rule)
        val serverConnected = status.actionsArmed
        val gateColor = if (serverConnected) Success else Warning
        SectionCard {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                StatusPill(
                    text = if (serverConnected) "RobOS Server Connected" else "Recorder Mode Only",
                    color = gateColor,
                    modifier = Modifier.testTag("pill:server-gate"),
                )
                if (serverConnected && status.serverLatencyMs > 0) {
                    MutedText("${status.serverLatencyMs} ms")
                }
            }
            if (serverConnected) {
                Text(
                    text = "Connected to ${status.serverHostname.ifBlank { status.serverHost }} (${status.serverHost}:${status.serverPort}). Server Whisper transcribes speech and wake word \"Commander\" executes RobOS actions.",
                    style = MaterialTheme.typography.bodyMedium,
                )
            } else {
                Text(
                    text = "No RobOS Server connected. Listening 24/7 and recording all speech as audio (.wav) + offline text like a surveillance camera. Connect a RobOS Server (:19188) to execute actions.",
                    style = MaterialTheme.typography.bodyMedium,
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(
                        onClick = onDiscoverServer,
                        colors = ButtonDefaults.buttonColors(containerColor = Accent, contentColor = Color(0xFF04222A)),
                    ) {
                        Text("Find RobOS Server")
                    }
                    OutlinedButton(onClick = onOpenServerTab) {
                        Text("Server Settings")
                    }
                }
            }
        }

        // 2. Live 24/7 Microphone Surveillance & Waveform Card
        SectionCard {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                val micColor = when (status.listeningState) {
                    ListeningState.RECORDING_SPEECH -> Success
                    ListeningState.PROCESSING_ACTION, ListeningState.SPEAKING_REPLY, ListeningState.AWAITING_QUERY -> Accent
                    ListeningState.LISTENING -> Accent
                    ListeningState.PERMISSION_NEEDED, ListeningState.ERROR -> Danger
                    else -> Muted
                }
                Column(Modifier.weight(1f)) {
                    StatusPill(text = status.listeningState.label, color = micColor)
                    Spacer(Modifier.height(4.dp))
                    MutedText("${config.room} · ${status.rmsDbFs.toInt()} dBFS (Noise floor ${status.noiseFloorDbFs.toInt()} dBFS)")
                }
                Switch(
                    checked = config.enabled,
                    onCheckedChange = onToggleEnabled,
                    modifier = Modifier.testTag("switch:listening"),
                )
            }

            if (status.listeningState == ListeningState.PERMISSION_NEEDED) {
                Button(
                    onClick = onRequestPermission,
                    colors = ButtonDefaults.buttonColors(containerColor = Danger),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Grant Microphone Permission")
                }
            }

            if (status.errorMessage.isNotBlank()) {
                Text(status.errorMessage, color = Danger, style = MaterialTheme.typography.bodySmall)
            }

            LiveWaveformBars(
                bars = status.waveformBars,
                active = status.running,
                speechDetected = status.vadSpeechActive,
            )

            // Live Streaming Partial Transcript Bubble
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(10.dp))
                    .background(Background)
                    .border(1.dp, Border, RoundedCornerShape(10.dp))
                    .padding(12.dp),
            ) {
                if (status.livePartialTranscript.isNotBlank()) {
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text("● Live Speech", color = Success, style = MaterialTheme.typography.labelSmall)
                        Text(
                            text = status.livePartialTranscript,
                            style = MaterialTheme.typography.bodyLarge,
                            fontWeight = FontWeight.Medium,
                        )
                    }
                } else {
                    MutedText(
                        if (serverConnected) {
                            "Say \"Commander…\" to run an action (audio processed by RobOS Server Whisper), or speak normally to record audio + text."
                        } else {
                            "Listening continuously. Spoken words are transcribed offline and saved with .wav audio."
                        },
                    )
                }
            }

            if (status.offlineSttState != OfflineSttState.READY) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(status.offlineSttState.label, color = Warning, style = MaterialTheme.typography.labelLarge)
                        if (status.offlineSttStatusDetail.isNotBlank()) {
                            MutedText(status.offlineSttStatusDetail)
                        }
                    }
                    if (status.offlineSttState != OfflineSttState.DOWNLOADING) {
                        OutlinedButton(onClick = onDownloadModel) {
                            Text("Download")
                        }
                    }
                }
                if (status.offlineSttState == OfflineSttState.DOWNLOADING) {
                    LinearProgressIndicator(
                        progress = { (status.offlineSttProgressPct / 100f).coerceIn(0f, 1f) },
                        modifier = Modifier.fillMaxWidth(),
                        color = Accent,
                    )
                }
            }
        }

        // 3. Direct RobOS Assistant Prompt Box (Gated by RobOS Server Connection!)
        SectionCard {
            Text("Ask RobOS Assistant", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            MutedText(
                if (serverConnected) {
                    "Send a command directly to your connected RobOS Server and speak the reply."
                } else {
                    "Disabled while RobOS Server is disconnected (actions require an active RobOS Server)."
                },
            )
            OutlinedTextField(
                value = askText,
                onValueChange = { askText = it },
                enabled = serverConnected,
                placeholder = { Text("What is the git status?") },
                singleLine = true,
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("input:ask"),
            )
            Button(
                onClick = {
                    val q = askText.trim()
                    if (q.isNotEmpty()) {
                        onSendCommand(q)
                        askText = ""
                    }
                },
                enabled = serverConnected && askText.isNotBlank(),
                colors = ButtonDefaults.buttonColors(containerColor = Accent, contentColor = Color(0xFF04222A)),
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("btn:ask"),
            ) {
                Text(if (serverConnected) "Run on RobOS Server" else "RobOS Server Required for Actions")
            }
        }

        // 4. Most Recent Surveillance Capture
        if (latestRecording != null) {
            SectionCard {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("Latest Recorded Utterance", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                    TextButton(onClick = onOpenRecordingsTab) {
                        Text("All (${status.totalRecordings}) →", color = Accent)
                    }
                }
                RecordingItemContent(
                    item = latestRecording,
                    isPlaying = status.activePlaybackId == latestRecording.id,
                    onPlay = { onPlayClip(latestRecording.id) },
                    onCopy = null,
                    onDelete = null,
                )
            }
        }

        // 5. LAN Surveillance Endpoints & 24/7 Power Telemetry
        SectionCard {
            Text("24/7 Surveillance Telemetry & LAN Stream", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
            val battLabel = if (status.batteryPercent >= 0) {
                "${status.batteryPercent}% (${if (status.charging) "Charging" else "On Battery"}) · ${"%.1f".format(status.temperatureC)}°C"
            } else {
                "Power status nominal"
            }
            MutedText("$battLabel · ${status.totalRecordings} clips (${formatBytes(status.totalStorageBytes)})")

            if (!status.batteryUnrestricted) {
                OutlinedButton(
                    onClick = onRequestUnrestrictedBattery,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Allow Unrestricted 24/7 Background Battery")
                }
            }

            status.baseUrl?.let { webUrl ->
                EndpointCopyRow("Web Console", webUrl) { onCopyUrl("Web Console URL", webUrl) }
            }
            status.audioStreamUrl?.let { wavUrl ->
                EndpointCopyRow("Live Audio (.wav)", wavUrl) { onCopyUrl("Live Audio URL", wavUrl) }
            }
        }
    }
}

@Composable
private fun EndpointCopyRow(label: String, url: String, onCopy: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(Background)
            .border(1.dp, Border, RoundedCornerShape(8.dp))
            .padding(horizontal = 10.dp, vertical = 6.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(label, color = Muted, style = MaterialTheme.typography.labelSmall)
            Text(url, fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.bodySmall)
        }
        TextButton(onClick = onCopy) {
            Text("Copy", color = Accent)
        }
    }
}

@Composable
fun RecordingsTabScreen(
    recordings: List<AudioRecordingEntry>,
    status: AssistantRuntimeStatus,
    config: AssistantConfig,
    searchQuery: String,
    selectedFilter: RecordingFilter,
    onSearchChange: (String) -> Unit,
    onFilterChange: (RecordingFilter) -> Unit,
    onPlayClip: (String) -> Unit,
    onCopyText: (String) -> Unit,
    onDeleteClip: (String) -> Unit,
    onClearAll: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            MutedText("${status.totalRecordings} clips · ${formatBytes(status.totalStorageBytes)} / ${config.retentionMaxMb} MB")
            if (status.totalRecordings > 0) {
                TextButton(onClick = onClearAll) {
                    Text("Clear All", color = Danger)
                }
            }
        }

        OutlinedTextField(
            value = searchQuery,
            onValueChange = onSearchChange,
            placeholder = { Text("Search transcripts, replies, or room…") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            RecordingFilter.entries.forEach { flt ->
                FilterChip(
                    selected = selectedFilter == flt,
                    onClick = { onFilterChange(flt) },
                    label = { Text(flt.label) },
                )
            }
        }

        if (recordings.isEmpty()) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                MutedText("No audio recordings match this filter yet.")
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                items(recordings, key = { it.id }) { item ->
                    SectionCard {
                        RecordingItemContent(
                            item = item,
                            isPlaying = status.activePlaybackId == item.id,
                            onPlay = { onPlayClip(item.id) },
                            onCopy = { onCopyText(item.transcript) },
                            onDelete = { onDeleteClip(item.id) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun RecordingItemContent(
    item: AudioRecordingEntry,
    isPlaying: Boolean,
    onPlay: () -> Unit,
    onCopy: (() -> Unit)?,
    onDelete: (() -> Unit)?,
) {
    val badgeColor = when (item.actionStatus) {
        ActionOutcomeStatus.ACTION_EXECUTED -> Success
        ActionOutcomeStatus.SERVER_OFFLINE_RECORDED_ONLY -> Warning
        ActionOutcomeStatus.ACTION_FAILED -> Danger
        ActionOutcomeStatus.AMBIENT_RECORDED -> Accent
    }

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        StatusPill(text = item.actionStatus.label, color = badgeColor)
        MutedText("${"%.1f".format(item.durationMs / 1000f)}s · ${item.peakDbFs.toInt()} dB")
    }

    Text(
        text = item.transcript,
        style = MaterialTheme.typography.bodyLarge,
        fontWeight = FontWeight.Medium,
    )

    if (item.assistantReply.isNotBlank()) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(8.dp))
                .background(Accent.copy(alpha = 0.12f))
                .border(1.dp, Accent.copy(alpha = 0.35f), RoundedCornerShape(8.dp))
                .padding(10.dp),
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text("RobOS Voice Reply", color = Accent, style = MaterialTheme.typography.labelSmall)
                Text(item.assistantReply, style = MaterialTheme.typography.bodyMedium)
            }
        }
    } else if (item.actionSummary.isNotBlank()) {
        MutedText(item.actionSummary)
    }

    MutedText("${formatTimestamp(item.createdAtIso)} · ${item.room} · ${formatBytes(item.sizeBytes)}")

    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Button(
            onClick = onPlay,
            colors = ButtonDefaults.buttonColors(
                containerColor = if (isPlaying) Danger else Accent,
                contentColor = if (isPlaying) Color.White else Color(0xFF04222A),
            ),
        ) {
            Text(if (isPlaying) "⏹ Stop Audio" else "▶ Play WAV")
        }
        if (onCopy != null) {
            OutlinedButton(onClick = onCopy) {
                Text("Copy Text")
            }
        }
        if (onDelete != null) {
            TextButton(onClick = onDelete) {
                Text("Delete", color = Danger)
            }
        }
    }
}

@Composable
fun AssistantTabScreen(
    config: AssistantConfig,
    status: AssistantRuntimeStatus,
    onUpdateConfig: ((AssistantConfig) -> AssistantConfig) -> Unit,
    onDownloadModel: () -> Unit,
) {
    var nameDraft by remember(config.assistantName) { mutableStateOf(config.assistantName) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        SectionCard {
            Text("Identity & Room", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            OutlinedTextField(
                value = nameDraft,
                onValueChange = {
                    nameDraft = it
                    onUpdateConfig { cfg -> cfg.copy(assistantName = it) }
                },
                label = { Text("Assistant Name") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            val roomOptions = (DEFAULT_ROOMS + config.room).distinct().map { it to it }
            Choice(
                label = "Smart Home Room",
                options = roomOptions,
                selected = config.room,
                onSelect = { r -> onUpdateConfig { it.copy(room = r) } },
            )
        }

        SectionCard {
            Text("Wake Word & Voice Replies", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text("Wake Word Detection (\"Commander\")")
                    MutedText("Triggers RobOS actions when a RobOS Server is connected.")
                }
                Switch(
                    checked = config.wakeWordEnabled,
                    onCheckedChange = { v -> onUpdateConfig { it.copy(wakeWordEnabled = v) } },
                )
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text("Speak RobOS Replies Out Loud")
                    MutedText("Plays natural Kokoro / Edge-TTS replies from the RobOS Server with echo suppression.")
                }
                Switch(
                    checked = config.speakServerReplies,
                    onCheckedChange = { v -> onUpdateConfig { it.copy(speakServerReplies = v) } },
                )
            }
        }

        SectionCard {
            Text("Offline On-Device Speech-to-Text", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            val sttColor = when (status.offlineSttState) {
                OfflineSttState.READY -> Success
                OfflineSttState.DOWNLOADING -> Accent
                else -> Warning
            }
            StatusPill(text = status.offlineSttState.label, color = sttColor)
            MutedText("Uses open-source Vosk (vosk-model-small-en-us-0.15, Apache 2.0) directly on the phone CPU with zero Google Play Services and zero cloud.")
            if (status.offlineSttState == OfflineSttState.DOWNLOADING) {
                LinearProgressIndicator(
                    progress = { (status.offlineSttProgressPct / 100f).coerceIn(0f, 1f) },
                    modifier = Modifier.fillMaxWidth(),
                    color = Accent,
                )
            } else if (status.offlineSttState != OfflineSttState.READY) {
                Button(
                    onClick = onDownloadModel,
                    colors = ButtonDefaults.buttonColors(containerColor = Accent, contentColor = Color(0xFF04222A)),
                ) {
                    Text("Download Offline English Model (~40 MB)")
                }
            }
        }

        SectionCard {
            Text("Surveillance Recording & Retention", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text("Record All Detected Speech")
                    MutedText("Surveillance mode: saves every spoken phrase as .wav + text (disable to save wake-word clips only).")
                }
                Switch(
                    checked = config.recordAllSpeech,
                    onCheckedChange = { v -> onUpdateConfig { it.copy(recordAllSpeech = v) } },
                )
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text("Also Save Non-Speech Sounds")
                    MutedText("Keep knocks, alarms, or room noises even when offline STT detects no spoken words.")
                }
                Switch(
                    checked = config.saveNonSpeechNoise,
                    onCheckedChange = { v -> onUpdateConfig { it.copy(saveNonSpeechNoise = v) } },
                )
            }

            Text("VAD Microphone Sensitivity: ${config.vadSensitivity}%")
            Slider(
                value = config.vadSensitivity.toFloat(),
                onValueChange = { v -> onUpdateConfig { it.copy(vadSensitivity = v.toInt()) } },
                valueRange = 10f..95f,
            )

            Choice(
                label = "End-of-Speech Silence Hang Time",
                options = listOf(
                    420 to "0.4s (Ultra-Fast — Recommended)",
                    700 to "0.7s (Fast response)",
                    1100 to "1.1s (Balanced)",
                    1800 to "1.8s (Long pauses)",
                    2500 to "2.5s (Dictation)",
                ),
                selected = config.silenceHangMs,
                onSelect = { ms -> onUpdateConfig { it.copy(silenceHangMs = ms) } },
            )

            Choice(
                label = "Automatic Storage Retention Cap",
                options = listOf(
                    128 to "128 MB (~2 hours of speech)",
                    512 to "512 MB (~9 hours of speech)",
                    1024 to "1 GB (~18 hours of speech)",
                    2048 to "2 GB (~36 hours of speech)",
                ),
                selected = config.retentionMaxMb,
                onSelect = { mb -> onUpdateConfig { it.copy(retentionMaxMb = mb) } },
            )
        }
    }
}

@Composable
fun ServerTabScreen(
    config: AssistantConfig,
    status: AssistantRuntimeStatus,
    hasPassword: Boolean,
    onUpdateConfig: ((AssistantConfig) -> AssistantConfig) -> Unit,
    onConnectServer: (String, Int) -> Unit,
    onDiscoverServer: () -> Unit,
    onSetPassword: (String) -> Unit,
    onCopyUrl: (String, String) -> Unit,
) {
    var serverHostDraft by remember(config.robosServerHost) { mutableStateOf(config.robosServerHost) }
    var serverPortDraft by remember(config.robosServerPort) { mutableStateOf(config.robosServerPort.toString()) }
    var localPortDraft by remember(config.port) { mutableStateOf(config.port.toString()) }
    var usernameDraft by remember(config.username) { mutableStateOf(config.username) }
    var passwordDraft by remember { mutableStateOf("") }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        SectionCard {
            Text("RobOS Voice Server Connection (:19188)", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            StatusPill(
                text = status.serverState.label,
                color = if (status.actionsArmed) Success else Warning,
            )
            MutedText("RobOS Server must be connected to execute voice commands and skills. When disconnected, the phone records audio and text locally without running actions.")

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Connect to RobOS Server")
                Switch(
                    checked = config.robosServerEnabled,
                    onCheckedChange = { v -> onUpdateConfig { it.copy(robosServerEnabled = v) } },
                    modifier = Modifier.testTag("switch:server-enabled"),
                )
            }

            OutlinedTextField(
                value = serverHostDraft,
                onValueChange = { serverHostDraft = it },
                label = { Text("RobOS Server Host / LAN IP") },
                placeholder = { Text("Auto-discovered on Wi-Fi (e.g. 192.168.1.50)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )

            OutlinedTextField(
                value = serverPortDraft,
                onValueChange = { serverPortDraft = it.filter(Char::isDigit) },
                label = { Text("RobOS Voice Server Port") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    onClick = {
                        onConnectServer(serverHostDraft, serverPortDraft.toIntOrNull() ?: 19188)
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = Accent, contentColor = Color(0xFF04222A)),
                    modifier = Modifier.weight(1f),
                ) {
                    Text("Connect")
                }
                OutlinedButton(
                    onClick = onDiscoverServer,
                    modifier = Modifier.weight(1f),
                ) {
                    Text("Scan Wi-Fi")
                }
            }
        }

        SectionCard {
            Text("Phone Local Surveillance Server (:8090)", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            MutedText("Serves the browser console, recorded .wav clips, live /audio.wav monitor stream, and /api/stream SSE on your local Wi-Fi.")

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(
                    value = localPortDraft,
                    onValueChange = { localPortDraft = it.filter(Char::isDigit) },
                    label = { Text("HTTP Port") },
                    singleLine = true,
                    modifier = Modifier.weight(1f),
                )
                OutlinedButton(
                    onClick = {
                        val p = localPortDraft.toIntOrNull() ?: 8090
                        onUpdateConfig { it.copy(port = p) }
                    },
                ) {
                    Text("Apply")
                }
            }

            status.baseUrl?.let { url ->
                EndpointCopyRow("Browser Console", url) { onCopyUrl("Console URL", url) }
            }
            status.audioStreamUrl?.let { url ->
                EndpointCopyRow("Live Microphone WAV", url) { onCopyUrl("Audio WAV URL", url) }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text("HTTP Basic Authentication")
                    MutedText(if (hasPassword) "Encrypted in Android Keystore" else "Set a password below to restrict LAN access")
                }
                Switch(
                    checked = config.authEnabled,
                    onCheckedChange = { v -> onUpdateConfig { it.copy(authEnabled = v) } },
                )
            }

            if (config.authEnabled) {
                OutlinedTextField(
                    value = usernameDraft,
                    onValueChange = {
                        usernameDraft = it
                        onUpdateConfig { cfg -> cfg.copy(username = it) }
                    },
                    label = { Text("Username") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(
                        value = passwordDraft,
                        onValueChange = { passwordDraft = it },
                        label = { Text("New Password") },
                        visualTransformation = PasswordVisualTransformation(),
                        singleLine = true,
                        modifier = Modifier.weight(1f),
                    )
                    OutlinedButton(
                        onClick = {
                            if (passwordDraft.isNotEmpty()) {
                                onSetPassword(passwordDraft)
                                passwordDraft = ""
                            }
                        },
                    ) {
                        Text("Save")
                    }
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Start Automatically on Phone Boot")
                Switch(
                    checked = config.autoStartOnBoot,
                    onCheckedChange = { v -> onUpdateConfig { it.copy(autoStartOnBoot = v) } },
                )
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Keep Screen Awake While Open")
                Switch(
                    checked = config.keepScreenAwake,
                    onCheckedChange = { v -> onUpdateConfig { it.copy(keepScreenAwake = v) } },
                )
            }
        }
    }
}

@Composable
fun OledBlackoutScreen(
    config: AssistantConfig,
    status: AssistantRuntimeStatus,
    onExit: () -> Unit,
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black)
            .pointerInput(Unit) {
                detectTapGestures(onDoubleTap = { onExit() })
            }
            .padding(24.dp),
        contentAlignment = Alignment.BottomStart,
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(
                text = "● ${config.assistantName} · ${status.listeningState.label}",
                color = Color(0xFF2B3440),
                style = MaterialTheme.typography.bodySmall,
            )
            Text(
                text = if (status.actionsArmed) {
                    "RobOS Server Connected · Double-tap screen to wake"
                } else {
                    "Recorder Only (Audio + Text) · Double-tap screen to wake"
                },
                color = Color(0xFF222A33),
                style = MaterialTheme.typography.labelSmall,
            )
        }
    }
}
