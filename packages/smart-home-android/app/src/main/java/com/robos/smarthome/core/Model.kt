package com.robos.smarthome.core

import kotlinx.serialization.Serializable

// The saved state uses the same field names as the desktop app's smart-lights.json.

@Serializable
data class Room(val id: String, val name: String)

@Serializable
data class Light(
    val id: String,
    val name: String,
    val roomId: String = UNASSIGNED_ROOM_ID,
    val protocolId: String,
    val formFactor: String = "bulb",
    val ip: String,
    val port: Int,
    val deviceKey: String = "",
    val on: Boolean = false,
    val brightness: Int = 80,
    val colorMode: String = "kelvin",
    val colorHex: String = "#00bcd4",
    val kelvin: Int = 4000,
    val effect: String = "solid",
    /** Why the last command did not reach this light; null when it did. */
    val lastError: String? = null,
    /** Feit / Smart Life lights: Tuya protocol version, such as "3.5". */
    val tuyaVersion: String = "",
    /** Feit / Smart Life lights: which data points the light uses ("v2", "v1" or "switch"). */
    val tuyaSchema: String = "",
) {
    val displayHex: String get() = if (colorMode == "kelvin") kelvinToHex(kelvin) else colorHex
}

/** A change to a light. Null fields stay as they are. */
data class LightPatch(
    val on: Boolean? = null,
    val brightness: Int? = null,
    val colorMode: String? = null,
    val colorHex: String? = null,
    val kelvin: Int? = null,
    val effect: String? = null,
)

@Serializable
data class ScenePreset(
    val on: Boolean = true,
    val brightness: Int = 80,
    val colorMode: String = "kelvin",
    val kelvin: Int = 4000,
    val colorHex: String = "#00bcd4",
    val stripColorHex: String? = null,
    val effect: String = "solid",
    val keepNightlightRoomId: String? = null,
)

@Serializable
data class Scene(
    val id: String,
    val name: String,
    val description: String = "",
    val roomScope: String = ALL_ROOMS,
    val isCustom: Boolean = false,
    val preset: ScenePreset = ScenePreset(),
)

@Serializable
data class Schedule(
    val id: String,
    val name: String,
    val time: String = "07:30",
    val days: List<String> = WEEKDAYS,
    val roomScope: String = ALL_ROOMS,
    val sceneId: String,
    val fadeMinutes: Int = 0,
    val enabled: Boolean = true,
    val lastTriggeredAt: String? = null,
    val lastAutoRunDate: String? = null,
)

@Serializable
data class HomeState(
    val rooms: List<Room> = DEFAULT_ROOMS,
    val lights: List<Light> = emptyList(),
    val customScenes: List<Scene> = emptyList(),
    val schedules: List<Schedule> = emptyList(),
    val activeSceneId: String? = null,
)

data class LightProtocol(
    val id: String,
    val name: String,
    val defaultPort: Int,
    val hasKelvin: Boolean,
    val hasRgb: Boolean,
    val hasEffects: Boolean = false,
    /** Label for the extra field this protocol needs, or null when it needs none. */
    val keyLabel: String? = null,
    val setupHint: String,
)

data class LightEffect(val id: String, val code: Int, val name: String)

const val ALL_ROOMS = "all"
const val UNASSIGNED_ROOM_ID = "unassigned"
val WEEKDAYS = listOf("Mon", "Tue", "Wed", "Thu", "Fri")
val ALL_DAYS = listOf("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")

val DEFAULT_ROOMS = listOf(
    Room("living-room", "Living Room"),
    Room("bedroom", "Bedroom"),
    Room("kitchen", "Kitchen"),
    Room("studio", "Studio"),
    Room("basement", "Basement"),
    Room(UNASSIGNED_ROOM_ID, "No room yet"),
)

val LIGHT_PROTOCOLS = listOf(
    LightProtocol(
        "wiz-udp", "Philips WiZ", 38899, hasKelvin = true, hasRgb = true,
        setupHint = "In the WiZ app, open Settings, then Security, and turn on Allow Local Communication.",
    ),
    LightProtocol(
        "hue-rest", "Philips Hue Bridge", 80, hasKelvin = true, hasRgb = true,
        keyLabel = "Bridge username|light number",
        setupHint = "Use Pair Hue Bridge instead of adding Hue lights by hand. It adds every light on the bridge.",
    ),
    LightProtocol(
        "wled-http", "WLED", 80, hasKelvin = true, hasRgb = true, hasEffects = true,
        setupHint = "Connect the WLED controller to your Wi-Fi. It needs no account.",
    ),
    LightProtocol(
        "kasa-lan", "TP-Link Kasa", 9999, hasKelvin = true, hasRgb = true,
        setupHint = "Keep the bulb on the same Wi-Fi as this phone. Newer firmware may need third-party access turned on in the Kasa app.",
    ),
    LightProtocol(
        "lifx-udp", "LIFX", 56700, hasKelvin = true, hasRgb = true,
        setupHint = "LIFX lights answer on your Wi-Fi with no extra setup.",
    ),
    LightProtocol(
        "govee-udp", "Govee", 4003, hasKelvin = true, hasRgb = true,
        setupHint = "In the Govee Home app, open the light's settings and turn on LAN Control.",
    ),
    LightProtocol(
        "elgato-http", "Elgato Key Light", 9123, hasKelvin = true, hasRgb = false,
        setupHint = "Connect the light to your Wi-Fi once with Elgato's app. It needs no password.",
    ),
    LightProtocol(
        "yeelight-tcp", "Yeelight", 55443, hasKelvin = true, hasRgb = true,
        setupHint = "In the Yeelight app, open the light's menu and turn on LAN Control.",
    ),
    LightProtocol(
        "shelly", "Shelly RGBW", 80, hasKelvin = false, hasRgb = true,
        setupHint = "Shelly devices answer on your Wi-Fi with no extra setup.",
    ),
    LightProtocol(
        "ha-rest", "Home Assistant", 8123, hasKelvin = true, hasRgb = true,
        keyLabel = "entity_id|access token",
        setupHint = "In Home Assistant, open your profile and create a long-lived access token.",
    ),
    LightProtocol(
        "tuya-lan", "Feit / Smart Life", TUYA_PORT, hasKelvin = true, hasRgb = true,
        setupHint = "Add these with Add Feit or Smart Life lights. It fetches each light's key from your Tuya cloud project.",
    ),
)

fun protocolFor(id: String): LightProtocol = LIGHT_PROTOCOLS.firstOrNull { it.id == id } ?: LIGHT_PROTOCOLS.first()

val WLED_EFFECTS = listOf(
    LightEffect("solid", 0, "Solid color"),
    LightEffect("breath", 2, "Breathing pulse"),
    LightEffect("rainbow", 9, "Rainbow cycle"),
    LightEffect("aurora", 38, "Northern aurora"),
    LightEffect("cyberpunk", 63, "Cyberpunk neon"),
    LightEffect("fireplace", 66, "Fireplace flicker"),
    LightEffect("ocean", 101, "Ocean waves"),
    LightEffect("meteor", 76, "Shooting star"),
)

val FORM_FACTORS = listOf(
    "bulb" to "Bulb",
    "strip" to "LED strip",
    "bar" to "Light bar",
    "panel" to "Light panel",
    "lamp" to "Floor or desk lamp",
    "pendant" to "Ceiling pendant",
)

val QUICK_COLORS = listOf("#00bcd4", "#3b82f6", "#7c3aed", "#ec4899", "#22c55e", "#f97316", "#eab308", "#ef4444")

// Same presets as BUILTIN_SCENES in packages/robos-lib/smart-light-engine.js.
val BUILTIN_SCENES = listOf(
    Scene(
        "scene-deep-focus", "Deep Focus",
        "Crisp 5200K daylight, with cyan on strips and bars.",
        preset = ScenePreset(true, 92, "kelvin", 5200, "#00bcd4", "#00bcd4", "solid"),
    ),
    Scene(
        "scene-movie-theater", "Cinema",
        "Dims the room to a low purple glow for watching TV.",
        preset = ScenePreset(true, 22, "rgb", 2400, "#7c3aed", "#7c3aed", "breath"),
    ),
    Scene(
        "scene-cozy-evening", "Cozy Evening",
        "Warm 2400K candlelight in every room.",
        preset = ScenePreset(true, 55, "kelvin", 2400, "#ff9e44", "#f97316", "fireplace"),
    ),
    Scene(
        "scene-cyberpunk", "Cyberpunk Arcade",
        "Neon pink lamps with electric cyan strips.",
        preset = ScenePreset(true, 85, "rgb", 4500, "#ec4899", "#00bcd4", "cyberpunk"),
    ),
    Scene(
        "scene-aurora-borealis", "Northern Aurora",
        "Slow teal and emerald colors.",
        preset = ScenePreset(true, 72, "rgb", 4000, "#14b8a6", "#22c55e", "aurora"),
    ),
    Scene(
        "scene-night-reading", "Night Reading",
        "Soft 3000K white at about half brightness.",
        preset = ScenePreset(true, 48, "kelvin", 3000, "#ffd29d", "#ffb76b", "solid"),
    ),
    Scene(
        "scene-goodnight", "Goodnight",
        "Turns everything off except a dim, warm bedroom nightlight.",
        preset = ScenePreset(false, 10, "kelvin", 2200, "#ff8a2b", "#ff8a2b", "solid", "bedroom"),
    ),
)
