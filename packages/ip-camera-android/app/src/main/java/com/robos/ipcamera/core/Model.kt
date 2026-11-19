package com.robos.ipcamera.core

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.File
import java.util.UUID

@Serializable
enum class LensFacing(val label: String) {
    BACK("Back camera"),
    FRONT("Front camera"),
}

@Serializable
enum class ResolutionPreset(val width: Int, val height: Int, val label: String) {
    FHD_1080P(1920, 1080, "1080p (1920 × 1080)"),
    HD_720P(1280, 720, "720p HD (1280 × 720)"),
    SD_480P(854, 480, "480p (854 × 480)"),
    QHD_360P(640, 360, "360p Low data (640 × 360)"),
}

@Serializable
enum class RotationMode(val label: String, val fixedOrientationDegrees: Int?) {
    AUTO("Automatic (gravity sensor)", null),
    PORTRAIT("Portrait (upright)", 0),
    LANDSCAPE_LEFT("Landscape (top left)", 270),
    PORTRAIT_INVERTED("Portrait (upside down)", 180),
    LANDSCAPE_RIGHT("Landscape (top right)", 90),
}

val DEFAULT_ROOMS = listOf(
    "Living Room",
    "Front Door",
    "Entryway",
    "Kitchen",
    "Office",
    "Nursery",
    "Garage",
    "Workshop",
    "Backyard",
)

@Serializable
data class IpCameraConfig(
    val deviceUuid: String = UUID.randomUUID().toString(),
    val cameraName: String = "RobOS Phone Camera",
    val room: String = "Living Room",
    val enabled: Boolean = true,
    val port: Int = 8080,
    val lensFacing: LensFacing = LensFacing.BACK,
    val resolution: ResolutionPreset = ResolutionPreset.HD_720P,
    val fps: Int = 10,
    val jpegQuality: Int = 80,
    val rotationMode: RotationMode = RotationMode.AUTO,
    val zoomRatio: Float = 1.0f,
    val panX: Float = 0.0f,
    val tiltY: Float = 0.0f,
    val torchEnabled: Boolean = false,
    val overlayTimestamp: Boolean = true,
    val motionEnabled: Boolean = true,
    val motionSensitivity: Int = 60,
    val motionMinAreaPercent: Float = 1.5f,
    val onvifDiscoveryEnabled: Boolean = true,
    val authEnabled: Boolean = false,
    val username: String = "admin",
    val autoStartOnBoot: Boolean = true,
    val keepScreenAwake: Boolean = false,
    val hubHostIp: String = "",
) {
    fun sanitized(): IpCameraConfig = copy(
        deviceUuid = deviceUuid.ifBlank { UUID.randomUUID().toString() },
        cameraName = cameraName.trim().take(64).ifBlank { "RobOS Phone Camera" },
        room = room.trim().take(48).ifBlank { "Living Room" },
        port = port.coerceIn(1024, 65535),
        fps = fps.coerceIn(1, 30),
        jpegQuality = jpegQuality.coerceIn(30, 95),
        zoomRatio = zoomRatio.coerceIn(1.0f, 8.0f),
        panX = panX.coerceIn(-1.0f, 1.0f),
        tiltY = tiltY.coerceIn(-1.0f, 1.0f),
        motionSensitivity = motionSensitivity.coerceIn(1, 100),
        motionMinAreaPercent = motionMinAreaPercent.coerceIn(0.2f, 40.0f),
        username = username.trim().take(64).ifBlank { "admin" },
        hubHostIp = hubHostIp.trim().take(64),
    )
}

interface ConfigStore {
    fun load(defaultModelName: String = "RobOS Phone Camera"): IpCameraConfig
    fun save(config: IpCameraConfig): IpCameraConfig
}

class FileConfigStore(private val file: File) : ConfigStore {
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
        prettyPrint = true
    }

    override fun load(defaultModelName: String): IpCameraConfig {
        if (!file.exists()) {
            val initial = IpCameraConfig(cameraName = defaultModelName).sanitized()
            save(initial)
            return initial
        }
        return try {
            json.decodeFromString(IpCameraConfig.serializer(), file.readText()).sanitized()
        } catch (_: Exception) {
            IpCameraConfig(cameraName = defaultModelName).sanitized()
        }
    }

    override fun save(config: IpCameraConfig): IpCameraConfig {
        val clean = config.sanitized()
        file.parentFile?.mkdirs()
        val tmp = File(file.parentFile, "${file.name}.tmp")
        tmp.writeText(json.encodeToString(IpCameraConfig.serializer(), clean))
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

enum class StreamState(val label: String) {
    LIVE("Live"),
    STARTING("Starting camera…"),
    RECONNECTING("Reconnecting camera…"),
    PERMISSION_NEEDED("Camera permission needed"),
    STOPPED("Paused"),
    ERROR("Camera error"),
}

data class CameraRuntimeStatus(
    val running: Boolean = false,
    val streamState: StreamState = StreamState.STOPPED,
    val errorMessage: String = "",
    val wifiConnected: Boolean = false,
    val wifiIp: String = "",
    val port: Int = 8080,
    val width: Int = 1280,
    val height: Int = 720,
    val measuredFps: Float = 0f,
    val activeViewers: Int = 0,
    val framesServed: Long = 0L,
    val uptimeSeconds: Long = 0L,
    val motionActive: Boolean = false,
    val motionScore: Float = 0f,
    val motionEventCount: Int = 0,
    val lastMotionIso: String = "",
    val batteryPercent: Int = -1,
    val charging: Boolean = false,
    val temperatureC: Float = 0f,
    val batteryUnrestricted: Boolean = false,
    val discoveryProbesAnswered: Int = 0,
) {
    val baseUrl: String?
        get() = wifiIp.takeIf { it.isNotBlank() }?.let { "http://$it:$port" }

    val streamUrl: String?
        get() = baseUrl?.let { "$it/video" }

    val subStreamUrl: String?
        get() = baseUrl?.let { "$it/sub" }

    val snapshotUrl: String?
        get() = baseUrl?.let { "$it/snapshot.jpg" }

    val onvifUrl: String?
        get() = baseUrl?.let { "$it/onvif/device_service" }
}
