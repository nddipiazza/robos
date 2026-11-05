package com.robos.smarthome.core

import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import com.sun.net.httpserver.HttpServer
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.ServerSocket
import kotlin.concurrent.thread

/** Real sockets on this computer's loopback, with no Android involved. */
class NetworkTest {
    private val loopback: InetAddress = InetAddress.getLoopbackAddress()
    private val ip: String = loopback.hostAddress!!

    private fun udpResponder(reply: (ByteArray) -> ByteArray?): DatagramSocket {
        val socket = DatagramSocket(0, loopback)
        thread(isDaemon = true) {
            val packet = DatagramPacket(ByteArray(4096), 4096)
            while (!socket.isClosed) {
                try {
                    packet.setLength(4096)
                    socket.receive(packet)
                } catch (_: Exception) {
                    break
                }
                val answer = reply(packet.data.copyOf(packet.length)) ?: continue
                socket.send(DatagramPacket(answer, answer.size, packet.address, packet.port))
            }
        }
        return socket
    }

    @Test
    fun udpReplyConfirmsTheLightGotIt() = runTest {
        udpResponder { "ok".toByteArray() }.use { device ->
            val result = SocketTransport().send(WireStep.Udp(ip, device.localPort, "hi".toByteArray(), expectsReply = true))
            assertEquals(SendResult.Confirmed, result)
        }
    }

    @Test
    fun udpSilenceIsReportedForProtocolsThatAnswer() = runTest {
        udpResponder { null }.use { device ->
            val result = SocketTransport().send(WireStep.Udp(ip, device.localPort, "hi".toByteArray(), expectsReply = true))
            assertTrue(result is SendResult.Failed)
        }
    }

    @Test
    fun udpRetriesOnce() = runTest {
        var seen = 0
        udpResponder { if (++seen == 2) "ok".toByteArray() else null }.use { device ->
            val result = SocketTransport().send(WireStep.Udp(ip, device.localPort, "hi".toByteArray(), expectsReply = true))
            assertEquals(SendResult.Confirmed, result)
            assertEquals(2, seen)
        }
    }

    @Test
    fun protocolsThatNeverAnswerCountAsSent() = runTest {
        udpResponder { null }.use { device ->
            val result = SocketTransport().send(WireStep.Udp(ip, device.localPort, "hi".toByteArray(), expectsReply = false))
            assertEquals(SendResult.Sent, result)
        }
    }

    @Test
    fun tcpSendsEveryLine() = runTest {
        ServerSocket(0, 1, loopback).use { server ->
            var received = ""
            val reader = thread { server.accept().use { received = it.getInputStream().readBytes().decodeToString() } }
            val result = SocketTransport().send(WireStep.Tcp(ip, server.localPort, listOf("one", "two")))
            reader.join(2000)
            assertEquals(SendResult.Sent, result)
            assertEquals("one\r\ntwo\r\n", received)
        }
    }

    @Test
    fun tcpReportsARefusedConnection() = runTest {
        val port = ServerSocket(0, 1, loopback).use { it.localPort }
        assertTrue(SocketTransport().send(WireStep.Tcp(ip, port, listOf("x"))) is SendResult.Failed)
    }

    private fun httpServer(status: Int, reply: String, seen: MutableList<String> = mutableListOf()): HttpServer =
        HttpServer.create(InetSocketAddress(loopback, 0), 0).apply {
            createContext("/") { exchange ->
                seen += "${exchange.requestMethod} ${exchange.requestURI} ${exchange.requestHeaders.getFirst("Authorization")} " +
                    exchange.requestBody.readBytes().decodeToString()
                val bytes = reply.toByteArray()
                exchange.sendResponseHeaders(status, bytes.size.toLong())
                exchange.responseBody.use { it.write(bytes) }
            }
            start()
        }

    @Test
    fun httpSendsTheBodyAndHeaders() = runTest {
        val seen = mutableListOf<String>()
        val server = httpServer(200, "{}", seen)
        try {
            val step = WireStep.Http(ip, server.address.port, "PUT", "/state", """{"on":true}""", mapOf("Authorization" to "Bearer t"))
            assertEquals(SendResult.Confirmed, SocketTransport().send(step))
            assertEquals("""PUT /state Bearer t {"on":true}""", seen.single())
        } finally {
            server.stop(0)
        }
    }

    @Test
    fun httpErrorsAreReported() = runTest {
        val server = httpServer(401, "{}")
        try {
            val result = SocketTransport().send(WireStep.Http(ip, server.address.port, "POST", "/", "{}"))
            assertTrue(result is SendResult.Failed && "401" in result.reason)
        } finally {
            server.stop(0)
        }
    }

    @Test
    fun aHueRefusalInsideHttp200IsReported() = runTest {
        val server = httpServer(200, """[{"error":{"type":1,"address":"/","description":"unauthorized user"}}]""")
        try {
            val result = SocketTransport().send(WireStep.Http(ip, server.address.port, "PUT", "/", "{}"))
            assertTrue(result is SendResult.Failed && "unauthorized user" in result.reason)
        } finally {
            server.stop(0)
        }
    }

    @Test
    fun hueSuccessRepliesAreNotErrors() {
        assertNull(bridgeError("""[{"success":{"/lights/1/state/on":true}}]"""))
        assertNull(bridgeError("""{"state":"ok"}"""))
        assertNull(bridgeError("[not json"))
    }

    // ── Scanning ─────────────────────────────────────────────────────────────

    @Test
    fun scanFindsLightsOfEachKindThatAnswers() = runTest {
        val kasaReply = encodeKasa("""{"system":{"get_sysinfo":{"alias":"Porch","light_state":{"on_off":1,"brightness":30}}}}""")
        val lifxReply = ByteArray(41).also { it[32] = LIFX_STATE_SERVICE.toByte() }
        udpResponder { """{"method":"getPilot","result":{"state":true,"dimming":55}}""".toByteArray() }.use { wiz ->
            udpResponder { kasaReply }.use { kasa ->
                udpResponder { lifxReply }.use { lifx ->
                    udpResponder { yeelightReply().toByteArray() }.use { yeelight ->
                        val targets = ScanTargets(
                            broadcast = listOf(ip),
                            multicast = ip,
                            wizPort = wiz.localPort,
                            kasaPort = kasa.localPort,
                            lifxPort = lifx.localPort,
                            yeelightPort = yeelight.localPort,
                            goveePort = 1,
                            goveeReplyPort = 0,
                        )
                        val found = UdpDiscovery(windowMs = 400).scan(targets).associateBy { it.protocolId }
                        assertEquals(55, found["wiz-udp"]?.brightness)
                        assertEquals(true, found["wiz-udp"]?.on)
                        assertEquals("Porch", found["kasa-lan"]?.name)
                        assertNotNull(found["lifx-udp"])
                        assertEquals("Desk Bar", found["yeelight-tcp"]?.name)
                        assertEquals(4, found.size)
                    }
                }
            }
        }
    }

    private fun yeelightReply() =
        "HTTP/1.1 200 OK\r\nLocation: yeelight://192.168.1.77:55443\r\nname: Desk Bar\r\npower: on\r\nbright: 60\r\n"

    @Test
    fun scanParsersIgnoreWhatTheyShould() {
        assertNull(parseWiz("not json", ip, 1))
        assertNull(parseWiz("""{"error":{}}""", ip, 1))
        // A Kasa plug answers the probe but has no light_state.
        val plug = encodeKasa("""{"system":{"get_sysinfo":{"alias":"Plug","relay_state":1}}}""")
        assertNull(parseKasa(plug, plug.size, ip, 9999))
        assertNull(parseLifx(ByteArray(10), 10, ip, 56700))
        assertNull(parseLifx(ByteArray(36), 36, ip, 56700))
        assertNull(parseYeelight("HTTP/1.1 200 OK\r\nLocation: http://router\r\n", ip))
        val yeelight = parseYeelight(yeelightReply(), "192.168.1.77")!!
        assertEquals(55443, yeelight.port)
        assertEquals(60, yeelight.brightness)
        val govee = parseGovee("""{"msg":{"cmd":"scan","data":{"ip":"192.168.1.8","sku":"H6199"}}}""", "10.0.0.1", 4003)!!
        assertEquals("192.168.1.8", govee.ip)
        assertTrue("H6199" in govee.name)
        assertNull(parseGovee("""{"msg":{"cmd":"devStatus","data":{}}}""", ip, 4003))
    }

    // ── LG ThinQ ─────────────────────────────────────────────────────────────

    private class MemoryVault(var value: ThinqCredentials? = null) : ThinqVault {
        override fun load() = value
        override fun save(credentials: ThinqCredentials) {
            value = credentials
        }

        override fun clear() {
            value = null
        }
    }

    private fun thinqServer(status: () -> Int = { 200 }, seen: MutableList<String> = mutableListOf()): HttpServer =
        HttpServer.create(InetSocketAddress(loopback, 0), 0).apply {
            createContext("/") { exchange ->
                val path = exchange.requestURI.path
                seen += "$path ${exchange.requestHeaders.getFirst("Authorization")} ${exchange.requestHeaders.getFirst("x-api-key")}"
                val code = status()
                val body = when {
                    code != 200 -> """{"error":{"code":"1306","message":"slow down"}}"""
                    path == "/devices" -> """{"response":[{"deviceId":"w1","deviceInfo":{"deviceType":"DEVICE_WASHER","alias":"Washer"}}]}"""
                    else -> """{"response":[{"runState":{"currentState":"RUNNING"}}]}"""
                }.toByteArray()
                exchange.sendResponseHeaders(code, body.size.toLong())
                exchange.responseBody.use { it.write(body) }
            }
            start()
        }

    private fun base(server: HttpServer) = "http://$ip:${server.address.port}"

    @Test
    fun theTokenIsSavedOnlyAfterLgAcceptsIt() = runTest {
        var status = 401
        val server = thinqServer({ status })
        val vault = MemoryVault()
        try {
            val service = ThinqService(vault, base(server))
            assertTrue(service.connect("", "US")!!.contains("Paste"))
            assertTrue(service.connect("t", "ZZ")!!.contains("supported country"))
            assertNotNull(service.connect("bad", "US"))
            assertNull(vault.value)
            status = 200
            assertNull(service.connect("good", "us"))
            assertEquals("good", vault.value?.token)
            assertEquals("US", vault.value?.countryCode)
            assertEquals("Running", service.overview.value.devices.single().units.single().status)
        } finally {
            server.stop(0)
        }
    }

    @Test
    fun requestsCarryLgsHeaders() = runTest {
        val seen = mutableListOf<String>()
        val server = thinqServer(seen = seen)
        try {
            ThinqService(MemoryVault(), base(server)).connect("secret", "US")
            assertTrue(seen.first().startsWith("/devices Bearer secret v6GFvkwe"))
            assertTrue(seen.last().startsWith("/devices/w1/state"))
        } finally {
            server.stop(0)
        }
    }

    @Test
    fun refreshesAreRateLimitedAndBackOff() = runTest {
        var time = 1_000_000L
        var status = 200
        val seen = mutableListOf<String>()
        val server = thinqServer({ status }, seen)
        try {
            val vault = MemoryVault(ThinqCredentials("t", "US", "c"))
            val service = ThinqService(vault, base(server), nowMs = { time })
            service.refresh()
            val afterFirst = seen.size
            service.refresh()
            assertEquals("too soon, no request", afterFirst, seen.size)
            time += THINQ_MIN_REFRESH_MS
            status = 429
            service.refresh()
            assertTrue(service.overview.value.error!!.contains("limiting"))
            val afterLimit = seen.size
            status = 200
            time += THINQ_MIN_REFRESH_MS
            service.refresh(force = true)
            assertEquals("backing off, no request", afterLimit, seen.size)
            time += THINQ_RATE_LIMIT_BACKOFF_MS
            service.refresh(force = true)
            assertNull(service.overview.value.error)
        } finally {
            server.stop(0)
        }
    }

    @Test
    fun forgettingRemovesTheToken() = runTest {
        val vault = MemoryVault(ThinqCredentials("t", "US", "c"))
        val service = ThinqService(vault, "http://$ip:1")
        assertTrue(service.overview.value.connected)
        service.disconnect()
        assertNull(vault.value)
        assertEquals(false, service.overview.value.connected)
    }
}
