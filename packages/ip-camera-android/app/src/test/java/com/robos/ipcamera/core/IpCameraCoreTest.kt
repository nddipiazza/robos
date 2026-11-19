package com.robos.ipcamera.core

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.security.MessageDigest
import java.util.Base64

class IpCameraCoreTest {

    @Test
    fun rotationDegreesKeepBackAndFrontCamerasUpright() {
        // Back camera with 90° sensor orientation (Moto G100, OrientationEventListener CW degrees):
        assertEquals(90, computeRotationDegrees(90, isFrontFacing = false, deviceDegrees = 0))
        assertEquals(0, computeRotationDegrees(90, isFrontFacing = false, deviceDegrees = 270))
        assertEquals(270, computeRotationDegrees(90, isFrontFacing = false, deviceDegrees = 180))
        assertEquals(180, computeRotationDegrees(90, isFrontFacing = false, deviceDegrees = 90))

        // Front camera with 270° sensor orientation:
        assertEquals(270, computeRotationDegrees(270, isFrontFacing = true, deviceDegrees = 0))
        assertEquals(0, computeRotationDegrees(270, isFrontFacing = true, deviceDegrees = 270))

        // Fixed mounting override ignores gravity jitter:
        assertEquals(0, computeRotationDegrees(90, isFrontFacing = false, deviceDegrees = 0, mode = RotationMode.LANDSCAPE_LEFT))
    }

    @Test
    fun yuvToNv21RotatesAllFourAnglesAndDownsamplesCleanly() {
        val w = 16
        val h = 12
        val y = ByteArray(w * h) { idx -> (idx % 200).toByte() }
        val u = ByteArray((w / 2) * (h / 2)) { 90.toByte() }
        val v = ByteArray((w / 2) * (h / 2)) { 150.toByte() }
        val conv = YuvToNv21Converter()

        val r0 = conv.convert(y, w, u, w / 2, 1, v, w / 2, 1, w, h, rotationDegrees = 0)
        assertEquals(16, r0.width)
        assertEquals(12, r0.height)
        assertEquals(y[0], r0.bytes[0])
        // NV21 stores V then U after the Y plane.
        assertEquals(150.toByte(), r0.bytes[w * h])
        assertEquals(90.toByte(), r0.bytes[w * h + 1])

        val r90 = conv.convert(y, w, u, w / 2, 1, v, w / 2, 1, w, h, rotationDegrees = 90)
        assertEquals(12, r90.width)
        assertEquals(16, r90.height)

        val r180 = conv.convert(y, w, u, w / 2, 1, v, w / 2, 1, w, h, rotationDegrees = 180)
        assertEquals(16, r180.width)
        assertEquals(12, r180.height)
        assertEquals(y[w * h - 1], r180.bytes[0])

        val r270 = conv.convert(y, w, u, w / 2, 1, v, w / 2, 1, w, h, rotationDegrees = 270)
        assertEquals(12, r270.width)
        assertEquals(16, r270.height)

        // Substream downsampler clamps to valid even dimensions.
        val bigY = ByteArray(320 * 180) { 120.toByte() }
        val bigUv = ByteArray(160 * 90) { 128.toByte() }
        val big = conv.convert(bigY, 320, bigUv, 160, 1, bigUv, 160, 1, 320, 180, rotationDegrees = 0)
        Nv21Overlay.stamp(big, "LIVING ROOM | 2026-11-19 09:00:00")
        val sub = conv.downsampleHalf(big)
        assertEquals(160, sub.width)
        assertEquals(90, sub.height)
    }

    @Test
    fun motionDetectorTriggersAfterTwoFramesAndIgnoresLightingJumps() {
        val det = LumaMotionDetector(sampleWidth = 32, sampleHeight = 18, sensitivity = 60, minAreaPercent = 2.0f, cooldownMs = 1_000L)
        val quiet = ByteArray(32 * 18) { 60.toByte() }
        var now = 1_000L
        repeat(6) {
            now += 250L
            assertFalse(det.feedGray(quiet, now).motion)
        }

        // Whole-room brightness jump is treated as lighting, not motion.
        val brightRoom = ByteArray(32 * 18) { 210.toByte() }
        now += 250L
        val lightJump = det.feedGray(brightRoom, now)
        assertTrue(lightJump.lightingChange)
        assertFalse(lightJump.motion)

        // Localized moving object across >2% of pixels triggers on the 2nd frame.
        fun withBox(base: ByteArray, x0: Int): ByteArray {
            val copy = base.copyOf()
            for (y in 4 until 10) {
                for (x in x0 until (x0 + 6)) {
                    copy[y * 32 + x] = 30.toByte()
                }
            }
            return copy
        }
        now += 250L
        val first = det.feedGray(withBox(brightRoom, 4), now)
        assertFalse(first.started)

        now += 250L
        val second = det.feedGray(withBox(brightRoom, 6), now)
        assertTrue(second.started)
        assertTrue(second.motion)

        // Cooldown expires back to quiet.
        var ended = false
        repeat(8) {
            now += 250L
            if (det.feedGray(brightRoom, now).ended) ended = true
        }
        assertTrue(ended)
        assertFalse(det.active)
    }

    @Test
    fun wsDiscoveryAnswersOnvifProbesAndIgnoresProbeMatchesLoops() {
        val probe = """
            <?xml version="1.0" encoding="UTF-8"?>
            <e:Envelope xmlns:e="http://www.w3.org/2003/05/soap-envelope"
                        xmlns:w="http://schemas.xmlsoap.org/ws/2004/08/addressing"
                        xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery"
                        xmlns:dn="http://www.onvif.org/ver10/network/wsdl">
              <e:Header><w:MessageID>uuid:probe-1234</w:MessageID></e:Header>
              <e:Body><d:Probe><d:Types>dn:NetworkVideoTransmitter</d:Types></d:Probe></e:Body>
            </e:Envelope>
        """.trimIndent()

        val match = WsDiscoveryResponder.buildProbeMatchIfApplicable(
            probeXml = probe,
            deviceUuid = "cam-uuid-99",
            cameraName = "Living Room",
            room = "Living Room",
            hardware = "RobOS XT2125-4",
            xaddr = "http://192.168.1.65:8080/onvif/device_service",
        )
        assertNotNull(match)
        assertTrue(match!!.contains("<wsa:RelatesTo>uuid:probe-1234</wsa:RelatesTo>"))
        assertTrue(match.contains("urn:uuid:cam-uuid-99"))
        assertTrue(match.contains("onvif://www.onvif.org/name/Living%20Room"))
        assertTrue(match.contains("http://192.168.1.65:8080/onvif/device_service"))

        // Never answer our own ProbeMatches reply.
        assertNull(
            WsDiscoveryResponder.buildProbeMatchIfApplicable(
                probeXml = match,
                deviceUuid = "cam-uuid-99",
                cameraName = "Living Room",
                room = "Living Room",
                hardware = "RobOS XT2125-4",
                xaddr = "http://192.168.1.65:8080/onvif/device_service",
            ),
        )
    }

    @Test
    fun httpOnvifServerStreamsMjpegHandlesSoapPtzAndVerifiesAuth() {
        val hub = FrameHub()
        val sampleJpeg = byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 0xFF.toByte(), 0xE0.toByte(), 1, 2, 3, 0xFF.toByte(), 0xD9.toByte())
        hub.publishMain(sampleJpeg)

        var cfg = IpCameraConfig(cameraName = "Porch Cam", room = "Front Door", authEnabled = false)
        var lastPreset = ""
        var lastMove: PtzCommand? = null
        var secretPassword = "s3cret-password"

        val controller = object : CameraController {
            override fun currentConfig() = cfg
            override fun currentStatus() = CameraRuntimeStatus(
                running = true,
                streamState = StreamState.LIVE,
                wifiConnected = true,
                wifiIp = "127.0.0.1",
                port = cfg.port,
                width = 1280,
                height = 720,
                measuredFps = 10f,
                motionActive = true,
            )
            override fun modelName() = "Moto G100"
            override fun password() = secretPassword
            override fun onPtzMove(cmd: PtzCommand) { lastMove = cmd }
            override fun onPtzPreset(token: String) { lastPreset = token }
        }

        val server = HttpOnvifServer(controller, hub, bindHost = "127.0.0.1")
        server.start(0)
        try {
            val port = server.localPort
            val base = "http://127.0.0.1:$port"

            // 1. Snapshot returns exact JPEG bytes.
            val snapConn = (URL("$base/snapshot.jpg").openConnection() as HttpURLConnection)
            assertEquals(200, snapConn.responseCode)
            assertEquals("image/jpeg", snapConn.contentType)
            assertArrayEquals(sampleJpeg, snapConn.inputStream.readBytes())

            // 2. Multipart MJPEG stream delivers frame boundary and JPEG payload.
            val mjpegConn = (URL("$base/video").openConnection() as HttpURLConnection)
            assertEquals(200, mjpegConn.responseCode)
            assertTrue(mjpegConn.contentType.contains("multipart/x-mixed-replace"))
            val chunk = ByteArray(128)
            val readN = mjpegConn.inputStream.read(chunk)
            assertTrue(readN > 20)
            mjpegConn.disconnect()

            // 3. ONVIF SOAP GetProfiles, GetStreamUri and GotoPreset (open LAN mode).
            val streamSoap = postSoap("$base/onvif/media", "<trt:GetStreamUri><trt:ProfileToken>main</trt:ProfileToken></trt:GetStreamUri>")
            assertEquals(200, streamSoap.first)
            assertTrue(streamSoap.second.contains("<tt:Uri>$base/video</tt:Uri>"))

            val presetSoap = postSoap("$base/onvif/ptz", "<tptz:GotoPreset><tptz:PresetToken>2</tptz:PresetToken></tptz:GotoPreset>")
            assertEquals(200, presetSoap.first)
            assertEquals("2", lastPreset)

            val moveSoap = postSoap(
                "$base/onvif/ptz",
                "<tptz:ContinuousMove><tptz:Velocity><tt:PanTilt x=\"0.5\" y=\"-0.25\"/><tt:Zoom x=\"1.0\"/></tptz:Velocity></tptz:ContinuousMove>",
            )
            assertEquals(200, moveSoap.first)
            assertEquals(0.5f, lastMove?.pan ?: 0f, 0.01f)
            assertEquals(-0.25f, lastMove?.tilt ?: 0f, 0.01f)
            assertEquals(1.0f, lastMove?.zoom ?: 0f, 0.01f)

            // 4. Enable authentication: verify HTTP Basic Auth + OASIS WS-Security PasswordDigest.
            cfg = cfg.copy(authEnabled = true, username = "admin")

            val unauthSnap = (URL("$base/snapshot.jpg").openConnection() as HttpURLConnection)
            assertEquals(401, unauthSnap.responseCode)

            val basicToken = Base64.getEncoder().encodeToString("admin:$secretPassword".toByteArray(StandardCharsets.UTF_8))
            val authSnap = (URL("$base/snapshot.jpg").openConnection() as HttpURLConnection).apply {
                setRequestProperty("Authorization", "Basic $basicToken")
            }
            assertEquals(200, authSnap.responseCode)

            // Unauthenticated SOAP GetProfiles must fail with 400 Sender not Authorized, while GetSystemDateAndTime stays open.
            assertEquals(200, postSoap("$base/onvif/device_service", "<tds:GetSystemDateAndTime/>").first)
            assertEquals(400, postSoap("$base/onvif/media", "<trt:GetProfiles/>").first)

            // Signed WS-Security PasswordDigest matching agsh/onvif formula succeeds.
            val nonceBytes = "0123456789abcdef".toByteArray(StandardCharsets.US_ASCII)
            val created = "2026-11-19T14:00:00.000Z"
            val sha1 = MessageDigest.getInstance("SHA-1").apply {
                update(nonceBytes)
                update(created.toByteArray(StandardCharsets.US_ASCII))
                update(secretPassword.toByteArray(StandardCharsets.UTF_8))
            }
            val digestB64 = Base64.getEncoder().encodeToString(sha1.digest())
            val nonceB64 = Base64.getEncoder().encodeToString(nonceBytes)
            val authedSoap = """
                <s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope">
                  <s:Header>
                    <Security xmlns="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
                      <UsernameToken>
                        <Username>admin</Username>
                        <Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest">$digestB64</Password>
                        <Nonce>$nonceB64</Nonce>
                        <Created xmlns="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">$created</Created>
                      </UsernameToken>
                    </Security>
                  </s:Header>
                  <s:Body><trt:GetProfiles/></s:Body>
                </s:Envelope>
            """.trimIndent()
            val profilesResp = postRawSoap("$base/onvif/media", authedSoap)
            assertEquals(200, profilesResp.first)
            assertTrue(profilesResp.second.contains("MainStream"))
        } finally {
            server.stop()
        }
    }

    @Test
    fun fileConfigStoreClampsAndPersistsSettings() {
        val dir = Files.createTempDirectory("robos-ipcam-test").toFile()
        try {
            val store = FileConfigStore(File(dir, "ip-camera.json"))
            val saved = store.save(
                IpCameraConfig(
                    cameraName = "  Garage Cam  ",
                    port = 80, // clamped to >= 1024
                    fps = 99,  // clamped to <= 30
                    zoomRatio = 12f, // clamped to <= 8f
                ),
            )
            assertEquals("Garage Cam", saved.cameraName)
            assertEquals(1024, saved.port)
            assertEquals(30, saved.fps)
            assertEquals(8.0f, saved.zoomRatio, 0.01f)
            assertEquals("Garage Cam", store.load().cameraName)
        } finally {
            dir.deleteRecursively()
        }
    }

    private fun postSoap(url: String, bodyContent: String): Pair<Int, String> =
        postRawSoap(
            url,
            "<s:Envelope xmlns:s=\"http://www.w3.org/2003/05/soap-envelope\" xmlns:tds=\"http://www.onvif.org/ver10/device/wsdl\" xmlns:trt=\"http://www.onvif.org/ver10/media/wsdl\" xmlns:tptz=\"http://www.onvif.org/ver20/ptz/wsdl\" xmlns:tt=\"http://www.onvif.org/ver10/schema\"><s:Body>$bodyContent</s:Body></s:Envelope>",
        )

    private fun postRawSoap(url: String, fullXml: String): Pair<Int, String> {
        val conn = (URL(url).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            doOutput = true
            setRequestProperty("Content-Type", "application/soap+xml; charset=utf-8")
        }
        conn.outputStream.use { it.write(fullXml.toByteArray(StandardCharsets.UTF_8)) }
        val code = conn.responseCode
        val stream = if (code in 200..299) conn.inputStream else conn.errorStream
        val text = stream?.readBytes()?.toString(StandardCharsets.UTF_8).orEmpty()
        return code to text
    }
}
