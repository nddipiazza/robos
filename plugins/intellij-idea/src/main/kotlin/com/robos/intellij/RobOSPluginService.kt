package com.robos.intellij

import com.intellij.openapi.Disposable
import com.intellij.openapi.components.Service

@Service(Service.Level.APP)
class RobOSPluginService : Disposable {

    private val ipcServer = RobOSIpcServer(63343)

    init {
        println("[RobOSPluginService] Initializing RobOS IntelliJ Plugin...")
        ipcServer.start()
    }

    override fun dispose() {
        println("[RobOSPluginService] Shutting down RobOS IntelliJ Plugin...")
        ipcServer.stop()
    }
}
