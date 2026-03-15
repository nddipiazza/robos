package com.robos.intellij.services

import com.intellij.openapi.components.Service
import java.util.concurrent.atomic.AtomicReference

/**
 * Application-level service that tracks the RobOS workspace state for the
 * currently open project — which Jira ticket is being worked, the git branch,
 * collaborators present, and when focused work began.
 *
 * State is written by [com.robos.intellij.ipc.RobosIpcHandler] when the
 * Workspace Agent calls the /robos/open-project endpoint, and read by the
 * [com.robos.intellij.ui.TicketContextPanel] to render the side panel.
 */
@Service(Service.Level.APP)
class RobosWorkspaceService {

    data class WorkspaceState(
        val ticketId: String = "",
        val ticketTitle: String = "",
        val ticketUrl: String = "",
        val branch: String = "",
        val projectPath: String = "",
        val collaborators: List<Collaborator> = emptyList(),
        val focusStartEpochMs: Long = 0L,
    )

    data class Collaborator(
        val username: String,
        val displayName: String,
        val avatarUrl: String = "",
        val lastActivity: String = "",
    )

    private val state = AtomicReference(WorkspaceState())

    fun getState(): WorkspaceState = state.get()

    fun updateState(block: WorkspaceState.() -> WorkspaceState) {
        state.updateAndGet { it.block() }
    }

    fun setTicket(ticketId: String, ticketTitle: String, ticketUrl: String) {
        state.updateAndGet { it.copy(ticketId = ticketId, ticketTitle = ticketTitle, ticketUrl = ticketUrl) }
    }

    fun setBranch(branch: String) {
        state.updateAndGet { it.copy(branch = branch) }
    }

    fun setProjectPath(path: String) {
        state.updateAndGet { it.copy(projectPath = path) }
    }

    fun setCollaborators(collaborators: List<Collaborator>) {
        state.updateAndGet { it.copy(collaborators = collaborators) }
    }

    fun startFocus() {
        state.updateAndGet { it.copy(focusStartEpochMs = System.currentTimeMillis()) }
    }

    fun focusedMinutes(): Long {
        val start = state.get().focusStartEpochMs
        if (start == 0L) return 0L
        return (System.currentTimeMillis() - start) / 60_000
    }

    fun clear() {
        state.set(WorkspaceState())
    }
}
