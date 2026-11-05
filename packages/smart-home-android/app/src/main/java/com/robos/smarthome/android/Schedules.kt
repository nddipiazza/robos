package com.robos.smarthome.android

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.IBinder
import android.os.PowerManager
import androidx.core.content.ContextCompat
import com.robos.smarthome.R
import com.robos.smarthome.core.LightEngine
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.joinAll
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull

/** Asks Android to wake the app for the next schedule, even if the app is closed. */
object ScheduleAlarms {
    fun arm(context: Context, engine: LightEngine) {
        val alarms = context.getSystemService(AlarmManager::class.java)
        val intent = PendingIntent.getBroadcast(
            context, 0,
            Intent(context, AlarmReceiver::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val next = engine.nextRunTime()
        if (next == null) {
            alarms.cancel(intent)
            return
        }
        val atMs = next.toInstant().toEpochMilli()
        if (canUseExactAlarms(alarms)) {
            alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMs, intent)
        } else {
            alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMs, intent)
        }
    }

    private fun canUseExactAlarms(alarms: AlarmManager) =
        android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.S || alarms.canScheduleExactAlarms()
}

class AlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val app = context.applicationContext as HomeApp
        try {
            ContextCompat.startForegroundService(context, Intent(context, ScheduleService::class.java))
        } catch (_: IllegalStateException) {
            // Android refused to start the service from the background. The schedules
            // still run, but a fade could be cut short, so they get the receiver's window.
            val pending = goAsync()
            app.scope.launch {
                try {
                    withTimeoutOrNull(9_000) { app.engine.runDueSchedules().joinAll() }
                } finally {
                    ScheduleAlarms.arm(context, app.engine)
                    pending.finish()
                }
            }
        }
    }
}

/** Android forgets alarms on restart and when the clock changes, so they are set again here. */
class RearmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val app = context.applicationContext as HomeApp
        ScheduleAlarms.arm(context, app.engine)
    }
}

/**
 * Runs due schedules while the screen is off. A fade can last up to an hour, and without
 * the foreground service and wake lock the phone would sleep between its steps.
 */
class ScheduleService : Service() {
    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private var wakeLock: PowerManager.WakeLock? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(NOTIFICATION_ID, notification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE)
        if (wakeLock == null) {
            wakeLock = getSystemService(PowerManager::class.java)
                .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "robos:schedule")
                .apply { acquire(MAX_RUN_MS) }
        }
        val app = application as HomeApp
        serviceScope.launch {
            try {
                withTimeoutOrNull(MAX_RUN_MS) { app.engine.runDueSchedules().joinAll() }
            } finally {
                ScheduleAlarms.arm(this@ScheduleService, app.engine)
                stopSelf(startId)
            }
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        wakeLock?.takeIf { it.isHeld }?.release()
        serviceScope.cancel()
        super.onDestroy()
    }

    private fun notification(): Notification {
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "Light schedules", NotificationManager.IMPORTANCE_LOW),
        )
        return Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_tab_lights)
            .setContentTitle("Running a light schedule")
            .build()
    }

    private companion object {
        const val NOTIFICATION_ID = 1
        const val CHANNEL_ID = "schedules"
        const val MAX_RUN_MS = 65 * 60 * 1000L
    }
}
