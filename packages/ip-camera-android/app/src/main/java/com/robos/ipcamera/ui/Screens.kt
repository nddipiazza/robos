package com.robos.ipcamera.ui

import android.annotation.SuppressLint
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.robos.ipcamera.core.CameraRuntimeStatus
import com.robos.ipcamera.core.DEFAULT_ROOMS
import com.robos.ipcamera.core.IpCameraConfig
import com.robos.ipcamera.core.LensFacing
import com.robos.ipcamera.core.ResolutionPreset
import com.robos.ipcamera.core.RotationMode
import com.robos.ipcamera.core.StreamState
import kotlinx.coroutines.delay
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import kotlin.math.roundToInt

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun LiveScreen(
    vm: CameraViewModel,
    config: IpCameraConfig,
    status: CameraRuntimeStatus,
    preview: ImageBitmap?,
    padding: PaddingValues,
    onRequestPermission: () -> Unit,
    onEnterBlackout: () -> Unit,
) {
    val context = LocalContext.current
    val shareState by vm.shareState.collectAsState()

    if (shareState.open) {
        RobosUserShareDialog(vm = vm, shareState = shareState, context = context)
    }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(padding)
            .testTag("screen:live"),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (!vm.hasCameraPermission()) {
            item {
                SectionCard {
                    Text("Camera permission needed", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    MutedText("RobOS IP Camera needs access to the camera so it can stream live video to Camera Watch and Smart Home.")
                    Button(onClick = onRequestPermission, modifier = Modifier.testTag("grant-camera")) {
                        Text("Allow camera access")
                    }
                }
            }
        }

        // 1. Live viewfinder & quick lens/zoom/torch controls
        item {
            SectionCard {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    val dotColor = when (status.streamState) {
                        StreamState.LIVE -> Success
                        StreamState.STARTING, StreamState.RECONNECTING -> Warning
                        StreamState.ERROR, StreamState.PERMISSION_NEEDED -> Danger
                        StreamState.STOPPED -> Muted
                    }
                    StatusDot(dotColor, 10)
                    Column(Modifier.weight(1f)) {
                        Text(config.cameraName, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                        MutedText("${config.room} · ${status.streamState.label}")
                    }
                    Switch(
                        checked = config.enabled,
                        onCheckedChange = vm::setEnabled,
                        modifier = Modifier.testTag("switch-enabled"),
                    )
                }

                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(220.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .background(Color(0xFF05070A))
                        .border(1.dp, Border, RoundedCornerShape(10.dp)),
                    contentAlignment = Alignment.Center,
                ) {
                    if (preview != null && config.enabled) {
                        Image(
                            bitmap = preview,
                            contentDescription = "Live surveillance preview",
                            contentScale = ContentScale.Fit,
                            modifier = Modifier.fillMaxSize(),
                        )
                    } else {
                        MutedText(
                            if (!config.enabled) "Stream paused" else status.streamState.label,
                        )
                    }

                    // Top-right telemetry pill
                    Row(
                        modifier = Modifier
                            .align(Alignment.TopEnd)
                            .padding(8.dp)
                            .clip(RoundedCornerShape(999.dp))
                            .background(Color(0xCC0D1117))
                            .padding(horizontal = 10.dp, vertical = 4.dp),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            "${status.width}×${status.height} · ${"%.1f".format(status.measuredFps)} fps · ${status.activeViewers} watching",
                            color = TextColor,
                            fontSize = 11.sp,
                        )
                    }

                    if (status.batteryPercent in 0..100 && !status.charging) {
                        val isLow = status.batteryPercent <= 20
                        Row(
                            modifier = Modifier
                                .align(Alignment.TopStart)
                                .padding(8.dp)
                                .clip(RoundedCornerShape(999.dp))
                                .background(if (isLow) Color(0xDD7F1D1D) else Color(0xDD451A03))
                                .border(1.dp, if (isLow) Danger else Warning, RoundedCornerShape(999.dp))
                                .padding(horizontal = 10.dp, vertical = 4.dp),
                        ) {
                            Text(
                                "${if (isLow) "🪫 Low Battery" else "🔋 On Battery"} · ${status.batteryPercent}%",
                                color = if (isLow) Color(0xFFFCA5A5) else Color(0xFFFCD34D),
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                            )
                        }
                    }

                    if (status.motionActive) {
                        Row(
                            modifier = Modifier
                                .align(Alignment.BottomStart)
                                .padding(8.dp)
                                .clip(RoundedCornerShape(999.dp))
                                .background(Color(0xDDEF4444))
                                .padding(horizontal = 10.dp, vertical = 4.dp),
                        ) {
                            Text("MOTION (${status.motionScore}%)", color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }

                if (status.errorMessage.isNotBlank()) {
                    ErrorText(status.errorMessage)
                }

                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    OutlinedButton(onClick = vm::flipLens, modifier = Modifier.testTag("flip-lens")) {
                        Text(if (config.lensFacing == LensFacing.BACK) "Switch to Front" else "Switch to Back")
                    }
                    listOf(1.0f to "1x", 2.0f to "2x", 4.0f to "4x").forEach { (z, label) ->
                        FilterChip(
                            selected = kotlin.math.abs(config.zoomRatio - z) < 0.2f,
                            onClick = { vm.setZoom(z) },
                            label = { Text(label) },
                        )
                    }
                    if (config.lensFacing == LensFacing.BACK) {
                        FilterChip(
                            selected = config.torchEnabled,
                            onClick = vm::toggleTorch,
                            label = { Text(if (config.torchEnabled) "Light On" else "Flashlight") },
                        )
                    }
                }

                Button(
                    onClick = vm::openShareDialog,
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("share-robos-user"),
                ) {
                    Text("Share with RobOS User (Google Drive Doc)", fontWeight = FontWeight.Bold)
                }
            }
        }

        // 2. Network addresses & ONVIF auto-discovery card
        item {
            SectionCard {
                Text("Connect in Smart Home & Camera Watch", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                if (!status.wifiConnected || status.wifiIp.isBlank()) {
                    ErrorText("Connect this phone to your home Wi-Fi so RobOS Camera Watch and Smart Home can reach it.")
                } else {
                    MutedText(
                        if (config.onvifDiscoveryEnabled) {
                            "ONVIF auto-discovery is active on Wi-Fi. Click 'Find cameras' in RobOS Camera Watch or 'Scan' in Smart Home -> Cameras."
                        } else {
                            "Enter one of the addresses below in Camera Watch or Smart Home."
                        },
                    )
                    EndpointRow("Live MJPEG stream", status.streamUrl.orEmpty(), context, vm)
                    EndpointRow("ONVIF service", "${status.wifiIp}:${status.port}  (/onvif/device_service)", context, vm, copyValue = status.onvifUrl.orEmpty())
                    EndpointRow("Snapshot JPEG", status.snapshotUrl.orEmpty(), context, vm)
                    EndpointRow("Browser live view", status.baseUrl.orEmpty(), context, vm)
                }
            }
        }

        // 3. Always-On 24/7 Surveillance & Power Card
        item {
            SectionCard {
                Text("Always-on surveillance status", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    KpiStat("Uptime", formatUptime(status.uptimeSeconds))
                    KpiStat("Frames", status.framesServed.toString())
                    KpiStat(
                        "Power",
                        if (status.batteryPercent >= 0) {
                            "${status.batteryPercent}%${if (status.charging) " AC" else ""}"
                        } else {
                            "—"
                        },
                    )
                    KpiStat("Temp", if (status.temperatureC > 0f) "${"%.1f".format(status.temperatureC)}°C" else "—")
                }

                if (status.batteryPercent in 0..100 && !status.charging) {
                    Text(
                        "Running on battery. Keep the phone plugged into wall power for continuous 24/7 operation.",
                        color = Warning,
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }

                if (!status.batteryUnrestricted) {
                    MutedText("Allow unrestricted background battery use so Android never throttles the camera stream overnight.")
                    OutlinedButton(
                        onClick = { requestIgnoreBatteryOptimizations(context) },
                        modifier = Modifier.testTag("allow-unrestricted-battery"),
                    ) {
                        Text("Allow unrestricted battery")
                    }
                } else {
                    MutedText("Unrestricted background power enabled · CPU & low-latency Wi-Fi locks active.")
                }

                MutedText("Tip: Press the phone's Power button to turn the display completely off — the camera keeps streaming in the background. Or use OLED Blackout to keep a dark status screen.")
                OutlinedButton(onClick = onEnterBlackout, modifier = Modifier.testTag("enter-blackout")) {
                    Text("OLED Blackout Screen")
                }
            }
        }
    }
}

@Composable
private fun RobosUserShareDialog(
    vm: CameraViewModel,
    shareState: RobosShareUiState,
    context: Context,
) {
    var customEmail by rememberSaveable { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = vm::closeShareDialog,
        containerColor = CardColor,
        titleContentColor = TextColor,
        textContentColor = TextColor,
        title = {
            Text("Share with RobOS User", fontWeight = FontWeight.Bold)
        },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = 460.dp)
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                MutedText("Shares your private Google Drive Camera Doc (protected by Google Login + Cloudflare HTTPS) with the chosen RobOS user's Google account.")

                if (shareState.docUrl.isNotBlank()) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(10.dp))
                            .background(Elevated)
                            .padding(horizontal = 10.dp, vertical = 8.dp),
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text("Google Drive Doc", color = Muted, fontSize = 11.sp)
                            Text(
                                shareState.docTitle.ifBlank { "RobOS Live Camera Doc" },
                                color = Accent,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.SemiBold,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                        TextButton(
                            onClick = {
                                val cm = context.getSystemService(ClipboardManager::class.java)
                                cm.setPrimaryClip(ClipData.newPlainText("Camera Google Doc", shareState.docUrl))
                                vm.notifyMessage("Copied Google Doc link")
                            },
                        ) {
                            Text("Copy")
                        }
                        TextButton(
                            onClick = {
                                try {
                                    context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(shareState.docUrl)))
                                } catch (_: Exception) {
                                }
                            },
                        ) {
                            Text("Open")
                        }
                    }
                }

                if (shareState.statusMessage.isNotBlank()) {
                    Text(
                        shareState.statusMessage,
                        color = Success,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                }

                if (shareState.errorMessage.isNotBlank()) {
                    ErrorText(shareState.errorMessage)
                }

                if (shareState.loading) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                        modifier = Modifier.padding(vertical = 8.dp),
                    ) {
                        CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp, color = Accent)
                        MutedText("Finding RobOS users…")
                    }
                } else {
                    shareState.users.forEach { user ->
                        val isBusy = shareState.busyKey == user.uid && user.uid.isNotBlank()
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(10.dp))
                                .background(Background)
                                .border(1.dp, Border, RoundedCornerShape(10.dp))
                                .padding(horizontal = 10.dp, vertical = 8.dp),
                        ) {
                            Box(
                                contentAlignment = Alignment.Center,
                                modifier = Modifier
                                    .size(34.dp)
                                    .clip(CircleShape)
                                    .background(Elevated),
                            ) {
                                Text(user.avatar.ifBlank { "👤" }, fontSize = 16.sp)
                            }
                            Column(Modifier.weight(1f)) {
                                Text(
                                    user.name,
                                    color = TextColor,
                                    fontWeight = FontWeight.SemiBold,
                                    fontSize = 14.sp,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                                val sub = buildString {
                                    if (user.groups.isNotEmpty()) {
                                        append(user.groups.take(2).joinToString(" · "))
                                        if (user.email.isNotBlank()) append(" · ")
                                    }
                                    append(user.email)
                                }
                                if (sub.isNotBlank()) {
                                    Text(
                                        sub,
                                        color = Muted,
                                        fontSize = 11.sp,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                }
                            }
                            when {
                                user.isOwner -> {
                                    Text("Owner", color = Accent, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                }
                                user.shared -> {
                                    Column(horizontalAlignment = Alignment.End) {
                                        Text("Shared ✓", color = Success, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                        TextButton(
                                            enabled = !isBusy,
                                            onClick = { vm.revokeRobosUser(user.uid, user.permissionId) },
                                        ) {
                                            Text(if (isBusy) "…" else "Revoke", color = Danger, fontSize = 12.sp)
                                        }
                                    }
                                }
                                user.canShare -> {
                                    Button(
                                        enabled = !isBusy,
                                        onClick = { vm.shareWithRobosUser(uid = user.uid) },
                                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                                    ) {
                                        Text(if (isBusy) "Sharing…" else "Share", fontSize = 12.sp)
                                    }
                                }
                            }
                        }
                    }
                }

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    OutlinedTextField(
                        value = customEmail,
                        onValueChange = { customEmail = it },
                        label = { Text("Or another Google email") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                        singleLine = true,
                        modifier = Modifier.weight(1f),
                    )
                    OutlinedButton(
                        enabled = customEmail.contains("@") && shareState.busyKey.isBlank(),
                        onClick = {
                            val target = customEmail.trim()
                            customEmail = ""
                            vm.shareWithRobosUser(email = target)
                        },
                    ) {
                        Text("Share")
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = vm::closeShareDialog) {
                Text("Done")
            }
        },
    )
}

@Composable
private fun EndpointRow(
    label: String,
    display: String,
    context: Context,
    vm: CameraViewModel,
    copyValue: String = display,
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(Elevated)
            .padding(horizontal = 12.dp, vertical = 8.dp),
    ) {
        Column(Modifier.weight(1f)) {
            Text(label, color = Muted, fontSize = 11.sp)
            Text(display, color = Accent, fontSize = 13.sp, fontFamily = FontFamily.Monospace)
        }
        TextButton(
            onClick = {
                val cm = context.getSystemService(ClipboardManager::class.java)
                cm.setPrimaryClip(ClipData.newPlainText(label, copyValue))
                vm.notifyMessage("Copied $label")
            },
        ) {
            Text("Copy")
        }
    }
}

@Composable
private fun KpiStat(label: String, value: String) {
    Column {
        Text(label, color = Muted, fontSize = 11.sp)
        Text(value, color = TextColor, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
    }
}

@SuppressLint("BatteryLife")
private fun requestIgnoreBatteryOptimizations(context: Context) {
    try {
        val intent = Intent(
            Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
            Uri.parse("package:${context.packageName}"),
        )
        context.startActivity(intent)
    } catch (_: Exception) {
        try {
            context.startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
        } catch (_: Exception) {
        }
    }
}

// ── Tab 2: Camera & Motion Settings ──────────────────────────────────────────

@Composable
fun CameraSettingsScreen(
    vm: CameraViewModel,
    config: IpCameraConfig,
    status: CameraRuntimeStatus,
    padding: PaddingValues,
) {
    var name by rememberSaveable(config.cameraName) { mutableStateOf(config.cameraName) }
    var room by rememberSaveable(config.room) { mutableStateOf(config.room) }
    var qualitySlider by remember(config.jpegQuality) { mutableFloatStateOf(config.jpegQuality.toFloat()) }
    var sensitivitySlider by remember(config.motionSensitivity) { mutableFloatStateOf(config.motionSensitivity.toFloat()) }

    val roomOptions = remember(room) {
        (listOf(room) + DEFAULT_ROOMS).distinct().map { it to it }
    }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(padding)
            .testTag("screen:camera"),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            SectionCard {
                Text("Camera identity", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Camera name (shown in Camera Watch & Smart Home)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Choice(
                    label = "Smart Home room",
                    options = roomOptions,
                    selected = room,
                    onSelect = { room = it },
                    tag = "room",
                )
                Button(
                    onClick = { vm.saveIdentity(name, room) },
                    enabled = name.isNotBlank() && (name != config.cameraName || room != config.room),
                ) {
                    Text("Save name & room")
                }
            }
        }

        item {
            SectionCard {
                Text("Picture & stream", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                Choice(
                    label = "Camera lens",
                    options = LensFacing.entries.map { it to it.label },
                    selected = config.lensFacing,
                    onSelect = vm::setLens,
                    tag = "lens",
                )
                Choice(
                    label = "Resolution",
                    options = ResolutionPreset.entries.map { it to it.label },
                    selected = config.resolution,
                    onSelect = vm::setResolution,
                    tag = "resolution",
                )
                Choice(
                    label = "Frame rate",
                    options = listOf(5, 10, 15, 24, 30).map { it to "$it fps${if (it == 10) " (recommended 24/7)" else ""}" },
                    selected = config.fps,
                    onSelect = vm::setFps,
                    tag = "fps",
                )
                Choice(
                    label = "Mounting orientation",
                    options = RotationMode.entries.map { it to it.label },
                    selected = config.rotationMode,
                    onSelect = vm::setRotationMode,
                    tag = "rotation",
                )
                Column {
                    MutedText("JPEG quality: ${qualitySlider.roundToInt()}%")
                    Slider(
                        value = qualitySlider,
                        onValueChange = { qualitySlider = it },
                        onValueChangeFinished = { vm.setJpegQuality(qualitySlider.roundToInt()) },
                        valueRange = 50f..95f,
                    )
                }
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(Modifier.weight(1f)) {
                        Text("Timestamp watermark")
                        MutedText("Burn camera name and clock into top-left of video")
                    }
                    Switch(checked = config.overlayTimestamp, onCheckedChange = vm::setOverlayTimestamp)
                }
            }
        }

        item {
            SectionCard {
                Text("On-camera motion detection", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(Modifier.weight(1f)) {
                        Text("Detect motion & send ONVIF alarms")
                        MutedText("Events since start: ${status.motionEventCount} · Current change: ${status.motionScore}%")
                    }
                    Switch(checked = config.motionEnabled, onCheckedChange = vm::setMotionEnabled)
                }
                LinearProgressIndicator(
                    progress = { (status.motionScore / 20f).coerceIn(0f, 1f) },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(6.dp)
                        .clip(RoundedCornerShape(3.dp)),
                    color = if (status.motionActive) Danger else Accent,
                    trackColor = Elevated,
                )
                if (config.motionEnabled) {
                    Column {
                        MutedText("Sensitivity: ${sensitivitySlider.roundToInt()}")
                        Slider(
                            value = sensitivitySlider,
                            onValueChange = { sensitivitySlider = it },
                            onValueChangeFinished = { vm.setMotionSensitivity(sensitivitySlider.roundToInt()) },
                            valueRange = 10f..95f,
                        )
                    }
                }
            }
        }
    }
}

// ── Tab 3: Network, Security & Power ─────────────────────────────────────────

@Composable
fun NetworkScreen(
    vm: CameraViewModel,
    config: IpCameraConfig,
    status: CameraRuntimeStatus,
    padding: PaddingValues,
) {
    var portText by rememberSaveable(config.port) { mutableStateOf(config.port.toString()) }
    var authEnabled by rememberSaveable(config.authEnabled) { mutableStateOf(config.authEnabled) }
    var username by rememberSaveable(config.username) { mutableStateOf(config.username) }
    var password by rememberSaveable { mutableStateOf("") }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(padding)
            .testTag("screen:network"),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            SectionCard {
                Text("Network & ONVIF discovery", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    OutlinedTextField(
                        value = portText,
                        onValueChange = { portText = it.filter(Char::isDigit).take(5) },
                        label = { Text("HTTP / ONVIF port") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        singleLine = true,
                        modifier = Modifier.weight(1f),
                    )
                    Button(
                        onClick = { portText.toIntOrNull()?.let(vm::setPort) },
                        enabled = portText.toIntOrNull() != null && portText.toIntOrNull() != config.port,
                    ) {
                        Text("Apply")
                    }
                }

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(Modifier.weight(1f)) {
                        Text("ONVIF WS-Discovery")
                        MutedText("Answers UDP 239.255.255.250:3702 scans (${status.discoveryProbesAnswered} answered)")
                    }
                    Switch(checked = config.onvifDiscoveryEnabled, onCheckedChange = vm::setOnvifDiscovery)
                }
            }
        }

        item {
            SectionCard {
                Text("Access control", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                MutedText("Leave off for friction-free LAN discovery on a trusted home Wi-Fi, or require a login for ONVIF and video streams. Passwords are encrypted with the Android Keystore.")
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Require username & password")
                    Switch(checked = authEnabled, onCheckedChange = { authEnabled = it })
                }
                if (authEnabled) {
                    OutlinedTextField(
                        value = username,
                        onValueChange = { username = it },
                        label = { Text("User name") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    OutlinedTextField(
                        value = password,
                        onValueChange = { password = it },
                        label = { Text(if (vm.hasSavedPassword()) "New password (leave blank to keep saved)" else "Password") },
                        visualTransformation = PasswordVisualTransformation(),
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                Button(
                    onClick = {
                        vm.saveAuthentication(authEnabled, username, password)
                        password = ""
                    },
                ) {
                    Text("Save access settings")
                }
            }
        }

        item {
            SectionCard {
                Text("Power & startup", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(Modifier.weight(1f)) {
                        Text("Start automatically when phone turns on")
                        MutedText("Resumes the IP camera after a power outage or restart")
                    }
                    Switch(checked = config.autoStartOnBoot, onCheckedChange = vm::setAutoStartOnBoot)
                }

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(Modifier.weight(1f)) {
                        Text("Keep screen awake while open")
                        MutedText("Useful when using OLED Blackout wall-mount mode")
                    }
                    Switch(checked = config.keepScreenAwake, onCheckedChange = vm::setKeepScreenAwake)
                }
            }
        }
    }
}

// ── Wall-Mount OLED Blackout Screen Saver ────────────────────────────────────

@Composable
fun BlackoutOverlay(
    config: IpCameraConfig,
    status: CameraRuntimeStatus,
    onExit: () -> Unit,
) {
    var tick by remember { mutableIntStateOf(0) }
    var clock by remember { mutableStateOf(LocalTime.now()) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(15_000L)
            tick = (tick + 1) % 9
            clock = LocalTime.now()
        }
    }
    // Subtle pixel drift prevents OLED burn-in over months of wall-mounted operation.
    val driftX = ((tick % 3) - 1) * 18
    val driftY = ((tick / 3) - 1) * 28

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black)
            .pointerInput(Unit) {
                detectTapGestures(onDoubleTap = { onExit() })
            }
            .testTag("blackout-overlay"),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.offset { IntOffset(driftX, driftY) },
        ) {
            Text(
                clock.format(DateTimeFormatter.ofPattern("HH:mm")),
                color = Color(0xFF2D3640),
                fontSize = 36.sp,
                fontWeight = FontWeight.Light,
            )
            Spacer(Modifier.height(4.dp))
            val battNote = if (status.batteryPercent in 0..100 && !status.charging) " · 🔋 ${status.batteryPercent}% Battery" else ""
            Text(
                "● ${config.cameraName} · ${status.wifiIp.ifBlank { "No Wi-Fi" }}:${status.port} · ${status.activeViewers} watching$battNote",
                color = if (status.batteryPercent in 0..20 && !status.charging) Color(0xFF991B1B) else Color(0xFF1E5560),
                fontSize = 12.sp,
            )
            Spacer(Modifier.height(6.dp))
            Text(
                "Double-tap anywhere to wake screen",
                color = Color(0xFF222830),
                fontSize = 11.sp,
            )
        }
    }
}
