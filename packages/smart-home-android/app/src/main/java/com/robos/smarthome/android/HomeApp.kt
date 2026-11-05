package com.robos.smarthome.android

import android.app.Application
import com.robos.smarthome.core.FileStateStore
import com.robos.smarthome.core.LightEngine
import com.robos.smarthome.core.SocketTransport
import com.robos.smarthome.core.ThinqService
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

    override fun onCreate() {
        super.onCreate()
        wifi = WifiMonitor(this)
        transport = SocketTransport(wifi)
        engine = LightEngine(FileStateStore(File(filesDir, "smart-lights.json")), transport, scope)
        thinq = ThinqService(KeystoreThinqVault(File(noBackupFilesDir, "lg-thinq.bin")))

        scope.launch {
            engine.state.map { it.schedules }.distinctUntilChanged().collect {
                ScheduleAlarms.arm(this@HomeApp, engine)
            }
        }
    }
}
