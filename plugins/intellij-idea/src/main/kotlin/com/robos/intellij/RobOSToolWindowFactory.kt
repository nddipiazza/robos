package com.robos.intellij

import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBPanel
import com.intellij.ui.content.ContentFactory
import java.awt.BorderLayout
import java.awt.Color
import java.awt.Font
import java.awt.GridLayout
import javax.swing.BorderFactory
import javax.swing.JButton
import javax.swing.JPanel

class RobOSToolWindowFactory : ToolWindowFactory, DumbAware {

    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        val rootPanel = JBPanel<JBPanel<*>>(BorderLayout()).apply {
            background = Color(0x1e, 0x1f, 0x22)
            border = BorderFactory.createEmptyBorder(12, 12, 12, 12)
        }

        // Header
        val headerPanel = JPanel(BorderLayout()).apply {
            isOpaque = false
            val title = JBLabel("⚡ RobOS Autonomous Agent Harness").apply {
                foreground = Color(0x00, 0xbc, 0xd4)
                font = font.deriveFont(Font.BOLD, 14f)
            }
            val status = JBLabel("🟢 IPC Bridge :63343").apply {
                foreground = Color(0x3f, 0xb9, 0x50)
                font = font.deriveFont(Font.PLAIN, 11f)
            }
            add(title, BorderLayout.NORTH)
            add(status, BorderLayout.SOUTH)
        }
        rootPanel.add(headerPanel, BorderLayout.NORTH)

        // Center card with active task & breakpoint state
        val centerPanel = JPanel(GridLayout(4, 1, 8, 8)).apply {
            isOpaque = false
            border = BorderFactory.createEmptyBorder(16, 0, 16, 0)

            val taskCard = JBLabel("<html><b>Task:</b> PET-105 Rabies Verification &amp; Certification<br><b>Branch:</b> <code>feature/PET-105-rabies-verification</code></html>").apply {
                foreground = Color(0xf0, 0xf6, 0xfc)
            }
            val secretCard = JBLabel("<html><b>Vault:</b> <code>acme/vaccine-gateway-mTLS</code> (GPG pass)<br><b>Target:</b> <code>https://localhost:8443</code></html>").apply {
                foreground = Color(0x8b, 0x94, 0x9e)
            }
            val bpStatus = JBLabel("<html><b>Breakpoint:</b> ⏸️ <code>PetService.java:48</code> (Suspended)<br><b>Thread:</b> <code>http-nio-8080-exec-1</code></html>").apply {
                foreground = Color(0xff, 0xc1, 0x07)
            }
            val pactCard = JBLabel("<html><b>Pact Tests:</b> 14/14 Passed | OpenAPI 3.1 Validated</html>").apply {
                foreground = Color(0x3f, 0xb9, 0x50)
            }

            add(taskCard)
            add(secretCard)
            add(bpStatus)
            add(pactCard)
        }
        rootPanel.add(centerPanel, BorderLayout.CENTER)

        // Bottom Action buttons
        val actionsPanel = JPanel(GridLayout(1, 2, 8, 8)).apply {
            isOpaque = false
            val btnApprove = JButton("✓ Approve & Resume").apply {
                background = Color(0x23, 0x86, 0x36)
                foreground = Color.WHITE
                addActionListener {
                    RobOSBreakpointHandler.triggerBreakpoint("PetService.java", 48)
                }
            }
            val btnInspect = JButton("🔍 Stack & Vars").apply {
                background = Color(0x30, 0x36, 0x3d)
                foreground = Color.WHITE
            }
            add(btnApprove)
            add(btnInspect)
        }
        rootPanel.add(actionsPanel, BorderLayout.SOUTH)

        val content = ContentFactory.getInstance().createContent(rootPanel, "", false)
        toolWindow.contentManager.addContent(content)
    }
}
