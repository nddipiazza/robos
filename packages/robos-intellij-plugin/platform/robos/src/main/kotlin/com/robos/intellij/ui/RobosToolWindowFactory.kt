package com.robos.intellij.ui

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBScrollPane
import com.intellij.util.ui.JBUI
import com.intellij.util.ui.UIUtil
import com.robos.intellij.ipc.RobosIpcServer
import com.robos.intellij.services.RobosWorkspaceService
import java.awt.*
import java.awt.event.MouseAdapter
import java.awt.event.MouseEvent
import java.net.URI
import javax.swing.*

/**
 * Registers the "RobOS" tool window in the IDE side panel.
 * The window renders [TicketContextPanel].
 */
class RobosToolWindowFactory : ToolWindowFactory {
    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        val panel = TicketContextPanel(project)
        val content = toolWindow.contentManager.factory.createContent(panel, null, false)
        toolWindow.contentManager.addContent(content)
    }

    override fun shouldBeAvailable(project: Project) = true
}

/**
 * Side panel showing the active RobOS workspace context:
 * - Jira ticket ID + title (clickable link)
 * - Current git branch
 * - Camera-verified focus time
 * - Collaborator presence strip
 * - IPC server status
 *
 * Refreshes every 5 seconds via a Swing timer.
 */
class TicketContextPanel(private val project: Project) : JPanel(BorderLayout()) {

    private val svc: RobosWorkspaceService get() =
        ApplicationManager.getApplication().getService(RobosWorkspaceService::class.java)

    // ── Label references ──────────────────────────────────────────────────────
    private val ticketLabel     = JBLabel().apply { font = font.deriveFont(Font.BOLD, 13f) }
    private val titleLabel      = JBLabel().apply { foreground = UIUtil.getLabelForeground() }
    private val branchLabel     = JBLabel().apply { foreground = UIUtil.getContextHelpForeground() }
    private val focusLabel      = JBLabel().apply { foreground = UIUtil.getContextHelpForeground() }
    private val ipcStatusLabel  = JBLabel().apply { foreground = UIUtil.getContextHelpForeground(); font = font.deriveFont(10f) }
    private val collaboratorsPanel = JPanel(FlowLayout(FlowLayout.LEFT, 4, 2))

    init {
        background = UIUtil.getPanelBackground()
        border = JBUI.Borders.empty(8)

        val content = JPanel().apply {
            layout = BoxLayout(this, BoxLayout.Y_AXIS)
            isOpaque = false

            // Section: Ticket
            add(sectionHeader("TICKET"))
            add(ticketLabel.also { it.alignmentX = LEFT_ALIGNMENT })
            add(titleLabel.also  { it.alignmentX = LEFT_ALIGNMENT })
            add(Box.createVerticalStrut(8))

            // Section: Branch
            add(sectionHeader("BRANCH"))
            add(branchLabel.also { it.alignmentX = LEFT_ALIGNMENT })
            add(Box.createVerticalStrut(8))

            // Section: Focus
            add(sectionHeader("FOCUS TODAY"))
            add(focusLabel.also { it.alignmentX = LEFT_ALIGNMENT })
            add(Box.createVerticalStrut(8))

            // Section: Collaborators
            add(sectionHeader("COLLABORATORS"))
            add(collaboratorsPanel.also { it.isOpaque = false; it.alignmentX = LEFT_ALIGNMENT })
            add(Box.createVerticalStrut(12))

            // IPC status footer
            add(ipcStatusLabel.also { it.alignmentX = LEFT_ALIGNMENT })
        }

        add(JBScrollPane(content).apply { border = null }, BorderLayout.CENTER)

        // Refresh every 5 seconds
        Timer(5_000) { refresh() }.also { it.initialDelay = 0; it.start() }
    }

    private fun refresh() {
        val state = svc.getState()

        // Ticket
        if (state.ticketId.isNotBlank()) {
            ticketLabel.text = state.ticketId
            if (state.ticketUrl.isNotBlank()) {
                ticketLabel.cursor = Cursor(Cursor.HAND_CURSOR)
                ticketLabel.toolTipText = state.ticketUrl
                ticketLabel.addMouseListener(object : MouseAdapter() {
                    override fun mouseClicked(e: MouseEvent) {
                        runCatching { Desktop.getDesktop().browse(URI(state.ticketUrl)) }
                    }
                })
            }
            titleLabel.text = state.ticketTitle.ifBlank { "—" }
        } else {
            ticketLabel.text = "No active ticket"
            titleLabel.text = ""
        }

        // Branch
        branchLabel.text = state.branch.ifBlank { "—" }

        // Focus
        val mins = svc.focusedMinutes()
        focusLabel.text = when {
            mins == 0L -> "Not started"
            mins < 60  -> "$mins min"
            else       -> "${mins / 60}h ${mins % 60}m"
        }

        // Collaborators
        collaboratorsPanel.removeAll()
        if (state.collaborators.isEmpty()) {
            collaboratorsPanel.add(JBLabel("—").apply { foreground = UIUtil.getContextHelpForeground() })
        } else {
            state.collaborators.forEach { c ->
                val chip = JBLabel(c.displayName).apply {
                    toolTipText = "${c.username} — ${c.lastActivity}"
                    border = JBUI.Borders.compound(
                        JBUI.Borders.customLine(com.intellij.ui.JBColor.border(), 1),
                        JBUI.Borders.empty(2, 5),
                    )
                    font = font.deriveFont(11f)
                }
                collaboratorsPanel.add(chip)
            }
        }

        // IPC status
        val ipcServer = ApplicationManager.getApplication().getService(
            com.robos.intellij.ipc.RobosIpcServer::class.java
        )
        ipcStatusLabel.text = if (ipcServer.isRunning)
            "RobOS IPC ● port ${RobosIpcServer.instance().boundPort}"
        else
            "RobOS IPC ○ stopped"

        revalidate()
        repaint()
    }

    private fun sectionHeader(text: String) = JBLabel(text).apply {
        font = font.deriveFont(Font.BOLD, 10f)
        foreground = UIUtil.getContextHelpForeground()
        alignmentX = LEFT_ALIGNMENT
    }
}
