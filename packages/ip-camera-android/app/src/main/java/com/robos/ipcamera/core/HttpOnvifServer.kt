package com.robos.ipcamera.core

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.floatOrNull
import kotlinx.serialization.json.jsonPrimitive
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.time.Instant
import java.time.ZoneOffset
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.Base64
import java.util.Collections
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong

data class PtzCommand(
    val pan: Float = 0f,
    val tilt: Float = 0f,
    val zoom: Float = 0f,
    val timeoutMs: Long = 2000L,
)

interface CameraController {
    fun currentConfig(): IpCameraConfig
    fun currentStatus(): CameraRuntimeStatus
    fun modelName(): String = "Android IP Camera"
    fun firmwareVersion(): String = "0.1.0"
    fun password(): String = ""
    fun onPtzMove(cmd: PtzCommand) {}
    fun onPtzStop() {}
    fun onPtzPreset(token: String) {}
    fun onToggleTorch(enabled: Boolean? = null) {}
    fun onSwitchLens(facing: LensFacing? = null) {}
}

/**
 * Fan-out hub for MJPEG streams. Each viewer gets a conflated 1-frame channel so a slow
 * Wi-Fi viewer skips stale frames instead of stalling the camera or buffering in RAM.
 */
class FrameHub {
    private val mainListeners = Collections.synchronizedSet(mutableSetOf<Channel<ByteArray>>())
    private val subListeners = Collections.synchronizedSet(mutableSetOf<Channel<ByteArray>>())

    @Volatile
    var latestMainJpeg: ByteArray? = null
        private set

    @Volatile
    var latestSubJpeg: ByteArray? = null
        private set

    val framesPublished = AtomicLong(0L)
    val activeViewers = AtomicInteger(0)

    val hasSubViewers: Boolean
        get() = subListeners.isNotEmpty()

    fun publishMain(jpeg: ByteArray) {
        latestMainJpeg = jpeg
        framesPublished.incrementAndGet()
        synchronized(mainListeners) {
            for (ch in mainListeners) ch.trySend(jpeg)
        }
    }

    fun publishSub(jpeg: ByteArray) {
        latestSubJpeg = jpeg
        synchronized(subListeners) {
            for (ch in subListeners) ch.trySend(jpeg)
        }
    }

    fun openMainSubscription(): Channel<ByteArray> {
        val ch = Channel<ByteArray>(Channel.CONFLATED)
        latestMainJpeg?.let { ch.trySend(it) }
        mainListeners.add(ch)
        activeViewers.incrementAndGet()
        return ch
    }

    fun closeMainSubscription(ch: Channel<ByteArray>) {
        if (mainListeners.remove(ch)) {
            activeViewers.decrementAndGet()
        }
        ch.close()
    }

    fun openSubSubscription(): Channel<ByteArray> {
        val ch = Channel<ByteArray>(Channel.CONFLATED)
        (latestSubJpeg ?: latestMainJpeg)?.let { ch.trySend(it) }
        subListeners.add(ch)
        activeViewers.incrementAndGet()
        return ch
    }

    fun closeSubSubscription(ch: Channel<ByteArray>) {
        if (subListeners.remove(ch)) {
            activeViewers.decrementAndGet()
        }
        ch.close()
    }
}

/**
 * Lightweight, zero-dependency HTTP/1.1 + Multipart MJPEG + ONVIF Profile S/T SOAP server.
 * Compatible with RobOS Camera Watch (`agsh/onvif` + `ffmpeg`), RobOS Smart Home, VLC,
 * Home Assistant, and any web browser on the local network.
 */
class HttpOnvifServer(
    private val controller: CameraController,
    private val hub: FrameHub,
    private val bindHost: String = "0.0.0.0",
) {
    private var scope: CoroutineScope? = null
    private var serverSocket: ServerSocket? = null
    private var acceptJob: Job? = null
    private val openSockets = Collections.synchronizedSet(mutableSetOf<Socket>())

    @Volatile
    private var lastReportedMotion: Boolean = false

    val localPort: Int
        get() = serverSocket?.localPort ?: -1

    val isRunning: Boolean
        get() = serverSocket?.isClosed == false

    fun start(port: Int) {
        stop()
        val serverScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val srv = ServerSocket()
        srv.reuseAddress = true
        srv.bind(InetSocketAddress(bindHost, port), 32)
        serverSocket = srv
        scope = serverScope

        acceptJob = serverScope.launch {
            while (isActive && !srv.isClosed) {
                val client = try {
                    srv.accept()
                } catch (_: Exception) {
                    if (srv.isClosed) break else continue
                }
                openSockets.add(client)
                launch {
                    try {
                        handleClient(client)
                    } catch (_: Exception) {
                    } finally {
                        openSockets.remove(client)
                        try {
                            client.close()
                        } catch (_: Exception) {
                        }
                    }
                }
            }
        }
    }

    fun stop() {
        acceptJob?.cancel()
        acceptJob = null
        try {
            serverSocket?.close()
        } catch (_: Exception) {
        }
        serverSocket = null
        synchronized(openSockets) {
            for (s in openSockets) {
                try {
                    s.close()
                } catch (_: Exception) {
                }
            }
            openSockets.clear()
        }
        scope?.cancel()
        scope = null
    }

    private suspend fun handleClient(socket: Socket) {
        socket.tcpNoDelay = true
        socket.soTimeout = 15_000
        val input = BufferedInputStream(socket.getInputStream(), 8192)
        val output = BufferedOutputStream(socket.getOutputStream(), 32 * 1024)

        val requestLine = readAsciiLine(input) ?: return
        val parts = requestLine.split(' ')
        if (parts.size < 2) return
        val method = parts[0].uppercase()
        val rawTarget = parts[1]
        val path = rawTarget.substringBefore('?')

        val headers = mutableMapOf<String, String>()
        while (true) {
            val line = readAsciiLine(input) ?: break
            if (line.isEmpty()) break
            val colon = line.indexOf(':')
            if (colon > 0) {
                headers[line.substring(0, colon).trim().lowercase()] = line.substring(colon + 1).trim()
            }
        }

        val contentLength = headers["content-length"]?.toIntOrNull()?.coerceIn(0, 256 * 1024) ?: 0
        val bodyBytes = if (contentLength > 0) readExact(input, contentLength) else ByteArray(0)

        val cfg = controller.currentConfig()
        val hostHeader = headers["host"]
        val resolvedBase = resolveBaseUrl(hostHeader, socket, cfg.port)

        // ONVIF SOAP endpoints use WS-Security UsernameToken inside the XML envelope.
        if (path.startsWith("/onvif")) {
            val soapBody = String(bodyBytes, StandardCharsets.UTF_8)
            handleOnvifSoap(output, soapBody, resolvedBase, cfg)
            return
        }

        // Unauthenticated liveness probe for local discovery.
        if (path == "/api/ping") {
            val json = buildJsonObject {
                put("app", JsonPrimitive("robos-ip-camera"))
                put("name", JsonPrimitive(cfg.cameraName))
                put("room", JsonPrimitive(cfg.room))
                put("urn", JsonPrimitive("urn:uuid:${cfg.deviceUuid}"))
                put("authRequired", JsonPrimitive(cfg.authEnabled))
                put("onvifPath", JsonPrimitive("/onvif/device_service"))
            }.toString()
            writeResponse(output, 200, "OK", "application/json; charset=utf-8", json.toByteArray(StandardCharsets.UTF_8))
            return
        }

        // HTTP Basic Auth check for web UI, streams, snapshots and control APIs when enabled.
        if (cfg.authEnabled && !checkHttpBasicAuth(headers["authorization"], cfg.username, controller.password())) {
            writeResponse(
                output,
                401,
                "Unauthorized",
                "text/plain; charset=utf-8",
                "401 Unauthorized".toByteArray(StandardCharsets.UTF_8),
                extraHeaders = mapOf("WWW-Authenticate" to "Basic realm=\"RobOS IP Camera\""),
            )
            return
        }

        when {
            method == "GET" && (path == "/" || path == "/index.html") -> {
                val html = renderDashboardHtml(cfg, controller.currentStatus())
                writeResponse(output, 200, "OK", "text/html; charset=utf-8", html.toByteArray(StandardCharsets.UTF_8))
            }
            method == "GET" && (path == "/video" || path == "/mjpeg" || path == "/live") -> {
                socket.soTimeout = 0
                streamMjpeg(output, subStream = false)
            }
            method == "GET" && path == "/sub" -> {
                socket.soTimeout = 0
                streamMjpeg(output, subStream = true)
            }
            method == "GET" && (path == "/snapshot.jpg" || path == "/frame.jpg") -> {
                val jpeg = hub.latestMainJpeg
                if (jpeg == null) {
                    writeResponse(output, 503, "Service Unavailable", "text/plain; charset=utf-8", "Camera warming up".toByteArray())
                } else {
                    writeResponse(output, 200, "OK", "image/jpeg", jpeg)
                }
            }
            method == "GET" && path == "/api/status" -> {
                val st = controller.currentStatus()
                val json = buildJsonObject {
                    put("app", JsonPrimitive("robos-ip-camera"))
                    put("urn", JsonPrimitive("urn:uuid:${cfg.deviceUuid}"))
                    put("name", JsonPrimitive(cfg.cameraName))
                    put("room", JsonPrimitive(cfg.room))
                    put("manufacturer", JsonPrimitive("RobOS"))
                    put("model", JsonPrimitive(controller.modelName()))
                    put("live", JsonPrimitive(st.streamState == StreamState.LIVE && hub.latestMainJpeg != null))
                    put("state", JsonPrimitive(st.streamState.name.lowercase()))
                    put("width", JsonPrimitive(st.width))
                    put("height", JsonPrimitive(st.height))
                    put("fps", JsonPrimitive(st.measuredFps))
                    put("targetFps", JsonPrimitive(cfg.fps))
                    put("activeViewers", JsonPrimitive(hub.activeViewers.get()))
                    put("framesServed", JsonPrimitive(hub.framesPublished.get()))
                    put("uptimeSeconds", JsonPrimitive(st.uptimeSeconds))
                    put("lensFacing", JsonPrimitive(cfg.lensFacing.name))
                    put("zoomRatio", JsonPrimitive(cfg.zoomRatio))
                    put("torchEnabled", JsonPrimitive(cfg.torchEnabled))
                    put("motion", JsonPrimitive(st.motionActive))
                    put("motionScore", JsonPrimitive(st.motionScore))
                    put("motionEvents", JsonPrimitive(st.motionEventCount))
                    put("batteryPercent", JsonPrimitive(st.batteryPercent))
                    put("charging", JsonPrimitive(st.charging))
                    put("temperatureC", JsonPrimitive(st.temperatureC))
                    put("streamUrl", JsonPrimitive("$resolvedBase/video"))
                    put("subStreamUrl", JsonPrimitive("$resolvedBase/sub"))
                    put("snapshotUrl", JsonPrimitive("$resolvedBase/snapshot.jpg"))
                    put("onvifUrl", JsonPrimitive("$resolvedBase/onvif/device_service"))
                }.toString()
                writeResponse(output, 200, "OK", "application/json; charset=utf-8", json.toByteArray(StandardCharsets.UTF_8))
            }
            method == "POST" && path == "/api/control" -> {
                val bodyText = String(bodyBytes, StandardCharsets.UTF_8)
                handleControlPost(output, bodyText)
            }
            else -> {
                writeResponse(output, 404, "Not Found", "text/plain; charset=utf-8", "404 Not Found".toByteArray())
            }
        }
    }

    private fun handleControlPost(output: BufferedOutputStream, bodyText: String) {
        try {
            val obj = kotlinx.serialization.json.Json.parseToJsonElement(bodyText) as? JsonObject
            obj?.get("torch")?.jsonPrimitive?.booleanOrNull?.let { controller.onToggleTorch(it) }
            if (obj?.get("toggleTorch")?.jsonPrimitive?.booleanOrNull == true) {
                controller.onToggleTorch(null)
            }
            obj?.get("lens")?.jsonPrimitive?.content?.let { lens ->
                LensFacing.entries.firstOrNull { it.name.equals(lens, ignoreCase = true) }?.let { controller.onSwitchLens(it) }
            }
            obj?.get("preset")?.jsonPrimitive?.content?.let { controller.onPtzPreset(it) }
            obj?.get("zoom")?.jsonPrimitive?.floatOrNull?.let { targetZoom ->
                val cur = controller.currentConfig().zoomRatio
                if (targetZoom != cur) {
                    controller.onPtzPreset("zoom:$targetZoom")
                }
            }
            writeResponse(output, 200, "OK", "application/json; charset=utf-8", "{\"ok\":true}".toByteArray())
        } catch (e: Exception) {
            writeResponse(output, 400, "Bad Request", "application/json; charset=utf-8", "{\"ok\":false}".toByteArray())
        }
    }

    private suspend fun streamMjpeg(output: BufferedOutputStream, subStream: Boolean) {
        val header = buildString {
            append("HTTP/1.1 200 OK\r\n")
            append("Content-Type: multipart/x-mixed-replace; boundary=frame\r\n")
            append("Cache-Control: no-cache, no-store, must-revalidate\r\n")
            append("Pragma: no-cache\r\n")
            append("Connection: close\r\n\r\n")
        }
        output.write(header.toByteArray(StandardCharsets.US_ASCII))
        output.flush()

        val channel = if (subStream) hub.openSubSubscription() else hub.openMainSubscription()
        try {
            for (jpeg in channel) {
                val partHeader = "--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${jpeg.size}\r\n\r\n"
                output.write(partHeader.toByteArray(StandardCharsets.US_ASCII))
                output.write(jpeg)
                output.write("\r\n".toByteArray(StandardCharsets.US_ASCII))
                output.flush()
            }
        } finally {
            if (subStream) hub.closeSubSubscription(channel) else hub.closeMainSubscription(channel)
        }
    }

    // ── ONVIF Profile S / T SOAP Responder ───────────────────────────────────

    private fun handleOnvifSoap(
        output: BufferedOutputStream,
        body: String,
        base: String,
        cfg: IpCameraConfig,
    ) {
        val action = ONVIF_ACTIONS.firstOrNull { a ->
            Regex("""<(\w+:)?$a[\s/>]""").containsMatchIn(body)
        }
        if (action == null) {
            sendSoap(output, 400, soapFault("Unknown ONVIF action"))
            return
        }

        // Per ONVIF Core Spec, GetSystemDateAndTime is always unauthenticated so clients can sync time shift.
        if (cfg.authEnabled && action != "GetSystemDateAndTime") {
            if (!verifyWsSecurity(body, cfg.username, controller.password())) {
                sendSoap(output, 400, soapFault("Sender not Authorized"))
                return
            }
        }

        val st = controller.currentStatus()
        val mainW = st.width.takeIf { it > 0 } ?: cfg.resolution.width
        val mainH = st.height.takeIf { it > 0 } ?: cfg.resolution.height
        val subW = ((mainW / 2) and -2).coerceAtLeast(320)
        val subH = ((mainH / 2) and -2).coerceAtLeast(180)

        val responseXml: String? = when (action) {
            "GetSystemDateAndTime" -> {
                val now = ZonedDateTime.now(ZoneOffset.UTC)
                "<tds:GetSystemDateAndTimeResponse><tds:SystemDateAndTime>" +
                    "<tt:DateTimeType>NTP</tt:DateTimeType><tt:DaylightSavings>false</tt:DaylightSavings>" +
                    "<tt:UTCDateTime>" +
                    "<tt:Time><tt:Hour>${now.hour}</tt:Hour><tt:Minute>${now.minute}</tt:Minute><tt:Second>${now.second}</tt:Second></tt:Time>" +
                    "<tt:Date><tt:Year>${now.year}</tt:Year><tt:Month>${now.monthValue}</tt:Month><tt:Day>${now.dayOfMonth}</tt:Day></tt:Date>" +
                    "</tt:UTCDateTime></tds:SystemDateAndTime></tds:GetSystemDateAndTimeResponse>"
            }
            // Returning null triggers fault so agsh/onvif cleanly falls back to GetCapabilities.
            "GetServices" -> null
            "GetCapabilities" -> {
                "<tds:GetCapabilitiesResponse><tds:Capabilities>" +
                    "<tt:Device><tt:XAddr>$base/onvif/device_service</tt:XAddr></tt:Device>" +
                    "<tt:Events><tt:XAddr>$base/onvif/events</tt:XAddr><tt:WSSubscriptionPolicySupport>false</tt:WSSubscriptionPolicySupport><tt:WSPullPointSupport>true</tt:WSPullPointSupport><tt:WSPausableSubscriptionManagerInterfaceSupport>false</tt:WSPausableSubscriptionManagerInterfaceSupport></tt:Events>" +
                    "<tt:Media><tt:XAddr>$base/onvif/media</tt:XAddr></tt:Media>" +
                    "<tt:PTZ><tt:XAddr>$base/onvif/ptz</tt:XAddr></tt:PTZ>" +
                    "</tds:Capabilities></tds:GetCapabilitiesResponse>"
            }
            "GetDeviceInformation" -> {
                "<tds:GetDeviceInformationResponse>" +
                    "<tds:Manufacturer>RobOS</tds:Manufacturer>" +
                    "<tds:Model>${escapeXml(controller.modelName())}</tds:Model>" +
                    "<tds:FirmwareVersion>${escapeXml(controller.firmwareVersion())}</tds:FirmwareVersion>" +
                    "<tds:SerialNumber>${escapeXml(cfg.deviceUuid)}</tds:SerialNumber>" +
                    "<tds:HardwareId>RobOS-Android-IPCam</tds:HardwareId>" +
                    "</tds:GetDeviceInformationResponse>"
            }
            "GetVideoSources" -> {
                "<trt:GetVideoSourcesResponse><trt:VideoSources token=\"vs1\">" +
                    "<tt:Framerate>${cfg.fps}</tt:Framerate>" +
                    "<tt:Resolution><tt:Width>$mainW</tt:Width><tt:Height>$mainH</tt:Height></tt:Resolution>" +
                    "</trt:VideoSources></trt:GetVideoSourcesResponse>"
            }
            "GetProfiles" -> {
                "<trt:GetProfilesResponse>" +
                    profileXml("main", "MainStream", mainW, mainH, cfg.fps) +
                    profileXml("sub", "SubStream", subW, subH, cfg.fps.coerceAtMost(10)) +
                    "</trt:GetProfilesResponse>"
            }
            "GetStreamUri" -> {
                val token = Regex("""ProfileToken[^>]*>([^<]+)<""").find(body)?.groupValues?.get(1)?.trim() ?: "main"
                val pathSuffix = if (token == "sub") "/sub" else "/video"
                "<trt:GetStreamUriResponse><trt:MediaUri>" +
                    "<tt:Uri>$base$pathSuffix</tt:Uri>" +
                    "<tt:InvalidAfterConnect>false</tt:InvalidAfterConnect>" +
                    "<tt:InvalidAfterReboot>false</tt:InvalidAfterReboot>" +
                    "<tt:Timeout>PT0S</tt:Timeout>" +
                    "</trt:MediaUri></trt:GetStreamUriResponse>"
            }
            "GetSnapshotUri" -> {
                "<trt:GetSnapshotUriResponse><trt:MediaUri>" +
                    "<tt:Uri>$base/snapshot.jpg</tt:Uri>" +
                    "<tt:InvalidAfterConnect>false</tt:InvalidAfterConnect>" +
                    "<tt:InvalidAfterReboot>false</tt:InvalidAfterReboot>" +
                    "<tt:Timeout>PT0S</tt:Timeout>" +
                    "</trt:MediaUri></trt:GetSnapshotUriResponse>"
            }
            "ContinuousMove" -> {
                val pan = Regex("""PanTilt[^>]*\bx="([^"]+)"""").find(body)?.groupValues?.get(1)?.toFloatOrNull() ?: 0f
                val tilt = Regex("""PanTilt[^>]*\by="([^"]+)"""").find(body)?.groupValues?.get(1)?.toFloatOrNull() ?: 0f
                val zoom = Regex("""Zoom[^>]*\bx="([^"]+)"""").find(body)?.groupValues?.get(1)?.toFloatOrNull() ?: 0f
                controller.onPtzMove(PtzCommand(pan = pan, tilt = tilt, zoom = zoom, timeoutMs = 2000L))
                "<tptz:ContinuousMoveResponse/>"
            }
            "Stop" -> {
                controller.onPtzStop()
                "<tptz:StopResponse/>"
            }
            "GetPresets" -> {
                "<tptz:GetPresetsResponse>" +
                    "<tptz:Preset token=\"1\"><tt:Name>Wide 1x (Back)</tt:Name></tptz:Preset>" +
                    "<tptz:Preset token=\"2\"><tt:Name>Zoom 2x</tt:Name></tptz:Preset>" +
                    "<tptz:Preset token=\"3\"><tt:Name>Zoom 4x</tt:Name></tptz:Preset>" +
                    "<tptz:Preset token=\"4\"><tt:Name>Front Camera</tt:Name></tptz:Preset>" +
                    "<tptz:Preset token=\"5\"><tt:Name>Toggle Flashlight</tt:Name></tptz:Preset>" +
                    "</tptz:GetPresetsResponse>"
            }
            "GotoPreset" -> {
                val token = Regex("""PresetToken[^>]*>([^<]+)<""").find(body)?.groupValues?.get(1)?.trim() ?: "1"
                controller.onPtzPreset(token)
                "<tptz:GotoPresetResponse/>"
            }
            "CreatePullPointSubscription" -> {
                val now = Instant.now()
                val term = now.plusSeconds(600)
                "<tev:CreatePullPointSubscriptionResponse>" +
                    "<tev:SubscriptionReference><wsa:Address>$base/onvif/events</wsa:Address></tev:SubscriptionReference>" +
                    "<wsnt:CurrentTime>${DateTimeFormatter.ISO_INSTANT.format(now)}</wsnt:CurrentTime>" +
                    "<wsnt:TerminationTime>${DateTimeFormatter.ISO_INSTANT.format(term)}</wsnt:TerminationTime>" +
                    "</tev:CreatePullPointSubscriptionResponse>"
            }
            "PullMessages" -> {
                val now = Instant.now()
                val term = now.plusSeconds(600)
                val motionNow = st.motionActive
                val msgXml = if (motionNow != lastReportedMotion || motionNow) {
                    lastReportedMotion = motionNow
                    "<wsnt:NotificationMessage>" +
                        "<wsnt:Topic Dialect=\"http://www.onvif.org/ver10/tev/topicExpression/ConcreteSet\">tns1:RuleEngine/CellMotionDetector/Motion</wsnt:Topic>" +
                        "<wsnt:Message><tt:Message UtcTime=\"${DateTimeFormatter.ISO_INSTANT.format(now)}\" PropertyOperation=\"Changed\">" +
                        "<tt:Data><tt:SimpleItem Name=\"IsMotion\" Value=\"$motionNow\"/></tt:Data>" +
                        "</tt:Message></wsnt:Message></wsnt:NotificationMessage>"
                } else {
                    ""
                }
                "<tev:PullMessagesResponse>" +
                    "<tev:CurrentTime>${DateTimeFormatter.ISO_INSTANT.format(now)}</tev:CurrentTime>" +
                    "<tev:TerminationTime>${DateTimeFormatter.ISO_INSTANT.format(term)}</tev:TerminationTime>" +
                    msgXml +
                    "</tev:PullMessagesResponse>"
            }
            "Renew" -> {
                val now = Instant.now()
                val term = now.plusSeconds(600)
                "<wsnt:RenewResponse>" +
                    "<wsnt:TerminationTime>${DateTimeFormatter.ISO_INSTANT.format(term)}</wsnt:TerminationTime>" +
                    "<wsnt:CurrentTime>${DateTimeFormatter.ISO_INSTANT.format(now)}</wsnt:CurrentTime>" +
                    "</wsnt:RenewResponse>"
            }
            "Unsubscribe" -> "<wsnt:UnsubscribeResponse/>"
            else -> null
        }

        if (responseXml == null) {
            sendSoap(output, 400, soapFault("Optional Action Not Implemented"))
        } else {
            sendSoap(output, 200, soapEnvelope(responseXml))
        }
    }

    private fun sendSoap(output: BufferedOutputStream, status: Int, xml: String) {
        val reason = if (status == 200) "OK" else "Bad Request"
        writeResponse(output, status, reason, "application/soap+xml; charset=utf-8", xml.toByteArray(StandardCharsets.UTF_8))
    }

    private fun resolveBaseUrl(hostHeader: String?, socket: Socket, fallbackPort: Int): String {
        val localIp = socket.localAddress?.hostAddress?.takeIf { it != "0.0.0.0" && it != "::" } ?: "127.0.0.1"
        val actualPort = localPort.takeIf { it > 0 } ?: fallbackPort
        if (!hostHeader.isNullOrBlank()) {
            return if (hostHeader.contains(':')) "http://$hostHeader" else "http://$hostHeader:$actualPort"
        }
        return "http://$localIp:$actualPort"
    }

    private fun writeResponse(
        output: BufferedOutputStream,
        status: Int,
        reason: String,
        contentType: String,
        body: ByteArray,
        extraHeaders: Map<String, String> = emptyMap(),
    ) {
        val sb = StringBuilder()
        sb.append("HTTP/1.1 $status $reason\r\n")
        sb.append("Content-Type: $contentType\r\n")
        sb.append("Content-Length: ${body.size}\r\n")
        sb.append("Cache-Control: no-cache, no-store\r\n")
        sb.append("Connection: close\r\n")
        for ((k, v) in extraHeaders) {
            sb.append("$k: $v\r\n")
        }
        sb.append("\r\n")
        output.write(sb.toString().toByteArray(StandardCharsets.US_ASCII))
        output.write(body)
        output.flush()
    }

    companion object {
        private val ONVIF_ACTIONS = listOf(
            "GetSystemDateAndTime",
            "GetServices",
            "GetCapabilities",
            "GetDeviceInformation",
            "GetVideoSources",
            "GetProfiles",
            "GetStreamUri",
            "GetSnapshotUri",
            "ContinuousMove",
            "Stop",
            "GetPresets",
            "GotoPreset",
            "CreatePullPointSubscription",
            "PullMessages",
            "Renew",
            "Unsubscribe",
        )

        private const val SOAP_NS =
            "xmlns:SOAP-ENV=\"http://www.w3.org/2003/05/soap-envelope\" " +
                "xmlns:tds=\"http://www.onvif.org/ver10/device/wsdl\" " +
                "xmlns:trt=\"http://www.onvif.org/ver10/media/wsdl\" " +
                "xmlns:tt=\"http://www.onvif.org/ver10/schema\" " +
                "xmlns:tptz=\"http://www.onvif.org/ver20/ptz/wsdl\" " +
                "xmlns:tev=\"http://www.onvif.org/ver10/events/wsdl\" " +
                "xmlns:wsnt=\"http://docs.oasis-open.org/wsn/b-2\" " +
                "xmlns:wsa=\"http://www.w3.org/2005/08/addressing\" " +
                "xmlns:tns1=\"http://www.onvif.org/ver10/topics\""

        fun soapEnvelope(body: String): String =
            "<?xml version=\"1.0\" encoding=\"UTF-8\"?><SOAP-ENV:Envelope $SOAP_NS><SOAP-ENV:Body>$body</SOAP-ENV:Body></SOAP-ENV:Envelope>"

        fun soapFault(reason: String): String = soapEnvelope(
            "<SOAP-ENV:Fault><SOAP-ENV:Code><SOAP-ENV:Value>SOAP-ENV:Sender</SOAP-ENV:Value></SOAP-ENV:Code>" +
                "<SOAP-ENV:Reason><SOAP-ENV:Text xml:lang=\"en\">${escapeXml(reason)}</SOAP-ENV:Text></SOAP-ENV:Reason></SOAP-ENV:Fault>",
        )

        private fun profileXml(token: String, name: String, w: Int, h: Int, fps: Int): String =
            "<trt:Profiles token=\"$token\" fixed=\"true\"><tt:Name>$name</tt:Name>" +
                "<tt:VideoSourceConfiguration token=\"vsc1\"><tt:Name>vsc1</tt:Name><tt:UseCount>2</tt:UseCount><tt:SourceToken>vs1</tt:SourceToken><tt:Bounds x=\"0\" y=\"0\" width=\"$w\" height=\"$h\"/></tt:VideoSourceConfiguration>" +
                "<tt:VideoEncoderConfiguration token=\"vec-$token\"><tt:Name>enc-$token</tt:Name><tt:UseCount>1</tt:UseCount><tt:Encoding>JPEG</tt:Encoding><tt:Resolution><tt:Width>$w</tt:Width><tt:Height>$h</tt:Height></tt:Resolution><tt:Quality>5</tt:Quality><tt:RateControl><tt:FrameRateLimit>$fps</tt:FrameRateLimit><tt:EncodingInterval>1</tt:EncodingInterval><tt:BitrateLimit>4096</tt:BitrateLimit></tt:RateControl></tt:VideoEncoderConfiguration>" +
                "<tt:PTZConfiguration token=\"ptz1\"><tt:Name>ptz</tt:Name><tt:UseCount>2</tt:UseCount><tt:NodeToken>node1</tt:NodeToken></tt:PTZConfiguration>" +
                "</trt:Profiles>"

        fun checkHttpBasicAuth(authHeader: String?, expectedUser: String, expectedPassword: String): Boolean {
            if (authHeader == null || !authHeader.startsWith("Basic ", ignoreCase = true)) return false
            val decoded = try {
                String(Base64.getDecoder().decode(authHeader.substring(6).trim()), StandardCharsets.UTF_8)
            } catch (_: Exception) {
                return false
            }
            val sep = decoded.indexOf(':')
            if (sep < 0) return false
            val user = decoded.substring(0, sep)
            val pass = decoded.substring(sep + 1)
            return user == expectedUser && pass == expectedPassword
        }

        /**
         * Verifies ONVIF WS-Security UsernameToken (both OASIS PasswordDigest SHA-1 and PasswordText).
         * Matches `agsh/onvif` Cam.prototype._passwordDigest: Base64(SHA1(NonceBytes + CreatedAscii + PasswordUtf8)).
         */
        fun verifyWsSecurity(soapXml: String, expectedUser: String, expectedPassword: String): Boolean {
            val user = Regex("""<(?:\w+:)?Username(?:\s[^>]*)?>([^<]+)<""").find(soapXml)?.groupValues?.get(1)?.trim() ?: return false
            if (user != expectedUser) return false
            val passwordTag = Regex("""<(?:\w+:)?Password((?:\s[^>]*)?)>([^<]+)<""").find(soapXml) ?: return false
            val attrs = passwordTag.groupValues[1]
            val supplied = passwordTag.groupValues[2].trim()

            if (!attrs.contains("PasswordDigest", ignoreCase = true)) {
                return supplied == expectedPassword
            }

            val nonceB64 = Regex("""<(?:\w+:)?Nonce(?:\s[^>]*)?>([^<]+)<""").find(soapXml)?.groupValues?.get(1)?.trim() ?: return false
            val created = Regex("""<(?:\w+:)?Created(?:\s[^>]*)?>([^<]+)<""").find(soapXml)?.groupValues?.get(1)?.trim() ?: return false
            val nonceBytes = try {
                Base64.getDecoder().decode(nonceB64)
            } catch (_: Exception) {
                return false
            }
            val sha1 = MessageDigest.getInstance("SHA-1")
            sha1.update(nonceBytes)
            sha1.update(created.toByteArray(StandardCharsets.US_ASCII))
            sha1.update(expectedPassword.toByteArray(StandardCharsets.UTF_8))
            val expectedDigest = Base64.getEncoder().encodeToString(sha1.digest())
            return MessageDigest.isEqual(
                expectedDigest.toByteArray(StandardCharsets.US_ASCII),
                supplied.toByteArray(StandardCharsets.US_ASCII),
            )
        }

        private fun escapeXml(s: String): String = s
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace("\"", "&quot;")

        private fun readAsciiLine(input: InputStream): String? {
            val out = ByteArrayOutputStream(128)
            while (true) {
                val b = input.read()
                if (b == -1) return if (out.size() == 0) null else out.toString(StandardCharsets.US_ASCII.name())
                if (b == '\n'.code) break
                if (b != '\r'.code) out.write(b)
                if (out.size() > 8192) break
            }
            return out.toString(StandardCharsets.US_ASCII.name())
        }

        private fun readExact(input: InputStream, count: Int): ByteArray {
            val buf = ByteArray(count)
            var off = 0
            while (off < count) {
                val n = input.read(buf, off, count - off)
                if (n <= 0) break
                off += n
            }
            return if (off == count) buf else buf.copyOf(off)
        }

        private fun renderDashboardHtml(cfg: IpCameraConfig, st: CameraRuntimeStatus): String = """
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeXml(cfg.cameraName)} · RobOS IP Camera</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: system-ui, -apple-system, sans-serif; background: #0d1117; color: #e6edf3; }
    header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 20px; background: #161b22; border-bottom: 1px solid #30363d; }
    .brand { display: flex; align-items: center; gap: 10px; }
    .dot { width: 10px; height: 10px; border-radius: 50%; background: #22c55e; box-shadow: 0 0 8px #22c55e; }
    h1 { font-size: 18px; margin: 0; }
    .room { color: #8b949e; font-size: 13px; }
    .pills { display: flex; flex-wrap: wrap; gap: 8px; }
    .pill { background: #1f2630; border: 1px solid #30363d; padding: 4px 10px; border-radius: 999px; font-size: 12px; color: #e6edf3; }
    .pill.motion { border-color: #ef4444; color: #fca5a5; }
    main { max-width: 1120px; margin: 20px auto; padding: 0 16px; }
    .stage { background: #05070a; border: 1px solid #30363d; border-radius: 12px; overflow: hidden; display: flex; justify-content: center; align-items: center; min-height: 280px; }
    .stage img { width: 100%; height: auto; max-height: 76vh; object-fit: contain; display: block; }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 14px; }
    a.btn, button.btn { background: #161b22; color: #e6edf3; border: 1px solid #30363d; padding: 8px 14px; border-radius: 8px; text-decoration: none; font-size: 13px; cursor: pointer; }
    a.btn.primary { background: #00bcd4; color: #04222a; border-color: #00bcd4; font-weight: 600; }
    .meta { margin-top: 16px; background: #161b22; border: 1px solid #30363d; border-radius: 12px; padding: 14px 16px; font-size: 13px; color: #8b949e; line-height: 1.6; }
    code { color: #00bcd4; }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <span class="dot"></span>
      <div>
        <h1 id="cam-name">${escapeXml(cfg.cameraName)}</h1>
        <div class="room">${escapeXml(cfg.room)} · RobOS IP Camera</div>
      </div>
    </div>
    <div class="pills">
      <span class="pill" id="p-res">${st.width}×${st.height}</span>
      <span class="pill" id="p-fps">${st.measuredFps} fps</span>
      <span class="pill" id="p-viewers">${st.activeViewers} watching</span>
      <span class="pill" id="p-batt">${if (st.batteryPercent >= 0) "${st.batteryPercent}%${if (st.charging) " ⚡" else ""}" else "Power OK"}</span>
    </div>
  </header>
  <main>
    <div class="stage"><img src="/video" alt="Live camera stream" /></div>
    <div class="actions">
      <a class="btn primary" href="/snapshot.jpg" download="snapshot.jpg">Save Snapshot</a>
      <button class="btn" onclick="act({toggleTorch:true})">Toggle Flashlight</button>
      <button class="btn" onclick="act({preset:'1'})">1x Wide</button>
      <button class="btn" onclick="act({preset:'2'})">2x Zoom</button>
      <button class="btn" onclick="act({preset:'4'})">Front / Back</button>
    </div>
    <div class="meta">
      <div><strong>RobOS Camera Watch / ONVIF:</strong> Use <b>Find cameras</b> in Camera Watch, or add ONVIF port <code>${cfg.port}</code> path <code>/onvif/device_service</code></div>
      <div><strong>Direct MJPEG Stream:</strong> <code id="u-video">/video</code> · <strong>Sub Stream:</strong> <code>/sub</code> · <strong>Snapshot:</strong> <code>/snapshot.jpg</code></div>
    </div>
  </main>
  <script>
    document.getElementById('u-video').textContent = location.origin + '/video';
    async function act(body) {
      await fetch('/api/control', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
    }
    setInterval(async () => {
      try {
        const r = await fetch('/api/status');
        if (!r.ok) return;
        const s = await r.json();
        document.getElementById('p-res').textContent = s.width + '×' + s.height + (s.zoomRatio > 1.05 ? ' · ' + s.zoomRatio.toFixed(1) + 'x' : '');
        document.getElementById('p-fps').textContent = s.fps.toFixed(1) + ' fps';
        document.getElementById('p-viewers').textContent = s.activeViewers + ' watching';
        if (s.batteryPercent >= 0) {
          document.getElementById('p-batt').textContent = s.batteryPercent + '%' + (s.charging ? ' ⚡' : '') + (s.temperatureC > 0 ? ' · ' + s.temperatureC.toFixed(0) + '°C' : '');
        }
      } catch {}
    }, 2500);
  </script>
</body>
</html>
        """.trimIndent()
    }
}
