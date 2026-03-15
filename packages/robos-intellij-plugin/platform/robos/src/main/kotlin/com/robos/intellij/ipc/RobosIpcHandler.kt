package com.robos.intellij.ipc

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.logger
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.ProjectManager
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.wm.WindowManager
import com.robos.intellij.services.RobosWorkspaceService
import io.netty.buffer.Unpooled
import io.netty.channel.ChannelFutureListener
import io.netty.channel.ChannelHandlerContext
import io.netty.channel.SimpleChannelInboundHandler
import io.netty.handler.codec.http.*
import java.io.File
import java.nio.charset.StandardCharsets

/**
 * Netty inbound handler that routes incoming HTTP requests to the appropriate
 * RobOS IPC action.
 *
 * All endpoints accept and return `application/json`. Paths:
 *
 * | Method | Path                   | Description                                 |
 * |--------|------------------------|---------------------------------------------|
 * | GET    | /robos/health          | Returns `{"ok":true,"version":"..."}`.      |
 * | GET    | /robos/status          | Returns current workspace state.            |
 * | POST   | /robos/open-project    | Opens a project directory in the IDE.       |
 * | POST   | /robos/open-file       | Opens a file in the editor.                 |
 * | POST   | /robos/navigate        | Navigates to a file:line:column.            |
 * | POST   | /robos/run             | Runs a named run configuration.             |
 * | POST   | /robos/stop            | Stops the currently running configuration.  |
 * | POST   | /robos/notify          | Shows a balloon notification in the IDE.    |
 * | POST   | /robos/workspace       | Updates workspace metadata (ticket, branch).|
 */
class RobosIpcHandler : SimpleChannelInboundHandler<FullHttpRequest>() {

    companion object {
        private val LOG = logger<RobosIpcHandler>()
        private val PLUGIN_VERSION = RobosIpcHandler::class.java
            .getResourceAsStream("/META-INF/robos-version.txt")
            ?.bufferedReader()?.readLine()?.trim() ?: "dev"
    }

    override fun channelRead0(ctx: ChannelHandlerContext, req: FullHttpRequest) {
        if (!req.decoderResult().isSuccess) {
            sendResponse(ctx, HttpResponseStatus.BAD_REQUEST, mapOf("error" to "bad_request"))
            return
        }

        val body = req.content().toString(StandardCharsets.UTF_8)
        val json = RobosIpcServer.JSON

        LOG.debug("RobOS IPC ${req.method()} ${req.uri()}")

        try {
            when {
                req.method() == HttpMethod.GET && req.uri() == "/robos/health" ->
                    sendResponse(ctx, HttpResponseStatus.OK, mapOf("ok" to true, "version" to PLUGIN_VERSION))

                req.method() == HttpMethod.GET && req.uri() == "/robos/status" ->
                    handleStatus(ctx)

                req.method() == HttpMethod.POST && req.uri() == "/robos/open-project" ->
                    handleOpenProject(ctx, json.readTree(body))

                req.method() == HttpMethod.POST && req.uri() == "/robos/open-file" ->
                    handleOpenFile(ctx, json.readTree(body))

                req.method() == HttpMethod.POST && req.uri() == "/robos/navigate" ->
                    handleNavigate(ctx, json.readTree(body))

                req.method() == HttpMethod.POST && req.uri() == "/robos/run" ->
                    handleRun(ctx, json.readTree(body))

                req.method() == HttpMethod.POST && req.uri() == "/robos/stop" ->
                    handleStop(ctx)

                req.method() == HttpMethod.POST && req.uri() == "/robos/notify" ->
                    handleNotify(ctx, json.readTree(body))

                req.method() == HttpMethod.POST && req.uri() == "/robos/workspace" ->
                    handleWorkspaceUpdate(ctx, json.readTree(body))

                else ->
                    sendResponse(ctx, HttpResponseStatus.NOT_FOUND, mapOf("error" to "not_found"))
            }
        } catch (e: Exception) {
            LOG.warn("RobOS IPC error for ${req.uri()}", e)
            sendResponse(ctx, HttpResponseStatus.INTERNAL_SERVER_ERROR, mapOf("error" to e.message))
        }
    }

    // ── Handlers ─────────────────────────────────────────────────────────────

    private fun handleStatus(ctx: ChannelHandlerContext) {
        val ws = workspaceService()
        val state = ws.getState()
        sendResponse(ctx, HttpResponseStatus.OK, mapOf(
            "ticketId"       to state.ticketId,
            "ticketTitle"    to state.ticketTitle,
            "branch"         to state.branch,
            "projectPath"    to state.projectPath,
            "focusedMinutes" to ws.focusedMinutes(),
            "collaborators"  to state.collaborators,
            "ipcPort"        to RobosIpcServer.instance().boundPort,
        ))
    }

    private fun handleOpenProject(ctx: ChannelHandlerContext, body: com.fasterxml.jackson.databind.JsonNode) {
        val path = body.get("path")?.asText()
            ?: return sendResponse(ctx, HttpResponseStatus.BAD_REQUEST, mapOf("error" to "path required"))

        val dir = File(path)
        if (!dir.exists()) return sendResponse(ctx, HttpResponseStatus.BAD_REQUEST, mapOf("error" to "path not found"))

        ApplicationManager.getApplication().invokeLater {
            val projectManager = ProjectManager.getInstance()
            projectManager.loadAndOpenProject(path)
        }

        workspaceService().setProjectPath(path)
        sendResponse(ctx, HttpResponseStatus.OK, mapOf("ok" to true, "path" to path))
    }

    private fun handleOpenFile(ctx: ChannelHandlerContext, body: com.fasterxml.jackson.databind.JsonNode) {
        val filePath = body.get("file")?.asText()
            ?: return sendResponse(ctx, HttpResponseStatus.BAD_REQUEST, mapOf("error" to "file required"))

        val vFile = LocalFileSystem.getInstance().findFileByPath(filePath)
            ?: return sendResponse(ctx, HttpResponseStatus.NOT_FOUND, mapOf("error" to "file not found"))

        ApplicationManager.getApplication().invokeLater {
            val project = ProjectManager.getInstance().openProjects.firstOrNull() ?: return@invokeLater
            FileEditorManager.getInstance(project).openFile(vFile, true)
        }

        sendResponse(ctx, HttpResponseStatus.OK, mapOf("ok" to true, "file" to filePath))
    }

    private fun handleNavigate(ctx: ChannelHandlerContext, body: com.fasterxml.jackson.databind.JsonNode) {
        val filePath = body.get("file")?.asText()
            ?: return sendResponse(ctx, HttpResponseStatus.BAD_REQUEST, mapOf("error" to "file required"))
        val line   = body.get("line")?.asInt(1) ?: 1
        val column = body.get("column")?.asInt(1) ?: 1

        val vFile = LocalFileSystem.getInstance().findFileByPath(filePath)
            ?: return sendResponse(ctx, HttpResponseStatus.NOT_FOUND, mapOf("error" to "file not found"))

        ApplicationManager.getApplication().invokeLater {
            val project = ProjectManager.getInstance().openProjects.firstOrNull() ?: return@invokeLater
            val editors = FileEditorManager.getInstance(project).openFile(vFile, true)
            val editor = editors.firstOrNull() ?: return@invokeLater
            if (editor is com.intellij.openapi.fileEditor.TextEditor) {
                val doc = editor.editor.document
                val offset = doc.getLineStartOffset(minOf(line - 1, doc.lineCount - 1)) + (column - 1)
                editor.editor.caretModel.moveToOffset(offset.coerceAtLeast(0))
                editor.editor.scrollingModel.scrollToCaret(com.intellij.openapi.editor.ScrollType.CENTER)
            }
        }

        sendResponse(ctx, HttpResponseStatus.OK, mapOf("ok" to true, "file" to filePath, "line" to line, "column" to column))
    }

    private fun handleRun(ctx: ChannelHandlerContext, body: com.fasterxml.jackson.databind.JsonNode) {
        val configName = body.get("configuration")?.asText()
            ?: return sendResponse(ctx, HttpResponseStatus.BAD_REQUEST, mapOf("error" to "configuration required"))

        ApplicationManager.getApplication().invokeLater {
            val project = ProjectManager.getInstance().openProjects.firstOrNull() ?: return@invokeLater
            val manager = com.intellij.execution.RunManager.getInstance(project)
            val settings = manager.findConfigurationByName(configName)
            if (settings != null) {
                com.intellij.execution.executors.DefaultRunExecutor.getRunExecutorInstance()?.let { executor ->
                    com.intellij.execution.ProgramRunnerUtil.executeConfiguration(settings, executor)
                }
            }
        }

        sendResponse(ctx, HttpResponseStatus.OK, mapOf("ok" to true, "configuration" to configName))
    }

    private fun handleStop(ctx: ChannelHandlerContext) {
        ApplicationManager.getApplication().invokeLater {
            val project = ProjectManager.getInstance().openProjects.firstOrNull() ?: return@invokeLater
            val executionManager = com.intellij.execution.ExecutionManager.getInstance(project)
            executionManager.getRunningDescriptors { true }.forEach { descriptor ->
                descriptor.processHandler?.destroyProcess()
            }
        }
        sendResponse(ctx, HttpResponseStatus.OK, mapOf("ok" to true))
    }

    private fun handleNotify(ctx: ChannelHandlerContext, body: com.fasterxml.jackson.databind.JsonNode) {
        val message  = body.get("message")?.asText() ?: "RobOS notification"
        val title    = body.get("title")?.asText() ?: "RobOS"
        val severity = body.get("severity")?.asText() ?: "info"

        ApplicationManager.getApplication().invokeLater {
            val project = ProjectManager.getInstance().openProjects.firstOrNull()
            val notificationType = when (severity) {
                "urgent", "error" -> com.intellij.notification.NotificationType.ERROR
                "warning"         -> com.intellij.notification.NotificationType.WARNING
                else              -> com.intellij.notification.NotificationType.INFORMATION
            }
            com.intellij.notification.NotificationGroupManager.getInstance()
                .getNotificationGroup("RobOS")
                .createNotification(title, message, notificationType)
                .apply { if (project != null) notify(project) else notify(null) }
        }

        sendResponse(ctx, HttpResponseStatus.OK, mapOf("ok" to true))
    }

    private fun handleWorkspaceUpdate(ctx: ChannelHandlerContext, body: com.fasterxml.jackson.databind.JsonNode) {
        val ws = workspaceService()
        body.get("ticketId")?.asText()?.let { id ->
            ws.setTicket(
                ticketId    = id,
                ticketTitle = body.get("ticketTitle")?.asText() ?: "",
                ticketUrl   = body.get("ticketUrl")?.asText() ?: "",
            )
        }
        body.get("branch")?.asText()?.let { ws.setBranch(it) }
        if (body.has("collaborators")) {
            val collabs = body.get("collaborators").map { c ->
                RobosWorkspaceService.Collaborator(
                    username     = c.get("username")?.asText() ?: "",
                    displayName  = c.get("displayName")?.asText() ?: "",
                    avatarUrl    = c.get("avatarUrl")?.asText() ?: "",
                    lastActivity = c.get("lastActivity")?.asText() ?: "",
                )
            }
            ws.setCollaborators(collabs)
        }
        sendResponse(ctx, HttpResponseStatus.OK, mapOf("ok" to true))
    }

    // ── Utilities ─────────────────────────────────────────────────────────────

    private fun workspaceService() =
        ApplicationManager.getApplication().getService(RobosWorkspaceService::class.java)

    private fun sendResponse(ctx: ChannelHandlerContext, status: HttpResponseStatus, payload: Any) {
        val bytes = RobosIpcServer.JSON.writeValueAsBytes(payload)
        val response = DefaultFullHttpResponse(
            HttpVersion.HTTP_1_1,
            status,
            Unpooled.wrappedBuffer(bytes),
        )
        response.headers().apply {
            set(HttpHeaderNames.CONTENT_TYPE, "application/json; charset=UTF-8")
            set(HttpHeaderNames.CONTENT_LENGTH, bytes.size)
            set(HttpHeaderNames.ACCESS_CONTROL_ALLOW_ORIGIN, "http://localhost")
        }
        ctx.writeAndFlush(response).addListener(ChannelFutureListener.CLOSE)
    }

    override fun exceptionCaught(ctx: ChannelHandlerContext, cause: Throwable) {
        LOG.warn("RobOS IPC channel error", cause)
        ctx.close()
    }
}
