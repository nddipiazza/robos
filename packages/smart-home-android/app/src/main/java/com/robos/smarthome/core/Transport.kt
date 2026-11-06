package com.robos.smarthome.core

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.HttpURLConnection
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.Socket
import java.net.SocketTimeoutException
import java.net.URL

sealed interface SendResult {
    /** The light answered. */
    data object Confirmed : SendResult

    /** Sent, but this protocol has no way to confirm it arrived. */
    data object Sent : SendResult

    data class Failed(val reason: String) : SendResult
}

data class HttpReply(val status: Int, val body: String)

interface LanTransport {
    suspend fun send(step: WireStep): SendResult

    /** A plain HTTP request for callers that need the reply, such as Hue pairing. Null when nothing answered. */
    suspend fun http(step: WireStep.Http, timeoutMs: Int = HTTP_TIMEOUT_MS): HttpReply?
}

/** Binds sockets to the Wi-Fi network, so a phone with mobile data cannot send them elsewhere. */
interface NetworkBinder {
    fun bind(socket: DatagramSocket) {}
    fun bind(socket: Socket) {}
    fun open(url: URL): HttpURLConnection = url.openConnection() as HttpURLConnection
}

const val UDP_REPLY_WAIT_MS = 500
const val UDP_ATTEMPTS = 2
const val TCP_TIMEOUT_MS = 1500
const val HTTP_TIMEOUT_MS = 2000

class SocketTransport(
    private val binder: NetworkBinder = object : NetworkBinder {},
    /** Feit / Smart Life: the local key of a device, by device ID. */
    private val tuyaKey: (String) -> String? = { null },
) : LanTransport {

    override suspend fun send(step: WireStep): SendResult = withContext(Dispatchers.IO) {
        try {
            when (step) {
                is WireStep.Udp -> sendUdp(step)
                is WireStep.Tcp -> sendTcp(step)
                is WireStep.Http -> sendHttp(step)
                is WireStep.Tuya -> sendTuya(step)
            }
        } catch (e: TuyaException) {
            SendResult.Failed(e.message ?: "The light did not answer.")
        } catch (e: Exception) {
            SendResult.Failed(unreachable(step, e))
        }
    }

    private fun sendUdp(step: WireStep.Udp): SendResult {
        DatagramSocket().use { socket ->
            binder.bind(socket)
            val address = InetAddress.getByName(step.ip)
            val packet = DatagramPacket(step.bytes, step.bytes.size, address, step.port)
            if (!step.expectsReply) {
                socket.send(packet)
                return SendResult.Sent
            }
            socket.soTimeout = UDP_REPLY_WAIT_MS
            val reply = DatagramPacket(ByteArray(2048), 2048)
            // UDP can drop a message on busy Wi-Fi, so it gets one retry.
            repeat(UDP_ATTEMPTS) {
                socket.send(packet)
                try {
                    socket.receive(reply)
                    return SendResult.Confirmed
                } catch (_: SocketTimeoutException) {
                }
            }
            return SendResult.Failed("No answer from ${step.ip}. Check that it is on this Wi-Fi network.")
        }
    }

    private fun sendTcp(step: WireStep.Tcp): SendResult {
        Socket().use { socket ->
            binder.bind(socket)
            socket.connect(InetSocketAddress(step.ip, step.port), TCP_TIMEOUT_MS)
            socket.soTimeout = TCP_TIMEOUT_MS
            val output = socket.getOutputStream()
            for (line in step.lines) output.write("$line\r\n".toByteArray())
            output.flush()
            return SendResult.Sent
        }
    }

    private fun sendTuya(step: WireStep.Tuya): SendResult {
        val key = tuyaKey(step.deviceId)
            ?: return SendResult.Failed("No key for this light. Open Add Feit or Smart Life lights and find your lights again.")
        TuyaConnection(step.deviceId, step.ip, key, step.version, step.port, binder = binder).use { conn ->
            conn.connect()
            conn.setDps(step.dps)
        }
        return SendResult.Confirmed
    }

    private fun sendHttp(step: WireStep.Http): SendResult {
        val reply = request(step, HTTP_TIMEOUT_MS)
        if (reply.status !in 200..399) return SendResult.Failed("${step.ip} answered with HTTP ${reply.status}.")
        return bridgeError(reply.body)?.let { SendResult.Failed(it) } ?: SendResult.Confirmed
    }

    override suspend fun http(step: WireStep.Http, timeoutMs: Int): HttpReply? = withContext(Dispatchers.IO) {
        try {
            request(step, timeoutMs)
        } catch (_: Exception) {
            null
        }
    }

    private fun request(step: WireStep.Http, timeoutMs: Int): HttpReply {
        val connection = binder.open(URL("http", step.ip, step.port, step.path))
        try {
            connection.connectTimeout = timeoutMs
            connection.readTimeout = timeoutMs
            connection.requestMethod = step.method
            step.headers.forEach { (name, value) -> connection.setRequestProperty(name, value) }
            if (step.body.isNotEmpty()) {
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json")
                connection.outputStream.use { it.write(step.body.toByteArray()) }
            }
            val status = connection.responseCode
            val stream = if (status in 200..399) connection.inputStream else connection.errorStream
            return HttpReply(status, stream?.use { it.readBytes().decodeToString() }.orEmpty())
        } finally {
            connection.disconnect()
        }
    }

    private fun unreachable(step: WireStep, e: Exception): String = when (e) {
        is SocketTimeoutException -> "No answer from ${step.ip}. Check that it is on this Wi-Fi network."
        else -> "Could not reach ${step.ip}: ${e.message ?: "connection failed"}."
    }
}

/**
 * A Hue bridge answers HTTP 200 even when it refuses a command, and puts the reason
 * in the body: [{"error":{"type":1,"description":"unauthorized user"}}]
 */
internal fun bridgeError(body: String): String? {
    if (!body.trimStart().startsWith("[")) return null
    val items = runCatching { Json.parseToJsonElement(body) as JsonArray }.getOrNull() ?: return null
    return items.firstNotNullOfOrNull { item ->
        runCatching {
            item.jsonObject["error"]?.jsonObject?.get("description")?.jsonPrimitive?.content
        }.getOrNull()
    }?.let { "The bridge refused this: $it." }
}
