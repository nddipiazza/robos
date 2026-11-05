package com.robos.smarthome.ui

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.robos.smarthome.core.ALL_DAYS
import com.robos.smarthome.core.ALL_ROOMS
import com.robos.smarthome.core.HomeState
import com.robos.smarthome.core.Scene
import com.robos.smarthome.core.Schedule
import com.robos.smarthome.core.THINQ_TOKEN_PAGE
import com.robos.smarthome.core.ThinqDevice
import com.robos.smarthome.core.ThinqOverview
import kotlinx.coroutines.delay
import java.time.Instant
import java.time.LocalTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

private fun roomChoices(home: HomeState) = listOf(ALL_ROOMS to "All rooms") + home.rooms.map { it.id to it.name }

// ── Scenes ───────────────────────────────────────────────────────────────────

@Composable
fun ScenesScreen(vm: HomeViewModel, home: HomeState, padding: PaddingValues) {
    var scope by rememberSaveable { mutableStateOf(ALL_ROOMS) }
    var saving by rememberSaveable { mutableStateOf(false) }
    val daylight = remember { vm.daylightNow() }

    LazyColumn(
        Modifier
            .fillMaxSize()
            .padding(padding),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item { Choice("Apply scenes to", roomChoices(home), scope, { scope = it }, tag = "scene-scope") }
        item {
            SectionCard {
                Text("Match the time of day", style = MaterialTheme.typography.titleMedium)
                MutedText("${daylight.phase}: ${daylight.kelvin}K at ${daylight.brightness}% brightness. This changes the lights that are on.")
                OutlinedButton(onClick = vm::applyDaylight, modifier = Modifier.testTag("apply-daylight")) { Text("Apply to my lights") }
            }
        }
        items(vm.scenes, key = { it.id }) { scene ->
            SceneCard(scene, active = home.activeSceneId == scene.id, vm = vm, scope = scope)
        }
        item {
            OutlinedButton(onClick = { saving = true }, modifier = Modifier.testTag("save-scene")) { Text("Save my lights as a scene") }
        }
    }

    if (saving) {
        var name by rememberSaveable { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { saving = false },
            title = { Text("Save my lights as a scene") },
            text = {
                OutlinedTextField(
                    value = name, onValueChange = { name = it }, label = { Text("Scene name") }, singleLine = true,
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("field-scene-name"),
                )
            },
            confirmButton = {
                Button(
                    enabled = name.isNotBlank(),
                    modifier = Modifier.testTag("confirm-save-scene"),
                    onClick = {
                        vm.saveScene(name.trim(), scope)
                        saving = false
                    },
                ) { Text("Save") }
            },
            dismissButton = { TextButton(onClick = { saving = false }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun SceneCard(scene: Scene, active: Boolean, vm: HomeViewModel, scope: String) {
    SectionCard(Modifier.testTag("scene:${scene.name}")) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            ColorDot(hexColor(scene.preset.colorHex))
            ColorDot(hexColor(scene.preset.stripColorHex ?: scene.preset.colorHex))
            Text(
                scene.name,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = if (active) FontWeight.Bold else FontWeight.Normal,
                modifier = Modifier.weight(1f),
            )
        }
        MutedText(scene.description)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (active) {
                Button(onClick = { vm.applyScene(scene.id, scope) }, modifier = Modifier.testTag("apply:${scene.name}")) { Text("Apply again") }
            } else {
                OutlinedButton(onClick = { vm.applyScene(scene.id, scope) }, modifier = Modifier.testTag("apply:${scene.name}")) { Text("Apply") }
            }
            if (scene.isCustom) TextButton(onClick = { vm.removeScene(scene.id) }) { Text("Delete", color = Danger) }
        }
    }
}

// ── Schedules ────────────────────────────────────────────────────────────────

@Composable
fun SchedulesScreen(vm: HomeViewModel, home: HomeState, padding: PaddingValues) {
    var editing by remember { mutableStateOf<Schedule?>(null) }
    var adding by rememberSaveable { mutableStateOf(false) }
    val sceneNames = vm.scenes.associate { it.id to it.name }

    LazyColumn(
        Modifier
            .fillMaxSize()
            .padding(padding),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (home.schedules.isEmpty()) {
            item {
                SectionCard {
                    Text("No schedules yet", style = MaterialTheme.typography.titleLarge)
                    MutedText("A schedule applies a scene at a set time, even when this app is closed. This phone must be on the same Wi-Fi as the lights at that time.")
                }
            }
        }
        items(home.schedules, key = { it.id }) { schedule ->
            SectionCard(Modifier.testTag("schedule:${schedule.name}")) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("${formatTime(schedule.time)}  ${schedule.name}", style = MaterialTheme.typography.titleMedium)
                        val days = if (schedule.days.size == 7 || schedule.days.isEmpty()) "Every day" else schedule.days.joinToString(" ")
                        val fade = if (schedule.fadeMinutes > 0) ", ${schedule.fadeMinutes} min fade" else ""
                        MutedText("$days, ${sceneNames[schedule.sceneId] ?: "Deleted scene"}$fade")
                    }
                    Switch(
                        checked = schedule.enabled,
                        onCheckedChange = { vm.saveSchedule(schedule.copy(enabled = it)) },
                    )
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { vm.testSchedule(schedule.id) }, modifier = Modifier.testTag("test:${schedule.name}")) { Text("Test now") }
                    TextButton(onClick = { editing = schedule }) { Text("Edit") }
                    TextButton(onClick = { vm.removeSchedule(schedule.id) }) { Text("Delete", color = Danger) }
                }
            }
        }
        item {
            Button(onClick = { adding = true }, modifier = Modifier.testTag("add-schedule")) { Text("Add a schedule") }
        }
    }

    if (adding || editing != null) {
        ScheduleEditor(editing, home, vm) {
            adding = false
            editing = null
        }
    }
}

private fun formatTime(time: String): String = runCatching {
    LocalTime.parse(time.padStart(5, '0')).format(DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT))
}.getOrDefault(time)

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun ScheduleEditor(schedule: Schedule?, home: HomeState, vm: HomeViewModel, onClose: () -> Unit) {
    val startTime = remember { runCatching { LocalTime.parse((schedule?.time ?: "07:00").padStart(5, '0')) }.getOrDefault(LocalTime.of(7, 0)) }
    val timeState = rememberTimePickerState(startTime.hour, startTime.minute)
    var name by rememberSaveable { mutableStateOf(schedule?.name.orEmpty()) }
    var sceneId by rememberSaveable { mutableStateOf(schedule?.sceneId ?: vm.scenes.first().id) }
    var scope by rememberSaveable { mutableStateOf(schedule?.roomScope ?: ALL_ROOMS) }
    var days by remember { mutableStateOf(schedule?.days?.ifEmpty { ALL_DAYS } ?: ALL_DAYS) }
    var fade by remember { mutableFloatStateOf((schedule?.fadeMinutes ?: 0).toFloat()) }

    AlertDialog(
        onDismissRequest = onClose,
        title = { Text(if (schedule == null) "Add a schedule" else "Edit schedule") },
        text = {
            Column(
                Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                OutlinedTextField(
                    value = name, onValueChange = { name = it }, label = { Text("Name") }, singleLine = true,
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("field-schedule-name"),
                )
                TimePicker(state = timeState)
                MutedText("Days")
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    ALL_DAYS.forEach { day ->
                        FilterChip(
                            selected = day in days,
                            onClick = { days = if (day in days) days - day else ALL_DAYS.filter { it in days || it == day } },
                            label = { Text(day) },
                        )
                    }
                }
                Choice("Scene", vm.scenes.map { it.id to it.name }, sceneId, { sceneId = it }, tag = "schedule-scene")
                Choice("Rooms", roomChoices(home), scope, { scope = it }, tag = "schedule-rooms")
                MutedText(if (fade < 1f) "Fade: none" else "Fade: ${fade.toInt()} minutes")
                Slider(value = fade, onValueChange = { fade = it }, valueRange = 0f..60f)
            }
        },
        confirmButton = {
            Button(
                enabled = name.isNotBlank() && days.isNotEmpty(),
                modifier = Modifier.testTag("save-schedule"),
                onClick = {
                    vm.saveSchedule(
                        (schedule ?: Schedule(id = "", name = "", sceneId = sceneId)).copy(
                            name = name.trim(),
                            time = "%02d:%02d".format(timeState.hour, timeState.minute),
                            days = days,
                            sceneId = sceneId,
                            roomScope = scope,
                            fadeMinutes = fade.toInt(),
                            // A changed time should be able to run today.
                            lastAutoRunDate = null,
                        ),
                    )
                    onClose()
                },
            ) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = onClose) { Text("Cancel") } },
    )
}

// ── Appliances ───────────────────────────────────────────────────────────────

private const val APPLIANCE_POLL_MS = 60_000L

@Composable
fun AppliancesScreen(vm: HomeViewModel, overview: ThinqOverview, padding: PaddingValues) {
    // This screen only exists while it is visible, and LG limits how often an account may ask.
    LaunchedEffect(overview.connected) {
        while (overview.connected) {
            vm.refreshAppliances()
            delay(APPLIANCE_POLL_MS)
        }
    }

    Column(
        Modifier
            .fillMaxSize()
            .padding(padding)
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (overview.connected) ConnectedAppliances(vm, overview) else ConnectAppliances(vm)
    }
}

@Composable
private fun ConnectAppliances(vm: HomeViewModel) {
    val context = LocalContext.current
    var token by rememberSaveable { mutableStateOf("") }
    var country by rememberSaveable { mutableStateOf("US") }
    var problem by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }

    SectionCard {
        Text("Connect LG ThinQ", style = MaterialTheme.typography.titleLarge)
        MutedText("See your LG washer, dryer and refrigerator here. Your lights stay on your Wi-Fi, but LG appliances can only be reached through LG's cloud, so this tab sends your token to LG and needs internet. RobOS only reads status; it cannot start or change anything.")
        Text("1. Open LG's token page and sign in with your ThinQ account.")
        OutlinedButton(onClick = {
            try {
                context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(THINQ_TOKEN_PAGE)))
            } catch (_: ActivityNotFoundException) {
                problem = "This phone has no web browser. Create the token on a computer at $THINQ_TOKEN_PAGE."
            }
        }) { Text("Open LG's token page") }
        Text("2. Add a token with the view devices and statuses permission, then copy it.")
        Text("3. Paste it below. It is encrypted and saved only on this phone.")
        OutlinedTextField(
            value = token, onValueChange = { token = it }, label = { Text("Personal access token") }, singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            modifier = Modifier
                .fillMaxWidth()
                .testTag("field-thinq-token"),
        )
        OutlinedTextField(
            value = country, onValueChange = { country = it.take(2).uppercase() }, label = { Text("Country (2 letters)") }, singleLine = true,
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters),
            modifier = Modifier.fillMaxWidth(),
        )
        problem?.let { ErrorText(it) }
        Button(
            enabled = !busy,
            modifier = Modifier.testTag("thinq-connect"),
            onClick = {
                busy = true
                problem = null
                vm.connectAppliances(token, country) { error ->
                    busy = false
                    problem = error
                    if (error == null) token = ""
                }
            },
        ) { Text(if (busy) "Connecting" else "Connect") }
    }
}

@Composable
private fun ConnectedAppliances(vm: HomeViewModel, overview: ThinqOverview) {
    val updated = overview.updatedAtMs?.let {
        Instant.ofEpochMilli(it).atZone(ZoneId.systemDefault()).toLocalTime()
            .format(DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT))
    }
    MutedText(if (updated != null) "Updated $updated from LG ThinQ. Checks every minute while this tab is open." else "Reading your appliances from LG ThinQ.")
    overview.error?.let { ErrorText(it) }
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedButton(onClick = { vm.refreshAppliances(force = true) }) { Text("Refresh") }
        TextButton(onClick = vm::forgetAppliances) { Text("Forget token", color = Danger) }
    }
    if (overview.devices.isEmpty() && updated != null) MutedText("LG found no appliances on this ThinQ account.")
    overview.devices.forEach { ApplianceCard(it) }
}

@Composable
private fun ApplianceCard(device: ThinqDevice) {
    SectionCard(Modifier.testTag("appliance:${device.name}")) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(device.name, style = MaterialTheme.typography.titleMedium)
                MutedText(listOfNotNull(device.typeLabel, device.model).joinToString(", "))
            }
            Text(if (device.reachable) "Online" else "Offline", color = if (device.reachable) Success else Muted)
        }
        device.error?.let { MutedText(it) }
        device.units.forEach { unit ->
            unit.label?.let { Text(it, fontWeight = FontWeight.SemiBold) }
            val alert = unit.status.contains("door open", ignoreCase = true) || unit.status.contains("error", ignoreCase = true)
            Text(unit.status, style = MaterialTheme.typography.titleMedium, color = if (alert) Danger else TextColor)
            unit.facts.forEach { fact ->
                Row(Modifier.fillMaxWidth()) {
                    MutedText(fact.label, Modifier.weight(1f))
                    Text(fact.value)
                }
            }
        }
    }
}
