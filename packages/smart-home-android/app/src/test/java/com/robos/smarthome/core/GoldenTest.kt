package com.robos.smarthome.core

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.double
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Compares the Kotlin port with what the desktop JavaScript produced. See tools/export-golden.js. */
class GoldenTest {
    private val golden: JsonObject = Json.parseToJsonElement(
        javaClass.classLoader!!.getResource("golden.json")!!.readText(),
    ).jsonObject

    private fun list(name: String): List<JsonObject> = golden[name]!!.jsonArray.map { it.jsonObject }
    private fun colors(name: String): List<JsonObject> = golden["colors"]!!.jsonObject[name]!!.jsonArray.map { it.jsonObject }
    private val JsonElement.text get() = jsonPrimitive.content

    private fun hex(text: String) = ByteArray(text.length / 2) { text.substring(it * 2, it * 2 + 2).toInt(16).toByte() }

    @Test
    fun colorsMatchDesktop() {
        for (case in colors("hexToRgb")) {
            val out = case["output"]!!.jsonObject
            val expected = Rgb(out["r"]!!.jsonPrimitive.int, out["g"]!!.jsonPrimitive.int, out["b"]!!.jsonPrimitive.int)
            assertEquals(case["input"]!!.text, expected, hexToRgb(case["input"]!!.text))
        }
        for (case in colors("rgbToHsv")) {
            val out = case["output"]!!.jsonObject
            val expected = Hsv(out["hue"]!!.jsonPrimitive.int, out["saturation"]!!.jsonPrimitive.int, out["value"]!!.jsonPrimitive.int)
            assertEquals(case["input"]!!.text, expected, rgbToHsv(hexToRgb(case["input"]!!.text)))
        }
        for (case in colors("kelvinToHex")) {
            assertEquals(case["output"]!!.text, kelvinToHex(case["input"]!!.jsonPrimitive.int))
        }
    }

    @Test
    fun daylightCurveMatchesDesktop() {
        for (case in list("circadian")) {
            val hour = case["input"]!!.jsonPrimitive.double
            val out = case["output"]!!.jsonObject
            val actual = computeCircadianTarget(hour)
            assertEquals("kelvin at $hour", out["kelvin"]!!.jsonPrimitive.int, actual.kelvin)
            assertEquals("brightness at $hour", out["brightness"]!!.jsonPrimitive.int, actual.brightness)
            assertEquals("color at $hour", out["colorHex"]!!.text, actual.colorHex)
        }
    }

    @Test
    fun kasaCipherMatchesDesktop() {
        for (case in list("kasa")) {
            val input = case["input"]!!.text
            assertArrayEquals(hex(case["outputHex"]!!.text), encodeKasa(input))
            assertEquals(input, decodeKasa(encodeKasa(input)))
        }
    }

    @Test
    fun effectsAndScenePresetsMatchDesktop() {
        assertEquals(
            list("effects").map { it["id"]!!.text to it["code"]!!.jsonPrimitive.int },
            WLED_EFFECTS.map { it.id to it.code },
        )
        val desktop = list("scenes").associateBy { it["id"]!!.text }
        for (scene in BUILTIN_SCENES) {
            val preset = desktop[scene.id]?.get("preset")?.jsonObject ?: error("${scene.id} is not on the desktop")
            assertEquals(scene.id, preset["on"]!!.jsonPrimitive.boolean, scene.preset.on)
            assertEquals(scene.id, preset["brightness"]!!.jsonPrimitive.int, scene.preset.brightness)
            assertEquals(scene.id, preset["colorMode"]!!.text, scene.preset.colorMode)
            assertEquals(scene.id, preset["kelvin"]!!.jsonPrimitive.int, scene.preset.kelvin)
            assertEquals(scene.id, preset["colorHex"]!!.text, scene.preset.colorHex)
            assertEquals(scene.id, preset["stripColorHex"]!!.text, scene.preset.stripColorHex)
            assertEquals(scene.id, preset["effect"]!!.text, scene.preset.effect)
            assertEquals(scene.id, preset["keepNightlightRoomId"]?.text, scene.preset.keepNightlightRoomId)
        }
    }

    private fun lightFrom(json: JsonObject) = Light(
        id = "golden",
        name = "Golden",
        protocolId = json["protocolId"]!!.text,
        ip = json["ip"]!!.text,
        port = json["port"]!!.jsonPrimitive.int,
        deviceKey = json["deviceKey"]!!.text,
        on = json["on"]!!.jsonPrimitive.boolean,
        brightness = json["brightness"]!!.jsonPrimitive.int,
        colorMode = json["colorMode"]!!.text,
        colorHex = json["colorHex"]!!.text,
        kelvin = json["kelvin"]!!.jsonPrimitive.int,
        effect = json["effect"]!!.text,
    )

    private fun cases(protocol: String) = list("commands").filter { it["light"]!!.jsonObject["protocolId"]!!.text == protocol }

    private fun onlyHttp(light: Light) = buildCommand(light).steps.single() as WireStep.Http
    private fun onlyUdpJson(step: WireStep) = Json.parseToJsonElement((step as WireStep.Udp).bytes.decodeToString())

    /** These protocols send exactly what the desktop sends. */
    @Test
    fun httpCommandsMatchDesktop() {
        for (protocol in listOf("wled-http", "elgato-http", "shelly")) {
            for (case in cases(protocol)) {
                val step = onlyHttp(lightFrom(case["light"]!!.jsonObject))
                assertEquals(protocol, case["path"]!!.text, step.path)
                assertEquals(protocol, case["method"]!!.text, step.method)
                assertEquals(protocol, case["payload"], Json.parseToJsonElement(step.body))
            }
        }
    }

    @Test
    fun kasaCommandsMatchDesktop() {
        for (case in cases("kasa-lan")) {
            val step = buildCommand(lightFrom(case["light"]!!.jsonObject)).steps.single() as WireStep.Udp
            assertEquals(case["payload"], Json.parseToJsonElement(decodeKasa(step.bytes)))
            assertEquals(true, step.expectsReply)
        }
    }

    // ── The places this differs from the desktop on purpose ──────────────────

    /** Off sends only {state:false}, because a bulb given a color can come back on. */
    @Test
    fun wizMatchesDesktopExceptWhenOff() {
        for (case in cases("wiz-udp")) {
            val light = lightFrom(case["light"]!!.jsonObject)
            val actual = onlyUdpJson(buildCommand(light).steps.single())
            if (light.on) {
                assertEquals(case["payload"], actual)
            } else {
                assertEquals(JsonPrimitive(false), actual.jsonObject["params"]!!.jsonObject["state"])
                assertEquals(1, actual.jsonObject["params"]!!.jsonObject.size)
            }
        }
    }

    /** Off sends only {on:false}, because a bridge answers errors for the other fields on an off light. */
    @Test
    fun hueMatchesDesktopExceptWhenOff() {
        for (case in cases("hue-rest")) {
            val light = lightFrom(case["light"]!!.jsonObject)
            val step = onlyHttp(light)
            assertEquals(case["path"]!!.text, step.path)
            assertEquals("PUT", step.method)
            val actual = Json.parseToJsonElement(step.body).jsonObject
            if (light.on) {
                assertEquals(case["payload"], actual)
            } else {
                assertEquals(JsonObject(mapOf("on" to JsonPrimitive(false))), actual)
            }
        }
    }

    /** SetColor bytes are the desktop's, but the header sets tagged and SetPower follows, or an off light stays off. */
    @Test
    fun lifxColorMatchesDesktopAndPowerIsAdded() {
        for (case in cases("lifx-udp")) {
            val light = lightFrom(case["light"]!!.jsonObject)
            val steps = buildCommand(light).steps.map { (it as WireStep.Udp).bytes }
            if (light.on) {
                assertArrayEquals(hex(case["binaryHex"]!!.text).drop(36).toByteArray(), steps[0].drop(36).toByteArray())
                assertEquals(0x34, steps[0][3].toInt())
                assertEquals(LIFX_SET_POWER, steps[1][32].toInt() and 0xff)
                assertEquals(-1, steps[1][36].toInt())
            } else {
                assertEquals(1, steps.size)
                assertEquals(0, steps[0][36].toInt())
            }
        }
    }

    /** Each message is sent clean, and an off light is only told to turn off. */
    @Test
    fun goveeMessagesMatchDesktop() {
        for (case in cases("govee-udp")) {
            val light = lightFrom(case["light"]!!.jsonObject)
            val payload = case["payload"]!!.jsonObject
            val steps = buildCommand(light).steps.map(::onlyUdpJson)
            assertEquals(payload["turn"], steps[0])
            if (light.on) {
                assertEquals(payload["brightness"], steps[1])
                assertEquals(JsonObject(mapOf("msg" to payload["msg"]!!)), steps[2])
            } else {
                assertEquals(1, steps.size)
            }
        }
    }

    /** Power, brightness and color all go out, because a Yeelight ignores color while off and set_rgb has no brightness. */
    @Test
    fun yeelightEndsWithDesktopColorCommand() {
        for (case in cases("yeelight-tcp")) {
            val light = lightFrom(case["light"]!!.jsonObject)
            val lines = (buildCommand(light).steps.single() as WireStep.Tcp).lines.map { Json.parseToJsonElement(it).jsonObject }
            val expected = case["payload"]!!.jsonObject
            assertEquals(expected["method"], lines.last()["method"])
            assertEquals(expected["params"], lines.last()["params"])
            if (light.on) {
                assertEquals("set_power", lines[0]["method"]!!.text)
                assertEquals("on", lines[0]["params"]!!.jsonArray[0].text)
                assertEquals("set_bright", lines[1]["method"]!!.text)
                assertEquals(light.brightness, lines[1]["params"]!!.jsonArray[0].jsonPrimitive.int)
            }
        }
    }

    /** color_temp_kelvin replaces the kelvin field Home Assistant has removed. */
    @Test
    fun homeAssistantMatchesDesktopExceptKelvinField() {
        for (case in cases("ha-rest")) {
            val step = onlyHttp(lightFrom(case["light"]!!.jsonObject))
            assertEquals(case["path"]!!.text, step.path)
            assertEquals(case["headers"]!!.jsonObject["Authorization"]!!.text, step.headers["Authorization"])
            val expected = case["payload"]!!.jsonObject.mapKeys { if (it.key == "kelvin") "color_temp_kelvin" else it.key }
            assertEquals(JsonObject(expected), Json.parseToJsonElement(step.body))
        }
    }

    // ── LG ThinQ ─────────────────────────────────────────────────────────────

    @Test
    fun regionsMatchDesktop() {
        for (case in list("regions")) {
            val expected = (case["output"] as? JsonPrimitive)?.takeIf { it !is JsonNull }?.content
            assertEquals(case["input"]!!.text, expected, regionForCountry(case["input"]!!.text))
        }
        assertNull(regionForCountry("ZZ"))
    }

    private fun optionalText(element: JsonElement?) = (element as? JsonPrimitive)?.takeIf { it !is JsonNull }?.content

    @Test
    fun applianceCardsMatchDesktop() {
        for (case in list("appliances")) {
            val out = case["output"]!!.jsonObject
            val error = optionalText(case["error"])
            val actual = normalizeAppliance(case["device"], case["state"], error)
            val who = out["id"]!!.text
            assertEquals(who, out["kind"]!!.text, actual.kind)
            assertEquals(who, out["typeLabel"]!!.text, actual.typeLabel)
            assertEquals(who, out["name"]!!.text, actual.name)
            assertEquals(who, optionalText(out["model"]), actual.model)
            assertEquals(who, out["reachable"]!!.jsonPrimitive.boolean, actual.reachable)
            assertEquals(who, optionalText(out["error"]), actual.error)
            val units = (out["units"] as JsonArray).map { unit ->
                val u = unit.jsonObject
                ThinqUnit(
                    optionalText(u["label"]),
                    u["status"]!!.text,
                    u["facts"]!!.jsonArray.map { ThinqFact(it.jsonObject["label"]!!.text, it.jsonObject["value"]!!.text) },
                )
            }
            assertEquals(who, units, actual.units)
        }
    }
}
