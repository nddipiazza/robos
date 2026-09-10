package com.robos.intellij

import com.google.gson.Gson
import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpHandler
import com.sun.net.httpserver.HttpServer
import java.io.File
import java.io.InputStreamReader
import java.net.InetSocketAddress
import java.net.URLDecoder
import java.nio.charset.StandardCharsets
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

data class RunConfigRecord(
    val name: String,
    val type: String,
    val projectPath: String?,
    val mainClassOrCommand: String?,
    val env: Map<String, String>,
    var status: String = "READY",
    var mode: String? = null,
    var pid: Long? = null
)

class RobOSIpcServer(private val port: Int = 63343) {

    private var server: HttpServer? = null
    private val gson = Gson()
    private val runConfigs = ConcurrentHashMap<String, RunConfigRecord>()

    init {
        // Seed standard demo run configurations
        runConfigs["Debug PetServiceTest"] = RunConfigRecord(
            name = "Debug PetServiceTest",
            type = "JUnit",
            projectPath = "/home/ndipiazza/source/robos/packages/robos-agent-session/demo-app",
            mainClassOrCommand = "com.acme.petshop.service.PetServiceTest",
            env = mapOf("SPRING_PROFILES_ACTIVE" to "test", "MTLS_KEYSTORE" to "pass:acme/vaccine-gateway-mTLS"),
            status = "SUSPENDED",
            mode = "debug",
            pid = 18402
        )
    }

    fun start() {
        try {
            server = HttpServer.create(InetSocketAddress("127.0.0.1", port), 0).apply {
                createContext("/robos/health", HealthHandler())
                createContext("/robos/open-file", OpenFileHandler())
                createContext("/robos/set-breakpoint", BreakpointHandler())
                createContext("/robos/run-config/create", CreateRunConfigHandler())
                createContext("/robos/run-config/run", RunConfigRunHandler())
                createContext("/robos/run-config/stop", RunConfigStopHandler())
                createContext("/robos/run", RunConfigRunHandler())
                createContext("/robos/stop", RunConfigStopHandler())
                createContext("/robos/webhook/register", WebhookRegisterHandler())
                createContext("/robos/debug/thread-state", ThreadStateHandler())
                createContext("/robos/workspace/ephemeral", EphemeralWorkspaceHandler())
                createContext("/robos/workspace/destroy", DestroyWorkspaceHandler())
                executor = Executors.newFixedThreadPool(4)
                start()
            }
            println("[RobOSIpcServer] Listening on http://127.0.0.1:$port")
        } catch (e: Exception) {
            System.err.println("[RobOSIpcServer] Failed to bind on port $port: ${e.message}")
        }
    }

    fun stop() {
        server?.stop(1)
        server = null
    }

    private inner class HealthHandler : HttpHandler {
        override fun handle(exchange: HttpExchange) {
            val res = mapOf(
                "status" to "OK",
                "ide" to "IntelliJ IDEA Ultimate 2026.1",
                "port" to port,
                "plugin" to "com.robos.intellij",
                "version" to "1.0.0"
            )
            sendJsonResponse(exchange, 200, res)
        }
    }

    private inner class OpenFileHandler : HttpHandler {
        override fun handle(exchange: HttpExchange) {
            val params = parseParams(exchange)
            val file = params["file"] ?: ""
            val line = params["line"]?.toIntOrNull() ?: 1
            val res = mapOf("ok" to true, "action" to "open-file", "file" to file, "line" to line)
            sendJsonResponse(exchange, 200, res)
        }
    }

    private inner class BreakpointHandler : HttpHandler {
        override fun handle(exchange: HttpExchange) {
            val params = parseParams(exchange)
            val file = params["file"] ?: "PetService.java"
            val line = params["line"]?.toIntOrNull() ?: 48
            val enabled = params["enabled"]?.toBooleanStrictOrNull() ?: true

            RobOSBreakpointHandler.triggerBreakpoint(file, line)

            val res = mapOf("ok" to true, "action" to "set-breakpoint", "file" to file, "line" to line, "enabled" to enabled)
            sendJsonResponse(exchange, 200, res)
        }
    }

    private inner class CreateRunConfigHandler : HttpHandler {
        override fun handle(exchange: HttpExchange) {
            val body = parseJsonBody(exchange)
            val name = body["name"] as? String ?: "New Run Config"
            val type = body["type"] as? String ?: "Application"
            val projectPath = body["projectPath"] as? String
            val mainClass = body["mainClassOrCommand"] as? String

            @Suppress("UNCHECKED_CAST")
            val rawEnv = (body["env"] as? Map<String, String>) ?: emptyMap()
            // Securely resolve pass secrets
            val resolvedEnv = RobOSSecretResolver.resolveEnvironment(rawEnv)

            val record = RunConfigRecord(
                name = name,
                type = type,
                projectPath = projectPath,
                mainClassOrCommand = mainClass,
                env = resolvedEnv,
                status = "READY"
            )
            runConfigs[name] = record

            val res = mapOf(
                "ok" to true,
                "name" to name,
                "type" to type,
                "status" to "READY",
                "secretsResolvedCount" to rawEnv.count { it.value.startsWith("pass:") },
                "runConfig" to record
            )
            sendJsonResponse(exchange, 201, res)
        }
    }

    private inner class RunConfigRunHandler : HttpHandler {
        override fun handle(exchange: HttpExchange) {
            val params = parseParams(exchange)
            val body = if (exchange.requestMethod.equals("POST", ignoreCase = true)) parseJsonBody(exchange) else emptyMap()
            val name = (body["name"] as? String) ?: params["name"] ?: "Debug PetServiceTest"
            val mode = (body["mode"] as? String) ?: params["mode"] ?: "debug"

            val existing = runConfigs[name] ?: RunConfigRecord(
                name = name,
                type = "Application",
                projectPath = null,
                mainClassOrCommand = null,
                env = emptyMap()
            ).also { runConfigs[name] = it }

            existing.status = "RUNNING"
            existing.mode = mode
            existing.pid = (10000..60000).random().toLong()

            // If debugging, simulate breakpoint hit after brief launch delay
            if (mode == "debug") {
                RobOSBreakpointHandler.triggerBreakpoint("PetService.java", 48)
            }

            val res = mapOf("ok" to true, "name" to name, "mode" to mode, "status" to existing.status, "pid" to existing.pid)
            sendJsonResponse(exchange, 200, res)
        }
    }

    private inner class RunConfigStopHandler : HttpHandler {
        override fun handle(exchange: HttpExchange) {
            val params = parseParams(exchange)
            val name = params["name"] ?: "Debug PetServiceTest"
            val existing = runConfigs[name]

            if (existing != null) {
                existing.status = "STOPPED"
                existing.pid = null
            }
            RobOSEphemeralWorkspaceManager.onSessionEnded(name)

            val res = mapOf("ok" to true, "name" to name, "status" to "STOPPED")
            sendJsonResponse(exchange, 200, res)
        }
    }

    private inner class WebhookRegisterHandler : HttpHandler {
        override fun handle(exchange: HttpExchange) {
            val body = parseJsonBody(exchange)
            val webhookUrl = body["webhookUrl"] as? String
            if (webhookUrl.isNullOrBlank()) {
                sendJsonResponse(exchange, 400, mapOf("ok" to false, "error" to "webhookUrl parameter required"))
                return
            }
            RobOSBreakpointHandler.registerWebhook(webhookUrl)
            val res = mapOf("ok" to true, "registered" to webhookUrl, "totalWebhooks" to RobOSBreakpointHandler.getRegisteredWebhooks().size)
            sendJsonResponse(exchange, 200, res)
        }
    }

    private inner class ThreadStateHandler : HttpHandler {
        override fun handle(exchange: HttpExchange) {
            val params = parseParams(exchange)
            val threadId = params["threadId"]
            val state = RobOSBreakpointHandler.getThreadState(threadId)
            if (state == null) {
                sendJsonResponse(exchange, 404, mapOf("ok" to false, "error" to "No paused thread found"))
                return
            }
            val res = mapOf("ok" to true, "thread" to state)
            sendJsonResponse(exchange, 200, res)
        }
    }

    private inner class EphemeralWorkspaceHandler : HttpHandler {
        override fun handle(exchange: HttpExchange) {
            val body = parseJsonBody(exchange)
            val wsId = body["workspaceId"] as? String ?: "ws-${System.currentTimeMillis()}"

            @Suppress("UNCHECKED_CAST")
            val projects = (body["projects"] as? List<String>) ?: listOf("/tmp/default-project")
            val autoDebug = body["autoRunConfig"] as? String
            val autoDestroy = (body["autoDestroyOnSessionEnd"] as? Boolean) ?: true

            val ws = RobOSEphemeralWorkspaceManager.createWorkspace(
                workspaceId = wsId,
                projectPaths = projects,
                autoRunConfig = autoDebug,
                autoDestroyOnSessionEnd = autoDestroy
            )

            if (!autoDebug.isNullOrBlank()) {
                RobOSBreakpointHandler.triggerBreakpoint("PetService.java", 48)
            }

            val res = mapOf("ok" to true, "workspace" to ws)
            sendJsonResponse(exchange, 201, res)
        }
    }

    private inner class DestroyWorkspaceHandler : HttpHandler {
        override fun handle(exchange: HttpExchange) {
            val params = parseParams(exchange)
            val wsId = params["workspaceId"] ?: ""
            val destroyed = RobOSEphemeralWorkspaceManager.destroyWorkspace(wsId)
            val res = mapOf("ok" to destroyed, "workspaceId" to wsId)
            sendJsonResponse(exchange, 200, res)
        }
    }

    private fun parseParams(exchange: HttpExchange): Map<String, String> {
        val query = exchange.requestURI.rawQuery ?: return emptyMap()
        return query.split("&")
            .mapNotNull {
                val parts = it.split("=", limit = 2)
                if (parts.isNotEmpty()) {
                    val k = URLDecoder.decode(parts[0], StandardCharsets.UTF_8.name())
                    val v = if (parts.size > 1) URLDecoder.decode(parts[1], StandardCharsets.UTF_8.name()) else ""
                    k to v
                } else null
            }.toMap()
    }

    @Suppress("UNCHECKED_CAST")
    private fun parseJsonBody(exchange: HttpExchange): Map<String, Any?> {
        return try {
            InputStreamReader(exchange.requestBody, StandardCharsets.UTF_8).use {
                gson.fromJson(it, Map::class.java) as Map<String, Any?>
            }
        } catch (_: Exception) {
            emptyMap()
        }
    }

    private fun sendJsonResponse(exchange: HttpExchange, statusCode: Int, data: Any) {
        val json = gson.toJson(data)
        val bytes = json.toByteArray(StandardCharsets.UTF_8)
        exchange.responseHeaders.set("Content-Type", "application/json; charset=UTF-8")
        exchange.sendResponseHeaders(statusCode, bytes.size.toLong())
        exchange.responseBody.use { it.write(bytes) }
    }
}
