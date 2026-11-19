package com.robos.ipcamera.android

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
import androidx.compose.ui.graphics.ImageBitmap
import androidx.core.content.ContextCompat
import com.robos.ipcamera.R
import com.robos.ipcamera.core.CameraController
import com.robos.ipcamera.core.CameraRuntimeStatus
import com.robos.ipcamera.core.FileConfigStore
import com.robos.ipcamera.core.FrameHub
import com.robos.ipcamera.core.HttpOnvifServer
import com.robos.ipcamera.core.IpCameraConfig
import com.robos.ipcamera.core.LensFacing
import com.robos.ipcamera.core.PtzCommand
import com.robos.ipcamera.core.StreamState
import com.robos.ipcamera.core.WsDiscoveryResponder
import com.robos.ipcamera.ui.MainActivity
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
import kotlinx.serialization.json.jsonPrimitive
import java.io.File
import java.time.Instant
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class IpCameraApp : Application() {
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    val hub = FrameHub()

    lateinit var configStore: FileConfigStore
        private set
    lateinit var authVault: KeystoreAuthVault
        private set
    lateinit var wifiMonitor: WifiMonitor
        private set
    lateinit var batteryMonitor: BatteryMonitor
        private set

    private val _config = MutableStateFlow(IpCameraConfig())
    val config: StateFlow<IpCameraConfig> = _config

    private val _status = MutableStateFlow(CameraRuntimeStatus())
    val status: StateFlow<CameraRuntimeStatus> = _status

    private val _previewBitmap = MutableStateFlow<ImageBitmap?>(null)
    val previewBitmap: StateFlow<ImageBitmap?> = _previewBitmap

    val ready = CountDownLatch(1)

    override fun onCreate() {
        super.onCreate()
        val defaultName = "${Build.MODEL?.takeIf { it.isNotBlank() } ?: "RobOS Phone"} Camera"
        configStore = FileConfigStore(File(filesDir, "ip-camera.json"))
        authVault = KeystoreAuthVault(File(noBackupFilesDir, "ip-camera-auth.bin"))
        wifiMonitor = WifiMonitor(this)
        batteryMonitor = BatteryMonitor(this)

        val initialCfg = configStore.load(defaultModelName = defaultName)
        _config.value = initialCfg

        val wifi = wifiMonitor.state.value
        val batt = batteryMonitor.state.value
        _status.value = CameraRuntimeStatus(
            running = false,
            streamState = if (hasCameraPermission()) StreamState.STOPPED else StreamState.PERMISSION_NEEDED,
            wifiConnected = wifi.connected,
            wifiIp = wifi.ip,
            port = initialCfg.port,
            width = initialCfg.resolution.width,
            height = initialCfg.resolution.height,
            batteryPercent = batt.percent,
            charging = batt.charging,
            temperatureC = batt.temperatureC,
            batteryUnrestricted = batt.unrestricted,
        )

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

    fun hasCameraPermission(): Boolean =
        ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED

    fun updateStatus(transform: (CameraRuntimeStatus) -> CameraRuntimeStatus) {
        _status.update(transform)
    }

    fun updatePreview(bitmap: ImageBitmap?) {
        _previewBitmap.value = bitmap
    }

    fun updateConfig(transform: (IpCameraConfig) -> IpCameraConfig): IpCameraConfig {
        val updated = configStore.save(transform(_config.value))
        _config.value = updated
        _status.update { it.copy(port = updated.port) }
        if (updated.enabled && hasCameraPermission()) {
            startCameraService(CameraServerService.ACTION_APPLY_CONFIG)
        } else if (!updated.enabled) {
            stopCameraService()
        }
        return updated
    }

    fun startCameraService(action: String = CameraServerService.ACTION_START) {
        if (!hasCameraPermission()) {
            _status.update { it.copy(streamState = StreamState.PERMISSION_NEEDED, errorMessage = "Grant Camera permission to start streaming.") }
            return
        }
        try {
            ContextCompat.startForegroundService(this, Intent(this, CameraServerService::class.java).setAction(action))
        } catch (e: Exception) {
            _status.update { it.copy(streamState = StreamState.ERROR, errorMessage = e.message ?: "Could not start foreground service.") }
        }
    }

    fun stopCameraService() {
        try {
            stopService(Intent(this, CameraServerService::class.java))
        } catch (_: Exception) {
        }
        _status.update { it.copy(running = false, streamState = StreamState.STOPPED, measuredFps = 0f, activeViewers = 0) }
    }
}

/**
 * Always-on Foreground Surveillance Service (`foregroundServiceType="camera"`).
 *
 * Holds CPU PartialWakeLock, Low-Latency WifiLock, and MulticastLock so the phone functions
 * like a dedicated hardware IP camera 24/7 even with the display off or locked.
 */
class CameraServerService : Service(), CameraController {
    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    private var cpuWakeLock: PowerManager.WakeLock? = null
    private var wifiLock: WifiManager.WifiLock? = null
    private var multicastLock: WifiManager.MulticastLock? = null

    private var cameraEngine: Camera2Engine? = null
    private var httpServer: HttpOnvifServer? = null
    private var discoveryResponder: WsDiscoveryResponder? = null

    private var watchdogJob: Job? = null
    private var ptzJob: Job? = null
    private var startedElapsedMs: Long = 0L
    private var activeHttpPort: Int = -1
    private var activeDiscoveryIp: String = ""

    private val app: IpCameraApp
        get() = application as IpCameraApp

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        startedElapsedMs = SystemClock.elapsedRealtime()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                app.updateConfig { it.copy(enabled = false) }
                stopSelf()
                return START_NOT_STICKY
            }
            ACTION_FLIP_LENS -> {
                onSwitchLens(null)
                return START_STICKY
            }
            ACTION_TOGGLE_TORCH -> {
                onToggleTorch(null)
                return START_STICKY
            }
        }

        if (!app.hasCameraPermission()) {
            app.updateStatus { it.copy(running = false, streamState = StreamState.PERMISSION_NEEDED) }
            stopSelf()
            return START_NOT_STICKY
        }

        startForeground(
            NOTIFICATION_ID,
            buildNotification(app.config.value, app.status.value),
            ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA,
        )

        acquireLocks()
        ensureRunning(app.config.value)
        return START_STICKY
    }

    override fun onDestroy() {
        ptzJob?.cancel()
        watchdogJob?.cancel()
        discoveryResponder?.stop()
        discoveryResponder = null
        httpServer?.stop()
        httpServer = null
        cameraEngine?.stop()
        cameraEngine = null
        releaseLocks()
        app.updateStatus { it.copy(running = false, streamState = StreamState.STOPPED, measuredFps = 0f, activeViewers = 0) }
        serviceScope.cancel()
        super.onDestroy()
    }

    private fun ensureRunning(cfg: IpCameraConfig) {
        app.wifiMonitor.refreshNow()
        app.batteryMonitor.refresh()

        // 1. HTTP + ONVIF + MJPEG server
        val server = httpServer
        if (server == null || !server.isRunning || activeHttpPort != cfg.port) {
            httpServer?.stop()
            val newServer = HttpOnvifServer(controller = this, hub = app.hub)
            try {
                newServer.start(cfg.port)
                httpServer = newServer
                activeHttpPort = cfg.port
            } catch (e: Exception) {
                app.updateStatus {
                    it.copy(
                        running = true,
                        streamState = StreamState.ERROR,
                        errorMessage = "Port ${cfg.port} unavailable: ${e.message}",
                    )
                }
            }
        }

        // 2. ONVIF WS-Discovery responder on UDP 239.255.255.250:3702
        syncDiscovery(cfg)

        // 3. Camera2 capture engine
        val cam = cameraEngine
        if (cam == null) {
            val newCam = Camera2Engine(
                context = this,
                hub = app.hub,
                onStateChanged = { st, err, w, h, fps ->
                    app.updateStatus {
                        it.copy(
                            running = true,
                            streamState = st,
                            errorMessage = err,
                            width = if (w > 0) w else it.width,
                            height = if (h > 0) h else it.height,
                            measuredFps = fps,
                            activeViewers = app.hub.activeViewers.get(),
                            framesServed = app.hub.framesPublished.get(),
                        )
                    }
                },
                onMotionResult = { mr ->
                    app.updateStatus { cur ->
                        cur.copy(
                            motionActive = mr.motion,
                            motionScore = mr.score,
                            motionEventCount = if (mr.started) cur.motionEventCount + 1 else cur.motionEventCount,
                            lastMotionIso = if (mr.started) Instant.now().toString() else cur.lastMotionIso,
                        )
                    }
                },
                onPreviewBitmap = { bmp -> app.updatePreview(bmp) },
            )
            newCam.uiPreviewActive = uiVisibleCount > 0
            cameraEngine = newCam
            activeEngineRef = newCam
            newCam.start(cfg)
        } else {
            cam.updateConfig(cfg)
        }

        // 4. Self-healing watchdog & notification updater
        if (watchdogJob?.isActive != true) {
            watchdogJob = serviceScope.launch {
                var stallRecoveries = 0
                while (isActive) {
                    delay(3_000L)
                    val curCfg = app.config.value
                    if (!curCfg.enabled) continue

                    app.wifiMonitor.refreshNow()
                    app.batteryMonitor.refresh()
                    syncDiscovery(curCfg)

                    val nowElapsed = SystemClock.elapsedRealtime()
                    val uptimeSec = ((nowElapsed - startedElapsedMs) / 1000L).coerceAtLeast(0L)
                    val engine = cameraEngine
                    val lastFrame = engine?.lastFrameElapsedMs ?: 0L
                    val stalled = lastFrame > 0L && (nowElapsed - lastFrame) > 8_500L
                    val curState = app.status.value.streamState

                    if (engine != null && (stalled || curState == StreamState.RECONNECTING || curState == StreamState.ERROR)) {
                        stallRecoveries++
                        app.updateStatus {
                            it.copy(streamState = StreamState.RECONNECTING, errorMessage = "Recovering camera stream (attempt $stallRecoveries)…")
                        }
                        engine.restart()
                        delay((stallRecoveries.coerceAtMost(4) * 1500L))
                    } else if (curState == StreamState.LIVE) {
                        stallRecoveries = 0
                    }

                    app.updateStatus {
                        it.copy(
                            running = true,
                            uptimeSeconds = uptimeSec,
                            activeViewers = app.hub.activeViewers.get(),
                            framesServed = app.hub.framesPublished.get(),
                            discoveryProbesAnswered = discoveryResponder?.probesAnswered?.get() ?: 0,
                        )
                    }
                    refreshNotification(curCfg, app.status.value)
                }
            }
        }
    }

    private fun syncDiscovery(cfg: IpCameraConfig) {
        val ip = app.wifiMonitor.state.value.ip
        if (!cfg.onvifDiscoveryEnabled || ip.isBlank()) {
            discoveryResponder?.stop()
            discoveryResponder = null
            activeDiscoveryIp = ""
            return
        }
        val existing = discoveryResponder
        if (existing == null || !existing.isRunning || activeDiscoveryIp != ip) {
            existing?.stop()
            val responder = WsDiscoveryResponder(
                configProvider = { app.config.value },
                ipProvider = { app.wifiMonitor.state.value.ip },
                portProvider = { httpServer?.localPort?.takeIf { it > 0 } ?: app.config.value.port },
                hardwareModel = "RobOS ${Build.MODEL ?: "Android"}",
            )
            if (responder.start(ip)) {
                discoveryResponder = responder
                activeDiscoveryIp = ip
            }
        }
    }

    @Suppress("DEPRECATION")
    private fun acquireLocks() {
        if (cpuWakeLock == null) {
            cpuWakeLock = getSystemService(PowerManager::class.java)
                .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "robos:ipcamera-cpu")
                .apply {
                    setReferenceCounted(false)
                    acquire()
                }
        }
        val wifiMgr = applicationContext.getSystemService(WifiManager::class.java)
        if (wifiLock == null) {
            val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                WifiManager.WIFI_MODE_FULL_LOW_LATENCY
            } else {
                WifiManager.WIFI_MODE_FULL_HIGH_PERF
            }
            wifiLock = wifiMgr.createWifiLock(mode, "robos:ipcamera-wifi").apply {
                setReferenceCounted(false)
                acquire()
            }
        }
        if (multicastLock == null) {
            multicastLock = wifiMgr.createMulticastLock("robos:ipcamera-multicast").apply {
                setReferenceCounted(false)
                acquire()
            }
        }
    }

    private fun releaseLocks() {
        try {
            cpuWakeLock?.takeIf { it.isHeld }?.release()
        } catch (_: Exception) {
        }
        cpuWakeLock = null
        try {
            wifiLock?.takeIf { it.isHeld }?.release()
        } catch (_: Exception) {
        }
        wifiLock = null
        try {
            multicastLock?.takeIf { it.isHeld }?.release()
        } catch (_: Exception) {
        }
        multicastLock = null
    }

    private fun refreshNotification(cfg: IpCameraConfig, st: CameraRuntimeStatus) {
        try {
            getSystemService(NotificationManager::class.java)
                .notify(NOTIFICATION_ID, buildNotification(cfg, st))
        } catch (_: Exception) {
        }
    }

    private fun buildNotification(cfg: IpCameraConfig, st: CameraRuntimeStatus): Notification {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "IP Camera Surveillance Stream", NotificationManager.IMPORTANCE_LOW).apply {
                description = "Keeps the surveillance camera online while the screen is off."
                setShowBadge(false)
            },
        )
        val openPending = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val flipPending = PendingIntent.getService(
            this,
            1,
            Intent(this, CameraServerService::class.java).setAction(ACTION_FLIP_LENS),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val torchPending = PendingIntent.getService(
            this,
            2,
            Intent(this, CameraServerService::class.java).setAction(ACTION_TOGGLE_TORCH),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val stopPending = PendingIntent.getService(
            this,
            3,
            Intent(this, CameraServerService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val addressLabel = st.wifiIp.takeIf { it.isNotBlank() }?.let { "$it:${st.port}" } ?: "Waiting for Wi-Fi"
        val viewers = st.activeViewers
        val sub = buildString {
            append(addressLabel)
            append(" · ")
            append(if (viewers == 1) "1 watching" else "$viewers watching")
            if (st.measuredFps > 0f) append(" · ${"%.0f".format(st.measuredFps)} fps")
        }

        return Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_tab_live)
            .setContentTitle("${cfg.cameraName} · ${st.streamState.label}")
            .setContentText(sub)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(openPending)
            .addAction(Notification.Action.Builder(null, "Flip Lens", flipPending).build())
            .addAction(Notification.Action.Builder(null, if (cfg.torchEnabled) "Light Off" else "Light On", torchPending).build())
            .addAction(Notification.Action.Builder(null, "Pause", stopPending).build())
            .build()
    }

    // ── CameraController implementation for ONVIF / HTTP remote control ──────

    override fun currentConfig(): IpCameraConfig = app.config.value

    override fun currentStatus(): CameraRuntimeStatus = app.status.value

    override fun modelName(): String = "${Build.MANUFACTURER ?: "Android"} ${Build.MODEL ?: "Phone"}".trim()

    override fun firmwareVersion(): String = "0.1.0"

    override fun password(): String = app.authVault.getPassword()

    override fun onPtzMove(cmd: PtzCommand) {
        ptzJob?.cancel()
        ptzJob = serviceScope.launch {
            val steps = (cmd.timeoutMs / 100L).coerceIn(1L, 30L).toInt()
            repeat(steps) {
                if (!isActive) return@launch
                app.updateConfig { cur ->
                    val nextZoom = (cur.zoomRatio + cmd.zoom * 0.14f).coerceIn(1.0f, 8.0f)
                    val stepScale = (0.12f / nextZoom).coerceAtLeast(0.02f)
                    cur.copy(
                        zoomRatio = nextZoom,
                        panX = (cur.panX + cmd.pan * stepScale).coerceIn(-1.0f, 1.0f),
                        tiltY = (cur.tiltY + cmd.tilt * stepScale).coerceIn(-1.0f, 1.0f),
                    )
                }
                delay(100L)
            }
        }
    }

    override fun onPtzStop() {
        ptzJob?.cancel()
        ptzJob = null
    }

    override fun onPtzPreset(token: String) {
        ptzJob?.cancel()
        if (token.startsWith("zoom:")) {
            val z = token.removePrefix("zoom:").toFloatOrNull() ?: return
            app.updateConfig { it.copy(zoomRatio = z.coerceIn(1.0f, 8.0f)) }
            return
        }
        when (token) {
            "1" -> app.updateConfig { it.copy(lensFacing = LensFacing.BACK, zoomRatio = 1.0f, panX = 0f, tiltY = 0f) }
            "2" -> app.updateConfig { it.copy(zoomRatio = 2.0f) }
            "3" -> app.updateConfig { it.copy(zoomRatio = 4.0f) }
            "4" -> onSwitchLens(null)
            "5" -> onToggleTorch(null)
        }
    }

    override fun onToggleTorch(enabled: Boolean?) {
        app.updateConfig { cur ->
            val target = enabled ?: !cur.torchEnabled
            cur.copy(torchEnabled = target, lensFacing = if (target) LensFacing.BACK else cur.lensFacing)
        }
    }

    override fun onSwitchLens(facing: LensFacing?) {
        app.updateConfig { cur ->
            val next = facing ?: if (cur.lensFacing == LensFacing.BACK) LensFacing.FRONT else LensFacing.BACK
            cur.copy(lensFacing = next, torchEnabled = if (next == LensFacing.FRONT) false else cur.torchEnabled)
        }
    }

    companion object {
        const val CHANNEL_ID = "ip_camera_stream"
        const val NOTIFICATION_ID = 101
        const val ACTION_START = "com.robos.ipcamera.START"
        const val ACTION_APPLY_CONFIG = "com.robos.ipcamera.APPLY_CONFIG"
        const val ACTION_STOP = "com.robos.ipcamera.STOP"
        const val ACTION_FLIP_LENS = "com.robos.ipcamera.FLIP_LENS"
        const val ACTION_TOGGLE_TORCH = "com.robos.ipcamera.TOGGLE_TORCH"

        @Volatile
        private var uiVisibleCount = 0

        @Volatile
        private var activeEngineRef: Camera2Engine? = null

        fun setUiVisible(visible: Boolean) {
            uiVisibleCount = (uiVisibleCount + if (visible) 1 else -1).coerceAtLeast(0)
            activeEngineRef?.uiPreviewActive = uiVisibleCount > 0
        }
    }
}

/**
 * Restores continuous surveillance after a power outage or reboot when `autoStartOnBoot` is on.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        val action = intent?.action ?: return
        if (action != Intent.ACTION_BOOT_COMPLETED && action != Intent.ACTION_MY_PACKAGE_REPLACED) return
        val app = context.applicationContext as? IpCameraApp ?: return
        val cfg = app.config.value
        if (!cfg.enabled || !cfg.autoStartOnBoot || !app.hasCameraPermission()) return

        try {
            ContextCompat.startForegroundService(
                context,
                Intent(context, CameraServerService::class.java).setAction(CameraServerService.ACTION_START),
            )
        } catch (_: Exception) {
            // Android 15+ may block background camera service start from BOOT_COMPLETED unless the
            // activity comes up or the user taps a resume notification.
            try {
                context.startActivity(
                    Intent(context, MainActivity::class.java)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
                )
            } catch (_: Exception) {
                postBootResumeNotification(context, cfg)
            }
        }
    }

    private fun postBootResumeNotification(context: Context, cfg: IpCameraConfig) {
        val nm = context.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(CameraServerService.CHANNEL_ID, "IP Camera Surveillance Stream", NotificationManager.IMPORTANCE_HIGH),
        )
        val openPending = PendingIntent.getActivity(
            context,
            99,
            Intent(context, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val n = Notification.Builder(context, CameraServerService.CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_tab_live)
            .setContentTitle("${cfg.cameraName} ready after restart")
            .setContentText("Tap to resume the IP camera stream.")
            .setContentIntent(openPending)
            .setAutoCancel(true)
            .build()
        nm.notify(102, n)
    }
}

/**
 * Receives optional camera name/room settings restored from RobOS Preferences Config Sync.
 */
class SettingsProvider : ContentProvider() {
    override fun onCreate(): Boolean = true

    override fun call(method: String, arg: String?, extras: Bundle?): Bundle {
        if (method != "import") return Bundle().apply { putString("error", "Unknown request: $method") }
        val jsonText = extras?.getString("json") ?: return Bundle().apply { putString("error", "Nothing to restore.") }
        val app = context!!.applicationContext as IpCameraApp
        if (!app.ready.await(15, TimeUnit.SECONDS)) {
            return Bundle().apply { putString("error", "IP Camera is still starting. Try again in a moment.") }
        }
        return try {
            val parsed = Json.parseToJsonElement(jsonText) as? JsonObject
            val restoredName = parsed?.get("cameraName")?.jsonPrimitive?.content
            val restoredRoom = parsed?.get("room")?.jsonPrimitive?.content
            if (!restoredName.isNullOrBlank() || !restoredRoom.isNullOrBlank()) {
                app.updateConfig { cur ->
                    cur.copy(
                        cameraName = restoredName?.takeIf { it.isNotBlank() } ?: cur.cameraName,
                        room = restoredRoom?.takeIf { it.isNotBlank() } ?: cur.room,
                    )
                }
            }
            Bundle().apply { putString("summary", "IP Camera: settings updated.") }
        } catch (e: Exception) {
            Bundle().apply { putString("error", "IP Camera could not read settings: ${e.message}") }
        }
    }

    override fun query(uri: Uri, projection: Array<out String>?, selection: String?, selectionArgs: Array<out String>?, sortOrder: String?): Cursor? = null
    override fun getType(uri: Uri): String? = null
    override fun insert(uri: Uri, values: ContentValues?): Uri? = null
    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?): Int = 0
    override fun update(uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<out String>?): Int = 0
}
