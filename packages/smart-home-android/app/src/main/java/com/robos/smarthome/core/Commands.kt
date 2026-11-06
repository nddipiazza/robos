package com.robos.smarthome.core

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject
import java.nio.ByteBuffer
import java.nio.ByteOrder

/** One thing to put on the network. A light command may need several. */
sealed interface WireStep {
    val ip: String
    val port: Int

    data class Udp(
        override val ip: String,
        override val port: Int,
        val bytes: ByteArray,
        /** The device answers this message, so silence means it did not arrive. */
        val expectsReply: Boolean,
    ) : WireStep

    data class Tcp(override val ip: String, override val port: Int, val lines: List<String>) : WireStep

    /** A Feit / Smart Life light: the data points to set, sent over Tuya's local protocol. */
    data class Tuya(
        override val ip: String,
        override val port: Int,
        val deviceId: String,
        val version: String,
        val dps: JsonObject,
    ) : WireStep

    data class Http(
        override val ip: String,
        override val port: Int,
        val method: String,
        val path: String,
        val body: String,
        val headers: Map<String, String> = emptyMap(),
    ) : WireStep
}

data class LightCommand(
    val protocolId: String,
    val steps: List<WireStep>,
    /** Set when the light cannot be sent anything yet, such as a Hue light with no bridge username. */
    val notReady: String? = null,
)

// ── Encoders ─────────────────────────────────────────────────────────────────

/** TP-Link Kasa XOR-171 autokey cipher. UDP messages have no length prefix. */
fun encodeKasa(json: String): ByteArray {
    var key = 171
    return ByteArray(json.length) { i ->
        key = key xor json[i].code
        key.toByte()
    }
}

fun decodeKasa(bytes: ByteArray, length: Int = bytes.size): String {
    var key = 171
    val out = StringBuilder(length)
    for (i in 0 until length) {
        val c = bytes[i].toInt() and 0xff
        out.append((key xor c).toChar())
        key = c
    }
    return out.toString()
}

const val LIFX_GET_SERVICE = 2
const val LIFX_STATE_SERVICE = 3
const val LIFX_SET_COLOR = 102
const val LIFX_SET_POWER = 117

/** LIFX LAN header (36 bytes) plus payload. These go to a single IP with an empty target, so tagged is set. */
fun buildLifxPacket(messageType: Int, payload: ByteArray = ByteArray(0)): ByteArray {
    val buffer = ByteBuffer.allocate(36 + payload.size).order(ByteOrder.LITTLE_ENDIAN)
    buffer.putShort(0, (36 + payload.size).toShort())
    buffer.putShort(2, 0x3400.toShort())
    buffer.putInt(4, 0x524f424f) // source identifier "ROBO"
    buffer.put(22, 0x01) // res_required
    buffer.putShort(32, messageType.toShort())
    payload.forEachIndexed { i, b -> buffer.put(36 + i, b) }
    return buffer.array()
}

fun buildLifxSetColor(hue: Int, saturation: Int, brightness: Int, kelvin: Int, durationMs: Int = 250): ByteArray {
    val payload = ByteBuffer.allocate(13).order(ByteOrder.LITTLE_ENDIAN)
    payload.put(0)
    payload.putShort(jsRound(clamp(hue, 0, 360) / 360.0 * 65535).toShort())
    payload.putShort(jsRound(clamp(saturation, 0, 100) / 100.0 * 65535).toShort())
    payload.putShort(jsRound(clamp(brightness, 0, 100) / 100.0 * 65535).toShort())
    payload.putShort(clamp(kelvin, 1500, 9000).toShort())
    payload.putInt(durationMs)
    return buildLifxPacket(LIFX_SET_COLOR, payload.array())
}

fun buildLifxSetPower(on: Boolean, durationMs: Int = 250): ByteArray {
    val payload = ByteBuffer.allocate(6).order(ByteOrder.LITTLE_ENDIAN)
    payload.putShort(if (on) 0xffff.toShort() else 0)
    payload.putInt(durationMs)
    return buildLifxPacket(LIFX_SET_POWER, payload.array())
}

// ── Command builder ──────────────────────────────────────────────────────────

/**
 * Builds the messages that put a light in its current state. CommandGoldenTest compares
 * the payloads with buildProtocolCommand in smart-light-engine.js and lists every place
 * this differs on purpose.
 */
fun buildCommand(light: Light): LightCommand {
    val rgb = hexToRgb(if (light.colorMode == "kelvin") kelvinToHex(light.kelvin) else light.colorHex)
    val hsv = rgbToHsv(rgb)
    val rgbMode = light.colorMode == "rgb"
    val percent = clamp(light.brightness, 1, 100)
    val kelvin = clamp(light.kelvin, 2000, 6500)
    val ip = light.ip
    val id = light.protocolId
    val port = light.port.takeIf { it > 0 } ?: protocolFor(id).defaultPort

    fun http(method: String, path: String, body: JsonElement, headers: Map<String, String> = emptyMap()) =
        LightCommand(id, listOf(WireStep.Http(ip, port, method, path, body.toString(), headers)))

    return when (id) {
        "wiz-udp" -> {
            // A bulb that is told to turn off and also given a color can come back on.
            val message = buildJsonObject {
                put("id", 1)
                put("method", "setPilot")
                putJsonObject("params") {
                    put("state", light.on)
                    if (light.on) {
                        put("dimming", clamp(percent, 10, 100))
                        if (rgbMode) {
                            put("r", rgb.r)
                            put("g", rgb.g)
                            put("b", rgb.b)
                        } else {
                            put("temp", kelvin)
                        }
                    }
                }
            }
            LightCommand(id, listOf(WireStep.Udp(ip, port, message.toString().toByteArray(), expectsReply = true)))
        }

        "wled-http" -> {
            val effect = WLED_EFFECTS.firstOrNull { it.id == light.effect } ?: WLED_EFFECTS.first()
            http(
                "POST", "/json/state",
                buildJsonObject {
                    put("on", light.on)
                    put("bri", jsRound(percent / 100.0 * 255))
                    put("transition", 4)
                    putJsonArray("seg") {
                        add(
                            buildJsonObject {
                                put("id", 0)
                                put("col", buildJsonArray { add(ints(rgb.r, rgb.g, rgb.b)) })
                                put("fx", effect.code)
                                put("sx", 128)
                                put("ix", 128)
                            },
                        )
                    }
                },
            )
        }

        "kasa-lan" -> {
            val message = buildJsonObject {
                putJsonObject("smartlife.iot.smartbulb.lightingservice") {
                    putJsonObject("transition_light_state") {
                        put("on_off", if (light.on) 1 else 0)
                        put("brightness", percent)
                        put("color_temp", if (rgbMode) 0 else kelvin)
                        put("hue", if (rgbMode) hsv.hue else 0)
                        put("saturation", if (rgbMode) hsv.saturation else 0)
                        put("transition_period", 200)
                    }
                }
            }
            LightCommand(id, listOf(WireStep.Udp(ip, port, encodeKasa(message.toString()), expectsReply = true)))
        }

        "hue-rest" -> {
            val parts = light.deviceKey.split("|")
            if (parts.size != 2 || parts[0].isBlank() || parts[1].isBlank()) {
                return LightCommand(id, emptyList(), notReady = "Pair the Hue Bridge first.")
            }
            // A bridge answers with errors when an off light is also given a brightness or color.
            val body = buildJsonObject {
                put("on", light.on)
                if (light.on) {
                    put("bri", clamp(jsRound(percent / 100.0 * 254), 1, 254))
                    if (rgbMode) {
                        put("hue", jsRound(hsv.hue / 360.0 * 65535))
                        put("sat", jsRound(hsv.saturation / 100.0 * 254))
                    } else {
                        put("ct", clamp(jsRound(1000000.0 / kelvin), 153, 500))
                    }
                }
            }
            http("PUT", "/api/${parts[0]}/lights/${parts[1]}/state", body)
        }

        "lifx-udp" -> {
            // SetColor alone does not power a light on, so a second message sets the power.
            val color = buildLifxSetColor(
                hue = if (rgbMode) hsv.hue else 0,
                saturation = if (rgbMode) hsv.saturation else 0,
                brightness = percent,
                kelvin = kelvin,
            )
            val steps = mutableListOf<WireStep>()
            if (light.on) steps += WireStep.Udp(ip, port, color, expectsReply = true)
            steps += WireStep.Udp(ip, port, buildLifxSetPower(light.on), expectsReply = true)
            LightCommand(id, steps)
        }

        "govee-udp" -> {
            fun message(cmd: String, data: JsonObject) = buildJsonObject {
                putJsonObject("msg") {
                    put("cmd", cmd)
                    put("data", data)
                }
            }.toString().toByteArray()

            val steps = mutableListOf<WireStep>(
                WireStep.Udp(ip, port, message("turn", buildJsonObject { put("value", if (light.on) 1 else 0) }), false),
            )
            if (light.on) {
                steps += WireStep.Udp(ip, port, message("brightness", buildJsonObject { put("value", percent) }), false)
                steps += WireStep.Udp(
                    ip, port,
                    message(
                        "colorwc",
                        buildJsonObject {
                            putJsonObject("color") {
                                put("r", rgb.r)
                                put("g", rgb.g)
                                put("b", rgb.b)
                            }
                            put("colorTemInKelvin", if (rgbMode) 0 else kelvin)
                        },
                    ),
                    false,
                )
            }
            LightCommand(id, steps)
        }

        "elgato-http" -> http(
            "PUT", "/elgato/lights",
            buildJsonObject {
                put("numberOfLights", 1)
                putJsonArray("lights") {
                    add(
                        buildJsonObject {
                            put("on", if (light.on) 1 else 0)
                            put("brightness", percent)
                            put("temperature", clamp(jsRound(1000000.0 / kelvin), 143, 344))
                        },
                    )
                }
            },
        )

        "yeelight-tcp" -> {
            // A Yeelight ignores color and brightness while it is off, so power comes first.
            val rpc = { rpcId: Int, method: String, params: JsonArray ->
                buildJsonObject {
                    put("id", rpcId)
                    put("method", method)
                    put("params", params)
                }.toString()
            }
            val smooth = { first: JsonElement ->
                buildJsonArray {
                    add(first)
                    add(JsonPrimitive("smooth"))
                    add(JsonPrimitive(300))
                }
            }
            val lines = if (!light.on) {
                listOf(rpc(1, "set_power", smooth(JsonPrimitive("off"))))
            } else {
                listOf(
                    rpc(1, "set_power", smooth(JsonPrimitive("on"))),
                    rpc(2, "set_bright", smooth(JsonPrimitive(percent))),
                    if (rgbMode) {
                        rpc(3, "set_rgb", smooth(JsonPrimitive((rgb.r shl 16) + (rgb.g shl 8) + rgb.b)))
                    } else {
                        rpc(3, "set_ct_abx", smooth(JsonPrimitive(kelvin)))
                    },
                )
            }
            LightCommand(id, listOf(WireStep.Tcp(ip, port, lines)))
        }

        "shelly" -> http(
            "POST", "/rpc/RGBW.Set",
            buildJsonObject {
                put("id", 0)
                put("on", light.on)
                put("brightness", percent)
                put("rgb", ints(rgb.r, rgb.g, rgb.b))
            },
        )

        "tuya-lan" -> {
            if (light.deviceKey.isBlank()) {
                return LightCommand(id, emptyList(), notReady = "This light has no Tuya device ID. Add it again with Add Feit or Smart Life lights.")
            }
            LightCommand(
                id,
                listOf(WireStep.Tuya(ip, port, light.deviceKey, light.tuyaVersion.ifEmpty { "3.3" }, tuyaDpsFromLight(light, light.tuyaSchema.ifEmpty { "v2" }))),
            )
        }

        else -> {
            val parts = light.deviceKey.split("|", limit = 2)
            val entity = parts[0].trim()
            val token = parts.getOrNull(1)?.trim().orEmpty()
            if (entity.isBlank() || token.isBlank()) {
                return LightCommand("ha-rest", emptyList(), notReady = "Enter the entity ID and access token for this light.")
            }
            val body = buildJsonObject {
                put("entity_id", entity)
                if (light.on) {
                    put("brightness_pct", percent)
                    if (rgbMode) put("rgb_color", ints(rgb.r, rgb.g, rgb.b)) else put("color_temp_kelvin", kelvin)
                }
            }
            LightCommand(
                "ha-rest",
                listOf(
                    WireStep.Http(
                        ip, port, "POST", "/api/services/light/${if (light.on) "turn_on" else "turn_off"}",
                        body.toString(), mapOf("Authorization" to "Bearer $token"),
                    ),
                ),
            )
        }
    }
}

private fun ints(vararg values: Int) = buildJsonArray { values.forEach { add(JsonPrimitive(it)) } }
