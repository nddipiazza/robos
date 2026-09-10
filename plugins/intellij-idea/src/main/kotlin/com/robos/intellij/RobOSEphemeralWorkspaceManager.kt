package com.robos.intellij

import java.io.File
import java.util.concurrent.ConcurrentHashMap

data class EphemeralWorkspace(
    val workspaceId: String,
    val projectPaths: List<String>,
    val autoRunConfig: String?,
    val autoDestroyOnSessionEnd: Boolean,
    val createdAt: Long = System.currentTimeMillis(),
    var status: String = "ACTIVE",
    var activePid: Long? = null
)

object RobOSEphemeralWorkspaceManager {

    private val workspaces = ConcurrentHashMap<String, EphemeralWorkspace>()

    fun createWorkspace(
        workspaceId: String,
        projectPaths: List<String>,
        autoRunConfig: String? = null,
        autoDestroyOnSessionEnd: Boolean = true
    ): EphemeralWorkspace {
        val ws = EphemeralWorkspace(
            workspaceId = workspaceId,
            projectPaths = projectPaths,
            autoRunConfig = autoRunConfig,
            autoDestroyOnSessionEnd = autoDestroyOnSessionEnd
        )
        workspaces[workspaceId] = ws
        return ws
    }

    fun getWorkspace(workspaceId: String): EphemeralWorkspace? = workspaces[workspaceId]

    fun listWorkspaces(): List<EphemeralWorkspace> = workspaces.values.toList()

    fun destroyWorkspace(workspaceId: String): Boolean {
        val ws = workspaces.remove(workspaceId) ?: return false
        ws.status = "DESTROYED"

        // If paths are located in /tmp or ephemeral tmpfs, safely clean up workspace metadata
        for (path in ws.projectPaths) {
            val f = File(path)
            if (f.exists() && (path.startsWith("/tmp/") || path.contains("robos-ephemeral"))) {
                try {
                    f.deleteRecursively()
                } catch (_: Exception) {}
            }
        }
        return true
    }

    fun onSessionEnded(configName: String) {
        for ((id, ws) in workspaces) {
            if (ws.autoRunConfig.equals(configName, ignoreCase = true) && ws.autoDestroyOnSessionEnd) {
                destroyWorkspace(id)
            }
        }
    }
}
