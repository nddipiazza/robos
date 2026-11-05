package com.robos.smarthome.core

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.net.HttpURLConnection
import java.net.URL
import java.util.Base64
import java.util.Locale
import java.util.UUID

// Read-only client for LG ThinQ Connect, ported from packages/robos-lib/lg-thinq.js.
// LG appliances are only reachable through LG's cloud, so this tab needs internet.

const val THINQ_TOKEN_PAGE = "https://connect-pat.lgthinq.com"
const val THINQ_MIN_REFRESH_MS = 20_000L
const val THINQ_RATE_LIMIT_BACKOFF_MS = 300_000L
private const val REQUEST_TIMEOUT_MS = 15_000

// The client key published in LG's Apache-licensed thinqconnect SDK. It identifies the
// SDK, not the person; every installation sends the same value.
private const val API_KEY = "v6GFvkweNo7DK7yD3ylIZ9w52aKBU0eJ7wLXkSR3"

private val COUNTRIES_BY_REGION = mapOf(
    "kic" to "AU BD CN HK ID IN JP KH KR LA LK MM MY NP NZ PH SG TH TW VN",
    "aic" to "AG AR AW BB BO BR BS BZ CA CL CO CR CU DM DO EC GD GT GY HN HT JM KN LC MX NI PA PE PR PY SR SV TT US UY VC VE",
    "eic" to "AE AF AL AM AO AT AZ BA BE BF BG BH BJ BY CD CF CG CH CI CM CV CY CZ DE DJ DK DZ EE EG ES ET FI FR GA GB GE GH GM GN GQ GR HR HU IE IL IQ IR IS IT JO KE KG KW KZ LB LR LT LU LV LY MA MD ME MK ML MR MT MU MW NE NG NL NO OM PK PL PS PT QA RO RS RU RW SA SD SE SI SK SL SN SO ST SY TD TG TN TR TZ UA UG UZ XK YE ZA ZM",
)

private val ERROR_TEXT = mapOf(
    "1103" to "LG rejected this token. Check that it was copied in full and has not been deleted.",
    "1218" to "LG rejected this token. Check that it was copied in full and has not been deleted.",
    "1302" to "LG does not recognize this token. Create a new one and try again.",
    "1304" to "Open the LG ThinQ phone app and accept its latest terms, then try again.",
    "1306" to "LG is limiting requests from this account. The app will wait five minutes before asking again.",
    "1307" to "LG does not support this country for this token. Use the country of your ThinQ account.",
    "1222" to "This appliance is not connected to LG right now.",
)

private val AUTH_ERROR_CODES = setOf("1103", "1218", "1302")

class ThinqError(val code: String?, message: String?, status: Int?) :
    Exception(ERROR_TEXT[code] ?: message ?: "LG ThinQ request failed (${status ?: "no response"}).")

data class ThinqFact(val label: String, val value: String)
data class ThinqUnit(val label: String?, val status: String, val facts: List<ThinqFact>)
data class ThinqDevice(
    val id: String?,
    val kind: String,
    val typeLabel: String,
    val name: String,
    val model: String?,
    val reachable: Boolean,
    val error: String?,
    val units: List<ThinqUnit>,
)

data class ThinqOverview(
    val connected: Boolean = false,
    val devices: List<ThinqDevice> = emptyList(),
    val updatedAtMs: Long? = null,
    val error: String? = null,
)

data class ThinqCredentials(val token: String, val countryCode: String, val clientId: String)

interface ThinqVault {
    fun load(): ThinqCredentials?
    fun save(credentials: ThinqCredentials)
    fun clear()
}

fun regionForCountry(countryCode: String): String? {
    val code = countryCode.trim().uppercase(Locale.ROOT)
    if (!Regex("^[A-Z]{2}$").matches(code)) return null
    return COUNTRIES_BY_REGION.entries.firstOrNull { code in it.value.split(" ") }?.key
}

private fun JsonElement?.obj(): JsonObject? = this as? JsonObject
private fun JsonElement?.prim(): JsonPrimitive? = (this as? JsonPrimitive)?.takeIf { it !is JsonNull }
private fun JsonElement?.at(vararg path: String): JsonElement? = path.fold(this) { node, key -> node.obj()?.get(key) }
private fun JsonElement?.number(): Double? = prim()?.takeIf { !it.isString }?.doubleOrNull
private fun JsonElement?.asList(): List<JsonElement> = when (this) {
    null, is JsonNull -> emptyList()
    is JsonArray -> this
    else -> listOf(this)
}

fun humanize(value: JsonElement?): String? {
    val prim = value.prim() ?: return null
    if (!prim.isString) {
        prim.booleanOrNull?.let { return if (it) "On" else "Off" }
    }
    return humanize(prim.content)
}

fun humanize(value: String?): String? {
    val text = value?.replace(Regex("[_-]+"), " ")?.trim()?.lowercase(Locale.ROOT)
    return if (text.isNullOrEmpty()) null else text.replaceFirstChar { it.titlecase(Locale.ROOT) }
}

private fun formatDuration(hours: JsonElement?, minutes: JsonElement?): String? {
    if (hours.number() == null && minutes.number() == null) return null
    val total = ((hours.number() ?: 0.0) * 60 + (minutes.number() ?: 0.0)).toInt()
    if (total <= 0) return null
    val h = total / 60
    val m = total % 60
    return listOfNotNull(if (h > 0) "$h hr" else null, if (m > 0) "$m min" else null).joinToString(" ")
}

private fun fact(label: String, value: String?) = value?.takeIf { it.isNotEmpty() }?.let { ThinqFact(label, it) }

private fun numberText(value: Double): String =
    if (value == value.toLong().toDouble()) value.toLong().toString() else value.toString()

private fun rawText(value: JsonElement?): String? {
    val prim = value.prim() ?: return null
    return if (prim.isString) prim.content else prim.doubleOrNull?.let(::numberText)
}

/** Text and numbers stay as LG sent them; true and false read as On and Off. */
private fun factOf(label: String, value: JsonElement?) = fact(label, rawText(value) ?: humanize(value))

private val RUN_STATE_TEXT = mapOf("END" to "Finished", "POWER_OFF" to "Off", "INITIAL" to "Ready", "RESERVED" to "Scheduled")

private fun runStateText(state: JsonElement?): String? {
    val current = state.at("runState", "currentState").prim()?.content
    return RUN_STATE_TEXT[current] ?: humanize(current)
}

private fun laundryUnit(state: JsonElement?, label: String? = null): ThinqUnit {
    val timer = state.at("timer")
    val facts = listOfNotNull(
        fact("Time left", formatDuration(timer.at("remainHour"), timer.at("remainMinute"))),
        fact("Cycle length", formatDuration(timer.at("totalHour"), timer.at("totalMinute"))),
        fact("Starts in", formatDuration(timer.at("relativeHourToStart"), timer.at("relativeMinuteToStart"))),
        fact("Finishes in", formatDuration(timer.at("relativeHourToStop"), timer.at("relativeMinuteToStop"))),
        factOf("Remote start", state.at("remoteControlEnable", "remoteControlEnabled")),
        state.at("cycle", "cycleCount").number()?.let { fact("Cycles run", numberText(it)) },
        fact("Detergent", humanize(state.at("detergent", "detergentSetting"))),
    )
    return ThinqUnit(label, runStateText(state) ?: "Status unknown", facts)
}

private fun fridgeSetPoint(entry: JsonElement?): String? {
    val unit = entry.at("unit").prim()?.content.orEmpty().uppercase(Locale.ROOT)
    val fahrenheit = rawText(entry.at("targetTemperatureF"))
    val celsius = rawText(entry.at("targetTemperatureC"))
    val plain = rawText(entry.at("targetTemperature"))
    return when {
        unit != "C" && fahrenheit != null -> "$fahrenheit°F"
        celsius != null -> "$celsius°C"
        plain != null -> "$plain°$unit"
        else -> null
    }
}

private fun fridgeUnit(state: JsonElement?): ThinqUnit {
    val known = state.at("doorStatus").asList().filter { it.at("doorState").prim() != null }
    val anyOpen = known.any { it.at("doorState").prim()?.content?.uppercase(Locale.ROOT) == "OPEN" }
    val status = if (known.isEmpty()) "Door status unknown" else if (anyOpen) "Door open" else "Door closed"

    // LG reports the temperature each compartment is set to, not a measured one.
    val points = (state.at("temperatureInUnits") ?: state.at("temperature")).asList().map { entry ->
        fact("${humanize(entry.at("locationName")) ?: "Compartment"} set to", fridgeSetPoint(entry))
    }
    val filter = state.at("waterFilterInfo")
    val refrigeration = state.at("refrigeration")
    val airFilter = listOfNotNull(
        humanize(refrigeration.at("freshAirFilter")),
        refrigeration.at("freshAirFilterRemainPercent").number()?.let { "${numberText(it)}% left" },
    ).joinToString(", ")
    val usedTime = filter.at("usedTime").number()?.let { amount ->
        val word = filter.at("unit").prim()?.content.orEmpty().lowercase(Locale.ROOT)
        val plural = if (word.isNotEmpty() && amount != 1.0 && !word.endsWith("s")) "s" else ""
        "${numberText(amount)} $word$plural".trim()
    }
    val facts = points + listOf(
        fact("Water filter", humanize(filter.at("waterFilterState"))),
        fact("Water filter used", usedTime),
        fact("Fresh air filter", airFilter),
        factOf("Express mode", refrigeration.at("expressMode")),
        factOf("Express cool", refrigeration.at("expressFridge")),
        factOf("Quick freeze", refrigeration.at("rapidFreeze")),
        factOf("Eco mode", state.at("ecoFriendly", "ecoFriendlyMode")),
        factOf("Power saving", state.at("powerSave", "powerSaveEnabled")),
        factOf("Sabbath mode", state.at("sabbath", "sabbathMode")),
    )
    return ThinqUnit(null, status, facts.filterNotNull())
}

/** Appliances without their own card still show whatever plain values LG sends. */
private fun genericUnit(state: JsonElement?): ThinqUnit {
    val facts = mutableListOf<ThinqFact>()
    fun walk(value: JsonElement?, prefix: String) {
        if (value == null || value is JsonNull || facts.size >= 12) return
        when (value) {
            is JsonArray -> value.forEach { walk(it, prefix) }
            is JsonObject -> value.forEach { (key, inner) -> walk(inner, key) }
            is JsonPrimitive -> {
                val label = humanize(prefix.replace(Regex("([a-z])([A-Z])"), "$1 $2")) ?: "Value"
                fact(label, humanize(value))?.let { facts += it }
            }
        }
    }
    walk(state, "Value")
    return ThinqUnit(null, runStateText(state) ?: "Connected", facts)
}

fun applianceKind(deviceType: String?): String {
    val type = deviceType.orEmpty().uppercase(Locale.ROOT)
    return when {
        "DISH" in type -> "other"
        type.endsWith("WASHTOWER") -> "washtower"
        "DRYER" in type -> "dryer"
        "WASH" in type -> "washer"
        type.endsWith("REFRIGERATOR") && "KIMCHI" !in type -> "refrigerator"
        else -> "other"
    }
}

private fun statusUnits(kind: String, state: JsonElement?): List<ThinqUnit> = when (kind) {
    "refrigerator" -> listOf(fridgeUnit(state))
    "washtower" -> listOf(laundryUnit(state.at("washer"), "Washer"), laundryUnit(state.at("dryer"), "Dryer"))
    "washer", "dryer" -> {
        val list = state.asList()
        if (list.size <= 1) {
            listOf(laundryUnit(list.firstOrNull()))
        } else {
            list.map { unit -> laundryUnit(unit, humanize(unit.at("location", "locationName") ?: unit.at("locationName"))) }
        }
    }
    else -> listOf(genericUnit(state))
}

private val KIND_ORDER = mapOf("washer" to 0, "washtower" to 1, "dryer" to 2, "refrigerator" to 3, "other" to 4)
private val KIND_LABEL = mapOf("washer" to "Washer", "washtower" to "WashTower", "dryer" to "Dryer", "refrigerator" to "Refrigerator")

fun normalizeAppliance(device: JsonElement?, state: JsonElement?, stateError: String? = null): ThinqDevice {
    val info = device.at("deviceInfo")
    val type = info.at("deviceType").prim()?.content
    val kind = applianceKind(type)
    val typeLabel = KIND_LABEL[kind] ?: humanize((type ?: "Appliance").removePrefix("DEVICE_")) ?: "Appliance"
    return ThinqDevice(
        id = device.at("deviceId").prim()?.content,
        kind = kind,
        typeLabel = typeLabel,
        name = info.at("alias").prim()?.content ?: typeLabel,
        model = info.at("modelName").prim()?.content,
        reachable = stateError == null,
        error = stateError,
        units = if (stateError != null) emptyList() else statusUnits(kind, state),
    )
}

class ThinqService(
    private val vault: ThinqVault,
    /** Only tests point the token at another host. */
    private val baseUrlOverride: String? = null,
    private val open: (URL) -> HttpURLConnection = { it.openConnection() as HttpURLConnection },
    private val nowMs: () -> Long = System::currentTimeMillis,
) {
    private val _overview = MutableStateFlow(ThinqOverview(connected = vault.load() != null))
    val overview: StateFlow<ThinqOverview> = _overview

    private val lock = Mutex()
    private var lastRefreshAt = 0L
    private var blockedUntil = 0L

    private fun request(credentials: ThinqCredentials, endpoint: String): JsonElement? {
        val base = baseUrlOverride ?: "https://api-${regionForCountry(credentials.countryCode)}.lgthinq.com"
        val connection = try {
            open(URL("$base/$endpoint")).apply {
                connectTimeout = REQUEST_TIMEOUT_MS
                readTimeout = REQUEST_TIMEOUT_MS
                setRequestProperty("Authorization", "Bearer ${credentials.token}")
                setRequestProperty("x-country", credentials.countryCode)
                setRequestProperty("x-message-id", newMessageId())
                setRequestProperty("x-client-id", credentials.clientId)
                setRequestProperty("x-api-key", API_KEY)
                setRequestProperty("x-service-phase", "OP")
            }
        } catch (_: Exception) {
            throw ThinqError(null, "Could not reach LG ThinQ. Check your internet connection.", null)
        }
        try {
            val status = try {
                connection.responseCode
            } catch (_: Exception) {
                throw ThinqError(null, "Could not reach LG ThinQ. Check your internet connection.", null)
            }
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val payload = runCatching { stream?.use { Json.parseToJsonElement(it.readBytes().decodeToString()) } }.getOrNull()
            if (status in 200..299) return payload.at("response")
            val code = payload.at("error", "code").prim()?.content
            if (status == 401 && code == null) throw ThinqError("1103", null, 401)
            throw ThinqError(code, payload.at("error", "message").prim()?.content, status)
        } finally {
            connection.disconnect()
        }
    }

    // Appliances are read one at a time so a house full of them stays inside LG's rate
    // limit. One unreachable appliance does not hide the others.
    private fun readAppliances(credentials: ThinqCredentials): List<ThinqDevice> {
        val cards = request(credentials, "devices").asList().map { device ->
            val id = device.at("deviceId").prim()?.content.orEmpty()
            try {
                normalizeAppliance(device, request(credentials, "devices/${java.net.URLEncoder.encode(id, "UTF-8")}/state"))
            } catch (e: ThinqError) {
                if (e.code == "1306" || e.code in AUTH_ERROR_CODES) throw e
                normalizeAppliance(device, null, e.message)
            }
        }
        return cards.sortedWith(compareBy({ KIND_ORDER[it.kind] ?: 4 }, { it.name }))
    }

    suspend fun refresh(force: Boolean = false) = lock.withLock {
        val credentials = vault.load()
        if (credentials == null) {
            _overview.value = ThinqOverview()
            return@withLock
        }
        val time = nowMs()
        if (time < blockedUntil) return@withLock
        if (!force && lastRefreshAt != 0L && time - lastRefreshAt < THINQ_MIN_REFRESH_MS) return@withLock
        lastRefreshAt = time
        try {
            val devices = withContext(Dispatchers.IO) { readAppliances(credentials) }
            _overview.value = ThinqOverview(true, devices, nowMs(), null)
        } catch (e: ThinqError) {
            if (e.code == "1306") blockedUntil = nowMs() + THINQ_RATE_LIMIT_BACKOFF_MS
            _overview.value = _overview.value.copy(connected = true, error = e.message)
        }
    }

    /** The token is saved only after LG has accepted it. Returns an error message, or null on success. */
    suspend fun connect(token: String, countryCode: String): String? = lock.withLock {
        val cleanToken = token.trim()
        val country = countryCode.trim().uppercase(Locale.ROOT)
        if (cleanToken.isEmpty()) return@withLock "Paste your LG ThinQ personal access token first."
        if (regionForCountry(country) == null) {
            return@withLock "LG ThinQ does not list \"$country\" as a supported country. Use a two-letter code such as US."
        }
        val credentials = ThinqCredentials(cleanToken, country, vault.load()?.clientId ?: UUID.randomUUID().toString())
        try {
            val devices = withContext(Dispatchers.IO) { readAppliances(credentials) }
            withContext(Dispatchers.IO) { vault.save(credentials) }
            blockedUntil = 0
            lastRefreshAt = nowMs()
            _overview.value = ThinqOverview(true, devices, nowMs(), null)
            null
        } catch (e: ThinqError) {
            if (e.code == "1306") blockedUntil = nowMs() + THINQ_RATE_LIMIT_BACKOFF_MS
            e.message
        }
    }

    suspend fun disconnect() = lock.withLock {
        withContext(Dispatchers.IO) { vault.clear() }
        lastRefreshAt = 0
        blockedUntil = 0
        _overview.value = ThinqOverview()
    }

    private fun newMessageId(): String {
        val uuid = UUID.randomUUID()
        val bytes = java.nio.ByteBuffer.allocate(16).putLong(uuid.mostSignificantBits).putLong(uuid.leastSignificantBits).array()
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
    }
}
