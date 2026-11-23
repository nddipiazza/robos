package com.robos.smarthome.ui

import android.content.Intent
import android.graphics.BitmapFactory
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.robos.smarthome.core.CameraPowerState
import com.robos.smarthome.core.HomeState
import com.robos.smarthome.core.SmartCamera
import com.robos.smarthome.core.UNASSIGNED_ROOM_ID
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun CamerasScreen(
    vm: HomeViewModel,
    home: HomeState,
    cameras: List<SmartCamera>,
    scanningCameras: Boolean,
    padding: PaddingValues,
) {
    val context = LocalContext.current
    var adding by rememberSaveable { mutableStateOf(false) }
    var focused by remember { mutableStateOf<SmartCamera?>(null) }

    val ipCameraLaunchIntent = remember(context) {
        context.packageManager.getLaunchIntentForPackage("com.robos.ipcamera")
    }
    val roomNames = remember(home.rooms) { home.rooms.associate { it.id to it.name } }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(padding)
            .testTag("screen:cameras"),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Button(
                    onClick = vm::scanCameras,
                    enabled = !scanningCameras,
                    modifier = Modifier.testTag("scan-cameras"),
                ) {
                    Text(if (scanningCameras) "Scanning Wi-Fi…" else "Find cameras")
                }
                OutlinedButton(
                    onClick = { adding = true },
                    modifier = Modifier.testTag("add-camera"),
                ) {
                    Text("Add by IP")
                }
                if (ipCameraLaunchIntent != null) {
                    OutlinedButton(
                        onClick = { context.startActivity(ipCameraLaunchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) },
                        modifier = Modifier.testTag("open-ip-camera"),
                    ) {
                        Text("IP Camera App")
                    }
                }
            }
        }

        if (cameras.isEmpty()) {
            item {
                SectionCard {
                    Text("No surveillance cameras yet", style = MaterialTheme.typography.titleMedium)
                    MutedText("Start RobOS IP Camera on a spare Android phone (or turn on ONVIF on a network camera), then tap Find cameras to add it to your Smart Home.")
                }
            }
        } else {
            items(cameras, key = { it.id }) { cam ->
                CameraTileCard(
                    vm = vm,
                    camera = cam,
                    roomLabel = roomNames[cam.roomId] ?: "No room yet",
                    fastRefresh = false,
                    onFocus = { focused = cam },
                    onRemove = { vm.removeCamera(cam) },
                )
            }
        }
    }

    if (adding) {
        AddCameraDialog(
            home = home,
            onDismiss = { adding = false },
            onSave = { name, roomId, address ->
                vm.saveCamera(null, name, roomId, address)
                adding = false
            },
        )
    }

    focused?.let { cam ->
        FullscreenCameraDialog(
            vm = vm,
            camera = cam,
            onDismiss = { focused = null },
        )
    }
}

@Composable
private fun FullscreenCameraDialog(
    vm: HomeViewModel,
    camera: SmartCamera,
    onDismiss: () -> Unit,
) {
    var frame by remember(camera.id) { mutableStateOf<ImageBitmap?>(null) }
    var online by remember(camera.id) { mutableStateOf<Boolean?>(null) }
    var power by remember(camera.id) { mutableStateOf<CameraPowerState?>(null) }

    LaunchedEffect(camera.id, camera.isRobosIpCamera) {
        if (!camera.isRobosIpCamera) return@LaunchedEffect
        while (isActive) {
            power = vm.fetchCameraPower(camera)
            delay(3500L)
        }
    }

    LaunchedEffect(camera.snapshotUrl) {
        while (isActive) {
            val bytes = vm.fetchCameraFrame(camera)
            if (bytes != null && bytes.isNotEmpty()) {
                val bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                if (bmp != null) {
                    frame = bmp.asImageBitmap()
                    online = true
                } else {
                    online = false
                }
            } else {
                online = false
            }
            delay(200L)
        }
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(
            usePlatformDefaultWidth = false,
            decorFitsSystemWindows = false,
        ),
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black)
                .pointerInput(Unit) {
                    detectTapGestures(onDoubleTap = { onDismiss() })
                }
                .testTag("fullscreen-camera"),
            contentAlignment = Alignment.Center,
        ) {
            val currentFrame = frame
            if (currentFrame != null) {
                Image(
                    bitmap = currentFrame,
                    contentDescription = camera.name,
                    contentScale = ContentScale.Fit,
                    modifier = Modifier.fillMaxSize(),
                )
            } else {
                MutedText(if (online == false) "Camera offline" else "Connecting to ${camera.name}…")
            }

            Row(
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .padding(14.dp)
                    .clip(RoundedCornerShape(999.dp))
                    .background(Color(0xCC0D1117))
                    .border(1.dp, Border, RoundedCornerShape(999.dp))
                    .padding(horizontal = 12.dp, vertical = 6.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                ColorDot(if (online == true) Success else Muted, size = 9)
                val batt = if (power?.isOnBattery == true) " · 🔋 ${power?.batteryPercent}% Battery" else ""
                Text("${camera.name}$batt", color = TextColor, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
            }

            YoutubeFullscreenIcon(
                isFullscreen = true,
                onClick = onDismiss,
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(14.dp)
                    .testTag("exit-fullscreen-camera"),
            )
        }
    }
}

@Composable
private fun YoutubeFullscreenIcon(
    isFullscreen: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        contentAlignment = Alignment.Center,
        modifier = modifier
            .size(38.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(Color(0xC80D1117))
            .border(1.dp, Color(0x88FFFFFF), RoundedCornerShape(8.dp))
            .clickable(onClick = onClick),
    ) {
        Canvas(modifier = Modifier.size(20.dp)) {
            val s = size.minDimension
            val p = s * 0.12f
            val arm = s * 0.26f
            val stroke = Stroke(width = 2.2.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
            val path = Path().apply {
                if (!isFullscreen) {
                    moveTo(p, p + arm); lineTo(p, p); lineTo(p + arm, p)
                    moveTo(s - p - arm, p); lineTo(s - p, p); lineTo(s - p, p + arm)
                    moveTo(p, s - p - arm); lineTo(p, s - p); lineTo(p + arm, s - p)
                    moveTo(s - p - arm, s - p); lineTo(s - p, s - p); lineTo(s - p, s - p - arm)
                } else {
                    moveTo(p, p + arm); lineTo(p + arm, p + arm); lineTo(p + arm, p)
                    moveTo(s - p - arm, p); lineTo(s - p - arm, p + arm); lineTo(s - p, p + arm)
                    moveTo(p, s - p - arm); lineTo(p + arm, s - p - arm); lineTo(p + arm, s - p)
                    moveTo(s - p - arm, s - p); lineTo(s - p - arm, s - p - arm); lineTo(s - p, s - p - arm)
                }
            }
            drawPath(path = path, color = Color.White, style = stroke)
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun CameraTileCard(
    vm: HomeViewModel,
    camera: SmartCamera,
    roomLabel: String,
    fastRefresh: Boolean,
    onFocus: (() -> Unit)?,
    onRemove: (() -> Unit)?,
) {
    var frame by remember(camera.id) { mutableStateOf<ImageBitmap?>(null) }
    var online by remember(camera.id) { mutableStateOf<Boolean?>(null) }
    var power by remember(camera.id) { mutableStateOf<CameraPowerState?>(null) }

    LaunchedEffect(camera.id, camera.isRobosIpCamera) {
        if (!camera.isRobosIpCamera) return@LaunchedEffect
        while (isActive) {
            power = vm.fetchCameraPower(camera)
            delay(4000L)
        }
    }

    LaunchedEffect(camera.snapshotUrl, fastRefresh) {
        val intervalMs = if (fastRefresh) 350L else 1200L
        while (isActive) {
            val bytes = vm.fetchCameraFrame(camera)
            if (bytes != null && bytes.isNotEmpty()) {
                val bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                if (bmp != null) {
                    frame = bmp.asImageBitmap()
                    online = true
                } else {
                    online = false
                }
            } else {
                online = false
            }
            delay(intervalMs)
        }
    }

    SectionCard(Modifier.testTag("camera:${camera.name}")) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            ColorDot(
                when (online) {
                    true -> Success
                    false -> Danger
                    null -> Muted
                },
                size = 10,
            )
            Column(Modifier.weight(1f)) {
                Text(camera.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                MutedText("$roomLabel · ${camera.host}:${camera.port}")
            }
            if (onFocus != null) {
                TextButton(onClick = onFocus) { Text("Expand") }
            }
        }

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(200.dp)
                .clip(RoundedCornerShape(10.dp))
                .background(Color(0xFF05070A))
                .border(1.dp, Border, RoundedCornerShape(10.dp))
                .let {
                    if (onFocus != null) {
                        it.pointerInput(camera.id) {
                            detectTapGestures(onDoubleTap = { onFocus() })
                        }
                    } else {
                        it
                    }
                },
            contentAlignment = Alignment.Center,
        ) {
            val currentFrame = frame
            if (currentFrame != null) {
                Image(
                    bitmap = currentFrame,
                    contentDescription = camera.name,
                    contentScale = ContentScale.Fit,
                    modifier = Modifier.fillMaxSize(),
                )
            } else {
                MutedText(if (online == false) "Camera offline (${camera.host}:${camera.port})" else "Connecting to camera…")
            }

            if (online == true && power?.isOnBattery == true) {
                val pct = power?.batteryPercent ?: 0
                val low = pct <= 20
                Box(
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .padding(8.dp)
                        .clip(RoundedCornerShape(999.dp))
                        .background(if (low) Color(0xDD7F1D1D) else Color(0xDD451A03))
                        .border(1.dp, if (low) Danger else Color(0xFFF59E0B), RoundedCornerShape(999.dp))
                        .padding(horizontal = 8.dp, vertical = 3.dp),
                ) {
                    Text(
                        "${if (low) "🪫 Low Battery" else "🔋 On Battery"} · $pct%",
                        color = if (low) Color(0xFFFCA5A5) else Color(0xFFFCD34D),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                    )
                }
            }

            if (online == true) {
                Box(
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(8.dp)
                        .clip(RoundedCornerShape(999.dp))
                        .background(Color(0xCC0D1117))
                        .padding(horizontal = 8.dp, vertical = 3.dp),
                ) {
                    Text("LIVE", color = Success, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                }
            }

            if (onFocus != null) {
                YoutubeFullscreenIcon(
                    isFullscreen = false,
                    onClick = onFocus,
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        .padding(8.dp)
                        .testTag("fullscreen-btn:${camera.name}"),
                )
            }
        }

        if (camera.isRobosIpCamera) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                OutlinedButton(onClick = { vm.controlCamera(camera, """{"preset":"1"}""", "1x Wide") }) { Text("1x") }
                OutlinedButton(onClick = { vm.controlCamera(camera, """{"preset":"2"}""", "2x Zoom") }) { Text("2x") }
                OutlinedButton(onClick = { vm.controlCamera(camera, """{"toggleTorch":true}""", "Toggled light") }) { Text("Light") }
                OutlinedButton(onClick = { vm.controlCamera(camera, """{"preset":"4"}""", "Switched lens") }) { Text("Flip") }
                if (onRemove != null) {
                    TextButton(onClick = onRemove) { Text("Remove", color = Danger) }
                }
            }
        } else if (onRemove != null) {
            Row {
                TextButton(onClick = onRemove) { Text("Remove", color = Danger) }
            }
        }
    }
}

@Composable
private fun AddCameraDialog(
    home: HomeState,
    onDismiss: () -> Unit,
    onSave: (name: String, roomId: String, address: String) -> Unit,
) {
    var name by rememberSaveable { mutableStateOf("") }
    var roomId by rememberSaveable { mutableStateOf(home.rooms.firstOrNull()?.id ?: UNASSIGNED_ROOM_ID) }
    var address by rememberSaveable { mutableStateOf("") }
    val roomOptions = home.rooms.map { it.id to it.name }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add IP camera") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Camera name (e.g. Front Door)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Choice("Room", roomOptions, roomId, { roomId = it }, tag = "camera-room")
                OutlinedTextField(
                    value = address,
                    onValueChange = { address = it },
                    label = { Text("IP:port or snapshot URL (e.g. 192.168.1.65:8080)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        },
        confirmButton = {
            Button(
                enabled = address.isNotBlank(),
                onClick = { onSave(name.ifBlank { "IP Camera" }, roomId, address) },
            ) {
                Text("Add")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        },
    )
}
