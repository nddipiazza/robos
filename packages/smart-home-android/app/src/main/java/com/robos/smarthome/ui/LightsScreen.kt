package com.robos.smarthome.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.robos.smarthome.core.ALL_ROOMS
import com.robos.smarthome.core.FORM_FACTORS
import com.robos.smarthome.core.HomeState
import com.robos.smarthome.core.LIGHT_PROTOCOLS
import com.robos.smarthome.core.Light
import com.robos.smarthome.core.LightPatch
import com.robos.smarthome.core.QUICK_COLORS
import com.robos.smarthome.core.Room
import com.robos.smarthome.core.UNASSIGNED_ROOM_ID
import com.robos.smarthome.core.WLED_EFFECTS
import com.robos.smarthome.core.hueToHex
import com.robos.smarthome.core.protocolFor

@Composable
fun LightsScreen(
    vm: HomeViewModel,
    home: HomeState,
    hueBridge: String?,
    scanning: Boolean,
    padding: PaddingValues,
) {
    var selectedRoom by rememberSaveable { mutableStateOf(ALL_ROOMS) }
    var editing by remember { mutableStateOf<Light?>(null) }
    var adding by rememberSaveable { mutableStateOf(false) }
    var pairing by rememberSaveable { mutableStateOf(false) }
    val visible = home.lights.filter { selectedRoom == ALL_ROOMS || it.roomId == selectedRoom }

    LazyColumn(
        Modifier
            .fillMaxSize()
            .padding(padding)
            .testTag("lights-list"),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (hueBridge != null && home.lights.none { it.protocolId == "hue-rest" }) {
            item {
                SectionCard {
                    Text("Hue Bridge found", style = MaterialTheme.typography.titleMedium)
                    MutedText("A bridge answered at $hueBridge. Pair it to add its lights.")
                    Button(onClick = { pairing = true }, modifier = Modifier.testTag("hue-found-pair")) { Text("Pair Hue Bridge") }
                }
            }
        }

        if (home.lights.isEmpty()) {
            item { EmptyLights(scanning, onScan = vm::scan, onAdd = { adding = true }, onPair = { pairing = true }) }
        } else {
            item {
                RoomFilter(home, selectedRoom) { selectedRoom = it }
            }
            item {
                val on = visible.count { it.on }
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    MutedText("$on of ${visible.size} on", Modifier.weight(1f))
                    OutlinedButton(onClick = { vm.setRoom(selectedRoom, LightPatch(on = false)) }, modifier = Modifier.testTag("all-off")) {
                        Text("All off")
                    }
                    Button(onClick = { vm.setRoom(selectedRoom, LightPatch(on = true)) }, modifier = Modifier.testTag("all-on")) {
                        Text("All on")
                    }
                }
            }
            items(visible, key = { it.id }) { light ->
                LightCard(light, home.rooms, vm, onEdit = { editing = light })
            }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { adding = true }, modifier = Modifier.testTag("add-light")) { Text("Add a light") }
                    OutlinedButton(onClick = { pairing = true }, modifier = Modifier.testTag("pair-hue")) { Text("Pair Hue Bridge") }
                }
            }
        }
    }

    if (adding || editing != null) {
        LightEditor(
            light = editing,
            rooms = home.rooms,
            vm = vm,
            onClose = {
                adding = false
                editing = null
            },
        )
    }
    if (pairing) {
        HueDialog(hueBridge, vm, onClose = { pairing = false })
    }
}

@Composable
private fun EmptyLights(scanning: Boolean, onScan: () -> Unit, onAdd: () -> Unit, onPair: () -> Unit) {
    SectionCard {
        Text("No lights yet", style = MaterialTheme.typography.titleLarge)
        MutedText("Scan to find lights on this Wi-Fi network. If a light does not appear, add it by its IP address.")
        Button(onClick = onScan, enabled = !scanning, modifier = Modifier
            .fillMaxWidth()
            .testTag("scan-empty")) {
            Text(if (scanning) "Scanning" else "Scan Wi-Fi for lights")
        }
        OutlinedButton(onClick = onPair, modifier = Modifier
            .fillMaxWidth()
            .testTag("pair-hue")) { Text("Pair Hue Bridge") }
        OutlinedButton(onClick = onAdd, modifier = Modifier
            .fillMaxWidth()
            .testTag("add-light")) { Text("Add a light by IP address") }
    }
}

@Composable
private fun RoomFilter(home: HomeState, selected: String, onSelect: (String) -> Unit) {
    val used = home.rooms.filter { room -> home.lights.any { it.roomId == room.id } }
    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        FilterChip(selected = selected == ALL_ROOMS, onClick = { onSelect(ALL_ROOMS) }, label = { Text("All rooms") })
        used.forEach { room ->
            FilterChip(selected = selected == room.id, onClick = { onSelect(room.id) }, label = { Text(room.name) })
        }
    }
}

@Composable
private fun LightCard(light: Light, rooms: List<Room>, vm: HomeViewModel, onEdit: () -> Unit) {
    var expanded by rememberSaveable(light.id) { mutableStateOf(false) }
    val protocol = protocolFor(light.protocolId)
    SectionCard(Modifier.testTag("light:${light.name}")) {
        Row(
            Modifier
                .fillMaxWidth()
                .clickable { expanded = !expanded },
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            ColorDot(if (light.on) hexColor(light.displayHex) else Border, size = 22)
            Column(Modifier.weight(1f)) {
                Text(light.name, style = MaterialTheme.typography.titleMedium)
                val room = rooms.firstOrNull { it.id == light.roomId }?.name ?: "No room yet"
                MutedText("$room, ${protocol.name}")
            }
            Switch(
                checked = light.on,
                onCheckedChange = { vm.setLight(light.id, LightPatch(on = it)) },
                modifier = Modifier
                    .testTag("switch:${light.name}")
                    .semantics { contentDescription = "Turn ${light.name} on or off" },
            )
        }
        light.lastError?.let { ErrorText(it, Modifier.testTag("error:${light.name}")) }

        if (expanded) {
            IntSlider("Brightness", light.brightness, 1..100, "%", Modifier.testTag("brightness:${light.name}")) {
                vm.setLight(light.id, LightPatch(brightness = it, on = true))
            }
            if (protocol.hasKelvin) {
                IntSlider("White temperature", light.kelvin, 2000..6500, "K", step = 100) {
                    vm.setLight(light.id, LightPatch(kelvin = it, colorMode = "kelvin", on = true))
                }
            }
            if (protocol.hasRgb) ColorPicker(light) { vm.setLight(light.id, LightPatch(colorHex = it, colorMode = "rgb", on = true)) }
            if (protocol.hasEffects) {
                Choice(
                    label = "Effect",
                    options = WLED_EFFECTS.map { it.id to it.name },
                    selected = light.effect,
                    onSelect = { vm.setLight(light.id, LightPatch(effect = it, on = true)) },
                )
            }
            TextButton(onClick = onEdit, modifier = Modifier.testTag("edit:${light.name}")) { Text("Edit this light") }
        }
    }
}

@Composable
private fun IntSlider(
    label: String,
    value: Int,
    range: IntRange,
    unit: String,
    modifier: Modifier = Modifier,
    step: Int = 1,
    onDone: (Int) -> Unit,
) {
    // The light is only sent the value where the finger stops, not every value on the way.
    var dragging by remember(value) { mutableFloatStateOf(value.toFloat()) }
    Column(modifier) {
        MutedText("$label: ${(dragging.toInt() / step) * step}$unit")
        Slider(
            value = dragging,
            onValueChange = { dragging = it },
            valueRange = range.first.toFloat()..range.last.toFloat(),
            onValueChangeFinished = { onDone((dragging.toInt() / step) * step) },
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ColorPicker(light: Light, onPick: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        MutedText("Color")
        FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            QUICK_COLORS.forEach { hex ->
                val selected = light.colorMode == "rgb" && light.colorHex.equals(hex, ignoreCase = true)
                Box(
                    Modifier
                        .size(36.dp)
                        .clip(CircleShape)
                        .background(hexColor(hex))
                        .border(BorderStroke(if (selected) 3.dp else 0.dp, Color.White), CircleShape)
                        .clickable { onPick(hex) }
                        .testTag("swatch:$hex")
                        .semantics { contentDescription = "Set color $hex" },
                )
            }
        }
        HueBar(onPick)
    }
}

@Composable
private fun HueBar(onPick: (String) -> Unit) {
    val rainbow = remember { (0..6).map { hexColor(hueToHex(it * 60f)) } }
    var width by remember { mutableFloatStateOf(1f) }
    var lastHue by remember { mutableFloatStateOf(-1f) }
    Box(
        Modifier
            .fillMaxWidth()
            .height(32.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(Brush.horizontalGradient(rainbow))
            .semantics { contentDescription = "Pick any color" }
            .pointerInput(Unit) {
                width = size.width.toFloat()
                detectTapGestures { offset -> onPick(hueToHex(offset.x / width * 360f)) }
            }
            .pointerInput(Unit) {
                detectHorizontalDragGestures(
                    onDragEnd = { if (lastHue >= 0) onPick(hueToHex(lastHue)) },
                ) { change, _ ->
                    lastHue = (change.position.x / size.width.toFloat()).coerceIn(0f, 1f) * 360f
                }
            },
    )
}

@Composable
private fun LightEditor(light: Light?, rooms: List<Room>, vm: HomeViewModel, onClose: () -> Unit) {
    var name by rememberSaveable { mutableStateOf(light?.name.orEmpty()) }
    var roomId by rememberSaveable { mutableStateOf(light?.roomId ?: UNASSIGNED_ROOM_ID) }
    var protocolId by rememberSaveable { mutableStateOf(light?.protocolId ?: LIGHT_PROTOCOLS.first().id) }
    var form by rememberSaveable { mutableStateOf(light?.formFactor ?: "bulb") }
    var ip by rememberSaveable { mutableStateOf(light?.ip.orEmpty()) }
    var port by rememberSaveable { mutableStateOf(light?.port?.toString().orEmpty()) }
    var key by rememberSaveable { mutableStateOf(light?.deviceKey.orEmpty()) }
    var newRoom by rememberSaveable { mutableStateOf<String?>(null) }
    var problem by remember { mutableStateOf<String?>(null) }
    val protocol = protocolFor(protocolId)

    AlertDialog(
        onDismissRequest = onClose,
        title = { Text(if (light == null) "Add a light" else "Edit this light") },
        text = {
            Column(
                Modifier
                    .verticalScroll(rememberScrollState())
                    .testTag("light-editor"),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                OutlinedTextField(
                    value = name, onValueChange = { name = it }, label = { Text("Name") }, singleLine = true,
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("field-name"),
                )
                Choice(
                    "Room",
                    rooms.map { it.id to it.name } + ("new" to "Add a room"),
                    roomId,
                    { if (it == "new") newRoom = "" else roomId = it },
                )
                newRoom?.let { draft ->
                    OutlinedTextField(
                        value = draft, onValueChange = { newRoom = it }, label = { Text("New room name") }, singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    TextButton(
                        enabled = draft.isNotBlank(),
                        onClick = {
                            vm.addRoom(draft.trim()) { roomId = it }
                            newRoom = null
                        },
                    ) { Text("Save room") }
                }
                Choice("Fixture", FORM_FACTORS, form, { form = it })
                Choice(
                    "Brand",
                    LIGHT_PROTOCOLS.map { it.id to it.name },
                    protocolId,
                    {
                        protocolId = it
                        port = ""
                    },
                )
                MutedText(protocol.setupHint)
                OutlinedTextField(
                    value = ip, onValueChange = { ip = it.trim() }, label = { Text("IP address") }, singleLine = true,
                    placeholder = { Text("192.168.1.50") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("field-ip"),
                )
                OutlinedTextField(
                    value = port, onValueChange = { port = it.filter(Char::isDigit) }, singleLine = true,
                    label = { Text("Port (leave blank for ${protocol.defaultPort})") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("field-port"),
                )
                protocol.keyLabel?.let { label ->
                    OutlinedTextField(
                        value = key, onValueChange = { key = it.trim() }, label = { Text(label) }, singleLine = true,
                        modifier = Modifier
                            .fillMaxWidth()
                            .testTag("field-key"),
                    )
                }
                problem?.let { ErrorText(it) }
                if (light != null) {
                    TextButton(
                        onClick = {
                            vm.removeLight(light)
                            onClose()
                        },
                        modifier = Modifier.testTag("remove-light"),
                    ) { Text("Remove this light", color = Danger) }
                }
            }
        },
        confirmButton = {
            Button(
                modifier = Modifier.testTag("save-light"),
                onClick = {
                    when {
                        name.isBlank() -> problem = "Give the light a name."
                        ip.isBlank() -> problem = "Enter the light's IP address."
                        else -> {
                            vm.saveLight(light?.id, name.trim(), roomId, protocolId, form, ip, port.toIntOrNull(), key)
                            onClose()
                        }
                    }
                },
            ) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = onClose) { Text("Cancel") } },
    )
}

@Composable
private fun HueDialog(found: String?, vm: HomeViewModel, onClose: () -> Unit) {
    var host by rememberSaveable { mutableStateOf(found.orEmpty()) }
    var busy by remember { mutableStateOf(false) }
    var problem by remember { mutableStateOf<String?>(null) }
    AlertDialog(
        onDismissRequest = onClose,
        title = { Text("Pair Hue Bridge") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                MutedText("Press the round button on top of the bridge, then tap Pair within 30 seconds. Every light on the bridge will be added.")
                OutlinedTextField(
                    value = host, onValueChange = { host = it.trim() }, label = { Text("Bridge IP address") }, singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("field-hue-host"),
                )
                problem?.let { ErrorText(it, Modifier.testTag("hue-problem")) }
            }
        },
        confirmButton = {
            Button(
                enabled = !busy && host.isNotBlank(),
                modifier = Modifier.testTag("hue-pair"),
                onClick = {
                    busy = true
                    problem = null
                    vm.pairHue(host) { failure ->
                        busy = false
                        if (failure == null) onClose() else problem = failure
                    }
                },
            ) { Text(if (busy) "Pairing" else "Pair") }
        },
        dismissButton = { TextButton(onClick = onClose) { Text("Cancel") } },
    )
}
