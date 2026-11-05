package com.robos.smarthome.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.robos.smarthome.android.HomeApp
import com.robos.smarthome.android.MDNS_ELGATO
import com.robos.smarthome.android.MDNS_HUE
import com.robos.smarthome.android.MDNS_SHELLY
import com.robos.smarthome.android.MDNS_WLED
import com.robos.smarthome.android.MdnsBrowser
import com.robos.smarthome.android.withMulticast
import com.robos.smarthome.core.ALL_ROOMS
import com.robos.smarthome.core.FoundLight
import com.robos.smarthome.core.Light
import com.robos.smarthome.core.LightPatch
import com.robos.smarthome.core.SCAN_WINDOW_MS
import com.robos.smarthome.core.ScanTargets
import com.robos.smarthome.core.Schedule
import com.robos.smarthome.core.UdpDiscovery
import com.robos.smarthome.core.computeCircadianTarget
import kotlinx.coroutines.async
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch
import java.time.LocalTime

class HomeViewModel(application: Application) : AndroidViewModel(application) {
    private val app = application as HomeApp
    private val engine = app.engine

    val state = engine.state
    val wifi = app.wifi.status
    val appliances = app.thinq.overview
    val scanning = MutableStateFlow(false)
    val hueBridge = MutableStateFlow<String?>(null)

    private val messages = Channel<String>(Channel.BUFFERED)
    val messageFlow = messages.receiveAsFlow()

    val scenes get() = engine.scenes

    private fun say(text: String) {
        messages.trySend(text)
    }

    fun setLight(id: String, patch: LightPatch) {
        viewModelScope.launch {
            val light = engine.updateLight(id, patch)
            light?.lastError?.let { say("${light.name}: $it") }
        }
    }

    fun setRoom(roomId: String, patch: LightPatch) {
        viewModelScope.launch {
            val count = engine.setRoomState(roomId, patch)
            val failed = engine.state.value.lights.count { (roomId == ALL_ROOMS || it.roomId == roomId) && it.lastError != null }
            val word = if (patch.on == true) "on" else "off"
            say(if (failed > 0) "$failed of $count lights did not respond." else "Turned $count lights $word.")
        }
    }

    fun saveLight(
        id: String?, name: String, roomId: String, protocolId: String, formFactor: String,
        ip: String, port: Int?, deviceKey: String,
    ) {
        viewModelScope.launch {
            engine.saveLight(id, name, roomId, protocolId, formFactor, ip, port, deviceKey)
            say("Saved $name.")
        }
    }

    fun removeLight(light: Light) {
        viewModelScope.launch {
            engine.removeLight(light.id)
            say("Removed ${light.name}.")
        }
    }

    fun addRoom(name: String, then: (String) -> Unit) {
        viewModelScope.launch { then(engine.addRoom(name).id) }
    }

    fun applyScene(sceneId: String, scope: String) {
        viewModelScope.launch {
            val scene = engine.applyScene(sceneId, scope) ?: return@launch
            val failed = engine.state.value.lights.count { it.lastError != null }
            say(if (failed > 0) "${scene.name} is on, but $failed lights did not respond." else "${scene.name} is on.")
        }
    }

    fun saveScene(name: String, scope: String) {
        viewModelScope.launch {
            val scene = engine.saveCustomScene(name, scope)
            say(if (scene != null) "Saved ${scene.name}." else "Add a light first. A scene copies how your lights look now.")
        }
    }

    fun removeScene(id: String) {
        viewModelScope.launch { engine.removeCustomScene(id) }
    }

    fun daylightNow() = LocalTime.now().let { computeCircadianTarget(it.hour + it.minute / 60.0) }

    fun applyDaylight() {
        viewModelScope.launch {
            val target = engine.applyDaylightNow()
            say("Lights that are on now match the time of day: ${target.kelvin}K at ${target.brightness}%.")
        }
    }

    fun saveSchedule(schedule: Schedule) {
        viewModelScope.launch {
            engine.saveSchedule(schedule)
            say("Saved ${schedule.name}.")
        }
    }

    fun removeSchedule(id: String) {
        viewModelScope.launch { engine.removeSchedule(id) }
    }

    fun testSchedule(id: String) {
        viewModelScope.launch {
            val scene = engine.testSchedule(id)
            say(if (scene != null) "Ran ${scene.name} now, without the fade." else "This schedule's scene no longer exists.")
        }
    }

    fun scan() {
        if (scanning.value) return
        scanning.value = true
        viewModelScope.launch {
            try {
                withMulticast(app) {
                    val udp = async { UdpDiscovery(app.wifi).scan(ScanTargets(broadcast = wifi.value.broadcast)) }
                    val mdns = async {
                        MdnsBrowser(app).browse(listOf(MDNS_WLED, MDNS_ELGATO, MDNS_SHELLY, MDNS_HUE), SCAN_WINDOW_MS.toLong())
                    }
                    val services = mdns.await()
                    val found = udp.await() + services.mapNotNull { service ->
                        val protocol = when (service.type) {
                            MDNS_WLED -> "wled-http"
                            MDNS_ELGATO -> "elgato-http"
                            MDNS_SHELLY -> "shelly"
                            else -> return@mapNotNull null
                        }
                        FoundLight(protocol, service.ip, service.port, service.name)
                    }
                    val outcome = engine.mergeScanResults(found)
                    hueBridge.value = services.firstOrNull { it.type == MDNS_HUE }?.ip ?: hueBridge.value
                    say(
                        when {
                            outcome.newLights > 0 -> "Found ${outcome.newLights} new lights. They are under No room yet."
                            outcome.knownLights > 0 -> "No new lights. ${outcome.knownLights} you already added answered."
                            hueBridge.value != null -> "Found a Hue Bridge. Pair it to add its lights."
                            else -> "No lights answered. Check that they are on this Wi-Fi network, or add one by IP address."
                        },
                    )
                }
            } finally {
                scanning.value = false
            }
        }
    }

    /** Reports failure to the pairing dialog, which covers the message area and stays open to retry. */
    fun pairHue(host: String, failed: (String?) -> Unit) {
        viewModelScope.launch {
            val result = engine.pairHueBridge(host)
            if (result.ok) say(result.message)
            failed(if (result.ok) null else result.message)
        }
    }

    fun refreshAppliances(force: Boolean = false) {
        viewModelScope.launch { app.thinq.refresh(force) }
    }

    fun connectAppliances(token: String, country: String, done: (String?) -> Unit) {
        viewModelScope.launch { done(app.thinq.connect(token, country)) }
    }

    fun forgetAppliances() {
        viewModelScope.launch { app.thinq.disconnect() }
    }
}
