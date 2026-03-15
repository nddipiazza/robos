package com.robos.intellij.bus

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.registerKotlinModule
import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.logger
import com.intellij.openapi.project.ProjectManager
import java.net.URI
import java.net.http.HttpClient
import java.net.http.WebSocket
import java.time.Duration
import java.util.concurrent.CompletionStage
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit

/**
 * WebSocket client that connects to the RobOS notification-bus running at
 * `ws://<host>:<port>` (default `ws://localhost:3700`).
 *
 * On connection it subscribes to all events. When an event arrives its
 * `severity` and `message` are surfaced as an IntelliJ balloon notification.
 * The connection is re-established automatically with exponential back-off if
 * it drops.
 *
 * Environment variables:
 *   ROBOS_BUS_HOST  — hostname of the notification-bus  (default: localhost)
 *   ROBOS_BUS_PORT  — port of the notification-bus      (default: 3700)
 */
class NotificationBusClient : AutoCloseable {

    companion object {
        private val LOG = logger<NotificationBusClient>()
        private val JSON = ObjectMapper().registerKotlinModule()

        private val BUS_HOST = System.getenv("ROBOS_BUS_HOST") ?: "localhost"
        private val BUS_PORT = System.getenv("ROBOS_BUS_PORT")?.toIntOrNull() ?: 3700
        private val BUS_URI  = URI("ws://$BUS_HOST:$BUS_PORT")

        /** Events that should be shown as ERROR (red) balloons. */
        private val URGENT_EVENTS = setOf(
            "BLOCKER_DETECTED", "ISSUE_REPORTED_YOUR_CHANGE",
            "MEETING_APPROACHING_2M", "MEETING_TAKEOVER",
        )
        /** Events that should be shown as WARNING (yellow) balloons. */
        private val WARNING_EVENTS = setOf(
            "PR_REVIEW_NEEDED", "PR_AGING_WARNING", "PR_STALE_CLOSE_SUGGESTION",
            "MEETING_APPROACHING_10M",
        )
    }

    private val scheduler = Executors.newSingleThreadScheduledExecutor { r ->
        Thread(r, "robos-bus-reconnect").also { it.isDaemon = true }
    }

    @Volatile private var socket: WebSocket? = null
    @Volatile private var closed = false
    private var retryDelaySeconds = 5L
    private var retryFuture: ScheduledFuture<*>? = null

    fun connect() {
        if (closed) return
        LOG.info("Connecting to RobOS notification-bus at $BUS_URI")
        HttpClient.newHttpClient()
            .newWebSocketBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .buildAsync(BUS_URI, Listener())
            .whenComplete { ws, err ->
                if (err != null) {
                    LOG.warn("Failed to connect to RobOS bus: ${err.message}")
                    scheduleReconnect()
                } else {
                    socket = ws
                    retryDelaySeconds = 5
                    LOG.info("Connected to RobOS notification-bus")
                }
            }
    }

    private fun scheduleReconnect() {
        if (closed) return
        LOG.info("Reconnecting to RobOS bus in ${retryDelaySeconds}s…")
        retryFuture = scheduler.schedule(::connect, retryDelaySeconds, TimeUnit.SECONDS)
        retryDelaySeconds = minOf(retryDelaySeconds * 2, 120)
    }

    override fun close() {
        closed = true
        retryFuture?.cancel(false)
        socket?.sendClose(WebSocket.NORMAL_CLOSURE, "IDE shutting down")
        scheduler.shutdownNow()
    }

    // ── WebSocket listener ────────────────────────────────────────────────────

    private inner class Listener : WebSocket.Listener {
        private val buffer = StringBuilder()

        override fun onText(ws: WebSocket, data: CharSequence, last: Boolean): CompletionStage<*>? {
            buffer.append(data)
            if (last) {
                val text = buffer.toString()
                buffer.clear()
                handleMessage(text)
            }
            ws.request(1)
            return null
        }

        override fun onClose(ws: WebSocket, statusCode: Int, reason: String): CompletionStage<*>? {
            LOG.info("RobOS bus connection closed ($statusCode): $reason")
            if (!closed) scheduleReconnect()
            return null
        }

        override fun onError(ws: WebSocket, error: Throwable) {
            LOG.warn("RobOS bus WebSocket error: ${error.message}")
            if (!closed) scheduleReconnect()
        }

        override fun onOpen(ws: WebSocket) {
            ws.request(1)
        }
    }

    // ── Message handling ──────────────────────────────────────────────────────

    private fun handleMessage(raw: String) {
        try {
            val node = JSON.readTree(raw)
            val event   = node.get("event")?.asText() ?: return
            val message = node.get("message")?.asText() ?: event
            val title   = node.get("title")?.asText() ?: "RobOS"

            val notifType = when (event) {
                in URGENT_EVENTS  -> NotificationType.ERROR
                in WARNING_EVENTS -> NotificationType.WARNING
                else              -> NotificationType.INFORMATION
            }

            ApplicationManager.getApplication().invokeLater {
                val project = ProjectManager.getInstance().openProjects.firstOrNull()
                NotificationGroupManager.getInstance()
                    .getNotificationGroup("RobOS")
                    .createNotification(title, message, notifType)
                    .apply { if (project != null) notify(project) else notify(null) }
            }
        } catch (e: Exception) {
            LOG.warn("Failed to parse RobOS bus message: $raw", e)
        }
    }
}
