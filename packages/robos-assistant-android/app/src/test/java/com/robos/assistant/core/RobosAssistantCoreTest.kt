package com.robos.assistant.core

import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.BufferedInputStream
import java.io.ByteArrayOutputStream
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.util.Base64
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

class RobosAssistantCoreTest {

    @Test
    fun wavCodecRoundTripsPcm16MonoCleanly() {
        val rawPcm = HttpAssistantServer.synthesizeSpeechLikeTonePcm(durationMs = 500L, sampleRate = 16000)
        val wav = WavCodec.encodePcm16Mono(rawPcm, sampleRate = 16000)
        assertEquals(44 + rawPcm.size, wav.size)

        val decoded = WavCodec.decodeWav(wav)
        assertNotNull(decoded)
        assertEquals(16000, decoded!!.sampleRate)
        assertEquals(1, decoded.channels)
        assertEquals(16, decoded.bitsPerSample)
        assertEquals(500L, decoded.durationMs)
        assertArrayEquals(rawPcm, decoded.pcm16le)
    }

    @Test
    fun adaptiveVadSegmenterCapturesPreRollAndSegmentsSpeech() {
        val segmenter = AdaptiveVadSegmenter(
            sampleRate = 16000,
            sensitivity = 65,
            silenceHangMs = 400,
            preRollMs = 300,
            maxClipSeconds = 30,
        )
        val quietFrame = ByteArray(3200) // 100ms silence
        val speechFrame = HttpAssistantServer.synthesizeSpeechLikeTonePcm(durationMs = 100L, sampleRate = 16000, freqHz = 240.0)

        val captured = ArrayList<CapturedUtterance>()
        var clockMs = 1_000_000L

        // 400ms quiet -> fills 300ms pre-roll ring
        repeat(4) {
            segmenter.processPcm16Le(quietFrame, quietFrame.size, clockMs) { captured.add(it) }
            clockMs += 100L
        }
        assertTrue(captured.isEmpty())

        // 500ms loud speech
        repeat(5) {
            val tel = segmenter.processPcm16Le(speechFrame, speechFrame.size, clockMs) { captured.add(it) }
            assertTrue(tel.speechActive)
            assertTrue(tel.inUtterance)
            clockMs += 100L
        }

        // 500ms trailing silence -> exceeds 400ms hang time and emits utterance
        repeat(5) {
            segmenter.processPcm16Le(quietFrame, quietFrame.size, clockMs) { captured.add(it) }
            clockMs += 100L
        }

        assertEquals(1, captured.size)
        // 300ms pre-roll + 500ms speech + 400ms hang = ~1200ms
        assertTrue("Expected >= 1100ms with pre-roll, got ${captured[0].durationMs}", captured[0].durationMs >= 1100L)
        assertTrue(captured[0].peakDbFs > -25f)
    }

    @Test
    fun wakeWordParserMatchesCommanderAtStartAndRejectsMidSentenceFalsePositives() {
        val m1 = WakeWordParser.parse("Commander, what is the git status?")
        assertTrue(m1.matched)
        assertFalse(m1.isGreetingOnly)
        assertEquals("what is the git status?", m1.query)

        val m2 = WakeWordParser.parse("hey commander turn on kitchen lights")
        assertTrue(m2.matched)
        assertEquals("turn on kitchen lights", m2.query)

        val m2b = WakeWordParser.parse("And commander add garbage bags to Costco")
        assertTrue(m2b.matched)
        assertEquals("add garbage bags to Costco", m2b.query)

        val m3 = WakeWordParser.parse("Commander!")
        assertTrue(m3.matched)
        assertTrue(m3.isGreetingOnly)

        val ambient = WakeWordParser.parse("Remember to buy coffee beans tomorrow morning")
        assertFalse(ambient.matched)

        val midSentence1 = WakeWordParser.parse("There is no way I just did that so I will watch one in commander tonight")
        assertFalse("Mid-sentence 'commander' must not trigger wake word", midSentence1.matched)

        val midSentence2 = WakeWordParser.parse("I built a new Commander deck yesterday")
        assertFalse("Mid-sentence 'Commander' must not trigger wake word", midSentence2.matched)
    }

    @Test
    fun disconnectedFromRobosServerRecordsAudioAndTextWithoutRunningActions() = runTest {
        val dir = Files.createTempDirectory("robos-assistant-offline-test").toFile()
        try {
            val store = RecordingArchiveStore(dir)
            val gatewayCalls = AtomicInteger(0)
            val coordinator = SurveillanceCoordinator(
                archiveStore = store,
                serverGateway = { _, _, _, _ ->
                    gatewayCalls.incrementAndGet()
                    ServerTurnResponse(ok = true, response = "Should never run while offline")
                },
                isServerConnected = { false },
            )

            val cfg = AssistantConfig(room = "Office", robosServerEnabled = true)
            val pcm = HttpAssistantServer.synthesizeSpeechLikeTonePcm(durationMs = 900L)
            val utt = CapturedUtterance(
                pcm16le = pcm,
                sampleRate = 16000,
                durationMs = 900L,
                peakDbFs = -14f,
                startedEpochMs = 1_700_000_000_000L,
                endedEpochMs = 1_700_000_000_900L,
            )

            // 1. Ambient speech while offline -> recorded as audio + text
            val ambient = coordinator.handleCapturedUtterance(
                config = cfg,
                utterance = utt,
                rawTranscript = "Let us schedule the architecture review at 3 PM",
            )
            assertNotNull(ambient)
            assertEquals(ActionOutcomeStatus.AMBIENT_RECORDED, ambient!!.actionStatus)
            assertFalse(ambient.wakeWordDetected)
            assertTrue(store.getWavFile(ambient.id)!!.exists())
            assertEquals(0, gatewayCalls.get())

            // 2. Wake-word command while RobOS Server is disconnected -> recorded as audio + text ONLY, ZERO actions!
            val offlineCmd = coordinator.handleCapturedUtterance(
                config = cfg,
                utterance = utt.copy(startedEpochMs = 1_700_000_005_000L, endedEpochMs = 1_700_000_005_900L),
                rawTranscript = "Commander, turn on the office lights",
            )
            assertNotNull(offlineCmd)
            assertTrue(offlineCmd!!.wakeWordDetected)
            assertEquals("turn on the office lights", offlineCmd.commandQuery)
            assertFalse(offlineCmd.serverConnectedAtCapture)
            assertEquals(ActionOutcomeStatus.SERVER_OFFLINE_RECORDED_ONLY, offlineCmd.actionStatus)
            assertEquals("", offlineCmd.assistantReply)
            assertEquals(0, gatewayCalls.get())
            assertTrue(store.getWavFile(offlineCmd.id)!!.exists())

            assertEquals(2, store.stats().totalRecordings)
            assertEquals(1, store.stats().offlineRecordedCommandsCount)
            assertEquals(0, store.stats().actionsExecutedCount)
        } finally {
            dir.deleteRecursively()
        }
    }

    @Test
    fun connectedRobosServerExecutesWakeWordActionsAndPlaysReplyWithEchoGuard() = runTest {
        val dir = Files.createTempDirectory("robos-assistant-online-test").toFile()
        val mockVoiceServer = ServerSocket(0, 16, InetSocketAddress("127.0.0.1", 0).address)
        val mockPort = mockVoiceServer.localPort
        val replyWav = WavCodec.encodePcm16Mono(
            HttpAssistantServer.synthesizeSpeechLikeTonePcm(durationMs = 450L, sampleRate = 16000),
            sampleRate = 16000,
        )
        val replyWavB64 = Base64.getEncoder().encodeToString(replyWav)
        val serverRunning = AtomicBoolean(true)

        val serverThread = Thread {
            while (serverRunning.get()) {
                val client = try {
                    mockVoiceServer.accept()
                } catch (_: Exception) {
                    break
                }
                client.use { sock ->
                    val raw = ByteArray(4096)
                    val n = sock.getInputStream().read(raw)
                    val reqStr = if (n > 0) String(raw, 0, n, StandardCharsets.UTF_8) else ""
                    val bodyJson = when {
                        reqStr.startsWith("GET /api/robos-assistant-hub") ->
                            """{"ok":true,"service":"robos-voice-server","hostname":"robos-workstation","port":$mockPort,"ttsEngine":"kokoro"}"""
                        reqStr.startsWith("POST /api/assistant/process-audio") ->
                            """{"ok":true,"isSpeech":true,"transcript":"Commander, what is the git status","sttSource":"robos-server-whisper","wakeWordDetected":true,"greetingOnly":false,"actionExecuted":true,"trigger":"Commander","query":"what is the git status","response":"Branch main is clean with 0 uncommitted files.","skill":"git-status","actionDone":"Checked git status","audioWavBase64":"$replyWavB64"}"""
                        else ->
                            """{"ok":true,"response":"Branch main is clean with 0 uncommitted files.","skill":"git-status","actionDone":"Checked git status","audioWavBase64":"$replyWavB64"}"""
                    }
                    val bytes = bodyJson.toByteArray(StandardCharsets.UTF_8)
                    val resp = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ${bytes.size}\r\nConnection: close\r\n\r\n"
                    sock.getOutputStream().write(resp.toByteArray(StandardCharsets.US_ASCII))
                    sock.getOutputStream().write(bytes)
                    sock.getOutputStream().flush()
                }
            }
        }.apply { isDaemon = true; start() }

        try {
            val client = RobosVoiceServerClient()
            val probe = client.probeServer("127.0.0.1", mockPort, deviceUuid = "dev-1", assistantName = "Desk Phone", room = "Office")
            assertTrue(probe.reachable)
            assertEquals("robos-workstation", probe.hostname)

            val store = RecordingArchiveStore(dir)
            val spokenReplies = ArrayList<String>()
            val coordinator = SurveillanceCoordinator(
                archiveStore = store,
                serverGateway = { cfg, trigger, query, full ->
                    client.executePhoneTurn("127.0.0.1", mockPort, cfg, trigger, query, full)
                },
                isServerConnected = { true },
                serverAudioProcessor = { cfg, wavBytes, fb, armed, trig ->
                    client.processUtteranceAudio("127.0.0.1", mockPort, cfg, wavBytes, fb, armed, trig)
                },
                onSpeakWav = { wavBytes, text ->
                    assertEquals(replyWav.size, wavBytes.size)
                    spokenReplies.add(text)
                },
            )

            val cfg = AssistantConfig(
                room = "Office",
                robosServerEnabled = true,
                robosServerHost = "127.0.0.1",
                robosServerPort = mockPort,
                speakServerReplies = true,
            )
            val pcm = HttpAssistantServer.synthesizeSpeechLikeTonePcm(durationMs = 800L)
            val now = System.currentTimeMillis()

            // 1. Connected raw audio utterance -> offloaded to server Whisper (/api/assistant/process-audio) + executes "Commander" action!
            val executed = coordinator.handleCapturedUtterance(
                config = cfg,
                utterance = CapturedUtterance(pcm, 16000, 800L, -12f, now, now + 800L),
                rawTranscript = "",
                sttSource = "robos-server-whisper",
            )
            assertNotNull(executed)
            assertEquals("robos-server-whisper", executed!!.sttSource)
            assertEquals(ActionOutcomeStatus.ACTION_EXECUTED, executed.actionStatus)
            assertEquals("git-status", executed.actionSkill)
            assertEquals("Branch main is clean with 0 uncommitted files.", executed.assistantReply)
            assertEquals(1, spokenReplies.size)

            // 2. Acoustic echo of the spoken reply is suppressed automatically
            val echo = coordinator.handleCapturedUtterance(
                config = cfg,
                utterance = CapturedUtterance(pcm, 16000, 800L, -18f, now + 1000L, now + 1800L),
                rawTranscript = "Branch main is clean with 0 uncommitted files",
            )
            assertNull(echo)

            // 3. Standalone "Commander" WITHOUT a command is ignored (no "Yes, Commander?", no follow-up arming!)
            val standalone = coordinator.handleCapturedUtterance(
                config = cfg,
                utterance = CapturedUtterance(pcm, 16000, 600L, -14f, now + 3000L, now + 3600L),
                rawTranscript = "Commander",
            )
            assertNotNull(standalone)
            assertFalse(standalone!!.wakeWordDetected)
            assertEquals("", standalone.assistantReply)
            assertEquals(ActionOutcomeStatus.AMBIENT_RECORDED, standalone.actionStatus)
            assertFalse(coordinator.isAwaitingFollowup(now + 4000L))
            assertEquals("Standalone 'Commander' must not speak any reply", 1, spokenReplies.size)

            // Subsequent room speech without "Commander" stays strictly ambient (never executed!)
            val subsequentAmbient = coordinator.handleCapturedUtterance(
                config = cfg,
                utterance = CapturedUtterance(pcm, 16000, 700L, -14f, now + 4100L, now + 4800L),
                rawTranscript = "what is the git status",
            )
            assertNotNull(subsequentAmbient)
            assertEquals(ActionOutcomeStatus.AMBIENT_RECORDED, subsequentAmbient!!.actionStatus)
        } finally {
            serverRunning.set(false)
            mockVoiceServer.close()
            serverThread.join(500)
            dir.deleteRecursively()
        }
    }

    @Test
    fun httpAssistantServerServesStatusRecordingsWavRangesAndEnforcesServerGate() {
        val dir = Files.createTempDirectory("robos-assistant-http-test").toFile()
        var srv: HttpAssistantServer? = null
        try {
            val store = RecordingArchiveStore(dir)
            val hub = LiveAudioHub()
            val vault = MemoryAuthVault("secret123")
            var cfg = AssistantConfig(port = 0, authEnabled = false, robosServerEnabled = false)
            var status = AssistantRuntimeStatus(
                running = true,
                listeningState = ListeningState.LISTENING,
                serverState = ServerConnectionState.OFFLINE_RECORDER_ONLY,
            )

            val coordinator = SurveillanceCoordinator(
                archiveStore = store,
                serverGateway = { _, _, q, _ ->
                    ServerTurnResponse(ok = true, response = "Ran: $q", skill = "demo", actionDone = "Done $q")
                },
                isServerConnected = { status.actionsArmed },
            )

            val controller = object : AssistantNodeController {
                override fun currentConfig(): AssistantConfig = cfg
                override fun currentStatus(): AssistantRuntimeStatus {
                    val s = store.stats()
                    return status.copy(totalRecordings = s.totalRecordings, totalStorageBytes = s.totalBytes)
                }

                override fun connectServer(host: String, port: Int): AssistantRuntimeStatus {
                    cfg = cfg.copy(robosServerEnabled = true, robosServerHost = host, robosServerPort = port)
                    status = status.copy(serverState = ServerConnectionState.CONNECTED, serverHost = host, serverPort = port)
                    return currentStatus()
                }

                override fun disconnectServer(): AssistantRuntimeStatus {
                    cfg = cfg.copy(robosServerEnabled = false)
                    status = status.copy(serverState = ServerConnectionState.DISABLED_RECORDER_ONLY)
                    return currentStatus()
                }

                override suspend fun askWhenConnected(query: String): Result<AudioRecordingEntry> {
                    if (!status.actionsArmed) {
                        return Result.failure(IllegalStateException("RobOS Server is not connected"))
                    }
                    val pcm = HttpAssistantServer.synthesizeSpeechLikeTonePcm(600L)
                    val entry = coordinator.handleCapturedUtterance(
                        config = cfg,
                        utterance = CapturedUtterance(pcm, 16000, 600L, -16f, 1000L, 1600L),
                        rawTranscript = "Commander, $query",
                    )!!
                    return Result.success(entry)
                }

                override suspend fun simulateUtterance(text: String, pcm16le: ByteArray, sampleRate: Int): AudioRecordingEntry? {
                    return coordinator.handleCapturedUtterance(
                        config = cfg,
                        utterance = CapturedUtterance(pcm16le, sampleRate, 800L, -15f, 2000L, 2800L),
                        rawTranscript = text,
                    )
                }

                override suspend fun playRemoteSpeechWav(wavBytes: ByteArray, caption: String) {}
            }

            srv = HttpAssistantServer(0, store, hub, vault, controller).also { it.start() }
            val port = srv.boundPort

            // 1. /api/ask returns 409 Conflict when RobOS Server is disconnected
            val (askOfflineCode, askOfflineBody) = simpleHttp(port, "POST", "/api/ask", """{"query":"git status"}""")
            assertEquals(409, askOfflineCode)
            assertTrue(askOfflineBody.contains("not connected"))

            // 2. Simulate offline utterance -> recorded as WAV + text, retrievable via /recordings/<id>.wav
            val (simCode, simBody) = simpleHttp(port, "POST", "/api/simulate-utterance", """{"text":"Commander, open calendar","durationMs":700}""")
            assertEquals(200, simCode)
            assertTrue(simBody.contains("SERVER_OFFLINE_RECORDED_ONLY"))

            val recId = store.list().first().id
            val (wavCode, wavBytes) = simpleHttpBytes(port, "GET", "/recordings/$recId.wav", extraHeaders = mapOf("Range" to "bytes=0-43"))
            assertEquals(206, wavCode)
            assertEquals(44, wavBytes.size)
            assertEquals("RIFF", String(wavBytes, 0, 4, StandardCharsets.US_ASCII))

            // 3. Connect RobOS Server -> /api/ask succeeds with 200 OK and executes action!
            val (connCode, _) = simpleHttp(port, "POST", "/api/server/connect", """{"host":"127.0.0.1","port":19188}""")
            assertEquals(200, connCode)

            val (askOnlineCode, askOnlineBody) = simpleHttp(port, "POST", "/api/ask", """{"query":"git status"}""")
            assertEquals(200, askOnlineCode)
            assertTrue(askOnlineBody.contains("ACTION_EXECUTED"))
            assertTrue(askOnlineBody.contains("Ran: git status"))

            // 4. Retention pruning check
            store.enforceRetention(maxClips = 1, maxMb = 64)
            assertEquals(1, store.stats().totalRecordings)
        } finally {
            srv?.stop()
            dir.deleteRecursively()
        }
    }

    @Test
    fun speakerIdentificationTagsRecordingsFiltersBySpeakerAndEnrollsClips() = runTest {
        val dir = Files.createTempDirectory("robos-assistant-speaker-test").toFile()
        val mockVoiceServer = ServerSocket(0, 16, InetSocketAddress("127.0.0.1", 0).address)
        val mockPort = mockVoiceServer.localPort
        val serverRunning = AtomicBoolean(true)

        val serverThread = Thread {
            while (serverRunning.get()) {
                val client = try {
                    mockVoiceServer.accept()
                } catch (_: Exception) {
                    break
                }
                client.use { sock ->
                    val raw = ByteArray(16384)
                    val n = sock.getInputStream().read(raw)
                    val reqStr = if (n > 0) String(raw, 0, n, StandardCharsets.UTF_8) else ""
                    val bodyJson = when {
                        reqStr.startsWith("GET /api/speakers") ->
                            """{"ok":true,"engine":"wespeaker-cam++","speakers":[{"speakerId":"nicholas-dipiazza","name":"Nicholas \"Nick\" DiPiazza","shortName":"Nick","sampleCount":2}],"robosPeople":[{"uid":"nicholas-dipiazza","name":"Nicholas \"Nick\" DiPiazza","shortName":"Nick"},{"uid":"diana-arrington","name":"Diana Arrington","shortName":"Diana"}]}"""
                        reqStr.startsWith("POST /api/speakers/enroll") ->
                            """{"ok":true,"speakerId":"diana-arrington","speakerName":"Diana","fullName":"Diana Arrington","sampleCount":1}"""
                        reqStr.startsWith("POST /api/assistant/process-audio") ->
                            """{"ok":true,"isSpeech":true,"transcript":"Hey everyone dinner is ready","sttSource":"robos-server-moonshine","wakeWordDetected":false,"greetingOnly":false,"actionExecuted":false,"speakerId":"nicholas-dipiazza","speakerName":"Nick","speakerFullName":"Nicholas \"Nick\" DiPiazza","speakerConfidencePct":91}"""
                        else ->
                            """{"ok":true}"""
                    }
                    val bytes = bodyJson.toByteArray(StandardCharsets.UTF_8)
                    val resp = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ${bytes.size}\r\nConnection: close\r\n\r\n"
                    sock.getOutputStream().write(resp.toByteArray(StandardCharsets.US_ASCII))
                    sock.getOutputStream().write(bytes)
                    sock.getOutputStream().flush()
                }
            }
        }.apply { isDaemon = true; start() }

        var httpSrv: HttpAssistantServer? = null
        try {
            val client = RobosVoiceServerClient()
            val spkInfo = client.fetchSpeakersInfo("127.0.0.1", mockPort)
            assertTrue(spkInfo.ok)
            assertEquals(listOf("Nick"), spkInfo.enrolledNames)
            assertEquals(listOf("Nick", "Diana"), spkInfo.robosPeopleNames)

            val store = RecordingArchiveStore(dir)
            val coordinator = SurveillanceCoordinator(
                archiveStore = store,
                serverGateway = { cfg, trig, q, full -> client.executePhoneTurn("127.0.0.1", mockPort, cfg, trig, q, full) },
                isServerConnected = { true },
                serverAudioProcessor = { cfg, wavBytes, fb, armed, trig ->
                    client.processUtteranceAudio("127.0.0.1", mockPort, cfg, wavBytes, fb, armed, trig)
                },
            )
            val cfg = AssistantConfig(room = "Kitchen", robosServerEnabled = true, robosServerHost = "127.0.0.1", robosServerPort = mockPort)
            val pcm = HttpAssistantServer.synthesizeSpeechLikeTonePcm(durationMs = 700L)

            // 1. Captured ambient clip is automatically tagged with Nick's voiceprint!
            val nickClip = coordinator.handleCapturedUtterance(
                config = cfg,
                utterance = CapturedUtterance(pcm, 16000, 700L, -14f, 1000L, 1700L),
                rawTranscript = "",
                sttSource = "robos-server-moonshine",
            )
            assertNotNull(nickClip)
            assertEquals("nicholas-dipiazza", nickClip!!.speakerId)
            assertEquals("Nick", nickClip.speakerName)
            assertEquals(91, nickClip.speakerConfidencePct)

            // 2. Unidentified offline clip for filter testing
            val untaggedClip = coordinator.handleCapturedUtterance(
                config = cfg.copy(robosServerEnabled = false),
                utterance = CapturedUtterance(pcm, 16000, 700L, -14f, 2000L, 2700L),
                rawTranscript = "Testing untagged clip",
            )
            assertNotNull(untaggedClip)
            assertEquals("", untaggedClip!!.speakerName)

            assertEquals(1, store.list(filter = RecordingFilter.IDENTIFIED_SPEAKERS).size)
            assertEquals(1, store.list(query = "nick").size)

            // 3. Enroll untagged clip via POST /api/recordings/<id>/enroll-speaker on HttpAssistantServer
            var status = AssistantRuntimeStatus(
                running = true,
                serverState = ServerConnectionState.CONNECTED,
                serverHost = "127.0.0.1",
                serverPort = mockPort,
                enrolledSpeakers = spkInfo.enrolledNames,
                robosPeople = spkInfo.robosPeopleNames,
            )
            val controller = object : AssistantNodeController {
                override fun currentConfig(): AssistantConfig = cfg
                override fun currentStatus(): AssistantRuntimeStatus = status
                override fun connectServer(host: String, port: Int): AssistantRuntimeStatus = status
                override fun disconnectServer(): AssistantRuntimeStatus = status
                override suspend fun askWhenConnected(query: String): Result<AudioRecordingEntry> = Result.failure(IllegalStateException())
                override suspend fun simulateUtterance(text: String, pcm16le: ByteArray, sampleRate: Int): AudioRecordingEntry? = null
                override suspend fun playRemoteSpeechWav(wavBytes: ByteArray, caption: String) {}
                override suspend fun enrollRecordingSpeaker(recordingId: String, speakerName: String): Result<AudioRecordingEntry> {
                    val wav = store.getWavFile(recordingId)!!.readBytes()
                    val res = client.enrollSpeakerWav("127.0.0.1", mockPort, speakerName, wav)
                    val updated = store.updateRecording(recordingId) {
                        it.copy(speakerId = res.speakerId, speakerName = res.speakerName, speakerConfidencePct = 99)
                    }!!
                    status = status.copy(enrolledSpeakers = (status.enrolledSpeakers + res.speakerName).distinct())
                    return Result.success(updated)
                }
            }
            httpSrv = HttpAssistantServer(0, store, LiveAudioHub(), MemoryAuthVault(""), controller).also { it.start() }

            val (enrollCode, enrollBody) = simpleHttp(
                httpSrv.boundPort,
                "POST",
                "/api/recordings/${untaggedClip.id}/enroll-speaker",
                """{"name":"Diana"}""",
            )
            assertEquals(200, enrollCode)
            assertTrue(enrollBody.contains(""""speakerName":"Diana""""))
            assertEquals(2, store.list(filter = RecordingFilter.IDENTIFIED_SPEAKERS).size)

            val (stCode, stBody) = simpleHttp(httpSrv.boundPort, "GET", "/api/status")
            assertEquals(200, stCode)
            assertTrue(stBody.contains(""""enrolledSpeakers":["Nick","Diana"]"""))
        } finally {
            httpSrv?.stop()
            serverRunning.set(false)
            mockVoiceServer.close()
            serverThread.join(500)
            dir.deleteRecursively()
        }
    }

    private fun simpleHttp(port: Int, method: String, path: String, jsonBody: String? = null): Pair<Int, String> {
        val (code, bytes) = simpleHttpBytes(port, method, path, jsonBody)
        return code to String(bytes, StandardCharsets.UTF_8)
    }

    private fun simpleHttpBytes(
        port: Int,
        method: String,
        path: String,
        jsonBody: String? = null,
        extraHeaders: Map<String, String> = emptyMap(),
    ): Pair<Int, ByteArray> {
        val bodyBytes = jsonBody?.toByteArray(StandardCharsets.UTF_8)
        Socket().use { sock ->
            sock.connect(InetSocketAddress("127.0.0.1", port), 2000)
            val head = buildString {
                append("$method $path HTTP/1.1\r\n")
                append("Host: 127.0.0.1:$port\r\n")
                append("Connection: close\r\n")
                for ((k, v) in extraHeaders) append("$k: $v\r\n")
                if (bodyBytes != null) {
                    append("Content-Type: application/json\r\n")
                    append("Content-Length: ${bodyBytes.size}\r\n")
                }
                append("\r\n")
            }
            val out = sock.getOutputStream()
            out.write(head.toByteArray(StandardCharsets.US_ASCII))
            if (bodyBytes != null) out.write(bodyBytes)
            out.flush()

            val raw = BufferedInputStream(sock.getInputStream()).readBytes()
            var sep = -1
            for (i in 0..raw.size - 4) {
                if (raw[i] == '\r'.code.toByte() &&
                    raw[i + 1] == '\n'.code.toByte() &&
                    raw[i + 2] == '\r'.code.toByte() &&
                    raw[i + 3] == '\n'.code.toByte()
                ) {
                    sep = i
                    break
                }
            }
            val headerStr = String(raw, 0, sep, StandardCharsets.ISO_8859_1)
            val code = headerStr.lineSequence().first().split(' ')[1].toInt()
            val payload = ByteArrayOutputStream()
            payload.write(raw, sep + 4, raw.size - (sep + 4))
            return code to payload.toByteArray()
        }
    }
}
