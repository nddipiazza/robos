package com.robos.smarthome.core

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject
import java.net.BindException
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.SocketTimeoutException
import java.nio.ByteBuffer
import java.nio.ByteOrder

/** A light that answered a scan. State fields are null when the protocol's answer leaves them out. */
data class FoundLight(
    val protocolId: String,
    val ip: String,
    val port: Int,
    val name: String,
    val on: Boolean? = null,
    val brightness: Int? = null,
)

data class ScanTargets(
    val broadcast: List<String> = listOf("255.255.255.255"),
    val multicast: String = "239.255.255.250",
    val wizPort: Int = 38899,
    val kasaPort: Int = 9999,
    val lifxPort: Int = 56700,
    val yeelightPort: Int = 1982,
    val goveePort: Int = 4001,
    val goveeReplyPort: Int = 4002,
)

const val SCAN_WINDOW_MS = 2500

private val WIZ_PROBE = """{"method":"getPilot","params":{}}""".toByteArray()
private val KASA_PROBE = encodeKasa("""{"system":{"get_sysinfo":{}}}""")
private val LIFX_PROBE = buildLifxPacket(LIFX_GET_SERVICE)
private val YEELIGHT_PROBE =
    "M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1982\r\nMAN: \"ssdp:discover\"\r\nST: wifi_bulb\r\n\r\n".toByteArray()
private val GOVEE_PROBE = buildJsonObject {
    putJsonObject("msg") {
        put("cmd", "scan")
        putJsonObject("data") { put("account_topic", "reserve") }
    }
}.toString().toByteArray()

/** Finds lights that answer UDP probes. WLED, Elgato, Shelly and Hue announce themselves over mDNS instead. */
class UdpDiscovery(
    private val binder: NetworkBinder = object : NetworkBinder {},
    private val windowMs: Int = SCAN_WINDOW_MS,
) {
    suspend fun scan(targets: ScanTargets): List<FoundLight> = withContext(Dispatchers.IO) {
        coroutineScope {
            val main = async { scanMainSocket(targets) }
            val govee = async { scanGovee(targets) }
            (main.await() + govee.await()).distinctBy { it.protocolId to it.ip }
        }
    }

    private fun scanMainSocket(targets: ScanTargets): List<FoundLight> {
        val found = mutableListOf<FoundLight>()
        DatagramSocket().use { socket ->
            binder.bind(socket)
            socket.broadcast = true
            val send = { bytes: ByteArray, host: String, port: Int ->
                runCatching { socket.send(DatagramPacket(bytes, bytes.size, InetAddress.getByName(host), port)) }
            }
            val probe = {
                for (host in targets.broadcast) {
                    send(WIZ_PROBE, host, targets.wizPort)
                    send(KASA_PROBE, host, targets.kasaPort)
                    send(LIFX_PROBE, host, targets.lifxPort)
                }
                send(YEELIGHT_PROBE, targets.multicast, targets.yeelightPort)
            }
            probe()
            found += collect(socket, windowMs / 2) { packet -> parseReply(packet, targets) }
            probe() // UDP can drop a probe on busy Wi-Fi.
            found += collect(socket, windowMs / 2) { packet -> parseReply(packet, targets) }
        }
        return found
    }

    private fun scanGovee(targets: ScanTargets): List<FoundLight> {
        // Govee answers on a fixed port rather than the sender's. If it is taken, skip Govee only.
        val socket = try {
            DatagramSocket(null).apply {
                reuseAddress = true
                bind(InetSocketAddress(targets.goveeReplyPort))
            }
        } catch (_: BindException) {
            return emptyList()
        }
        socket.use {
            binder.bind(it)
            runCatching {
                it.send(DatagramPacket(GOVEE_PROBE, GOVEE_PROBE.size, InetAddress.getByName(targets.multicast), targets.goveePort))
            }
            return collect(it, windowMs) { packet ->
                parseGovee(packet.data.decodeToString(0, packet.length), packet.address.hostAddress.orEmpty(), DEFAULT_GOVEE_PORT)
            }
        }
    }

    private fun collect(socket: DatagramSocket, durationMs: Int, parse: (DatagramPacket) -> FoundLight?): List<FoundLight> {
        val found = mutableListOf<FoundLight>()
        val deadline = System.currentTimeMillis() + durationMs
        val packet = DatagramPacket(ByteArray(4096), 4096)
        while (true) {
            val left = deadline - System.currentTimeMillis()
            if (left <= 0) break
            socket.soTimeout = left.toInt()
            packet.setLength(packet.data.size)
            try {
                socket.receive(packet)
            } catch (_: SocketTimeoutException) {
                break
            }
            runCatching { parse(packet) }.getOrNull()?.let { found += it }
        }
        return found
    }

    private fun parseReply(packet: DatagramPacket, targets: ScanTargets): FoundLight? {
        val ip = packet.address.hostAddress.orEmpty()
        return when {
            packet.port == targets.wizPort -> parseWiz(packet.data.decodeToString(0, packet.length), ip, targets.wizPort)
            packet.port == targets.kasaPort -> parseKasa(packet.data, packet.length, ip, targets.kasaPort)
            packet.port == targets.lifxPort -> parseLifx(packet.data, packet.length, ip, targets.lifxPort)
            else -> parseYeelight(packet.data.decodeToString(0, packet.length), ip)
        }
    }
}

private const val DEFAULT_GOVEE_PORT = 4003
private const val DEFAULT_YEELIGHT_PORT = 55443

private fun parseJson(text: String): JsonObject? = runCatching { Json.parseToJsonElement(text).jsonObject }.getOrNull()

internal fun parseWiz(text: String, ip: String, port: Int): FoundLight? {
    val result = parseJson(text)?.get("result")?.jsonObject ?: return null
    return FoundLight(
        "wiz-udp", ip, port, "WiZ light ($ip)",
        on = result["state"]?.jsonPrimitive?.booleanOrNull,
        brightness = result["dimming"]?.jsonPrimitive?.intOrNull,
    )
}

/** Kasa plugs answer this probe too, but they do not take light commands, so only bulbs count. */
internal fun parseKasa(bytes: ByteArray, length: Int, ip: String, port: Int): FoundLight? {
    val info = parseJson(decodeKasa(bytes, length))?.get("system")?.jsonObject?.get("get_sysinfo")?.jsonObject ?: return null
    val state = info["light_state"]?.jsonObject ?: return null
    return FoundLight(
        "kasa-lan", ip, port,
        info["alias"]?.jsonPrimitive?.content ?: "Kasa light ($ip)",
        on = state["on_off"]?.jsonPrimitive?.intOrNull?.let { it == 1 },
        brightness = state["brightness"]?.jsonPrimitive?.intOrNull,
    )
}

internal fun parseLifx(bytes: ByteArray, length: Int, ip: String, port: Int): FoundLight? {
    if (length < 36) return null
    val type = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN).getShort(32).toInt() and 0xffff
    return if (type == LIFX_STATE_SERVICE) FoundLight("lifx-udp", ip, port, "LIFX light ($ip)") else null
}

internal fun parseYeelight(text: String, ip: String): FoundLight? {
    if (!text.startsWith("HTTP/1.1 200") || !text.contains("yeelight://")) return null
    val header = { name: String ->
        text.lineSequence().firstOrNull { it.startsWith("$name:", ignoreCase = true) }?.substringAfter(':')?.trim()
    }
    val port = header("Location")?.substringAfterLast(':')?.toIntOrNull() ?: DEFAULT_YEELIGHT_PORT
    return FoundLight(
        "yeelight-tcp", ip, port,
        header("name")?.takeIf { it.isNotEmpty() } ?: "Yeelight ($ip)",
        on = header("power")?.let { it == "on" },
        brightness = header("bright")?.toIntOrNull(),
    )
}

internal fun parseGovee(text: String, fromIp: String, port: Int): FoundLight? {
    val message = parseJson(text)?.get("msg")?.jsonObject ?: return null
    if (message["cmd"]?.jsonPrimitive?.content != "scan") return null
    val data = message["data"]?.jsonObject ?: return null
    val ip = data["ip"]?.jsonPrimitive?.content ?: fromIp
    val sku = data["sku"]?.jsonPrimitive?.content
    return FoundLight("govee-udp", ip, port, listOfNotNull("Govee", sku).joinToString(" ") + " ($ip)")
}
