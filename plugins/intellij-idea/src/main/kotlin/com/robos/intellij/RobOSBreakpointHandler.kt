package com.robos.intellij

import com.google.gson.Gson
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.Executors

data class StackFrameInfo(
    val file: String,
    val className: String,
    val methodName: String,
    val line: Int
)

data class ThreadState(
    val threadId: String,
    val threadName: String,
    val status: String,
    val suspendedAtFile: String,
    val suspendedAtLine: Int,
    val frames: List<StackFrameInfo>,
    val variables: Map<String, String>
)

data class BreakpointEvent(
    val event: String = "breakpoint_hit",
    val timestamp: Long = System.currentTimeMillis(),
    val file: String,
    val line: Int,
    val thread: ThreadState
)

object RobOSBreakpointHandler {

    private val gson = Gson()
    private val webhookUrls = CopyOnWriteArrayList<String>()
    private val threadStates = ConcurrentHashMap<String, ThreadState>()
    private val executor = Executors.newCachedThreadPool()

    @Volatile
    private var lastActiveThreadId: String? = null

    init {
        // Seed default paused state for reproduction testing
        val defaultThread = ThreadState(
            threadId = "thread-exec-1",
            threadName = "http-nio-8080-exec-1",
            status = "SUSPENDED",
            suspendedAtFile = "PetService.java",
            suspendedAtLine = 48,
            frames = listOf(
                StackFrameInfo("PetService.java", "com.acme.petshop.service.PetService", "adoptPet", 48),
                StackFrameInfo("PetController.java", "com.acme.petshop.web.PetController", "processAdoption", 104),
                StackFrameInfo("SecurityFilterChain.java", "org.springframework.security.web.SecurityFilterChain", "doFilterInternal", 221)
            ),
            variables = mapOf(
                "pet" to "{Pet@1402} \"id=a81b2c-91, species=Canine, ageMonths=4, status=PENDING\"",
                "tagId" to "\"VAX-2026-9814\"",
                "vaccineGateway" to "{VaccineGatewayClient@1499} (mTLS target: https://localhost:8443)",
                "stateCompliant" to "false"
            )
        )
        recordThreadState(defaultThread)
    }

    fun registerWebhook(url: String): Boolean {
        if (!webhookUrls.contains(url)) {
            webhookUrls.add(url)
        }
        return true
    }

    fun getRegisteredWebhooks(): List<String> = webhookUrls.toList()

    fun recordThreadState(state: ThreadState) {
        threadStates[state.threadId] = state
        lastActiveThreadId = state.threadId
    }

    fun getThreadState(threadId: String? = null): ThreadState? {
        val id = threadId ?: lastActiveThreadId ?: return null
        return threadStates[id]
    }

    fun getAllThreadStates(): Collection<ThreadState> = threadStates.values

    fun triggerBreakpoint(file: String, line: Int, thread: ThreadState? = null) {
        val activeThread = thread ?: getThreadState() ?: ThreadState(
            threadId = "main",
            threadName = "main",
            status = "SUSPENDED",
            suspendedAtFile = file,
            suspendedAtLine = line,
            frames = listOf(StackFrameInfo(file, "UnknownClass", "execute", line)),
            variables = emptyMap()
        )
        recordThreadState(activeThread)

        val event = BreakpointEvent(
            file = file,
            line = line,
            thread = activeThread
        )
        val jsonPayload = gson.toJson(event)

        for (webhookUrl in webhookUrls) {
            executor.submit {
                dispatchWebhook(webhookUrl, jsonPayload)
            }
        }
    }

    private fun dispatchWebhook(endpoint: String, payload: String) {
        try {
            val url = URL(endpoint)
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "POST"
            conn.setRequestProperty("Content-Type", "application/json")
            conn.setRequestProperty("User-Agent", "RobOS-IntelliJ-Plugin/1.0")
            conn.doOutput = true
            conn.connectTimeout = 3000
            conn.readTimeout = 3000
            conn.outputStream.use { os ->
                os.write(payload.toByteArray(Charsets.UTF_8))
            }
            conn.responseCode
            conn.disconnect()
        } catch (e: Exception) {
            System.err.println("[RobOSBreakpointHandler] Webhook dispatch error: ${e.message}")
        }
    }
}
