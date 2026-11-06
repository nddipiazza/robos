package com.robos.smarthome.core

import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import java.net.ServerSocket
import java.security.MessageDigest
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
import kotlin.concurrent.thread

/** Feit / Smart Life (Tuya). The golden cases come from packages/robos-lib/tuya.js, checked on a real bulb. */
class TuyaTest {
    private val golden: JsonObject = Json.parseToJsonElement(
        javaClass.classLoader!!.getResource("golden.json")!!.readText(),
    ).jsonObject["tuya"]!!.jsonObject

    private fun hex(text: String) = ByteArray(text.length / 2) { text.substring(it * 2, it * 2 + 2).toInt(16).toByte() }
    private val key = "abcdefghijklmnop".toByteArray()

    private fun lightFrom(json: JsonObject) = Light(
        id = "l", name = "l", protocolId = "tuya-lan", ip = "1.2.3.4", port = TUYA_PORT,
        on = json["on"]!!.jsonPrimitive.content.toBoolean(),
        brightness = json["brightness"]!!.jsonPrimitive.int,
        colorMode = json["colorMode"]!!.jsonPrimitive.content,
        colorHex = json["colorHex"]!!.jsonPrimitive.content,
        kelvin = json["kelvin"]!!.jsonPrimitive.int,
    )

    private fun stateJson(s: TuyaLightState) = JsonObject(
        buildMap {
            s.on?.let { put("on", JsonPrimitive(it)) }
            s.brightness?.let { put("brightness", JsonPrimitive(it)) }
            s.kelvin?.let { put("kelvin", JsonPrimitive(it)) }
            s.colorMode?.let { put("colorMode", JsonPrimitive(it)) }
            s.colorHex?.let { put("colorHex", JsonPrimitive(it)) }
        },
    )

    @Test
    fun dataPointsMatchDesktop() {
        for (case in golden["dps"]!!.jsonArray.map { it.jsonObject }) {
            val schema = case["schema"]!!.jsonPrimitive.content
            val dps = tuyaDpsFromLight(lightFrom(case["light"]!!.jsonObject), schema)
            assertEquals("$case", case["dps"], dps)
            assertEquals("$case", case["back"], stateJson(tuyaLightFromDps(dps, schema)))
        }
    }

    @Test
    fun framesMatchDesktopByteForByte() {
        val iv = hex("000102030405060708090a0b")
        for (case in golden["frames"]!!.jsonArray.map { it.jsonObject }) {
            val plain = hex(case["plainHex"]!!.jsonPrimitive.content)
            val seq = case["seq"]!!.jsonPrimitive.int
            val cmd = case["cmd"]!!.jsonPrimitive.int
            val frame = when (case["kind"]!!.jsonPrimitive.content) {
                "6699" -> encode6699(seq, cmd, plain, key, iv)
                "55aa-crc" -> encode55aa(seq, cmd, plain)
                else -> encode55aa(seq, cmd, plain, hmacKey = key)
            }
            assertEquals(case["kind"]!!.jsonPrimitive.content, case["frameHex"]!!.jsonPrimitive.content, frame.joinToString("") { "%02x".format(it) })
        }
    }

    @Test
    fun signaturesMatchDesktop() {
        for (case in golden["sign"]!!.jsonArray.map { it.jsonObject }) {
            fun s(k: String) = case[k]!!.jsonPrimitive.content
            assertEquals(s("sign"), signTuyaRequest(s("accessId"), s("accessSecret"), s("accessToken"), s("t"), s("method"), s("urlPath")))
        }
    }

    @Test
    fun readsTheBroadcastOfARealBulb() {
        val b = golden["broadcast"]!!.jsonObject
        val parsed = parseTuyaBroadcast(hex(b["frameHex"]!!.jsonPrimitive.content), "192.168.1.66")!!
        val expected = b["parsed"]!!.jsonObject
        assertEquals(expected["id"]!!.jsonPrimitive.content, parsed.id)
        assertEquals(expected["ip"]!!.jsonPrimitive.content, parsed.ip)
        assertEquals(expected["version"]!!.jsonPrimitive.content, parsed.version)
    }

    @Test
    fun theAppProbeIsNotALight() {
        assertNull(parseTuyaBroadcast(tuyaAppProbe("192.168.1.18"), "192.168.1.18"))
    }

    @Test
    fun sessionKeysMatchDesktop() {
        val k = golden["sessionKeys"]!!.jsonObject
        val local = hex(k["localHex"]!!.jsonPrimitive.content)
        val remote = hex(k["remoteHex"]!!.jsonPrimitive.content)
        assertArrayEquals(hex(k["v34Hex"]!!.jsonPrimitive.content), tuyaSessionKey(key, local, remote, 3.4))
        assertArrayEquals(hex(k["v35Hex"]!!.jsonPrimitive.content), tuyaSessionKey(key, local, remote, 3.5))
    }

    // ── A fake bulb on 127.0.0.1 ────────────────────────────────────────────

    private class FakeBulb(val version: String, deviceKey: String = "abcdefghijklmnop", val dps: MutableMap<String, Any> = mutableMapOf("20" to false, "21" to "white", "22" to 1000, "23" to 0)) {
        val server = ServerSocket(0)
        val port get() = server.localPort
        val received = mutableListOf<String>()
        private val local = deviceKey.toByteArray()
        private val v = version.toDouble()

        init {
            thread(isDaemon = true) { runCatching { server.accept().use(::serve) } }
        }

        private fun ecb(k: ByteArray, data: ByteArray, enc: Boolean, pad: Boolean = true) = aesEcb(k, data, enc, pad)

        private fun serve(sock: java.net.Socket) {
            var session: ByteArray? = null
            var clientNonce = ByteArray(0)
            var deviceNonce = ByteArray(0)
            var buf = ByteArray(0)
            var seq = 100
            val out = sock.getOutputStream()
            fun reply(cmd: Int, plain: ByteArray) {
                seq += 1
                val ret = ByteArray(4)
                val frame = when {
                    v >= 3.5 -> encode6699(seq, cmd, ret + plain, session ?: local)
                    v >= 3.4 -> encode55aa(seq, cmd, ret + (if (plain.isEmpty()) plain else ecb(session ?: local, plain, true)), session ?: local)
                    else -> encode55aa(seq, cmd, ret + (if (plain.isEmpty()) plain else ecb(local, plain, true)))
                }
                out.write(frame)
                out.flush()
            }
            val chunk = ByteArray(4096)
            while (true) {
                val n = sock.getInputStream().read(chunk)
                if (n < 0) return
                buf += chunk.copyOf(n)
                val (frames, rest) = splitTuyaFrames(buf, hmac = v >= 3.4 && v < 3.5)
                buf = rest
                for (f in frames) {
                    val plain = try {
                        when {
                            v >= 3.5 -> decrypt6699(f, session ?: local)
                            v >= 3.4 -> ecb(session ?: local, f.body, false)
                            else -> ecb(local, if (f.cmd == TuyaCmd.CONTROL) f.body.copyOfRange(15, f.body.size) else f.body, false)
                        }
                    } catch (_: Exception) {
                        sock.close() // A real bulb hangs up on a frame it cannot read.
                        return
                    }
                    when (f.cmd) {
                        TuyaCmd.SESS_KEY_NEG_START -> {
                            clientNonce = plain
                            deviceNonce = ByteArray(16) { (it * 7).toByte() }
                            reply(TuyaCmd.SESS_KEY_NEG_RESP, deviceNonce + hmacSha256(local, clientNonce))
                        }
                        TuyaCmd.SESS_KEY_NEG_FINISH -> {
                            check(MessageDigest.isEqual(plain, hmacSha256(local, deviceNonce)))
                            val mixed = ByteArray(16) { (clientNonce[it].toInt() xor deviceNonce[it].toInt()).toByte() }
                            session = if (v >= 3.5) {
                                Cipher.getInstance("AES/GCM/NoPadding").run {
                                    init(Cipher.ENCRYPT_MODE, SecretKeySpec(local, "AES"), GCMParameterSpec(128, clientNonce.copyOfRange(0, 12)))
                                    doFinal(mixed).copyOfRange(0, 16)
                                }
                            } else {
                                ecb(local, mixed, true, pad = false)
                            }
                        }
                        TuyaCmd.DP_QUERY, TuyaCmd.DP_QUERY_NEW -> {
                            val body = dps.entries.joinToString(",") { (k, value) -> "\"$k\":" + if (value is String) "\"$value\"" else "$value" }
                            reply(f.cmd, "{\"devId\":\"x\",\"dps\":{$body}}".toByteArray())
                        }
                        TuyaCmd.CONTROL, TuyaCmd.CONTROL_NEW -> {
                            val json = Json.parseToJsonElement(plain.decodeToString().replace(Regex("^3\\.\\d\u0000{12}"), "")).jsonObject
                            val changed = (json["dps"] ?: json["data"]!!.jsonObject["dps"])!!.jsonObject
                            received += changed.toString()
                            reply(f.cmd, ByteArray(0))
                        }
                    }
                }
            }
        }
    }

    @Test
    fun readsAndSetsEveryProtocolVersion() {
        for (version in listOf("3.3", "3.4", "3.5")) {
            val bulb = FakeBulb(version)
            TuyaConnection("x", "127.0.0.1", "abcdefghijklmnop", version, bulb.port, timeoutMs = 2000).use { conn ->
                conn.connect()
                val dps = conn.status()
                assertEquals(version, "v2", detectTuyaSchema(dps))
                conn.setDps(JsonObject(mapOf("20" to JsonPrimitive(true), "22" to JsonPrimitive(500))))
            }
            assertEquals(version, listOf("""{"20":true,"22":500}"""), bulb.received)
        }
    }

    @Test
    fun aWrongKeyIsReportedNotHung() {
        val bulb = FakeBulb("3.5")
        try {
            TuyaConnection("x", "127.0.0.1", "WRONGKEYWRONGKEY", "3.5", bulb.port, timeoutMs = 2000).use { it.connect() }
            fail("A wrong key must not connect.")
        } catch (e: TuyaException) {
            assertTrue(e.message, e.message!!.contains("local key"))
        }
    }

    // ── Cloud and the service ───────────────────────────────────────────────

    private class MemoryVault : TuyaVault {
        var saved: TuyaSecrets? = null
        override fun load() = saved
        override fun save(secrets: TuyaSecrets) {
            saved = secrets
        }
        override fun clear() {
            saved = null
        }
    }

    /** Stands in for Tuya's cloud and checks each signature the way Tuya documents it. */
    private fun fakeCloud(devicesJson: String, failCode: Int? = null) = TuyaHttp { url, headers ->
        val path = url.removePrefix("https://openapi.tuyaus.com")
        val token = headers["access_token"].orEmpty()
        val expected = signTuyaRequest("ACCESSID", "SECRET", token, headers["t"]!!, "GET", path)
        when {
            headers["sign"] != expected -> HttpReply(200, """{"success":false,"code":1004,"msg":"sign invalid"}""")
            failCode != null -> HttpReply(200, """{"success":false,"code":$failCode,"msg":"No permissions"}""")
            path.startsWith("/v1.0/token") -> HttpReply(200, """{"success":true,"result":{"access_token":"TOKEN1"}}""")
            token != "TOKEN1" -> HttpReply(200, """{"success":false,"code":1010,"msg":"token invalid"}""")
            path.startsWith("/v2.0/cloud/thing/device") -> HttpReply(200, """{"success":true,"result":$devicesJson}""")
            else -> HttpReply(200, """{"success":true,"result":{"devices":[],"has_more":false}}""")
        }
    }

    @Test
    fun findsLinkedLightsAndKeepsKeysInTheVault() = runBlocking {
        val vault = MemoryVault()
        val service = TuyaService(
            vault,
            http = fakeCloud("""[{"id":"eb95","name":"Color Light","local_key":"abcdefghijklmnop","category":"dj","isOnline":true},{"id":"plug","name":"Porch Plug","local_key":"qrstuvwxyzabcdef","category":"cz"}]"""),
            discover = { listOf(TuyaBroadcast("eb95", "192.168.1.66", "3.5", "x")) },
        )
        val result = service.findLights("ACCESSID", "SECRET", "us") as TuyaFindResult.Found
        assertEquals(
            listOf(Triple("Color Light", "light", "192.168.1.66"), Triple("Porch Plug", "switch", null)),
            result.devices.map { Triple(it.name, it.kind, it.ip) },
        )
        assertEquals("abcdefghijklmnop", service.keyFor("eb95"))
        assertEquals("SSID", service.setup().accessIdEnding)
        assertEquals("SECRET", vault.saved!!.accessSecret)
    }

    @Test
    fun aWrongSecretIsExplainedAndNothingIsSaved() = runBlocking {
        val vault = MemoryVault()
        val service = TuyaService(vault, http = fakeCloud("[]"), discover = { emptyList() })
        val result = service.findLights("ACCESSID", "WRONG", "us") as TuyaFindResult.Failed
        assertTrue(result.message, result.message.contains("Access ID or Access Secret"))
        assertNull(vault.saved)
    }

    @Test
    fun aMissingIotCoreSubscriptionIsExplained() = runBlocking {
        val service = TuyaService(MemoryVault(), http = fakeCloud("[]", failCode = 28841105), discover = { emptyList() })
        val result = service.findLights("ACCESSID", "SECRET", "us") as TuyaFindResult.Failed
        assertTrue(result.message, result.message.contains("IoT Core"))
    }

    @Test
    fun anAddedLightGetsItsRealStateAndLaterChangesReachTheBulb() = runBlocking {
        val bulb = FakeBulb("3.5", dps = mutableMapOf("20" to true, "21" to "white", "22" to 1000, "23" to 263))
        val vault = MemoryVault()
        val service = TuyaService(
            vault,
            http = fakeCloud("""[{"id":"eb95","name":"Color Light","local_key":"abcdefghijklmnop","category":"dj"}]"""),
            discover = { listOf(TuyaBroadcast("eb95", "127.0.0.1", "3.5", "x")) },
            open = { id, ip, key, version -> TuyaConnection(id, ip, key, version, bulb.port, timeoutMs = 2000) },
        )
        val found = (service.findLights("ACCESSID", "SECRET", "us") as TuyaFindResult.Found).devices.single()
        val read = service.readDevice(found.id, found.ip!!, found.version!!)
        assertEquals(TuyaLightState(on = true, brightness = 100, kelvin = 3700, colorMode = "kelvin"), read.state)

        // The transport needs a second fake bulb connection, since the first one served the read.
        val bulb2 = FakeBulb("3.5")
        val engine = LightEngine(
            object : StateStore {
                override fun load(): HomeState? = null
                override fun save(state: HomeState) {}
            },
            SocketTransport(tuyaKey = service::keyFor),
            this,
        )
        val light = engine.saveTuyaLight(found.copy(ip = "127.0.0.1"), read, UNASSIGNED_ROOM_ID).copy(port = bulb2.port)
        assertEquals(listOf<String>(), bulb.received)
        // Point the saved light at the second fake bulb's port.
        val command = buildCommand(light.copy(on = false))
        val step = command.steps.single() as WireStep.Tuya
        assertEquals(SendResult.Confirmed, SocketTransport(tuyaKey = service::keyFor).send(step.copy(port = bulb2.port)))
        assertEquals(listOf("""{"20":false}"""), bulb2.received)
    }
}
