package com.robos.intellij.startup

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.logger
import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.ProjectActivity
import com.robos.intellij.bus.NotificationBusClient
import com.robos.intellij.ipc.RobosIpcServer

/**
 * Runs once after the first project is loaded. Starts:
 * 1. The IPC HTTP server ([RobosIpcServer]) so mcp-idea can call it.
 * 2. The notification-bus WebSocket client ([NotificationBusClient]) so
 *    RobOS events surface as IDE balloon notifications.
 *
 * Both are kept alive for the lifetime of the IDE process. Shutdown is
 * handled via the ApplicationService lifecycle (AutoCloseable).
 */
class RobosStartupActivity : ProjectActivity {

    companion object {
        private val LOG = logger<RobosStartupActivity>()
    }

    override suspend fun execute(project: Project) {
        val app = ApplicationManager.getApplication()

        // Start IPC server (idempotent — won't start twice)
        val ipcServer = app.getService(RobosIpcServer::class.java)
        if (!ipcServer.isRunning) {
            ipcServer.start()
        }

        // Start notification-bus client
        val busClient = app.getService(NotificationBusAppService::class.java)
        busClient.ensureConnected()

        LOG.info("RobOS integration active (IPC port ${RobosIpcServer.instance().boundPort})")
    }
}

/**
 * Application-level service wrapper around [NotificationBusClient] so it is
 * properly managed by the IntelliJ service container and shut down with the IDE.
 */
@com.intellij.openapi.components.Service(com.intellij.openapi.components.Service.Level.APP)
class NotificationBusAppService : AutoCloseable {
    private val client = NotificationBusClient()

    fun ensureConnected() = client.connect()

    override fun close() = client.close()
}
