package com.robos.smarthome.core

import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.nio.file.Files

class CamerasTest {
    @Test
    fun parsesOnvifWsDiscoveryProbeMatchFromRobosIpCamera() {
        val xml = """
            <?xml version="1.0" encoding="UTF-8"?>
            <SOAP-ENV:Envelope xmlns:SOAP-ENV="http://www.w3.org/2003/05/soap-envelope">
              <SOAP-ENV:Body><d:ProbeMatches><d:ProbeMatch>
                <wsa:EndpointReference><wsa:Address>urn:uuid:phone-cam-1</wsa:Address></wsa:EndpointReference>
                <d:Scopes>onvif://www.onvif.org/type/video_encoder onvif://www.onvif.org/name/Front%20Door onvif://www.onvif.org/hardware/RobOS%20XT2125-4 onvif://www.onvif.org/location/Living%20Room</d:Scopes>
                <d:XAddrs>http://192.168.1.65:8080/onvif/device_service</d:XAddrs>
              </d:ProbeMatch></d:ProbeMatches></SOAP-ENV:Body>
            </SOAP-ENV:Envelope>
        """.trimIndent()

        val found = CameraService.parseWsDiscoveryMatch(xml, "192.168.1.65")
        assertNotNull(found)
        assertEquals("urn:uuid:phone-cam-1", found!!.urn)
        assertEquals("Front Door", found.name)
        assertEquals("Living Room", found.roomHint)
        assertEquals("192.168.1.65", found.host)
        assertEquals(8080, found.port)
        assertTrue(found.isRobosIpCamera)
        assertEquals("http://192.168.1.65:8080/snapshot.jpg", found.snapshotUrl)
    }

    @Test
    fun mergesDiscoveredAndRestoredCamerasWithoutDuplicates() = runTest {
        val dir = Files.createTempDirectory("smart-cam-test").toFile()
        try {
            val svc = CameraService(File(dir, "smart-cameras.json"))
            val found = DiscoveredCamera(
                urn = "urn:uuid:phone-cam-1",
                name = "Moto G100 Camera",
                roomHint = "Living Room",
                host = "192.168.1.65",
                port = 8080,
                snapshotUrl = "http://192.168.1.65:8080/snapshot.jpg",
                streamUrl = "http://192.168.1.65:8080/video",
                isRobosIpCamera = true,
            )
            assertEquals(1, svc.mergeDiscovered(listOf(found), DEFAULT_ROOMS))
            assertEquals("living-room", svc.cameras.value.single().roomId)
            // Merging again updates in place without adding a duplicate.
            assertEquals(0, svc.mergeDiscovered(listOf(found), DEFAULT_ROOMS))
            assertEquals(1, svc.cameras.value.size)

            val desktopJson = """
                {
                  "version": 1,
                  "cameras": [
                    {
                      "id": "cam-1",
                      "name": "Porch Cam",
                      "kind": "onvif",
                      "streamUrl": "http://192.168.1.70:8080/video",
                      "snapshotUrl": "http://192.168.1.70:8080/snapshot.jpg",
                      "onvif": { "hostname": "192.168.1.70", "port": 8080 }
                    }
                  ]
                }
            """.trimIndent()
            assertEquals(1, svc.importDesktopCameras(desktopJson))
            assertEquals(2, svc.cameras.value.size)
        } finally {
            dir.deleteRecursively()
        }
    }
}
