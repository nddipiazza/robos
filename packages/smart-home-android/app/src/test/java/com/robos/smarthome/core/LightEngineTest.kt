package com.robos.smarthome.core

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.joinAll
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.ZoneId
import java.time.ZonedDateTime

private class FakeTransport : LanTransport {
    val sent = mutableListOf<WireStep>()
    var result: SendResult = SendResult.Confirmed
    val replies = ArrayDeque<HttpReply?>()
    val httpCalls = mutableListOf<WireStep.Http>()

    override suspend fun send(step: WireStep): SendResult {
        sent += step
        return result
    }

    override suspend fun http(step: WireStep.Http, timeoutMs: Int): HttpReply? {
        httpCalls += step
        return replies.removeFirstOrNull()
    }
}

private class MemoryStore(var saved: HomeState? = null) : StateStore {
    override fun load() = saved
    override fun save(state: HomeState) {
        saved = state
    }
}

@OptIn(ExperimentalCoroutinesApi::class)
class LightEngineTest {
    // 2026-11-02 is a Monday.
    private var clock = ZonedDateTime.of(2026, 11, 2, 7, 0, 0, 0, ZoneId.of("America/New_York"))
    private val transport = FakeTransport()
    private val store = MemoryStore()

    private fun TestScope.engine() = LightEngine(store, transport, backgroundScope, now = { clock })

    private suspend fun LightEngine.wiz(name: String = "Lamp", room: String = "bedroom", form: String = "bulb") =
        saveLight(null, name, room, "wiz-udp", form, "192.168.1.50", null, "")

    /** The smart-lights.json the desktop engine wrote (tools/export-golden.js). */
    private val desktopHome: String = kotlinx.serialization.json.Json.parseToJsonElement(
        javaClass.classLoader!!.getResource("golden.json")!!.readText(),
    ).let { (it as kotlinx.serialization.json.JsonObject)["desktopHome"].toString() }

    @Test
    fun restoringTheDesktopHomeAddsItsLightsAndKeepsThePhones() = runTest {
        val e = engine()
        val mine = e.saveLight(null, "Phone-only Lamp", UNASSIGNED_ROOM_ID, "lifx-udp", "bulb", "192.168.1.200", null, "")
        // The same WiZ lamp the desktop has, added on the phone under another name.
        val sofa = e.saveLight(null, "Sofa", UNASSIGNED_ROOM_ID, "wiz-udp", "lamp", "192.168.1.83", null, "")
        val summary = e.importDesktopHome(desktopHome)
        val home = e.state.value
        // The phone already has the same five room IDs as the desktop, so only their names change.
        assertEquals(ImportSummary(lightsAdded = 6, lightsUpdated = 1, roomsAdded = 0, scenes = 1, schedules = 3), summary)
        assertEquals(8, home.lights.size)
        assertTrue(home.lights.any { it.id == mine.id && it.name == "Phone-only Lamp" })
        val restoredSofa = home.lights.single { it.ip == "192.168.1.83" }
        assertEquals(sofa.id, restoredSofa.id)
        assertEquals("Sofa Floor Lamp (Philips WiZ)", restoredSofa.name)
        assertEquals("living-room", restoredSofa.roomId)
        assertTrue(home.customScenes.single().isCustom)
        assertEquals(UNASSIGNED_ROOM_ID, home.rooms.last().id)
        assertTrue("restoring sends lights nothing", transport.sent.isEmpty())

        // Restoring again changes nothing.
        assertEquals(ImportSummary(0, 7, 0, 1, 3), e.importDesktopHome(desktopHome))
        assertEquals(8, e.state.value.lights.size)
    }

    @Test
    fun aNewPhoneStartsWithNoLightsAndNoSchedules() = runTest {
        val home = engine().state.value
        assertTrue(home.lights.isEmpty())
        assertTrue(home.schedules.isEmpty())
        assertNull(engine().nextRunTime())
    }

    @Test
    fun addingALightSendsItNothing() = runTest {
        val light = engine().wiz()
        assertTrue(transport.sent.isEmpty())
        assertEquals(38899, light.port)
    }

    @Test
    fun lightsAddedInTheSameInstantGetTheirOwnIds() = runTest {
        val engine = engine()
        engine.mergeScanResults((1..2000).map { FoundLight("wiz-udp", "10.0.${it / 250}.${it % 250}", 38899, "Light $it") })
        val ids = engine.state.value.lights.map { it.id }
        assertEquals(2000, ids.size)
        assertEquals(2000, ids.toSet().size)
    }

    @Test
    fun stateSurvivesARestart() = runTest {
        val first = engine()
        val light = first.wiz()
        first.updateLight(light.id, LightPatch(brightness = 33))
        val second = engine()
        assertEquals(33, second.state.value.lights.single().brightness)
    }

    @Test
    fun changesFollowTheDesktopRules() = runTest {
        val engine = engine()
        val light = engine.wiz()
        // Changing brightness turns a light on.
        assertTrue(engine.updateLight(light.id, LightPatch(brightness = 500))!!.let { it.on && it.brightness == 100 })
        // An explicit off wins over the brightness.
        assertFalse(engine.updateLight(light.id, LightPatch(brightness = 50, on = false))!!.on)
        // Temperature and color switch the mode unless a mode is given.
        assertEquals("kelvin", engine.updateLight(light.id, LightPatch(kelvin = 9000))!!.colorMode)
        assertEquals(6500, engine.state.value.lights.single().kelvin)
        assertEquals("rgb", engine.updateLight(light.id, LightPatch(colorHex = "ff0000"))!!.colorMode)
        assertEquals("#ff0000", engine.state.value.lights.single().colorHex)
    }

    @Test
    fun aFailedSendIsShownOnTheLightAndClearsOnSuccess() = runTest {
        val engine = engine()
        val light = engine.wiz()
        transport.result = SendResult.Failed("No answer")
        assertEquals("No answer", engine.updateLight(light.id, LightPatch(on = true))!!.lastError)
        transport.result = SendResult.Sent
        assertNull(engine.updateLight(light.id, LightPatch(on = false))!!.lastError)
    }

    @Test
    fun aHueLightWithoutAUsernameAsksToPair() = runTest {
        val engine = engine()
        val light = engine.saveLight(null, "Hue", "bedroom", "hue-rest", "bulb", "192.168.1.9", null, "1")
        assertEquals("Pair the Hue Bridge first.", engine.updateLight(light.id, LightPatch(on = true))!!.lastError)
        assertTrue(transport.sent.isEmpty())
    }

    @Test
    fun scenesTreatStripsAndBulbsDifferently() = runTest {
        val engine = engine()
        val bulb = engine.wiz("Bulb")
        val strip = engine.saveLight(null, "Strip", "studio", "wled-http", "strip", "192.168.1.60", null, "")
        engine.applyScene("scene-cozy-evening")
        val lights = engine.state.value.lights
        val savedBulb = lights.first { it.id == bulb.id }
        val savedStrip = lights.first { it.id == strip.id }
        assertEquals("kelvin", savedBulb.colorMode)
        assertEquals(2400, savedBulb.kelvin)
        assertEquals("solid", savedBulb.effect)
        assertEquals("rgb", savedStrip.colorMode)
        assertEquals("#f97316", savedStrip.colorHex)
        assertEquals("fireplace", savedStrip.effect)
        assertEquals("scene-cozy-evening", engine.state.value.activeSceneId)
    }

    @Test
    fun goodnightKeepsTheBedroomNightlight() = runTest {
        val engine = engine()
        val bedroom = engine.wiz("Bedroom", "bedroom")
        val kitchen = engine.wiz("Kitchen", "kitchen")
        engine.applyScene("scene-goodnight")
        val lights = engine.state.value.lights
        assertTrue(lights.first { it.id == bedroom.id }.on)
        assertEquals(10, lights.first { it.id == bedroom.id }.brightness)
        assertFalse(lights.first { it.id == kitchen.id }.on)
    }

    @Test
    fun aSceneCanBeLimitedToOneRoom() = runTest {
        val engine = engine()
        val bedroom = engine.wiz("Bedroom", "bedroom")
        val kitchen = engine.wiz("Kitchen", "kitchen")
        engine.applyScene("scene-deep-focus", "kitchen")
        val lights = engine.state.value.lights
        assertFalse(lights.first { it.id == bedroom.id }.on)
        assertTrue(lights.first { it.id == kitchen.id }.on)
    }

    @Test
    fun savedScenesCopyTheLightsAndCanBeDeleted() = runTest {
        val engine = engine()
        assertNull(engine.saveCustomScene("Empty", ALL_ROOMS))
        val light = engine.wiz()
        engine.updateLight(light.id, LightPatch(brightness = 37, kelvin = 3100))
        val scene = engine.saveCustomScene("Mine", ALL_ROOMS)!!
        assertEquals(37, scene.preset.brightness)
        assertEquals(3100, scene.preset.kelvin)
        assertTrue(engine.scenes.any { it.id == scene.id })
        engine.removeCustomScene(scene.id)
        assertFalse(engine.scenes.any { it.id == scene.id })
    }

    @Test
    fun daylightOnlyChangesLightsThatAreOn() = runTest {
        val engine = engine()
        val on = engine.wiz("On")
        engine.wiz("Off")
        engine.updateLight(on.id, LightPatch(on = true))
        clock = clock.withHour(12)
        val target = engine.applyDaylightNow()
        val lights = engine.state.value.lights
        assertEquals(target.kelvin, lights.first { it.id == on.id }.kelvin)
        assertFalse(lights.first { it.name == "Off" }.on)
    }

    private fun schedule(time: String = "07:00", days: List<String> = ALL_DAYS, fade: Int = 0, scope: String = ALL_ROOMS, scene: String = "scene-deep-focus") =
        Schedule(id = "", name = "Test", time = time, days = days, sceneId = scene, roomScope = scope, fadeMinutes = fade)

    @Test
    fun aScheduleRunsOnceOnItsDayAndTime() = runTest {
        val engine = engine()
        engine.wiz()
        engine.saveSchedule(schedule())
        engine.runDueSchedules().joinAll()
        assertTrue(engine.state.value.lights.single().on)
        val sentAfterFirst = transport.sent.size
        assertEquals(1, sentAfterFirst)
        // A second alarm in the same minute must not run it again.
        engine.runDueSchedules().joinAll()
        assertEquals(sentAfterFirst, transport.sent.size)
    }

    @Test
    fun aScheduleSkipsOtherDaysAndTimes() = runTest {
        val engine = engine()
        engine.wiz()
        engine.saveSchedule(schedule(days = listOf("Tue")))
        engine.saveSchedule(schedule(time = "06:00"))
        engine.saveSchedule(schedule().copy(enabled = false))
        engine.runDueSchedules().joinAll()
        assertTrue(transport.sent.isEmpty())
    }

    @Test
    fun aDelayedAlarmStillRunsWithinTheGraceWindow() = runTest {
        val engine = engine()
        engine.wiz()
        engine.saveSchedule(schedule())
        clock = clock.plusMinutes(4)
        assertEquals(1, engine.runDueSchedules().size)
        val tooLate = engine()
        tooLate.saveSchedule(schedule(time = "06:00"))
        assertTrue(tooLate.runDueSchedules().isEmpty())
    }

    @Test
    fun theNextAlarmIsTheSoonestRun() = runTest {
        val engine = engine()
        val laterToday = engine.saveSchedule(schedule(time = "18:30"))
        assertEquals(clock.withHour(18).withMinute(30), engine.nextRunTime())
        engine.saveSchedule(schedule(time = "08:15"))
        assertEquals(clock.withHour(8).withMinute(15), engine.nextRunTime())
        engine.removeSchedule(laterToday.id)
        clock = clock.withHour(9)
        // Today's time has passed, so it is tomorrow's.
        assertEquals(clock.plusDays(1).withHour(8).withMinute(15), engine.nextRunTime())
    }

    @Test
    fun theNextAlarmSkipsDaysItDoesNotRun() = runTest {
        val engine = engine()
        engine.saveSchedule(schedule(time = "08:00", days = listOf("Fri")))
        assertEquals(clock.plusDays(4).withHour(8), engine.nextRunTime())
    }

    @Test
    fun aScheduleAlreadyRunTodayWaitsForTomorrow() = runTest {
        val engine = engine()
        engine.wiz()
        engine.saveSchedule(schedule())
        assertEquals(clock, engine.nextRunTime())
        engine.runDueSchedules().joinAll()
        assertEquals(clock.plusDays(1), engine.nextRunTime())
    }

    @Test
    fun testingAScheduleDoesNotUseUpItsRun() = runTest {
        val engine = engine()
        engine.wiz()
        val saved = engine.saveSchedule(schedule())
        engine.testSchedule(saved.id)
        assertNull(engine.state.value.schedules.single().lastAutoRunDate)
        assertEquals(1, engine.runDueSchedules().size)
    }

    @Test
    fun aFadeRisesInStepsAndEndsOnTheScene() = runTest {
        val engine = engine()
        engine.wiz()
        engine.saveSchedule(schedule(fade = 10, scene = "scene-deep-focus"))
        val jobs = engine.runDueSchedules()
        runCurrent()
        val first = engine.state.value.lights.single()
        assertTrue("starts near off, got ${first.brightness}", first.brightness < 10)
        assertTrue("starts warm, got ${first.kelvin}", first.kelvin < 2600)

        advanceTimeBy(5 * 60_000L)
        runCurrent()
        val middle = engine.state.value.lights.single()
        assertTrue("halfway, got ${middle.brightness}", middle.brightness in 40..55)

        advanceUntilIdle()
        jobs.joinAll()
        val last = engine.state.value.lights.single()
        assertEquals(92, last.brightness)
        assertEquals(5200, last.kelvin)
        assertEquals(20, transport.sent.size)
    }

    @Test
    fun touchingALightTakesItOutOfAFade() = runTest {
        val engine = engine()
        val light = engine.wiz()
        engine.saveSchedule(schedule(fade = 10))
        val jobs = engine.runDueSchedules()
        runCurrent()
        engine.updateLight(light.id, LightPatch(brightness = 15))
        advanceUntilIdle()
        jobs.joinAll()
        assertEquals(15, engine.state.value.lights.single().brightness)
    }

    @Test
    fun aFadeToOffEndsOff() = runTest {
        val engine = engine()
        val bedroom = engine.wiz("Bedroom", "bedroom")
        val kitchen = engine.wiz("Kitchen", "kitchen")
        engine.updateLight(kitchen.id, LightPatch(brightness = 80))
        engine.saveSchedule(schedule(fade = 5, scene = "scene-goodnight"))
        val jobs = engine.runDueSchedules()
        advanceUntilIdle()
        jobs.joinAll()
        assertFalse(engine.state.value.lights.first { it.id == kitchen.id }.on)
        assertTrue(engine.state.value.lights.first { it.id == bedroom.id }.on)
    }

    @Test
    fun scanningAddsNewLightsWithoutSendingAnything() = runTest {
        val engine = engine()
        val existing = engine.wiz()
        val outcome = engine.mergeScanResults(
            listOf(
                FoundLight("wiz-udp", "192.168.1.50", 38899, "WiZ", on = true, brightness = 44),
                FoundLight("kasa-lan", "192.168.1.51", 9999, "Porch", on = false, brightness = 10),
            ),
        )
        assertEquals(ScanOutcome(1, 1), outcome)
        val lights = engine.state.value.lights
        assertEquals("Lamp", lights.first { it.id == existing.id }.name)
        assertEquals(44, lights.first { it.id == existing.id }.brightness)
        assertEquals(UNASSIGNED_ROOM_ID, lights.first { it.name == "Porch" }.roomId)
        assertTrue(transport.sent.isEmpty())
    }

    @Test
    fun huePairingAddsEveryBridgeLight() = runTest {
        val engine = engine()
        transport.replies += HttpReply(200, """[{"success":{"username":"abc"}}]""")
        transport.replies += HttpReply(
            200,
            """{"1":{"name":"Sofa","productname":"Hue color lamp","state":{"on":true,"bri":127}},
               "4":{"name":"TV","productname":"Hue lightstrip plus","state":{"on":false}}}""",
        )
        val result = engine.pairHueBridge("192.168.1.2")
        assertTrue(result.ok)
        assertEquals(2, result.lightCount)
        val lights = engine.state.value.lights
        val sofa = lights.first { it.name == "Sofa" }
        assertEquals("abc|1", sofa.deviceKey)
        assertEquals(50, sofa.brightness)
        assertTrue(sofa.on)
        assertEquals("strip", lights.first { it.name == "TV" }.formFactor)
        assertEquals("/api/abc/lights", transport.httpCalls[1].path)
        assertTrue(transport.sent.isEmpty())
    }

    @Test
    fun pairingAgainUpdatesTheUsernameInsteadOfDuplicating() = runTest {
        val engine = engine()
        val list = """{"1":{"name":"Sofa","state":{"on":true,"bri":127}}}"""
        transport.replies += listOf(HttpReply(200, """[{"success":{"username":"old"}}]"""), HttpReply(200, list))
        engine.pairHueBridge("192.168.1.2")
        transport.replies += listOf(HttpReply(200, """[{"success":{"username":"new"}}]"""), HttpReply(200, list))
        engine.pairHueBridge("192.168.1.2")
        assertEquals("new|1", engine.state.value.lights.single().deviceKey)
    }

    @Test
    fun huePairingExplainsEachFailure() = runTest {
        val engine = engine()
        assertFalse(engine.pairHueBridge(" ").ok)

        transport.replies += null as HttpReply?
        assertTrue(engine.pairHueBridge("192.168.1.2").message.startsWith("Could not reach"))

        transport.replies += HttpReply(200, """[{"error":{"type":101,"description":"link button not pressed"}}]""")
        assertTrue(engine.pairHueBridge("192.168.1.2").message.startsWith("Press the round button"))

        transport.replies += HttpReply(200, "<html>a router</html>")
        assertTrue(engine.pairHueBridge("192.168.1.2").message.contains("does not look like"))
        assertTrue(engine.state.value.lights.isEmpty())
    }

    @Test
    fun hostsAcceptAnOptionalPort() {
        assertEquals("10.0.0.2" to 80, splitHost(" 10.0.0.2 "))
        assertEquals("10.0.0.2" to 8080, splitHost("10.0.0.2:8080"))
        assertNull(splitHost(""))
        assertNull(splitHost("10.0.0.2:http"))
        assertNotNull(splitHost("bridge.local"))
    }
}
