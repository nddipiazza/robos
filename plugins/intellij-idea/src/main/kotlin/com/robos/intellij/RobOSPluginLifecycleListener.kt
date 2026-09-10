package com.robos.intellij

import com.intellij.ide.AppLifecycleListener
import com.intellij.openapi.application.ApplicationManager

class RobOSPluginLifecycleListener : AppLifecycleListener {
    override fun appFrameCreated(commandLineArgs: List<String>) {
        ApplicationManager.getApplication().getService(RobOSPluginService::class.java)
    }
}
