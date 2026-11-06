package com.robos.smarthome.core

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.io.File
import java.time.DayOfWeek
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.Locale
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

interface StateStore {
    fun load(): HomeState?
    fun save(state: HomeState)
}

class FileStateStore(private val file: File) : StateStore {
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
        prettyPrint = true
    }

    override fun load(): HomeState? = runCatching {
        if (file.exists()) json.decodeFromString<HomeState>(file.readText()) else null
    }.getOrNull()

    override fun save(state: HomeState) {
        file.parentFile?.mkdirs()
        val temp = File(file.parentFile, "${file.name}.tmp")
        temp.writeText(json.encodeToString(HomeState.serializer(), state))
        temp.renameTo(file)
    }
}

data class HuePairResult(
    val ok: Boolean,
    val message: String,
    val lightCount: Int = 0,
)

data class ScanOutcome(val newLights: Int, val knownLights: Int)

private const val SCHEDULE_GRACE_MINUTES = 5

private val SHORT_DAYS = mapOf(
    DayOfWeek.MONDAY to "Mon",
    DayOfWeek.TUESDAY to "Tue",
    DayOfWeek.WEDNESDAY to "Wed",
    DayOfWeek.THURSDAY to "Thu",
    DayOfWeek.FRIDAY to "Fri",
    DayOfWeek.SATURDAY to "Sat",
    DayOfWeek.SUNDAY to "Sun",
)

/**
 * The phone's copy of the desktop Smart Light Engine: the state of the home and the
 * rules for changing it. It has no Android dependencies so it runs in plain JVM tests.
 */
class LightEngine(
    private val store: StateStore,
    private val transport: LanTransport,
    private val scope: CoroutineScope,
    private val now: () -> ZonedDateTime = { ZonedDateTime.now() },
) {
    private val stateLock = Mutex()
    private val _state = MutableStateFlow(store.load() ?: HomeState())
    val state: StateFlow<HomeState> = _state

    /** Keeps each light's commands in order, so a late one cannot overwrite a newer one. */
    private val sendLocks = ConcurrentHashMap<String, Mutex>()

    val scenes: List<Scene> get() = _state.value.customScenes + BUILTIN_SCENES

    private suspend fun mutate(change: (HomeState) -> HomeState): HomeState = stateLock.withLock {
        val next = change(_state.value)
        _state.value = next
        store.save(next)
        next
    }

    private fun newId(prefix: String) = "$prefix-${UUID.randomUUID()}"

    // ── Lights ───────────────────────────────────────────────────────────────

    /** A direct change takes the light out of any running fade, so the fade cannot overwrite it. */
    suspend fun updateLight(lightId: String, patch: LightPatch): Light? {
        releaseFromFades(lightId)
        return setLightState(lightId, patch)
    }

    private suspend fun setLightState(lightId: String, patch: LightPatch): Light? {
        var updated: Light? = null
        mutate { home ->
            home.copy(
                lights = home.lights.map { light ->
                    if (light.id == lightId) applyPatch(light, patch).also { updated = it } else light
                },
            )
        }
        val light = updated ?: return null
        return dispatch(light)
    }

    private fun applyPatch(light: Light, patch: LightPatch): Light {
        var next = light
        patch.effect?.let { next = next.copy(effect = it) }
        patch.brightness?.let { next = next.copy(brightness = clamp(it, 1, 100), on = true) }
        patch.kelvin?.let {
            val kelvin = clamp(it, 2000, 6500)
            next = next.copy(kelvin = kelvin, colorHex = kelvinToHex(kelvin), colorMode = "kelvin")
        }
        patch.colorHex?.let {
            next = next.copy(colorHex = if (it.startsWith("#")) it else "#$it", colorMode = "rgb")
        }
        patch.colorMode?.let { next = next.copy(colorMode = it) }
        patch.on?.let { next = next.copy(on = it) }
        return next
    }

    /** Sends the light's state and records whether it got through. */
    private suspend fun dispatch(light: Light): Light {
        val outcome = sendLocks.getOrPut(light.id) { Mutex() }.withLock {
            // Sends the newest state, in case another change arrived while this one waited.
            val current = _state.value.lights.firstOrNull { it.id == light.id } ?: return light
            current to sendAll(buildCommand(current))
        }
        val error = outcome.second
        var result = outcome.first
        mutate { home ->
            home.copy(
                lights = home.lights.map {
                    if (it.id == light.id) it.copy(lastError = error).also { saved -> result = saved } else it
                },
            )
        }
        return result
    }

    private suspend fun sendAll(command: LightCommand): String? {
        command.notReady?.let { return it }
        for (step in command.steps) {
            val result = transport.send(step)
            if (result is SendResult.Failed) return result.reason
        }
        return null
    }

    suspend fun setRoomState(roomId: String, patch: LightPatch): Int {
        val targets = _state.value.lights.filter { roomId == ALL_ROOMS || it.roomId == roomId }
        sendTogether(targets.map { it.id to patch }, releaseFades = true)
        return targets.size
    }

    private suspend fun sendTogether(patches: List<Pair<String, LightPatch>>, releaseFades: Boolean) = coroutineScope {
        patches.map { (id, patch) ->
            async { if (releaseFades) updateLight(id, patch) else setLightState(id, patch) }
        }.awaitAll()
    }

    /** Saves a light without sending it anything, so adding a light never switches it on. */
    suspend fun saveLight(
        id: String?,
        name: String,
        roomId: String,
        protocolId: String,
        formFactor: String,
        ip: String,
        port: Int?,
        deviceKey: String,
    ): Light {
        val protocol = protocolFor(protocolId)
        var saved: Light? = null
        mutate { home ->
            val existing = home.lights.firstOrNull { it.id == id }
            val light = (existing ?: Light(id = newId("light"), name = name, protocolId = protocol.id, ip = ip, port = protocol.defaultPort)).copy(
                name = name,
                roomId = roomId,
                protocolId = protocol.id,
                formFactor = formFactor,
                ip = ip,
                port = port ?: protocol.defaultPort,
                deviceKey = deviceKey,
                lastError = null,
            )
            saved = light
            home.copy(lights = if (existing != null) home.lights.map { if (it.id == id) light else it } else home.lights + light)
        }
        return saved!!
    }

    /**
     * Saves a Feit / Smart Life light with the state just read from it, without sending it
     * anything. Adding the same device again refreshes its address but keeps its name and room.
     */
    suspend fun saveTuyaLight(device: TuyaFoundDevice, read: TuyaRead, roomId: String): Light {
        val ip = device.ip ?: error("A Tuya light needs an address.")
        var saved: Light? = null
        mutate { home ->
            val existing = home.lights.firstOrNull { it.protocolId == "tuya-lan" && it.deviceKey == device.id }
            val s = read.state
            val light = (existing ?: Light(id = newId("light"), name = device.name, roomId = roomId, protocolId = "tuya-lan", ip = ip, port = TUYA_PORT)).copy(
                ip = ip,
                port = TUYA_PORT,
                deviceKey = device.id,
                formFactor = existing?.formFactor ?: if (device.kind == "switch") "lamp" else "bulb",
                tuyaVersion = device.version ?: existing?.tuyaVersion ?: "3.3",
                tuyaSchema = read.schema,
                on = s.on ?: existing?.on ?: false,
                brightness = s.brightness ?: existing?.brightness ?: 100,
                kelvin = s.kelvin ?: existing?.kelvin ?: 4000,
                colorMode = s.colorMode ?: existing?.colorMode ?: "kelvin",
                colorHex = s.colorHex ?: existing?.colorHex ?: "#ffffff",
                lastError = null,
            )
            saved = light
            home.copy(lights = if (existing != null) home.lights.map { if (it.id == existing.id) light else it } else home.lights + light)
        }
        return saved!!
    }

    suspend fun removeLight(lightId: String) {
        releaseFromFades(lightId)
        mutate { home -> home.copy(lights = home.lights.filter { it.id != lightId }) }
    }

    suspend fun addRoom(name: String): Room {
        val room = Room(newId("room"), name)
        mutate { home -> home.copy(rooms = home.rooms + room) }
        return room
    }

    // ── Scenes ───────────────────────────────────────────────────────────────

    /** Resolves a scene into the change it makes to each light, without sending anything. */
    fun buildScenePatches(scene: Scene, roomScopeOverride: String? = null): List<Pair<String, LightPatch>> {
        val scope = roomScopeOverride ?: scene.roomScope
        val preset = scene.preset
        return _state.value.lights.filter { scope == ALL_ROOMS || it.roomId == scope }.map { light ->
            if (preset.keepNightlightRoomId != null && !preset.on) {
                val patch = if (light.roomId == preset.keepNightlightRoomId) {
                    LightPatch(on = true, brightness = preset.brightness, colorMode = "kelvin", kelvin = preset.kelvin, effect = "solid")
                } else {
                    LightPatch(on = false)
                }
                return@map light.id to patch
            }
            val isStripOrBar = light.formFactor == "strip" || light.formFactor == "bar"
            val stripColor = preset.stripColorHex?.takeIf { isStripOrBar }
            light.id to LightPatch(
                on = preset.on,
                brightness = preset.brightness,
                colorMode = if (stripColor != null) "rgb" else preset.colorMode,
                kelvin = preset.kelvin,
                colorHex = stripColor ?: preset.colorHex,
                effect = if (isStripOrBar) preset.effect else "solid",
            )
        }
    }

    suspend fun applyScene(sceneId: String, roomScope: String? = null): Scene? {
        val scene = scenes.firstOrNull { it.id == sceneId } ?: return null
        mutate { it.copy(activeSceneId = scene.id) }
        sendTogether(buildScenePatches(scene, roomScope), releaseFades = true)
        return scene
    }

    /** Saves how the lights look now as a scene. Null when there are no lights to copy. */
    suspend fun saveCustomScene(name: String, roomScope: String): Scene? {
        val lights = _state.value.lights.filter { roomScope == ALL_ROOMS || it.roomId == roomScope }
        val reference = lights.firstOrNull { it.on } ?: lights.firstOrNull() ?: return null
        val strip = lights.firstOrNull { it.on && it.formFactor == "strip" } ?: reference
        val scene = Scene(
            id = newId("scene-custom"),
            name = name,
            description = "Saved from your lights: ${reference.brightness}% brightness.",
            roomScope = roomScope,
            isCustom = true,
            preset = ScenePreset(
                on = true,
                brightness = reference.brightness,
                colorMode = reference.colorMode,
                kelvin = reference.kelvin,
                colorHex = reference.colorHex,
                stripColorHex = strip.colorHex,
                effect = strip.effect,
            ),
        )
        mutate { it.copy(customScenes = listOf(scene) + it.customScenes, activeSceneId = scene.id) }
        return scene
    }

    suspend fun removeCustomScene(sceneId: String) {
        mutate { it.copy(customScenes = it.customScenes.filter { scene -> scene.id != sceneId }) }
    }

    /** Sets the lights that are on to suit the time of day. */
    suspend fun applyDaylightNow(): CircadianTarget {
        val time = now()
        val target = computeCircadianTarget(time.hour + time.minute / 60.0)
        sendTogether(
            _state.value.lights.filter { it.on }.map {
                it.id to LightPatch(on = true, brightness = target.brightness, colorMode = "kelvin", kelvin = target.kelvin)
            },
            releaseFades = true,
        )
        return target
    }

    // ── Schedules ────────────────────────────────────────────────────────────

    suspend fun saveSchedule(input: Schedule): Schedule {
        val item = input.copy(
            id = input.id.ifBlank { newId("sched") },
            fadeMinutes = clamp(input.fadeMinutes, 0, 60),
        )
        mutate { home ->
            val exists = home.schedules.any { it.id == item.id }
            home.copy(schedules = if (exists) home.schedules.map { if (it.id == item.id) item else it } else home.schedules + item)
        }
        return item
    }

    suspend fun removeSchedule(id: String) {
        mutate { it.copy(schedules = it.schedules.filter { s -> s.id != id }) }
    }

    /** Applies a schedule's scene right now, with no fade. It does not count as the day's automatic run. */
    suspend fun testSchedule(id: String): Scene? {
        val schedule = _state.value.schedules.firstOrNull { it.id == id } ?: return null
        mutate { home ->
            home.copy(schedules = home.schedules.map { if (it.id == id) it.copy(lastTriggeredAt = now().toString()) else it })
        }
        return applyScene(schedule.sceneId, schedule.roomScope)
    }

    private fun minutesOf(time: String): Int? {
        val match = Regex("""^(\d{1,2}):(\d{2})$""").find(time.trim()) ?: return null
        val hours = match.groupValues[1].toInt()
        val minutes = match.groupValues[2].toInt()
        return if (hours > 23 || minutes > 59) null else hours * 60 + minutes
    }

    private fun runsOn(schedule: Schedule, date: ZonedDateTime): Boolean {
        if (schedule.days.isEmpty()) return true
        val today = SHORT_DAYS.getValue(date.dayOfWeek).lowercase(Locale.ROOT)
        return schedule.days.any { it.take(3).lowercase(Locale.ROOT) == today }
    }

    private fun dateKey(date: ZonedDateTime) = date.format(DateTimeFormatter.ISO_LOCAL_DATE)

    fun isScheduleDue(schedule: Schedule, date: ZonedDateTime): Boolean {
        if (!schedule.enabled) return false
        val at = minutesOf(schedule.time) ?: return false
        if (!runsOn(schedule, date)) return false
        if (schedule.lastAutoRunDate == dateKey(date)) return false
        val minutes = date.hour * 60 + date.minute
        // A little late still counts, because an alarm can be delayed while the phone sleeps.
        return minutes >= at && minutes < at + SCHEDULE_GRACE_MINUTES
    }

    /** Starts every schedule that is due. The returned jobs finish when their fades do. */
    suspend fun runDueSchedules(): List<Job> {
        val date = now()
        val jobs = mutableListOf<Job>()
        for (schedule in _state.value.schedules) {
            if (!isScheduleDue(schedule, date)) continue
            // Recorded before running, so a crash or restart cannot run it twice in one day.
            mutate { home ->
                home.copy(
                    schedules = home.schedules.map {
                        if (it.id == schedule.id) it.copy(lastAutoRunDate = dateKey(date), lastTriggeredAt = date.toString()) else it
                    },
                )
            }
            val scene = scenes.firstOrNull { it.id == schedule.sceneId } ?: continue
            jobs += scope.launch { fadeToScene(schedule, scene) }
        }
        return jobs
    }

    /** When the alarm should next wake the app, or null when nothing is scheduled. */
    fun nextRunTime(): ZonedDateTime? {
        val date = now()
        return _state.value.schedules.mapNotNull { nextRunOf(it, date) }.minOrNull()
    }

    private fun nextRunOf(schedule: Schedule, date: ZonedDateTime): ZonedDateTime? {
        if (!schedule.enabled) return null
        val at = minutesOf(schedule.time) ?: return null
        if (isScheduleDue(schedule, date)) return date
        for (offset in 0L..7L) {
            val candidate = date.truncatedTo(ChronoUnit.DAYS).plusDays(offset).withHour(at / 60).withMinute(at % 60)
            if (candidate.isAfter(date) && runsOn(schedule, candidate) && schedule.lastAutoRunDate != dateKey(candidate)) {
                return candidate
            }
        }
        return null
    }

    // ── Fades ────────────────────────────────────────────────────────────────

    private class FadeTarget(
        val finalPatch: LightPatch,
        val startBrightness: Int,
        val targetBrightness: Int,
        val kelvinMode: Boolean,
        val startKelvin: Int,
        val targetKelvin: Int,
    )

    private class Fade(val targets: ConcurrentHashMap<String, FadeTarget>)

    private val activeFades = ConcurrentHashMap.newKeySet<Fade>()

    private fun releaseFromFades(lightId: String) {
        for (fade in activeFades) fade.targets.remove(lightId)
    }

    private fun lerp(from: Int, to: Int, t: Double) = jsRound(from + (to - from) * t)

    private suspend fun fadeToScene(schedule: Schedule, scene: Scene) {
        val fadeMs = clamp(schedule.fadeMinutes, 0, 60) * 60_000L
        val patches = buildScenePatches(scene, schedule.roomScope)
        mutate { it.copy(activeSceneId = scene.id) }

        // A newer schedule takes over any light an older fade is still moving.
        for ((lightId, _) in patches) releaseFromFades(lightId)

        if (fadeMs <= 0) {
            sendTogether(patches, releaseFades = false)
            return
        }

        val fade = Fade(ConcurrentHashMap())
        for ((lightId, patch) in patches) {
            val light = _state.value.lights.firstOrNull { it.id == lightId } ?: continue
            val targetOn = patch.on != false
            val targetKelvin = clamp(patch.kelvin ?: light.kelvin, 2000, 6500)
            fade.targets[lightId] = FadeTarget(
                finalPatch = patch,
                startBrightness = if (light.on) clamp(light.brightness, 1, 100) else 1,
                targetBrightness = if (targetOn) clamp(patch.brightness ?: light.brightness, 1, 100) else 1,
                kelvinMode = targetOn && (patch.colorMode ?: light.colorMode) == "kelvin",
                // Lights that start off warm up from candlelight, like a sunrise.
                startKelvin = if (light.on && light.colorMode == "kelvin") clamp(light.kelvin, 2000, 6500) else minOf(2200, targetKelvin),
                targetKelvin = targetKelvin,
            )
        }
        activeFades += fade

        // About one step every 30 seconds, so a long fade does not flood the network.
        val steps = clamp(jsRound(fadeMs / 30_000.0), 1, 60)
        val stepMs = fadeMs / steps
        try {
            for (step in 1..steps) {
                if (fade.targets.isEmpty()) return
                val last = step == steps
                val t = step.toDouble() / steps
                sendTogether(
                    fade.targets.map { (lightId, target) ->
                        lightId to if (last) target.finalPatch else fadeStep(target, t)
                    },
                    releaseFades = false,
                )
                if (!last) delay(stepMs)
            }
        } finally {
            activeFades -= fade
        }
    }

    private fun fadeStep(target: FadeTarget, t: Double): LightPatch {
        val final = target.finalPatch
        val brightness = lerp(target.startBrightness, target.targetBrightness, t)
        // Fading out keeps the light's color; fading in moves toward the scene's.
        return when {
            final.on == false -> LightPatch(on = true, brightness = brightness)
            target.kelvinMode -> LightPatch(
                on = true, brightness = brightness, effect = final.effect ?: "solid",
                colorMode = "kelvin", kelvin = lerp(target.startKelvin, target.targetKelvin, t),
            )
            final.colorHex != null -> LightPatch(
                on = true, brightness = brightness, effect = final.effect ?: "solid",
                colorMode = final.colorMode ?: "rgb", colorHex = final.colorHex,
            )
            else -> LightPatch(on = true, brightness = brightness, effect = final.effect ?: "solid")
        }
    }

    // ── Discovery and pairing ────────────────────────────────────────────────

    /** Adds lights that answered a scan. It does not send them anything, so a scan changes no lights. */
    suspend fun mergeScanResults(found: List<FoundLight>): ScanOutcome {
        var added = 0
        var known = 0
        mutate { home ->
            val lights = home.lights.toMutableList()
            for (item in found) {
                val index = lights.indexOfFirst { it.ip == item.ip && it.protocolId == item.protocolId }
                if (index >= 0) {
                    known += 1
                    val light = lights[index]
                    lights[index] = light.copy(
                        on = item.on ?: light.on,
                        brightness = item.brightness?.let { clamp(it, 1, 100) } ?: light.brightness,
                        port = item.port,
                        lastError = null,
                    )
                } else {
                    added += 1
                    lights += Light(
                        id = newId("light"),
                        name = item.name,
                        protocolId = item.protocolId,
                        ip = item.ip,
                        port = item.port,
                        on = item.on ?: false,
                        brightness = item.brightness?.let { clamp(it, 1, 100) } ?: 80,
                    )
                }
            }
            home.copy(lights = lights)
        }
        return ScanOutcome(added, known)
    }

    /**
     * Hue link-button pairing. Only a real username from the bridge is saved. Then every
     * light on the bridge is added, because a new phone has no Hue lights to point at it.
     */
    suspend fun pairHueBridge(host: String): HuePairResult {
        val (ip, port) = splitHost(host) ?: return HuePairResult(false, "Enter the Hue Bridge IP address.")
        val body = buildJsonObject { put("devicetype", "robos#smart-home-phone") }.toString()
        val reply = transport.http(WireStep.Http(ip, port, "POST", "/api", body), timeoutMs = 3000)
            ?: return HuePairResult(false, "Could not reach a Hue Bridge at $host. Check the address and that this phone is on the same Wi-Fi.")
        val first = runCatching { Json.parseToJsonElement(reply.body) }.getOrNull()
            ?.let { element -> runCatching { (element as kotlinx.serialization.json.JsonArray)[0].jsonObject }.getOrNull() }
        val username = first?.get("success")?.jsonObject?.get("username")?.jsonPrimitive?.content
        if (username == null) {
            val error = first?.get("error")?.jsonObject
            return if (error?.get("type")?.jsonPrimitive?.intOrNull == 101) {
                HuePairResult(false, "Press the round button on top of the bridge, then tap Pair within 30 seconds.")
            } else if (error != null) {
                HuePairResult(false, "The bridge refused pairing: ${error["description"]?.jsonPrimitive?.content ?: "unknown error"}.")
            } else {
                HuePairResult(false, "The device at $host does not look like a Hue Bridge.")
            }
        }

        val listReply = transport.http(WireStep.Http(ip, port, "GET", "/api/$username/lights", ""), timeoutMs = 3000)
        val bridgeLights = listReply?.body?.let { parseHueLights(it) }
            ?: return HuePairResult(false, "Paired, but the bridge did not list its lights. Try pairing again.")

        mutate { home ->
            val lights = home.lights.toMutableList()
            for (item in bridgeLights) {
                val key = "$username|${item.number}"
                val index = lights.indexOfFirst {
                    it.protocolId == "hue-rest" && it.ip == ip && it.deviceKey.substringAfter('|') == item.number
                }
                if (index >= 0) {
                    lights[index] = lights[index].copy(name = item.name, port = port, deviceKey = key, lastError = null)
                } else {
                    lights += Light(
                        id = newId("light"),
                        name = item.name,
                        protocolId = "hue-rest",
                        formFactor = item.formFactor,
                        ip = ip,
                        port = port,
                        deviceKey = key,
                        on = item.on,
                        brightness = item.brightness,
                    )
                }
            }
            home.copy(lights = lights)
        }
        return HuePairResult(true, "Paired with the Hue Bridge and added ${bridgeLights.size} lights.", bridgeLights.size)
    }
}

/** Accepts "192.168.1.5" or "192.168.1.5:8080". Null when it is blank or the port is not a number. */
fun splitHost(host: String, defaultPort: Int = 80): Pair<String, Int>? {
    val clean = host.trim()
    if (clean.isEmpty()) return null
    if (!clean.contains(':')) return clean to defaultPort
    val port = clean.substringAfter(':').toIntOrNull() ?: return null
    return clean.substringBefore(':') to port
}

internal data class HueBridgeLight(
    val number: String,
    val name: String,
    val on: Boolean,
    val brightness: Int,
    val formFactor: String,
)

/** Reads GET /api/<username>/lights. Null when the reply is not a map of lights. */
internal fun parseHueLights(body: String): List<HueBridgeLight>? = runCatching {
    Json.parseToJsonElement(body).jsonObject.map { (number, value) ->
        val light = value.jsonObject
        val state = light["state"]?.jsonObject
        val bri = state?.get("bri")?.jsonPrimitive?.intOrNull
        val product = (light["productname"] ?: light["type"])?.jsonPrimitive?.content.orEmpty().lowercase(Locale.ROOT)
        HueBridgeLight(
            number = number,
            name = light["name"]?.jsonPrimitive?.content ?: "Hue light $number",
            on = state?.get("on")?.jsonPrimitive?.booleanOrNull ?: false,
            brightness = bri?.let { clamp(jsRound(it / 254.0 * 100), 1, 100) } ?: 80,
            formFactor = when {
                "strip" in product -> "strip"
                "play" in product || "bar" in product -> "bar"
                else -> "bulb"
            },
        )
    }
}.getOrNull()
