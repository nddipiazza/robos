package com.robos.smarthome

import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.assertIsOff
import androidx.compose.ui.test.assertIsOn
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import androidx.test.core.app.ApplicationProvider
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.UiDevice
import com.robos.smarthome.android.HomeApp
import com.robos.smarthome.core.ALL_DAYS
import com.robos.smarthome.core.LightPatch
import com.robos.smarthome.core.Schedule
import com.robos.smarthome.ui.MainActivity
import kotlinx.coroutines.runBlocking
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.FixMethodOrder
import org.junit.Rule
import org.junit.Test
import org.junit.runners.MethodSorters
import java.net.HttpURLConnection
import java.net.URL
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter

private const val HOST = "10.0.2.2"
private const val SHOTS = "/data/local/tmp/robos-shots"

/** Drives the real app against tools/fake-lights.js, which records what reaches the "lights". */
@OptIn(ExperimentalTestApi::class)
@FixMethodOrder(MethodSorters.NAME_ASCENDING)
class SmartHomeE2eTest {
    @get:Rule
    val rule = createAndroidComposeRule<MainActivity>()

    private val app get() = ApplicationProvider.getApplicationContext<HomeApp>()
    private val device get() = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())

    private fun control(path: String): String {
        val connection = URL("http://$HOST:19300$path").openConnection() as HttpURLConnection
        return connection.inputStream.use { it.readBytes().decodeToString() }
    }

    private fun packets(protocol: String): List<JSONObject> {
        val all = JSONArray(control("/packets"))
        return (0 until all.length()).map { all.getJSONObject(it) }.filter { it.getString("protocol") == protocol }
    }

    private fun waitFor(what: String, timeoutMs: Long = 8000, check: () -> Boolean) {
        val deadline = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < deadline) {
            if (check()) return
            Thread.sleep(100)
        }
        throw AssertionError("Timed out waiting for $what")
    }

    private fun shot(name: String) {
        rule.waitForIdle()
        // Outside the app's folders, because the test run uninstalls the app when it ends.
        device.executeShellCommand("mkdir -p $SHOTS")
        device.executeShellCommand("screencap -p $SHOTS/$name.png")
    }

    @Before
    fun clean() = runBlocking {
        for (light in app.engine.state.value.lights) app.engine.removeLight(light.id)
        for (schedule in app.engine.state.value.schedules) app.engine.removeSchedule(schedule.id)
        control("/reset")
        Unit
    }

    private fun addLightByHand(name: String, port: Int?) {
        rule.onNodeWithTag("add-light").performScrollTo().performClick()
        rule.onNodeWithTag("field-name").performTextInput(name)
        rule.onNodeWithTag("field-ip").performScrollTo().performTextInput(HOST)
        if (port != null) rule.onNodeWithTag("field-port").performScrollTo().performTextInput(port.toString())
    }

    private fun saveLightDialog() {
        rule.onNodeWithTag("save-light").performClick()
        rule.waitUntilExactlyOneExists(hasTestTag("switch:${app.engine.state.value.lights.lastOrNull()?.name}"), 3000)
    }

    @Test
    fun a_startsEmptyWithWaysToAddLights() {
        rule.onNodeWithText("No lights yet").assertExists()
        rule.onNodeWithTag("scan-empty").assertExists()
        shot("01-first-run")
    }

    @Test
    fun b_wizLightIsAddedWithoutTouchingItThenControlled() {
        addLightByHand("Desk Lamp", null)
        shot("02-add-light")
        saveLightDialog()
        Thread.sleep(500)
        assertTrue("adding a light must not send it anything", packets("wiz").isEmpty())

        rule.onNodeWithTag("switch:Desk Lamp").assertIsOff().performClick()
        waitFor("the on command") { packets("wiz").size == 1 }
        val on = packets("wiz").single().getJSONObject("json").getJSONObject("params")
        assertTrue(on.getBoolean("state"))
        rule.onNodeWithTag("switch:Desk Lamp").assertIsOn()

        // Open the card and pick a color.
        rule.onNodeWithText("Desk Lamp").performClick()
        rule.onNodeWithTag("swatch:#ec4899").performClick()
        waitFor("the color command") { packets("wiz").size == 2 }
        val color = packets("wiz")[1].getJSONObject("json").getJSONObject("params")
        assertEquals(0xec, color.getInt("r"))
        assertEquals(0x48, color.getInt("g"))
        assertEquals(0x99, color.getInt("b"))
        waitFor("the app to settle") { app.engine.state.value.lights.single().lastError == null }
        shot("03-light-card")

        // All off sends only the off state.
        rule.onNodeWithTag("all-off").performClick()
        waitFor("the off command") { packets("wiz").size == 3 }
        val off = packets("wiz")[2].getJSONObject("json").getJSONObject("params")
        assertFalse(off.getBoolean("state"))
        assertEquals(1, off.length())
        rule.onNodeWithTag("switch:Desk Lamp").assertIsOff()
    }

    @Test
    fun c_aLightThatDoesNotAnswerSaysSo() {
        addLightByHand("Broken Lamp", 59999)
        saveLightDialog()
        rule.onNodeWithTag("switch:Broken Lamp").performClick()
        rule.waitUntilExactlyOneExists(hasTestTag("error:Broken Lamp"), 8000)
        rule.onNodeWithTag("error:Broken Lamp").assertTextContains("No answer", substring = true)
        shot("04-unreachable-light")
    }

    @Test
    fun d_hueBridgePairsAndControlsItsLights() {
        rule.onNodeWithTag("pair-hue").performClick()
        rule.onNodeWithTag("field-hue-host").performTextInput("$HOST:19301")
        shot("05-hue-pairing")

        // Link button not pressed: the app explains and adds nothing.
        rule.onNodeWithTag("hue-pair").performClick()
        rule.waitUntilExactlyOneExists(hasTestTag("hue-problem"), 5000)
        shot("05b-hue-button-not-pressed")
        rule.onNodeWithText("Press the round button on top of the bridge, then tap Pair within 30 seconds.").assertExists()
        assertTrue(app.engine.state.value.lights.isEmpty())

        control("/press-link")
        rule.onNodeWithTag("hue-pair").performClick()
        rule.waitUntilExactlyOneExists(hasTestTag("switch:Hue Sofa Lamp"), 5000)
        rule.onNodeWithTag("switch:Hue TV Strip").assertIsOff()
        rule.onNodeWithTag("switch:Hue Sofa Lamp").assertIsOn()
        assertEquals("strip", app.engine.state.value.lights.first { it.name == "Hue TV Strip" }.formFactor)
        shot("06-hue-lights")

        control("/reset")
        rule.onNodeWithTag("switch:Hue TV Strip").performClick()
        waitFor("the Hue command") { packets("hue").size == 1 }
        val put = packets("hue").single()
        assertEquals("PUT", put.getString("method"))
        assertEquals("/api/fake-hue-username/lights/2/state", put.getString("path"))
        assertTrue(put.getJSONObject("json").getBoolean("on"))
        waitFor("no error") { app.engine.state.value.lights.first { it.name == "Hue TV Strip" }.lastError == null }
    }

    @Test
    fun e_sceneReachesEveryLight() {
        runBlocking {
            app.engine.saveLight(null, "Lamp", "living-room", "wiz-udp", "lamp", HOST, null, "")
            app.engine.saveLight(null, "Strip", "living-room", "wled-http", "strip", HOST, 19302, "")
        }
        rule.onNodeWithTag("tab:Scenes").performClick()
        shot("07-scenes")
        rule.onNodeWithTag("apply:Cinema").performScrollTo().performClick()
        waitFor("both lights") { packets("wiz").isNotEmpty() && packets("wled").isNotEmpty() }
        val wiz = packets("wiz").last().getJSONObject("json").getJSONObject("params")
        assertEquals(0x7c, wiz.getInt("r"))
        val wled = packets("wled").last().getJSONObject("json")
        assertEquals(2, wled.getJSONArray("seg").getJSONObject(0).getInt("fx"))
    }

    @Test
    fun f_everyProtocolReachesTheNetworkFromAndroid() = runBlocking {
        val cases = listOf(
            Triple("wiz-udp", 38899, "wiz"),
            Triple("kasa-lan", 9999, "kasa"),
            Triple("lifx-udp", 56700, "lifx"),
            Triple("govee-udp", 4003, "govee"),
            Triple("yeelight-tcp", 55443, "yeelight"),
            Triple("wled-http", 19302, "wled"),
            Triple("elgato-http", 9123, "elgato"),
            Triple("shelly", 19303, "shelly"),
            Triple("hue-rest", 19301, "hue"),
            Triple("ha-rest", 8123, "ha"),
        )
        for ((protocolId, port, recorded) in cases) {
            val key = when (protocolId) {
                "hue-rest" -> "fake-hue-username|1"
                "ha-rest" -> "light.office|test-token"
                else -> ""
            }
            val light = app.engine.saveLight(null, protocolId, "studio", protocolId, "bulb", HOST, port, key)
            val result = app.engine.updateLight(light.id, LightPatch(on = true, brightness = 60))
            assertNotNull(result)
            assertNull("$protocolId: ${result?.lastError}", result?.lastError)
            waitFor("$protocolId traffic") { packets(recorded).isNotEmpty() }
        }
        assertEquals("Bearer test-token", packets("ha").single().getString("auth"))
        assertEquals(listOf(102, 117), packets("lifx").map { it.getInt("type") })
        assertEquals(3, packets("yeelight").size)
        assertEquals(3, packets("govee").size)
    }

    @Test
    fun g_scheduleUiAddsAndTestsASchedule() {
        runBlocking { app.engine.saveLight(null, "Lamp", "bedroom", "wiz-udp", "lamp", HOST, null, "") }
        rule.onNodeWithTag("tab:Schedules").performClick()
        rule.onNodeWithText("No schedules yet").assertExists()
        rule.onNodeWithTag("add-schedule").performClick()
        rule.onNodeWithTag("field-schedule-name").performTextInput("Wake up")
        shot("08-schedule-editor")
        rule.onNodeWithTag("save-schedule").performClick()
        rule.waitUntilExactlyOneExists(hasTestTag("test:Wake up"), 3000)
        shot("09-schedules")
        rule.onNodeWithTag("test:Wake up").performClick()
        waitFor("the scene") { packets("wiz").isNotEmpty() }
    }

    @Test
    fun h_scheduleRunsWithTheAppInTheBackground() {
        val at = ZonedDateTime.now().plusMinutes(1)
        val lightId = runBlocking {
            val light = app.engine.saveLight(null, "Lamp", "bedroom", "wiz-udp", "lamp", HOST, null, "")
            app.engine.saveSchedule(
                Schedule(
                    id = "",
                    name = "Soon",
                    time = at.format(DateTimeFormatter.ofPattern("HH:mm")),
                    days = ALL_DAYS,
                    sceneId = "scene-night-reading",
                ),
            )
            light.id
        }
        device.pressHome()
        waitFor("the schedule to run from its alarm", timeoutMs = 130_000) { packets("wiz").isNotEmpty() }
        val params = packets("wiz").last().getJSONObject("json").getJSONObject("params")
        assertEquals(48, params.getInt("dimming"))
        assertEquals(3000, params.getInt("temp"))
        waitFor("the run to be recorded") {
            app.engine.state.value.schedules.single().lastAutoRunDate != null &&
                app.engine.state.value.lights.single { it.id == lightId }.on
        }
    }

    @Test
    fun i_appliancesTabExplainsHowToConnect() {
        rule.onNodeWithTag("tab:Appliances").performClick()
        rule.onNodeWithText("Connect LG ThinQ").assertExists()
        shot("10-appliances")
    }
}
