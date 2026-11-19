package com.robos.smarthome.core

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.io.File
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.HttpURLConnection
import java.net.InetAddress
import java.net.SocketTimeoutException
import java.net.URL
import java.net.URLDecoder
import java.nio.charset.StandardCharsets
import java.util.UUID

@Serializable
data class SmartCamera(
    val id: String = "cam-${UUID.randomUUID().toString().take(8)}",
    val urn: String = "",
    val name: String,
    val roomId: String = UNASSIGNED_ROOM_ID,
    val host: String,
    val port: Int = 8080,
    val snapshotUrl: String,
    val streamUrl: String = "",
    val isRobosIpCamera: Boolean = false,
) {
    val baseUrl: String get() = "http://$host:$port"
}

@Serializable
data class SavedCameras(
    val cameras: List<SmartCamera> = emptyList(),
)

data class CameraPowerState(
    val batteryPercent: Int = -1,
    val charging: Boolean = false,
) {
    val isOnBattery: Boolean get() = batteryPercent in 0..100 && !charging
}

data class DiscoveredCamera(
    val urn: String,
    val name: String,
    val roomHint: String,
    val host: String,
    val port: Int,
    val snapshotUrl: String,
    val streamUrl: String,
    val isRobosIpCamera: Boolean,
)

class CameraService(
    private val file: File,
    private val binder: NetworkBinder? = null,
) {
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
        prettyPrint = true
    }
    private val mutex = Mutex()
    private val _cameras = MutableStateFlow(loadFromDisk())
    val cameras: StateFlow<List<SmartCamera>> = _cameras

    private fun loadFromDisk(): List<SmartCamera> {
        if (!file.exists()) return emptyList()
        return try {
            json.decodeFromString(SavedCameras.serializer(), file.readText()).cameras
        } catch (_: Exception) {
            emptyList()
        }
    }

    private fun saveToDisk(list: List<SmartCamera>) {
        file.parentFile?.mkdirs()
        val tmp = File(file.parentFile, "${file.name}.tmp")
        tmp.writeText(json.encodeToString(SavedCameras.serializer(), SavedCameras(list)))
        tmp.renameTo(file)
    }

    suspend fun saveCamera(
        id: String?,
        name: String,
        roomId: String,
        addressOrUrl: String,
    ): SmartCamera = mutex.withLock {
        val parsed = parseCameraInput(addressOrUrl)
        val existing = id?.let { target -> _cameras.value.firstOrNull { it.id == target } }
        val cam = SmartCamera(
            id = existing?.id ?: "cam-${UUID.randomUUID().toString().take(8)}",
            urn = existing?.urn.orEmpty(),
            name = name.trim().ifBlank { "IP Camera" },
            roomId = roomId.ifBlank { UNASSIGNED_ROOM_ID },
            host = parsed.host,
            port = parsed.port,
            snapshotUrl = parsed.snapshotUrl,
            streamUrl = parsed.streamUrl,
            isRobosIpCamera = existing?.isRobosIpCamera ?: parsed.isRobosGuess,
        )
        val updated = if (existing != null) {
            _cameras.value.map { if (it.id == cam.id) cam else it }
        } else {
            _cameras.value + cam
        }
        _cameras.value = updated
        saveToDisk(updated)
        cam
    }

    suspend fun removeCamera(id: String) = mutex.withLock {
        val updated = _cameras.value.filterNot { it.id == id }
        _cameras.value = updated
        saveToDisk(updated)
    }

    suspend fun mergeDiscovered(found: List<DiscoveredCamera>, rooms: List<Room>): Int = mutex.withLock {
        var added = 0
        val current = _cameras.value.toMutableList()
        for (d in found) {
            val idx = current.indexOfFirst {
                (d.urn.isNotBlank() && it.urn == d.urn) || (it.host == d.host && it.port == d.port)
            }
            val matchedRoomId = rooms.firstOrNull {
                it.id != UNASSIGNED_ROOM_ID && it.name.equals(d.roomHint, ignoreCase = true)
            }?.id ?: UNASSIGNED_ROOM_ID

            if (idx >= 0) {
                val old = current[idx]
                current[idx] = old.copy(
                    urn = d.urn.ifBlank { old.urn },
                    host = d.host,
                    port = d.port,
                    snapshotUrl = d.snapshotUrl,
                    streamUrl = d.streamUrl,
                    isRobosIpCamera = d.isRobosIpCamera || old.isRobosIpCamera,
                )
            } else {
                current += SmartCamera(
                    urn = d.urn,
                    name = d.name.ifBlank { "Camera (${d.host})" },
                    roomId = matchedRoomId,
                    host = d.host,
                    port = d.port,
                    snapshotUrl = d.snapshotUrl,
                    streamUrl = d.streamUrl,
                    isRobosIpCamera = d.isRobosIpCamera,
                )
                added++
            }
        }
        if (found.isNotEmpty()) {
            _cameras.value = current
            saveToDisk(current)
        }
        added
    }

    /** Imports HTTP/ONVIF network cameras from desktop Camera Watch (`config/camera-watch/cameras.json`). */
    suspend fun importDesktopCameras(jsonText: String): Int = mutex.withLock {
        val root = Json.parseToJsonElement(jsonText).jsonObject
        val arr = root["cameras"]?.jsonArray ?: return@withLock 0
        val current = _cameras.value.toMutableList()
        var added = 0
        for (el in arr) {
            val obj = el.jsonObject
            val kind = obj["kind"]?.jsonPrimitive?.content.orEmpty()
            if (kind == "device" || kind == "remote") continue
            val name = obj["name"]?.jsonPrimitive?.content?.trim().orEmpty().ifBlank { "Camera" }
            val streamUrl = obj["streamUrl"]?.jsonPrimitive?.content.orEmpty()
            val snapshotUrl = obj["snapshotUrl"]?.jsonPrimitive?.content.orEmpty()
            val onvif = obj["onvif"] as? JsonObject
            val host = onvif?.get("hostname")?.jsonPrimitive?.content
                ?: extractHostPort(streamUrl)?.first
                ?: extractHostPort(snapshotUrl)?.first
                ?: continue
            val port = onvif?.get("port")?.jsonPrimitive?.intOrNull
                ?: extractHostPort(snapshotUrl)?.second
                ?: extractHostPort(streamUrl)?.second
                ?: 8080
            val snap = snapshotUrl.ifBlank { "http://$host:$port/snapshot.jpg" }
            val stream = streamUrl.ifBlank { "http://$host:$port/video" }
            if (current.none { it.host == host && it.port == port }) {
                current += SmartCamera(
                    name = name,
                    host = host,
                    port = port,
                    snapshotUrl = snap,
                    streamUrl = stream,
                    isRobosIpCamera = stream.endsWith("/video") && snap.endsWith("/snapshot.jpg"),
                )
                added++
            }
        }
        if (added > 0) {
            _cameras.value = current
            saveToDisk(current)
        }
        added
    }

    /**
     * Scans the Wi-Fi network for ONVIF cameras (WS-Discovery UDP 239.255.255.250:3702) and
     * probes any local RobOS IP Camera running on this phone (`127.0.0.1:8080`).
     */
    suspend fun discoverOnLan(localWifiIp: String = "", timeoutMs: Int = 1800): List<DiscoveredCamera> =
        withContext(Dispatchers.IO) {
            val byKey = linkedMapOf<String, DiscoveredCamera>()

            // 1. Check if RobOS IP Camera is running on this phone itself.
            val selfHost = localWifiIp.ifBlank { findLocalWlanIp() }.ifBlank { "127.0.0.1" }
            probeRobosCamera(selfHost, 8080)?.let { d ->
                byKey[d.urn.ifBlank { "${d.host}:${d.port}" }] = d
            }

            // 2. Broadcast ONVIF WS-Discovery Probe on 239.255.255.250:3702.
            val probeXml = """
                <?xml version="1.0" encoding="UTF-8"?>
                <e:Envelope xmlns:e="http://www.w3.org/2003/05/soap-envelope"
                            xmlns:w="http://schemas.xmlsoap.org/ws/2004/08/addressing"
                            xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery"
                            xmlns:dn="http://www.onvif.org/ver10/network/wsdl">
                  <e:Header>
                    <w:MessageID>uuid:${UUID.randomUUID()}</w:MessageID>
                    <w:To>urn:schemas-xmlsoap-org:ws:2005:04:discovery</w:To>
                    <w:Action>http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</w:Action>
                  </e:Header>
                  <e:Body><d:Probe><d:Types>dn:NetworkVideoTransmitter</d:Types></d:Probe></e:Body>
                </e:Envelope>
            """.trimIndent().toByteArray(StandardCharsets.UTF_8)

            val sock = DatagramSocket()
            try {
                binder?.bind(sock)
                sock.soTimeout = 350
                val group = InetAddress.getByName("239.255.255.250")
                repeat(2) {
                    try {
                        sock.send(DatagramPacket(probeXml, probeXml.size, group, 3702))
                    } catch (_: Exception) {
                    }
                }
                val deadline = System.currentTimeMillis() + timeoutMs
                val buf = ByteArray(8192)
                while (System.currentTimeMillis() < deadline) {
                    val pkt = DatagramPacket(buf, buf.size)
                    try {
                        sock.receive(pkt)
                        val xml = String(pkt.data, pkt.offset, pkt.length, StandardCharsets.UTF_8)
                        val parsed = parseWsDiscoveryMatch(xml, pkt.address?.hostAddress.orEmpty()) ?: continue
                        val enriched = probeRobosCamera(parsed.host, parsed.port) ?: parsed
                        byKey[enriched.urn.ifBlank { "${enriched.host}:${enriched.port}" }] = enriched
                    } catch (_: SocketTimeoutException) {
                        // keep listening until deadline
                    } catch (_: Exception) {
                        break
                    }
                }
            } finally {
                try {
                    sock.close()
                } catch (_: Exception) {
                }
            }

            byKey.values.toList()
        }

    suspend fun fetchSnapshot(camera: SmartCamera, timeoutMs: Int = 3500): ByteArray? = withContext(Dispatchers.IO) {
        try {
            val url = URL(camera.snapshotUrl)
            val conn = (binder?.open(url) ?: url.openConnection() as HttpURLConnection).apply {
                connectTimeout = timeoutMs
                readTimeout = timeoutMs
                useCaches = false
            }
            if (conn.responseCode == 200) conn.inputStream.use { it.readBytes() } else null
        } catch (_: Exception) {
            null
        }
    }

    suspend fun fetchPowerState(camera: SmartCamera, timeoutMs: Int = 2000): CameraPowerState? = withContext(Dispatchers.IO) {
        if (!camera.isRobosIpCamera) return@withContext null
        try {
            val url = URL("${camera.baseUrl}/api/status")
            val conn = (binder?.open(url) ?: url.openConnection() as HttpURLConnection).apply {
                connectTimeout = timeoutMs
                readTimeout = timeoutMs
                useCaches = false
            }
            if (conn.responseCode != 200) return@withContext null
            val body = conn.inputStream.use { it.readBytes().toString(StandardCharsets.UTF_8) }
            val obj = Json.parseToJsonElement(body).jsonObject
            CameraPowerState(
                batteryPercent = obj["batteryPercent"]?.jsonPrimitive?.intOrNull ?: -1,
                charging = obj["charging"]?.jsonPrimitive?.booleanOrNull ?: false,
            )
        } catch (_: Exception) {
            null
        }
    }

    suspend fun sendRobosControl(camera: SmartCamera, payloadJson: String): Boolean = withContext(Dispatchers.IO) {
        try {
            val url = URL("${camera.baseUrl}/api/control")
            val conn = (binder?.open(url) ?: url.openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                doOutput = true
                connectTimeout = 2500
                readTimeout = 2500
                setRequestProperty("Content-Type", "application/json; charset=utf-8")
            }
            conn.outputStream.use { it.write(payloadJson.toByteArray(StandardCharsets.UTF_8)) }
            conn.responseCode in 200..299
        } catch (_: Exception) {
            false
        }
    }

    private fun probeRobosCamera(host: String, port: Int): DiscoveredCamera? {
        return try {
            val url = URL("http://$host:$port/api/ping")
            val conn = (binder?.open(url) ?: url.openConnection() as HttpURLConnection).apply {
                connectTimeout = 600
                readTimeout = 600
            }
            if (conn.responseCode != 200) return null
            val body = conn.inputStream.use { it.readBytes().toString(StandardCharsets.UTF_8) }
            val obj = Json.parseToJsonElement(body).jsonObject
            if (obj["app"]?.jsonPrimitive?.content != "robos-ip-camera") return null
            val authReq = obj["authRequired"]?.jsonPrimitive?.booleanOrNull == true
            DiscoveredCamera(
                urn = obj["urn"]?.jsonPrimitive?.content.orEmpty(),
                name = obj["name"]?.jsonPrimitive?.content.orEmpty().ifBlank { "RobOS IP Camera" },
                roomHint = obj["room"]?.jsonPrimitive?.content.orEmpty(),
                host = host,
                port = port,
                snapshotUrl = "http://$host:$port/snapshot.jpg",
                streamUrl = "http://$host:$port/video",
                isRobosIpCamera = !authReq,
            )
        } catch (_: Exception) {
            null
        }
    }

    companion object {
        private data class ParsedInput(
            val host: String,
            val port: Int,
            val snapshotUrl: String,
            val streamUrl: String,
            val isRobosGuess: Boolean,
        )

        private fun parseCameraInput(raw: String): ParsedInput {
            val trimmed = raw.trim()
            if (trimmed.startsWith("http://", ignoreCase = true) || trimmed.startsWith("https://", ignoreCase = true)) {
                val u = URL(trimmed)
                val port = if (u.port > 0) u.port else if (u.protocol == "https") 443 else 80
                val base = "${u.protocol}://${u.host}:$port"
                val snap = if (u.path.endsWith(".jpg", ignoreCase = true)) trimmed else "$base/snapshot.jpg"
                val stream = if (u.path.isNotBlank() && !u.path.endsWith(".jpg", ignoreCase = true)) trimmed else "$base/video"
                return ParsedInput(u.host, port, snap, stream, port == 8080)
            }
            val host = trimmed.substringBefore('/').substringBefore(':').ifBlank { "127.0.0.1" }
            val port = trimmed.substringBefore('/').substringAfter(':', "8080").toIntOrNull() ?: 8080
            return ParsedInput(
                host = host,
                port = port,
                snapshotUrl = "http://$host:$port/snapshot.jpg",
                streamUrl = "http://$host:$port/video",
                isRobosGuess = true,
            )
        }

        private fun extractHostPort(urlText: String): Pair<String, Int>? {
            return try {
                val normalized = if (urlText.startsWith("rtsp://")) "http://${urlText.removePrefix("rtsp://")}" else urlText
                val u = URL(normalized)
                if (u.host.isBlank()) null else u.host to (if (u.port > 0) u.port else 80)
            } catch (_: Exception) {
                null
            }
        }

        fun parseWsDiscoveryMatch(xml: String, senderIp: String): DiscoveredCamera? {
            if (!xml.contains("ProbeMatch")) return null
            val urn = Regex("""Address[^>]*>([^<]+)<""").find(xml)?.groupValues?.get(1)?.trim().orEmpty()
            val xaddrs = Regex("""XAddrs[^>]*>([^<]+)<""").find(xml)?.groupValues?.get(1)?.trim()
                ?.split(Regex("\\s+")).orEmpty()
            val firstUrl = xaddrs.firstNotNullOfOrNull { runCatching { URL(it) }.getOrNull() }
            val host = firstUrl?.host?.takeIf { it.isNotBlank() } ?: senderIp
            if (host.isBlank()) return null
            val port = firstUrl?.port?.takeIf { it > 0 } ?: 80
            val scopes = Regex("""Scopes[^>]*>([^<]+)<""").find(xml)?.groupValues?.get(1).orEmpty()
            val name = scopeVal(scopes, "name").ifBlank { scopeVal(scopes, "hardware") }.ifBlank { "ONVIF Camera" }
            val room = scopeVal(scopes, "location")
            val hw = scopeVal(scopes, "hardware")
            val isRobos = hw.contains("RobOS", ignoreCase = true)
            return DiscoveredCamera(
                urn = urn,
                name = name,
                roomHint = room,
                host = host,
                port = port,
                snapshotUrl = "http://$host:$port/snapshot.jpg",
                streamUrl = "http://$host:$port/video",
                isRobosIpCamera = isRobos,
            )
        }

        private fun scopeVal(scopes: String, key: String): String {
            val m = Regex("""onvif://www\.onvif\.org/$key/([^\s<"]+)""", RegexOption.IGNORE_CASE).find(scopes) ?: return ""
            return try {
                URLDecoder.decode(m.groupValues[1], StandardCharsets.UTF_8.name()).replace('_', ' ')
            } catch (_: Exception) {
                m.groupValues[1]
            }
        }

        private fun findLocalWlanIp(): String = try {
            java.net.NetworkInterface.getNetworkInterfaces()?.toList().orEmpty()
                .filter { it.isUp && !it.isLoopback }
                .sortedBy { if (it.name.startsWith("wlan")) 0 else 1 }
                .flatMap { it.inetAddresses.toList() }
                .filterIsInstance<java.net.Inet4Address>()
                .firstOrNull { !it.isLoopbackAddress && !it.isLinkLocalAddress }
                ?.hostAddress.orEmpty()
        } catch (_: Exception) {
            ""
        }
    }
}
