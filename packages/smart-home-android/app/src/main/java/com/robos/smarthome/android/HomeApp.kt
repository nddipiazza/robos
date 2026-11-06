package com.robos.smarthome.android

import android.app.Application
import com.robos.smarthome.core.FileStateStore
import com.robos.smarthome.core.LightEngine
import com.robos.smarthome.core.SocketTransport
import com.robos.smarthome.core.ThinqService
import com.robos.smarthome.core.TuyaConnection
import com.robos.smarthome.core.TuyaDiscovery
import com.robos.smarthome.core.TuyaService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import java.io.File

class HomeApp : Application() {
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    lateinit var wifi: WifiMonitor
        private set
    lateinit var transport: SocketTransport
        private set
    lateinit var engine: LightEngine
        private set
    lateinit var thinq: ThinqService
        private set
    lateinit var tuya: TuyaService
        private set

    override fun onCreate() {
        super.onCreate()
        wifi = WifiMonitor(this)
        tuya = TuyaService(
            KeystoreTuyaVault(File(noBackupFilesDir, "tuya.bin")),
            discover = { TuyaDiscovery(wifi).scan(targets = (wifi.status.value.broadcast + "255.255.255.255").distinct()) },
            open = { id, ip, key, version -> TuyaConnection(id, ip, key, version, binder = wifi) },
        )
        transport = SocketTransport(wifi, tuyaKey = { tuya.keyFor(it) })
        engine = LightEngine(FileStateStore(File(filesDir, "smart-lights.json")), transport, scope)
        thinq = ThinqService(KeystoreThinqVault(File(noBackupFilesDir, "lg-thinq.bin")))

        scope.launch {
            engine.state.map { it.schedules }.distinctUntilChanged().collect {
                ScheduleAlarms.arm(this@HomeApp, engine)
            }
        }
    }
}
