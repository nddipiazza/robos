package com.robos.ipcamera.core

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.supervisorScope
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.net.InetSocketAddress
import java.net.Socket
import java.nio.charset.StandardCharsets

@Serializable
data class RobosSharedWithInfo(
    val uid: String = "",
    val name: String = "",
    val email: String = "",
    val permissionId: String = "",
)

@Serializable
data class RobosUserItem(
    val uid: String = "",
    val name: String = "",
    val avatar: String = "👤",
    val groups: List<String> = emptyList(),
    val email: String = "",
    val canShare: Boolean = false,
    val isOwner: Boolean = false,
    val shared: Boolean = false,
    val permissionId: String = "",
)

@Serializable
data class RobosUsersResponse(
    val ok: Boolean = false,
    val error: String = "",
    val docId: String = "",
    val docUrl: String = "",
    val docTitle: String = "",
    val publicTunnelUrl: String = "",
    val users: List<RobosUserItem> = emptyList(),
    val sharedWith: RobosSharedWithInfo? = null,
)

/**
 * Discovers the RobOS Camera Watch Web Server (`:19227`) on the local Wi-Fi network and invokes
 * the Google Drive Doc share/revoke endpoints for RobOS Users over deterministic raw TCP HTTP/1.1
 * (`Connection: close`), avoiding Android OkHttp connection-pool stalls.
 */
class RobosHubClient(private val hubPort: Int = DEFAULT_HUB_PORT) {
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    suspend fun discoverHubHostIp(wifiIp: String, cachedHostIp: String = ""): String? = withContext(Dispatchers.IO) {
        if (cachedHostIp.isNotBlank() && probeHub(cachedHostIp, timeoutMs = 600)) {
            return@withContext cachedHostIp
        }
        val parts = wifiIp.trim().split('.')
        if (parts.size != 4) return@withContext null
        val prefix = "${parts[0]}.${parts[1]}.${parts[2]}."
        val myLastOctet = parts[3].toIntOrNull()

        val found = CompletableDeferred<String?>()
        val gate = Semaphore(40)
        supervisorScope {
            val jobs = (1..254).filter { it != myLastOctet }.map { octet ->
                val host = "$prefix$octet"
                launch {
                    gate.withPermit {
                        if (!found.isCompleted && probeHub(host, timeoutMs = 450)) {
                            found.complete(host)
                        }
                    }
                }
            }
            launch {
                jobs.forEach { it.join() }
                if (!found.isCompleted) found.complete(null)
            }
            val winner = found.await()
            jobs.forEach { it.cancel() }
            winner
        }
    }

    fun probeHub(hostIp: String, timeoutMs: Int = 500): Boolean {
        return try {
            val (code, body) = rawHttp(
                hostIp = hostIp,
                port = hubPort,
                method = "GET",
                path = "/api/robos-camera-hub",
                connectTimeoutMs = timeoutMs,
                readTimeoutMs = timeoutMs,
            )
            code == 200 && body.contains("robos-camera-watch-web")
        } catch (_: Exception) {
            false
        }
    }

    suspend fun listUsers(hostIp: String, deviceUuid: String, cameraPort: Int): RobosUsersResponse =
        withContext(Dispatchers.IO) {
            requestJson(
                hostIp = hostIp,
                method = "GET",
                path = "/api/robos-users",
                deviceUuid = deviceUuid,
                cameraPort = cameraPort,
                bodyJson = null,
                readTimeoutMs = 15_000,
            )
        }

    suspend fun shareWithUser(
        hostIp: String,
        deviceUuid: String,
        cameraPort: Int,
        uid: String = "",
        email: String = "",
    ): RobosUsersResponse = withContext(Dispatchers.IO) {
        val payload = buildJsonObject {
            if (uid.isNotBlank()) put("uid", uid)
            if (email.isNotBlank()) put("email", email)
        }.toString()
        requestJson(
            hostIp = hostIp,
            method = "POST",
            path = "/api/robos-users/share",
            deviceUuid = deviceUuid,
            cameraPort = cameraPort,
            bodyJson = payload,
            readTimeoutMs = 35_000,
        )
    }

    suspend fun revokeUser(
        hostIp: String,
        deviceUuid: String,
        cameraPort: Int,
        uid: String = "",
        permissionId: String = "",
    ): RobosUsersResponse = withContext(Dispatchers.IO) {
        val payload = buildJsonObject {
            if (uid.isNotBlank()) put("uid", uid)
            if (permissionId.isNotBlank()) put("permissionId", permissionId)
        }.toString()
        requestJson(
            hostIp = hostIp,
            method = "POST",
            path = "/api/robos-users/revoke",
            deviceUuid = deviceUuid,
            cameraPort = cameraPort,
            bodyJson = payload,
            readTimeoutMs = 25_000,
        )
    }

    private fun requestJson(
        hostIp: String,
        method: String,
        path: String,
        deviceUuid: String,
        cameraPort: Int,
        bodyJson: String?,
        readTimeoutMs: Int,
    ): RobosUsersResponse {
        val (code, text) = rawHttp(
            hostIp = hostIp,
            port = hubPort,
            method = method,
            path = path,
            headers = mapOf(
                "Accept" to "application/json",
                "X-Robos-Camera-Urn" to "urn:uuid:$deviceUuid",
                "X-Robos-Camera-Port" to cameraPort.toString(),
            ),
            bodyJson = bodyJson,
            connectTimeoutMs = 3_500,
            readTimeoutMs = readTimeoutMs,
        )
        val parsed = json.decodeFromString(RobosUsersResponse.serializer(), text)
        if (code !in 200..299 && parsed.error.isNotBlank()) {
            throw IllegalStateException(parsed.error)
        }
        if (code !in 200..299) {
            throw IllegalStateException("HTTP $code")
        }
        return parsed
    }

    private fun rawHttp(
        hostIp: String,
        port: Int,
        method: String,
        path: String,
        headers: Map<String, String> = emptyMap(),
        bodyJson: String? = null,
        connectTimeoutMs: Int = 2_000,
        readTimeoutMs: Int = 10_000,
    ): Pair<Int, String> {
        val bodyBytes = bodyJson?.toByteArray(StandardCharsets.UTF_8)
        Socket().use { sock ->
            sock.tcpNoDelay = true
            sock.soTimeout = readTimeoutMs
            sock.connect(InetSocketAddress(hostIp, port), connectTimeoutMs)
            val reqHead = buildString {
                append("$method $path HTTP/1.0\r\n")
                append("Host: $hostIp:$port\r\n")
                append("Connection: close\r\n")
                for ((k, v) in headers) {
                    append("$k: $v\r\n")
                }
                if (bodyBytes != null) {
                    append("Content-Type: application/json; charset=utf-8\r\n")
                    append("Content-Length: ${bodyBytes.size}\r\n")
                }
                append("\r\n")
            }
            val out = sock.getOutputStream()
            out.write(reqHead.toByteArray(StandardCharsets.UTF_8))
            if (bodyBytes != null) {
                out.write(bodyBytes)
            }
            out.flush()

            val rawResp = sock.getInputStream().readBytes()
            val sep = findHeaderEnd(rawResp)
            val headerStr = if (sep >= 0) {
                String(rawResp, 0, sep, StandardCharsets.ISO_8859_1)
            } else {
                String(rawResp, StandardCharsets.UTF_8)
            }
            val statusLine = headerStr.lineSequence().firstOrNull().orEmpty()
            val code = statusLine.split(' ').getOrNull(1)?.toIntOrNull() ?: 0
            val bodyStr = if (sep >= 0 && sep + 4 <= rawResp.size) {
                String(rawResp, sep + 4, rawResp.size - (sep + 4), StandardCharsets.UTF_8)
            } else {
                ""
            }
            return code to bodyStr
        }
    }

    private fun findHeaderEnd(buf: ByteArray): Int {
        var i = 0
        while (i <= buf.size - 4) {
            if (buf[i] == '\r'.code.toByte() &&
                buf[i + 1] == '\n'.code.toByte() &&
                buf[i + 2] == '\r'.code.toByte() &&
                buf[i + 3] == '\n'.code.toByte()
            ) {
                return i
            }
            i++
        }
        return -1
    }

    companion object {
        const val DEFAULT_HUB_PORT = 19227
    }
}
