package com.robos.intellij.startup

import com.intellij.ide.AppLifecycleListener
import com.intellij.openapi.application.ApplicationManager
import com.robos.intellij.ipc.RobosIpcServer
import com.robos.intellij.services.RobosWorkspaceService

class RobosAppLifecycleListener : AppLifecycleListener {
    override fun appFrameCreated(commandLineArgs: List<String>) {
        val app = ApplicationManager.getApplication()
        // Eagerly initialize application services so they are ready before any project opens.
        app.getService(RobosWorkspaceService::class.java)
        app.getService(NotificationBusAppService::class.java)
        app.getService(RobosIpcServer::class.java)
    }
}
