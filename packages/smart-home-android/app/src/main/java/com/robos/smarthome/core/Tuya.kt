package com.robos.smarthome.core

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject
import java.io.Closeable
import java.io.IOException
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.Inet4Address
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.NetworkInterface
import java.net.Socket
import java.net.SocketTimeoutException
import java.net.URL
import java.net.URLEncoder
import java.nio.ByteBuffer
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.zip.CRC32
import javax.crypto.Cipher
import javax.crypto.Mac
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
import javax.net.ssl.HttpsURLConnection

// Feit Electric, Smart Life and other Tuya lights. A port of packages/robos-lib/tuya.js,
// which was checked against a real Feit bulb; GoldenTest compares the two.
//
// Cloud, once: a signed request to Tuya's developer API lists the devices in the Smart
// Life account linked to the person's Tuya cloud project, with each one's local key.
// Network, for every command: Tuya's local protocol 3.3, 3.4 or 3.5 on TCP 6668.

const val TUYA_PORT = 6668
private val TUYA_BROADCAST_PORTS = listOf(6666, 6667, 7000)

data class TuyaRegion(val id: String, val name: String, val host: String)

val TUYA_REGIONS = listOf(
    TuyaRegion("us", "Western America", "openapi.tuyaus.com"),
    TuyaRegion("us-e", "Eastern America", "openapi-ueaz.tuyaus.com"),
    TuyaRegion("eu", "Central Europe", "openapi.tuyaeu.com"),
    TuyaRegion("eu-w", "Western Europe", "openapi-weaz.tuyaeu.com"),
    TuyaRegion("in", "India", "openapi.tuyain.com"),
    TuyaRegion("cn", "China", "openapi.tuyacn.com"),
)

private val LIGHT_CATEGORIES = setOf("dj", "dd", "xdd", "fwd", "dc", "tgq", "tyndj", "sxd", "gyd", "fsd", "tgkg", "dsd", "mbd", "qjdcz")
private val SWITCH_CATEGORIES = setOf("kg", "cz", "pc", "tdq")

object TuyaCmd {
    const val SESS_KEY_NEG_START = 3
    const val SESS_KEY_NEG_RESP = 4
    const val SESS_KEY_NEG_FINISH = 5
    const val CONTROL = 7
    const val STATUS = 8
    const val DP_QUERY = 10
    const val CONTROL_NEW = 13
    const val DP_QUERY_NEW = 16
    const val APP_PROBE = 0x25
}

class TuyaException(message: String) : IOException(message)

/** The key every Tuya device uses for its broadcasts. It is public and the same everywhere. */
val TUYA_BROADCAST_KEY: ByteArray = MessageDigest.getInstance("MD5").digest("yGAdlopoPVldABfn".toByteArray())

private val random = SecureRandom()

// ── Crypto ───────────────────────────────────────────────────────────────────

internal fun aesEcb(key: ByteArray, data: ByteArray, encrypt: Boolean, pad: Boolean = true): ByteArray {
    val cipher = Cipher.getInstance(if (pad) "AES/ECB/PKCS5Padding" else "AES/ECB/NoPadding")
    cipher.init(if (encrypt) Cipher.ENCRYPT_MODE else Cipher.DECRYPT_MODE, SecretKeySpec(key, "AES"))
    return cipher.doFinal(data)
}

internal fun hmacSha256(key: ByteArray, data: ByteArray): ByteArray =
    Mac.getInstance("HmacSHA256").run {
        init(SecretKeySpec(key, "HmacSHA256"))
        doFinal(data)
    }

private fun gcm(encrypt: Boolean, key: ByteArray, iv: ByteArray, aad: ByteArray?, data: ByteArray): ByteArray {
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(if (encrypt) Cipher.ENCRYPT_MODE else Cipher.DECRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, iv))
    aad?.let { cipher.updateAAD(it) }
    return cipher.doFinal(data)
}

private fun ByteArray.hex(): String = joinToString("") { "%02x".format(it) }

// ── Frames ───────────────────────────────────────────────────────────────────

/** A 0x55AA frame (versions 3.1 to 3.4). 3.4 ends it with an HMAC instead of a CRC. */
fun encode55aa(seq: Int, cmd: Int, payload: ByteArray, hmacKey: ByteArray? = null): ByteArray {
    val tailLen = if (hmacKey != null) 32 else 4
    val body = ByteBuffer.allocate(16 + payload.size).apply {
        putInt(0x000055aa)
        putInt(seq)
        putInt(cmd)
        putInt(payload.size + tailLen + 4)
        put(payload)
    }.array()
    val check = if (hmacKey != null) {
        hmacSha256(hmacKey, body)
    } else {
        ByteBuffer.allocate(4).putInt(CRC32().apply { update(body) }.value.toInt()).array()
    }
    return body + check + byteArrayOf(0, 0, 0xaa.toByte(), 0x55)
}

/** A 0x6699 frame (version 3.5): AES-GCM, with the header as additional data. */
fun encode6699(seq: Int, cmd: Int, plaintext: ByteArray, key: ByteArray, iv: ByteArray = ByteArray(12).also(random::nextBytes)): ByteArray {
    val header = ByteBuffer.allocate(18).apply {
        putInt(0x00006699)
        putShort(0)
        putInt(seq)
        putInt(cmd)
        putInt(12 + plaintext.size + 16)
    }.array()
    val sealed = gcm(true, key, iv, header.copyOfRange(4, 18), plaintext)
    return header + iv + sealed + byteArrayOf(0, 0, 0x99.toByte(), 0x66)
}

class TuyaFrame(val gcm: Boolean, val seq: Int, val cmd: Int, val body: ByteArray, val aad: ByteArray?)

/** Splits a byte stream into frames, and returns what is left over. */
fun splitTuyaFrames(buf: ByteArray, hmac: Boolean = false): Pair<List<TuyaFrame>, ByteArray> {
    val frames = mutableListOf<TuyaFrame>()
    val bb = ByteBuffer.wrap(buf)
    var offset = 0
    while (buf.size - offset >= 20) {
        when (bb.getInt(offset)) {
            0x000055aa -> {
                val total = 16 + bb.getInt(offset + 12)
                if (total < 24 || buf.size - offset < total) break
                val tail = (if (hmac) 32 else 4) + 4
                frames += TuyaFrame(false, bb.getInt(offset + 4), bb.getInt(offset + 8), buf.copyOfRange(offset + 16, offset + total - tail), null)
                offset += total
            }
            0x00006699 -> {
                val len = bb.getInt(offset + 14)
                val total = 18 + len + 4
                if (len < 28 || buf.size - offset < total) break
                frames += TuyaFrame(true, bb.getInt(offset + 6), bb.getInt(offset + 10), buf.copyOfRange(offset + 18, offset + 18 + len), buf.copyOfRange(offset + 4, offset + 18))
                offset += total
            }
            else -> offset += 1
        }
    }
    return frames to buf.copyOfRange(offset, buf.size)
}

fun decrypt6699(frame: TuyaFrame, key: ByteArray): ByteArray =
    gcm(false, key, frame.body.copyOfRange(0, 12), frame.aad, frame.body.copyOfRange(12, frame.body.size))

/** A device puts a 4-byte return code (0 or 1) in front of what it sends. */
internal fun stripReturnCode(buf: ByteArray): ByteArray =
    if (buf.size >= 4 && buf[0] == 0.toByte() && buf[1] == 0.toByte() && buf[2] == 0.toByte() && buf[3] in 0..1) buf.copyOfRange(4, buf.size) else buf

/** Control messages from 3.3 on carry "3.x" and 12 zero bytes in front of the data. */
internal fun stripVersionHeader(buf: ByteArray): ByteArray =
    if (buf.size >= 15 && buf[0] == '3'.code.toByte() && buf[1] == '.'.code.toByte()) buf.copyOfRange(15, buf.size) else buf

private fun versionHeader(version: String): ByteArray = version.toByteArray() + ByteArray(12)

private fun parseJson(buf: ByteArray): JsonObject? {
    val text = buf.decodeToString().trimEnd('\u0000').trim()
    if (text.isEmpty()) return null
    return runCatching { Json.parseToJsonElement(text).jsonObject }.getOrNull()
}

// ── Discovery ────────────────────────────────────────────────────────────────

data class TuyaBroadcast(val id: String, val ip: String, val version: String, val productKey: String)

/** Reads one broadcast. Null when it is not a device announcing itself. */
fun parseTuyaBroadcast(bytes: ByteArray, fromIp: String): TuyaBroadcast? = runCatching {
    val frame = splitTuyaFrames(bytes).first.firstOrNull() ?: return null
    val json = if (frame.gcm) {
        parseJson(stripReturnCode(decrypt6699(frame, TUYA_BROADCAST_KEY)))
    } else {
        val body = stripReturnCode(frame.body)
        parseJson(body) ?: parseJson(aesEcb(TUYA_BROADCAST_KEY, body, false))
    } ?: return null
    val id = json["gwId"]?.jsonPrimitive?.contentOrNull ?: return null
    TuyaBroadcast(
        id = id,
        ip = json["ip"]?.jsonPrimitive?.contentOrNull ?: fromIp,
        version = json["version"]?.jsonPrimitive?.contentOrNull ?: "3.3",
        productKey = json["productKey"]?.jsonPrimitive?.contentOrNull.orEmpty(),
    )
}.getOrNull()

/** The "where are you?" call the Smart Life app broadcasts. Version 3.5 bulbs only answer this. */
fun tuyaAppProbe(localIp: String): ByteArray =
    encode6699(0, TuyaCmd.APP_PROBE, """{"from":"app","ip":"$localIp"}""".toByteArray(), TUYA_BROADCAST_KEY)

class TuyaDiscovery(private val binder: NetworkBinder = object : NetworkBinder {}) {
    suspend fun scan(windowMs: Int = 7000, targets: List<String> = listOf("255.255.255.255")): List<TuyaBroadcast> =
        withContext(Dispatchers.IO) {
            val found = java.util.concurrent.ConcurrentHashMap<String, TuyaBroadcast>()
            val deadline = System.currentTimeMillis() + windowMs
            coroutineScope {
                TUYA_BROADCAST_PORTS.map { port ->
                    async {
                        val socket = runCatching {
                            DatagramSocket(null).apply {
                                reuseAddress = true
                                broadcast = true
                                bind(InetSocketAddress(port))
                            }
                        }.getOrNull() ?: return@async
                        socket.use { sock ->
                            runCatching { binder.bind(sock) }
                            if (port == 7000) {
                                val ask = {
                                    for (ip in localIpv4()) {
                                        val probe = tuyaAppProbe(ip)
                                        for (target in targets) {
                                            runCatching { sock.send(DatagramPacket(probe, probe.size, InetAddress.getByName(target), 7000)) }
                                        }
                                    }
                                }
                                ask()
                                launch {
                                    delay(1500)
                                    runCatching { ask() }
                                    delay(2000)
                                    runCatching { ask() }
                                }
                            }
                            val packet = DatagramPacket(ByteArray(2048), 2048)
                            while (true) {
                                val left = deadline - System.currentTimeMillis()
                                if (left <= 0) break
                                sock.soTimeout = left.toInt()
                                packet.setLength(packet.data.size)
                                try {
                                    sock.receive(packet)
                                } catch (_: SocketTimeoutException) {
                                    break
                                }
                                val bytes = packet.data.copyOf(packet.length)
                                parseTuyaBroadcast(bytes, packet.address.hostAddress.orEmpty())?.let { found[it.id] = it }
                            }
                        }
                    }
                }.awaitAll()
            }
            found.values.toList()
        }

    private fun localIpv4(): List<String> = runCatching {
        NetworkInterface.getNetworkInterfaces().toList()
            .filter { it.isUp && !it.isLoopback }
            .flatMap { it.inetAddresses.toList() }
            .filterIsInstance<Inet4Address>()
            .map { it.hostAddress.orEmpty() }
    }.getOrDefault(emptyList())
}

// ── One connection to one device ─────────────────────────────────────────────

class TuyaConnection(
    private val id: String,
    private val ip: String,
    localKey: String,
    private val version: String = "3.3",
    private val port: Int = TUYA_PORT,
    private val timeoutMs: Int = 5000,
    private val binder: NetworkBinder = object : NetworkBinder {},
) : Closeable {
    private val localKey = localKey.toByteArray()
    private val v = version.toDoubleOrNull() ?: 3.3
    private var sessionKey: ByteArray? = null
    private var seq = 1
    private val socket = Socket()
    private var buffer = ByteArray(0)
    private val inbox = ArrayDeque<Message>()

    private class Message(val cmd: Int, val payload: ByteArray?)

    init {
        if (this.localKey.size != 16) throw TuyaException("This light has no valid local key. Find your lights again to fetch it.")
    }

    private fun key() = sessionKey ?: localKey

    fun connect() {
        try {
            binder.bind(socket)
            socket.connect(InetSocketAddress(ip, port), timeoutMs)
            socket.soTimeout = timeoutMs
        } catch (e: IOException) {
            throw TuyaException(
                if (e is SocketTimeoutException) "No answer from the light at $ip. Check that it is powered on and on this Wi-Fi network."
                else "Could not connect to the light at $ip (${e.message ?: "connection failed"}).",
            )
        }
        if (v >= 3.4) negotiate()
    }

    override fun close() {
        runCatching { socket.close() }
    }

    private fun send(cmd: Int, plaintext: ByteArray) {
        val s = seq++
        val frame = when {
            v >= 3.5 -> encode6699(s, cmd, plaintext, key())
            v >= 3.4 -> encode55aa(s, cmd, aesEcb(key(), plaintext, true), key())
            else -> {
                var payload = aesEcb(localKey, plaintext, true)
                if (cmd == TuyaCmd.CONTROL) payload = versionHeader(version) + payload
                encode55aa(s, cmd, payload)
            }
        }
        socket.getOutputStream().run {
            write(frame)
            flush()
        }
    }

    private fun decrypt(frame: TuyaFrame): ByteArray? = runCatching {
        if (frame.gcm) return@runCatching stripReturnCode(decrypt6699(frame, key()))
        var body = stripReturnCode(frame.body)
        if (body.isEmpty()) return@runCatching body
        if (v >= 3.4) return@runCatching aesEcb(key(), body, false)
        body = stripVersionHeader(body)
        if (body[0] == '{'.code.toByte()) body else aesEcb(localKey, body, false)
    }.getOrNull()

    private fun waitFor(what: String, match: (Message) -> Boolean): Message {
        inbox.firstOrNull(match)?.let {
            inbox.remove(it)
            return it
        }
        val chunk = ByteArray(4096)
        val deadline = System.currentTimeMillis() + timeoutMs
        while (true) {
            val left = deadline - System.currentTimeMillis()
            if (left <= 0) throw TuyaException("The light at $ip did not answer $what. Its local key may be wrong; find your lights again.")
            socket.soTimeout = left.toInt()
            val n = try {
                socket.getInputStream().read(chunk)
            } catch (_: SocketTimeoutException) {
                continue
            } catch (e: IOException) {
                throw TuyaException("The light closed the connection. Its local key may be wrong; find your lights again.")
            }
            if (n < 0) throw TuyaException("The light closed the connection. Its local key may be wrong; find your lights again.")
            buffer += chunk.copyOf(n)
            val (frames, rest) = splitTuyaFrames(buffer, hmac = v >= 3.4 && v < 3.5)
            buffer = rest
            for (frame in frames) {
                val message = Message(frame.cmd, decrypt(frame))
                if (match(message)) {
                    return message
                }
                inbox.addLast(message)
            }
        }
    }

    private fun negotiate() {
        val localNonce = ByteArray(16).also(random::nextBytes)
        send(TuyaCmd.SESS_KEY_NEG_START, localNonce)
        val reply = waitFor("the key exchange") { it.cmd == TuyaCmd.SESS_KEY_NEG_RESP }.payload
        val refused = TuyaException("The light refused the local key. Find your lights again to fetch a fresh key.")
        if (reply == null || reply.size < 48) throw refused
        val payload = if (reply.size >= 52) reply.copyOfRange(reply.size - 48, reply.size) else reply
        val remoteNonce = payload.copyOfRange(0, 16)
        if (!MessageDigest.isEqual(payload.copyOfRange(16, 48), hmacSha256(localKey, localNonce))) throw refused
        send(TuyaCmd.SESS_KEY_NEG_FINISH, hmacSha256(localKey, remoteNonce))
        sessionKey = tuyaSessionKey(localKey, localNonce, remoteNonce, v)
    }

    /** The device's data points, such as {"20": true, "22": 1000}. */
    fun status(): JsonObject {
        val t = (System.currentTimeMillis() / 1000).toString()
        val query = buildJsonObject {
            put("gwId", id)
            put("devId", id)
            put("uid", id)
            put("t", t)
        }
        val cmd = if (v >= 3.4) TuyaCmd.DP_QUERY_NEW else TuyaCmd.DP_QUERY
        send(cmd, query.toString().toByteArray())
        val reply = waitFor("a status request") { (it.cmd == cmd || it.cmd == TuyaCmd.STATUS) && dpsOf(it.payload) != null }
        return dpsOf(reply.payload)!!
    }

    fun setDps(dps: JsonObject) {
        val t = System.currentTimeMillis() / 1000
        if (v >= 3.4) {
            val json = buildJsonObject {
                put("protocol", 5)
                put("t", t)
                putJsonObject("data") { put("dps", dps) }
            }
            send(TuyaCmd.CONTROL_NEW, versionHeader(version) + json.toString().toByteArray())
            waitFor("a command") { it.cmd == TuyaCmd.CONTROL_NEW || it.cmd == TuyaCmd.STATUS }
        } else {
            val json = buildJsonObject {
                put("devId", id)
                put("uid", id)
                put("t", t.toString())
                put("dps", dps)
            }
            send(TuyaCmd.CONTROL, json.toString().toByteArray())
            waitFor("a command") { it.cmd == TuyaCmd.CONTROL || it.cmd == TuyaCmd.STATUS }
        }
    }

    private fun dpsOf(payload: ByteArray?): JsonObject? {
        if (payload == null || payload.isEmpty()) return null
        val json = parseJson(stripVersionHeader(payload)) ?: return null
        return (json["dps"] ?: json["data"]?.jsonObject?.get("dps"))?.let { it as? JsonObject }
    }
}

/** The key both sides derive from the two nonces: AES-ECB for 3.4, AES-GCM for 3.5. */
fun tuyaSessionKey(localKey: ByteArray, localNonce: ByteArray, remoteNonce: ByteArray, version: Double): ByteArray {
    val mixed = ByteArray(16) { (localNonce[it].toInt() xor remoteNonce[it].toInt()).toByte() }
    return if (version >= 3.5) {
        gcm(true, localKey, localNonce.copyOfRange(0, 12), null, mixed).copyOfRange(0, 16)
    } else {
        aesEcb(localKey, mixed, true, pad = false)
    }
}

// ── Light state ↔ data points ────────────────────────────────────────────────

private const val KELVIN_MIN = 2700
private const val KELVIN_MAX = 6500

/** Which data points a device uses: "v2" (20-24), "v1" (1-5) or "switch" (on/off only). */
fun detectTuyaSchema(dps: JsonObject): String = when {
    "20" in dps -> "v2"
    "1" in dps && ("3" in dps || "2" in dps) -> "v1"
    "1" in dps -> "switch"
    else -> "v2"
}

private fun clampD(v: Double, lo: Double, hi: Double) = minOf(hi, maxOf(lo, v))

private class HsvD(val h: Int, val s: Double, val v: Double)

private fun tuyaHexToRgb(hex: String): DoubleArray {
    val h = hex.removePrefix("#").padEnd(6, 'f')
    return doubleArrayOf(h.substring(0, 2).toInt(16).toDouble(), h.substring(2, 4).toInt(16).toDouble(), h.substring(4, 6).toInt(16).toDouble())
}

private fun tuyaRgbToHex(rgb: DoubleArray): String =
    "#" + rgb.joinToString("") { jsRound(clampD(it, 0.0, 255.0)).toString(16).padStart(2, '0') }

private fun tuyaRgbToHsv(rgb: DoubleArray): HsvD {
    val (rn, gn, bn) = Triple(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255)
    val max = maxOf(rn, gn, bn)
    val min = minOf(rn, gn, bn)
    val d = max - min
    var h = 0.0
    if (d != 0.0) {
        h = when (max) {
            rn -> ((gn - bn) / d) % 6
            gn -> (bn - rn) / d + 2
            else -> (rn - gn) / d + 4
        }
        h *= 60
        if (h < 0) h += 360
    }
    return HsvD(jsRound(h), if (max != 0.0) d / max else 0.0, max)
}

private fun tuyaHsvToRgb(h: Double, s: Double, v: Double): DoubleArray {
    val c = v * s
    val x = c * (1 - kotlin.math.abs(((h / 60) % 2) - 1))
    val m = v - c
    val (r, g, b) = when {
        h < 60 -> Triple(c, x, 0.0)
        h < 120 -> Triple(x, c, 0.0)
        h < 180 -> Triple(0.0, c, x)
        h < 240 -> Triple(0.0, x, c)
        h < 300 -> Triple(x, 0.0, c)
        else -> Triple(c, 0.0, x)
    }
    return doubleArrayOf((r + m) * 255, (g + m) * 255, (b + m) * 255)
}

private fun hex4(n: Double) = jsRound(n).toString(16).padStart(4, '0')

/** The data points that make a device match a Smart Home light. */
fun tuyaDpsFromLight(light: Light, schema: String): JsonObject {
    val on = light.on
    val pct = clamp(light.brightness, 1, 100)
    val kelvin = clamp(light.kelvin, KELVIN_MIN, KELVIN_MAX)
    val warmth = (kelvin - KELVIN_MIN).toDouble() / (KELVIN_MAX - KELVIN_MIN)
    val colour = light.colorMode == "rgb"
    return buildJsonObject {
        when (schema) {
            "switch" -> put("1", on)
            "v1" -> {
                put("1", on)
                if (!on) return@buildJsonObject
                if (colour) {
                    val hsv = tuyaRgbToHsv(tuyaHexToRgb(light.colorHex))
                    val scaled = tuyaRgbToHex(tuyaHsvToRgb(hsv.h.toDouble(), hsv.s, pct / 100.0)).substring(1)
                    val legacy = scaled + hex4(hsv.h.toDouble()) +
                        jsRound(hsv.s * 255).toString(16).padStart(2, '0') +
                        jsRound(pct / 100.0 * 255).toString(16).padStart(2, '0')
                    put("2", "colour")
                    put("5", legacy)
                } else {
                    put("2", "white")
                    put("3", jsRound(25 + ((pct - 1) / 99.0) * 230))
                    put("4", jsRound(warmth * 255))
                }
            }
            else -> {
                put("20", on)
                if (!on) return@buildJsonObject
                if (colour) {
                    val hsv = tuyaRgbToHsv(tuyaHexToRgb(light.colorHex))
                    put("21", "colour")
                    put("24", hex4(hsv.h.toDouble()) + hex4(hsv.s * 1000) + hex4(pct * 10.0))
                } else {
                    put("21", "white")
                    put("22", jsRound(10 + ((pct - 1) / 99.0) * 990))
                    put("23", jsRound(warmth * 1000))
                }
            }
        }
    }
}

/** A device's state in Smart Home terms. Null fields are ones the device did not report. */
data class TuyaLightState(
    val on: Boolean? = null,
    val brightness: Int? = null,
    val kelvin: Int? = null,
    val colorMode: String? = null,
    val colorHex: String? = null,
)

private fun JsonElement.number(): Double? = jsonPrimitive.doubleOrNull
private fun JsonElement.truthy(): Boolean = jsonPrimitive.booleanOrNull ?: (jsonPrimitive.doubleOrNull?.let { it != 0.0 } ?: false)

fun tuyaLightFromDps(dps: JsonObject, schema: String = detectTuyaSchema(dps)): TuyaLightState {
    if (schema == "switch") return TuyaLightState(on = dps["1"]?.truthy() ?: false)
    val keys = if (schema == "v1") listOf("1", "2", "3", "4", "5") else listOf("20", "21", "22", "23", "24")
    val (sw, mode, bright, temp, colourKey) = keys
    val v1 = schema == "v1"
    var state = TuyaLightState(colorMode = if (dps[mode]?.jsonPrimitive?.contentOrNull == "colour") "rgb" else "kelvin")
    dps[sw]?.let { state = state.copy(on = it.truthy()) }
    dps[bright]?.number()?.let { raw ->
        val pct = if (v1) 1 + ((raw - 25) / 230) * 99 else 1 + ((raw - 10) / 990) * 99
        state = state.copy(brightness = clamp(jsRound(pct), 1, 100))
    }
    dps[temp]?.number()?.let { raw ->
        val warmth = raw / (if (v1) 255 else 1000)
        state = state.copy(kelvin = jsRound((KELVIN_MIN + warmth * (KELVIN_MAX - KELVIN_MIN)) / 100) * 100)
    }
    val c = dps[colourKey]?.jsonPrimitive?.contentOrNull
    if (state.colorMode == "rgb" && c != null) {
        if (!v1 && c.length >= 12) {
            val h = c.substring(0, 4).toInt(16).toDouble()
            val s = c.substring(4, 8).toInt(16) / 1000.0
            val v = c.substring(8, 12).toInt(16) / 1000.0
            state = state.copy(colorHex = tuyaRgbToHex(tuyaHsvToRgb(h, s, 1.0)), brightness = clamp(jsRound(v * 100), 1, 100))
        } else if (c.length >= 6) {
            state = state.copy(colorHex = "#" + c.substring(0, 6))
        }
    }
    return state
}

// ── Cloud ────────────────────────────────────────────────────────────────────

/** Tuya's request signature: HMAC-SHA256 over the ID, token, time and request, in upper-case hex. */
fun signTuyaRequest(accessId: String, accessSecret: String, accessToken: String, t: String, method: String, urlPath: String, body: String = ""): String {
    val bodyHash = MessageDigest.getInstance("SHA-256").digest(body.toByteArray()).hex()
    val stringToSign = listOf(method.uppercase(), bodyHash, "", urlPath).joinToString("\n")
    return hmacSha256(accessSecret.toByteArray(), (accessId + accessToken + t + stringToSign).toByteArray()).hex().uppercase()
}

/** Makes a GET request to Tuya's cloud. Throws IOException when nothing answers. */
fun interface TuyaHttp {
    fun get(url: String, headers: Map<String, String>): HttpReply
}

val DefaultTuyaHttp = TuyaHttp { url, headers ->
    val connection = URL(url).openConnection() as HttpsURLConnection
    try {
        connection.connectTimeout = 15_000
        connection.readTimeout = 15_000
        headers.forEach { (k, v) -> connection.setRequestProperty(k, v) }
        val status = connection.responseCode
        val stream = if (status in 200..399) connection.inputStream else connection.errorStream
        HttpReply(status, stream?.use { it.readBytes().decodeToString() }.orEmpty())
    } finally {
        connection.disconnect()
    }
}

data class TuyaCloudDevice(val id: String, val name: String, val localKey: String, val kind: String, val productName: String)

private fun explainTuyaError(code: Long?, msg: String, region: String): String {
    val where = TUYA_REGIONS.firstOrNull { it.id == region }?.name ?: region
    return when (code) {
        1004L -> "Tuya rejected the Access ID or Access Secret. Copy both again from the Overview page of your cloud project."
        2009L, 1005L -> "Tuya does not recognize this Access ID in the $where data center. Check the Access ID, and choose the data center your cloud project uses."
        1106L, 28841105L, 28841101L, 28841002L -> "Your cloud project is not allowed to read devices. In the project, open Service API and add IoT Core (it has a free trial), then try again."
        else -> "Tuya said: $msg (code $code)."
    }
}

private class TuyaCloudError(message: String, val code: Long?) : IOException(message)

class TuyaCloud(
    private val accessId: String,
    private val accessSecret: String,
    private val region: String,
    private val http: TuyaHttp = DefaultTuyaHttp,
    private val now: () -> Long = System::currentTimeMillis,
    private val baseUrl: String? = null,
) {
    private var token = ""

    private fun call(urlPath: String, auth: Boolean = true): JsonElement? {
        val host = baseUrl ?: "https://" + (TUYA_REGIONS.firstOrNull { it.id == region }?.host
            ?: throw TuyaCloudError("Choose the data center of your Tuya cloud project.", null))
        val t = now().toString()
        val accessToken = if (auth) token else ""
        val headers = mutableMapOf(
            "client_id" to accessId,
            "sign" to signTuyaRequest(accessId, accessSecret, accessToken, t, "GET", urlPath),
            "t" to t,
            "sign_method" to "HMAC-SHA256",
        )
        if (auth) headers["access_token"] = accessToken
        val reply = try {
            http.get(host + urlPath, headers)
        } catch (e: IOException) {
            throw TuyaCloudError("Could not reach Tuya (${e.message ?: "no connection"}). Check that this phone is online.", null)
        }
        val json = runCatching { Json.parseToJsonElement(reply.body).jsonObject }.getOrNull()
            ?: throw TuyaCloudError("Tuya answered HTTP ${reply.status} without data.", null)
        if (json["success"]?.jsonPrimitive?.booleanOrNull != true) {
            val code = json["code"]?.jsonPrimitive?.contentOrNull?.toLongOrNull()
            throw TuyaCloudError(explainTuyaError(code, json["msg"]?.jsonPrimitive?.contentOrNull ?: "unknown error", region), code)
        }
        return json["result"]
    }

    private fun normalize(o: JsonObject): TuyaCloudDevice? {
        fun s(vararg keys: String) = keys.firstNotNullOfOrNull { o[it]?.jsonPrimitive?.contentOrNull?.takeIf(String::isNotEmpty) }
        val id = s("id") ?: return null
        val category = s("category").orEmpty()
        return TuyaCloudDevice(
            id = id,
            name = s("name", "customName", "custom_name", "product_name", "productName") ?: "Tuya device",
            localKey = s("local_key", "localKey").orEmpty(),
            kind = when (category) {
                in LIGHT_CATEGORIES -> "light"
                in SWITCH_CATEGORIES -> "switch"
                else -> "other"
            },
            productName = s("product_name", "productName").orEmpty(),
        )
    }

    private fun listLinked(): List<JsonObject> {
        val all = mutableListOf<JsonObject>()
        var lastId = ""
        repeat(50) {
            val query = if (lastId.isNotEmpty()) "last_id=${URLEncoder.encode(lastId, "UTF-8")}&page_size=20" else "page_size=20"
            val result = call("/v2.0/cloud/thing/device?$query")
            val list = runCatching { result!!.jsonArray }.getOrNull()
                ?: runCatching { result!!.jsonObject["list"]!!.jsonArray }.getOrNull()
                ?: return all
            val page = list.mapNotNull { it as? JsonObject }
            all += page
            if (page.size < 20) return all
            lastId = page.last()["id"]?.jsonPrimitive?.contentOrNull ?: return all
        }
        return all
    }

    private fun listAssociated(): List<JsonObject> {
        val all = mutableListOf<JsonObject>()
        var lastRowKey = ""
        repeat(50) {
            val query = if (lastRowKey.isNotEmpty()) "last_row_key=${URLEncoder.encode(lastRowKey, "UTF-8")}&size=50" else "size=50"
            val result = call("/v1.0/iot-01/associated-users/devices?$query")?.jsonObject ?: return all
            all += result["devices"]?.jsonArray?.mapNotNull { it as? JsonObject }.orEmpty()
            if (result["has_more"]?.jsonPrimitive?.booleanOrNull != true) return all
            lastRowKey = result["last_row_key"]?.jsonPrimitive?.contentOrNull ?: return all
        }
        return all
    }

    /** Every device in the Smart Life accounts linked to the project. Throws IOException with a readable message. */
    fun listDevices(): List<TuyaCloudDevice> {
        token = call("/v1.0/token?grant_type=1", auth = false)?.jsonObject?.get("access_token")?.jsonPrimitive?.contentOrNull
            ?: throw TuyaCloudError("Tuya did not return an access token.", null)
        var raw = emptyList<JsonObject>()
        var firstError: TuyaCloudError? = null
        try {
            raw = listLinked()
        } catch (e: TuyaCloudError) {
            if (e.code == null || e.code == 1004L) throw e
            firstError = e
        }
        // Some projects only list linked-account devices through the older API.
        if (raw.isEmpty()) {
            try {
                raw = listAssociated()
            } catch (e: TuyaCloudError) {
                if (firstError != null) throw firstError
            }
        }
        return raw.mapNotNull(::normalize)
    }
}

// ── Saved keys and the service the app talks to ──────────────────────────────

@Serializable
data class TuyaSecrets(
    val accessId: String,
    val accessSecret: String,
    val region: String,
    /** Each device's local key, by device ID. */
    val keys: Map<String, String> = emptyMap(),
)

interface TuyaVault {
    fun load(): TuyaSecrets?
    fun save(secrets: TuyaSecrets)
    fun clear()
}

data class TuyaSetup(val connected: Boolean, val region: String, val accessIdEnding: String)

data class TuyaFoundDevice(
    val id: String,
    val name: String,
    val kind: String,
    val productName: String,
    val hasKey: Boolean,
    val ip: String?,
    val version: String?,
)

sealed interface TuyaFindResult {
    data class Found(val devices: List<TuyaFoundDevice>) : TuyaFindResult
    data class Failed(val message: String) : TuyaFindResult
}

data class TuyaRead(val schema: String, val state: TuyaLightState)

class TuyaService(
    private val vault: TuyaVault,
    private val http: TuyaHttp = DefaultTuyaHttp,
    private val discover: suspend () -> List<TuyaBroadcast> = { TuyaDiscovery().scan() },
    private val open: (id: String, ip: String, key: String, version: String) -> TuyaConnection = { id, ip, key, version ->
        TuyaConnection(id, ip, key, version)
    },
    private val now: () -> Long = System::currentTimeMillis,
) {
    @Volatile
    private var cached: TuyaSecrets? = null

    private fun secrets(): TuyaSecrets? = cached ?: vault.load().also { cached = it }

    fun setup(): TuyaSetup {
        val s = secrets()
        return TuyaSetup(connected = s != null, region = s?.region ?: "us", accessIdEnding = s?.accessId?.takeLast(4).orEmpty())
    }

    fun keyFor(deviceId: String): String? = secrets()?.keys?.get(deviceId)

    /**
     * Fetches the devices of the linked Smart Life account, saves their keys, and looks for
     * each one on this network. Credentials are saved only after Tuya accepts them.
     */
    suspend fun findLights(accessId: String, accessSecret: String, region: String): TuyaFindResult = coroutineScope {
        val saved = secrets()
        val id = accessId.trim().ifEmpty { saved?.accessId.orEmpty() }
        val secret = accessSecret.trim().ifEmpty { saved?.accessSecret.orEmpty() }
        val where = region.ifEmpty { saved?.region ?: "us" }
        if (id.isEmpty() || secret.isEmpty()) return@coroutineScope TuyaFindResult.Failed("Enter the Access ID and Access Secret of your Tuya cloud project.")
        val scan = async { discover() }
        val devices = try {
            withContext(Dispatchers.IO) { TuyaCloud(id, secret, where, http, now).listDevices() }
        } catch (e: IOException) {
            scan.await()
            return@coroutineScope TuyaFindResult.Failed(e.message ?: "Could not reach Tuya.")
        }
        val secrets = TuyaSecrets(id, secret, where, devices.filter { it.localKey.isNotEmpty() }.associate { it.id to it.localKey })
        vault.save(secrets)
        cached = secrets
        val onLan = scan.await().associateBy { it.id }
        if (devices.isEmpty()) {
            return@coroutineScope TuyaFindResult.Failed(
                "Tuya accepted your keys, but the linked Smart Life account has no devices. Link the account that paired the light: in the project, Devices, then Link App Account.",
            )
        }
        val order = mapOf("light" to 0, "switch" to 1, "other" to 2)
        TuyaFindResult.Found(
            devices.map { d ->
                val lan = onLan[d.id]
                TuyaFoundDevice(d.id, d.name, d.kind, d.productName, d.localKey.isNotEmpty(), lan?.ip, lan?.version)
            }.sortedWith(compareBy({ order[it.kind] ?: 3 }, { it.name })),
        )
    }

    /** Connects to a device to learn its data points and current state. */
    suspend fun readDevice(id: String, ip: String, version: String): TuyaRead = withContext(Dispatchers.IO) {
        val key = keyFor(id) ?: throw TuyaException("No key for this light. Find your lights again.")
        open(id, ip, key, version).use { conn ->
            conn.connect()
            val dps = conn.status()
            val schema = detectTuyaSchema(dps)
            TuyaRead(schema, tuyaLightFromDps(dps, schema))
        }
    }

    fun forget() {
        vault.clear()
        cached = null
    }

    fun connectionFor(id: String, ip: String, version: String): TuyaConnection {
        val key = keyFor(id) ?: throw TuyaException("No key for this light. Open Add Feit or Smart Life lights and find your lights again.")
        return open(id, ip, key, version)
    }
}

