package com.robos.ipcamera.core

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.net.DatagramPacket
import java.net.Inet4Address
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.MulticastSocket
import java.net.NetworkInterface
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.util.UUID
import java.util.concurrent.atomic.AtomicInteger

/**
 * Answers ONVIF WS-Discovery probes on UDP multicast 239.255.255.250:3702 so RobOS Camera Watch
 * ("Find cameras") and RobOS Smart Home discover the phone on Wi-Fi with zero manual IP entry.
 */
class WsDiscoveryResponder(
    private val configProvider: () -> IpCameraConfig,
    private val ipProvider: () -> String,
    private val portProvider: () -> Int,
    private val hardwareModel: String = "RobOS-Android-IPCam",
    private val multicastPort: Int = WS_DISCOVERY_PORT,
) {
    private var scope: CoroutineScope? = null
    private var socket: MulticastSocket? = null
    private var job: Job? = null

    val probesAnswered = AtomicInteger(0)

    val isRunning: Boolean
        get() = socket?.isClosed == false

    fun start(preferredIp: String = ipProvider()): Boolean {
        stop()
        return try {
            val groupAddr = InetAddress.getByName(WS_DISCOVERY_GROUP)
            val sock = MulticastSocket(null)
            sock.reuseAddress = true
            sock.bind(InetSocketAddress(multicastPort))
            val netIf = findInterfaceForIp(preferredIp)
            if (netIf != null) {
                sock.joinGroup(InetSocketAddress(groupAddr, multicastPort), netIf)
            } else {
                @Suppress("DEPRECATION")
                sock.joinGroup(groupAddr)
            }
            socket = sock
            val s = CoroutineScope(SupervisorJob() + Dispatchers.IO)
            scope = s
            job = s.launch {
                val buf = ByteArray(8192)
                while (isActive && !sock.isClosed) {
                    val packet = DatagramPacket(buf, buf.size)
                    try {
                        sock.receive(packet)
                    } catch (_: Exception) {
                        if (sock.isClosed) break else continue
                    }
                    val cfg = configProvider()
                    if (!cfg.onvifDiscoveryEnabled) continue
                    val xml = String(packet.data, packet.offset, packet.length, StandardCharsets.UTF_8)
                    val ip = ipProvider().ifBlank { packet.address.hostAddress ?: "" }
                    val port = portProvider()
                    if (ip.isBlank() || port <= 0) continue
                    val reply = buildProbeMatchIfApplicable(
                        probeXml = xml,
                        deviceUuid = cfg.deviceUuid,
                        cameraName = cfg.cameraName,
                        room = cfg.room,
                        hardware = hardwareModel,
                        xaddr = "http://$ip:$port/onvif/device_service",
                    ) ?: continue
                    val replyBytes = reply.toByteArray(StandardCharsets.UTF_8)
                    try {
                        sock.send(DatagramPacket(replyBytes, replyBytes.size, packet.address, packet.port))
                        probesAnswered.incrementAndGet()
                    } catch (_: Exception) {
                    }
                }
            }
            true
        } catch (_: Exception) {
            stop()
            false
        }
    }

    fun stop() {
        job?.cancel()
        job = null
        try {
            socket?.close()
        } catch (_: Exception) {
        }
        socket = null
        scope?.cancel()
        scope = null
    }

    private fun findInterfaceForIp(ip: String): NetworkInterface? {
        if (ip.isBlank()) return null
        return try {
            NetworkInterface.getNetworkInterfaces()?.toList()?.firstOrNull { nif ->
                nif.isUp && nif.inetAddresses.toList().any { it is Inet4Address && it.hostAddress == ip }
            }
        } catch (_: Exception) {
            null
        }
    }

    companion object {
        const val WS_DISCOVERY_GROUP = "239.255.255.250"
        const val WS_DISCOVERY_PORT = 3702

        fun buildProbeMatchIfApplicable(
            probeXml: String,
            deviceUuid: String,
            cameraName: String,
            room: String,
            hardware: String,
            xaddr: String,
        ): String? {
            if (!Regex("""Probe[\s>]""").containsMatchIn(probeXml) || probeXml.contains("ProbeMatches")) {
                return null
            }
            // Answer wildcard probes and ONVIF NetworkVideoTransmitter / Device probes.
            val types = Regex("""<(?:\w+:)?Types[^>]*>([^<]*)</""").find(probeXml)?.groupValues?.get(1)?.trim().orEmpty()
            if (types.isNotEmpty() &&
                !types.contains("NetworkVideoTransmitter", ignoreCase = true) &&
                !types.contains("Device", ignoreCase = true)
            ) {
                return null
            }
            val relatesTo = Regex("""MessageID[^>]*>([^<]+)<""").find(probeXml)?.groupValues?.get(1)?.trim().orEmpty()
            val encName = urlScopeEncode(cameraName)
            val encHw = urlScopeEncode(hardware)
            val encRoom = urlScopeEncode(room)
            val urn = if (deviceUuid.startsWith("urn:")) deviceUuid else "urn:uuid:$deviceUuid"

            return "<?xml version=\"1.0\" encoding=\"UTF-8\"?>" +
                "<SOAP-ENV:Envelope xmlns:SOAP-ENV=\"http://www.w3.org/2003/05/soap-envelope\" " +
                "xmlns:wsa=\"http://schemas.xmlsoap.org/ws/2004/08/addressing\" " +
                "xmlns:d=\"http://schemas.xmlsoap.org/ws/2005/04/discovery\" " +
                "xmlns:dn=\"http://www.onvif.org/ver10/network/wsdl\">" +
                "<SOAP-ENV:Header>" +
                "<wsa:MessageID>urn:uuid:${UUID.randomUUID()}</wsa:MessageID>" +
                "<wsa:RelatesTo>$relatesTo</wsa:RelatesTo>" +
                "<wsa:To>http://schemas.xmlsoap.org/ws/2004/08/addressing/role/anonymous</wsa:To>" +
                "<wsa:Action>http://schemas.xmlsoap.org/ws/2005/04/discovery/ProbeMatches</wsa:Action>" +
                "</SOAP-ENV:Header>" +
                "<SOAP-ENV:Body><d:ProbeMatches><d:ProbeMatch>" +
                "<wsa:EndpointReference><wsa:Address>$urn</wsa:Address></wsa:EndpointReference>" +
                "<d:Types>dn:NetworkVideoTransmitter</d:Types>" +
                "<d:Scopes>onvif://www.onvif.org/type/video_encoder onvif://www.onvif.org/name/$encName onvif://www.onvif.org/hardware/$encHw onvif://www.onvif.org/location/$encRoom</d:Scopes>" +
                "<d:XAddrs>$xaddr</d:XAddrs>" +
                "<d:MetadataVersion>1</d:MetadataVersion>" +
                "</d:ProbeMatch></d:ProbeMatches></SOAP-ENV:Body></SOAP-ENV:Envelope>"
        }

        private fun urlScopeEncode(value: String): String =
            URLEncoder.encode(value.trim(), StandardCharsets.UTF_8.name()).replace("+", "%20")
    }
}
