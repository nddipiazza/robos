package com.robos.assistant.android

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.ConnectivityManager
import android.net.LinkProperties
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.BatteryManager
import android.os.PowerManager
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import com.robos.assistant.core.AuthVault
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import java.io.File
import java.net.Inet4Address
import java.net.NetworkInterface
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

data class WifiInfoState(
    val connected: Boolean = false,
    val ip: String = "",
)

class WifiMonitor(context: Context) {
    private val appContext = context.applicationContext
    private val connectivity = appContext.getSystemService(ConnectivityManager::class.java)
    private val _state = MutableStateFlow(resolveInitialState())
    val state: StateFlow<WifiInfoState> = _state

    init {
        val req = NetworkRequest.Builder()
            .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
            .build()
        try {
            connectivity.registerNetworkCallback(
                req,
                object : ConnectivityManager.NetworkCallback() {
                    override fun onAvailable(network: Network) {
                        updateFrom(connectivity.getLinkProperties(network))
                    }

                    override fun onLinkPropertiesChanged(network: Network, linkProperties: LinkProperties) {
                        updateFrom(linkProperties)
                    }

                    override fun onLost(network: Network) {
                        val fallbackIp = findWlanIpv4()
                        _state.value = WifiInfoState(connected = fallbackIp.isNotBlank(), ip = fallbackIp)
                    }
                },
            )
        } catch (_: Exception) {
        }
    }

    fun refreshNow() {
        _state.value = resolveInitialState()
    }

    private fun updateFrom(props: LinkProperties?) {
        val ip = props?.linkAddresses
            ?.map { it.address }
            ?.filterIsInstance<Inet4Address>()
            ?.firstOrNull { !it.isLoopbackAddress }
            ?.hostAddress
            ?: findWlanIpv4()
        _state.value = WifiInfoState(connected = ip.isNotBlank(), ip = ip)
    }

    private fun resolveInitialState(): WifiInfoState {
        val active = connectivity.activeNetwork
        val caps = active?.let { connectivity.getNetworkCapabilities(it) }
        val props = active?.let { connectivity.getLinkProperties(it) }
        val propIp = props?.linkAddresses
            ?.map { it.address }
            ?.filterIsInstance<Inet4Address>()
            ?.firstOrNull { !it.isLoopbackAddress }
            ?.hostAddress
        val ip = propIp ?: findWlanIpv4()
        val onWifi = caps?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true || ip.isNotBlank()
        return WifiInfoState(connected = onWifi, ip = ip)
    }

    companion object {
        fun findWlanIpv4(): String {
            return try {
                val interfaces = NetworkInterface.getNetworkInterfaces()?.toList().orEmpty()
                val preferred = interfaces.sortedBy { nif ->
                    when {
                        nif.name.startsWith("wlan") -> 0
                        nif.name.startsWith("eth") -> 1
                        else -> 2
                    }
                }
                for (nif in preferred) {
                    if (!nif.isUp || nif.isLoopback) continue
                    for (addr in nif.inetAddresses) {
                        if (addr is Inet4Address && !addr.isLoopbackAddress && !addr.isLinkLocalAddress) {
                            return addr.hostAddress ?: continue
                        }
                    }
                }
                ""
            } catch (_: Exception) {
                ""
            }
        }
    }
}

data class BatteryState(
    val percent: Int = -1,
    val charging: Boolean = false,
    val temperatureC: Float = 0f,
    val unrestricted: Boolean = false,
)

class BatteryMonitor(context: Context) {
    private val appContext = context.applicationContext
    private val powerManager = appContext.getSystemService(PowerManager::class.java)
    private val _state = MutableStateFlow(readNow())
    val state: StateFlow<BatteryState> = _state

    init {
        try {
            appContext.registerReceiver(
                object : BroadcastReceiver() {
                    override fun onReceive(ctx: Context?, intent: Intent?) {
                        _state.value = parseBatteryIntent(intent)
                    }
                },
                IntentFilter(Intent.ACTION_BATTERY_CHANGED),
            )
        } catch (_: Exception) {
        }
    }

    fun refresh() {
        _state.value = readNow()
    }

    private fun readNow(): BatteryState {
        val sticky = try {
            appContext.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        } catch (_: Exception) {
            null
        }
        return parseBatteryIntent(sticky)
    }

    private fun parseBatteryIntent(intent: Intent?): BatteryState {
        val unrestricted = try {
            powerManager.isIgnoringBatteryOptimizations(appContext.packageName)
        } catch (_: Exception) {
            false
        }
        if (intent == null) return BatteryState(unrestricted = unrestricted)
        val level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
        val scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, 100).coerceAtLeast(1)
        val pct = if (level >= 0) ((level * 100f) / scale).toInt().coerceIn(0, 100) else -1
        val plugged = intent.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0)
        val status = intent.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
        val charging = plugged != 0 ||
            status == BatteryManager.BATTERY_STATUS_CHARGING ||
            status == BatteryManager.BATTERY_STATUS_FULL
        val tenthsC = intent.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, 0)
        return BatteryState(
            percent = pct,
            charging = charging,
            temperatureC = if (tenthsC > 0) tenthsC / 10f else 0f,
            unrestricted = unrestricted,
        )
    }
}

class KeystoreAuthVault(private val file: File) : AuthVault {
    @Volatile
    private var cached: String? = null

    override fun getPassword(): String {
        cached?.let { return it }
        if (!file.exists()) {
            cached = ""
            return ""
        }
        val pw = try {
            val bytes = file.readBytes()
            if (bytes.size <= 13) {
                ""
            } else {
                val ivLen = bytes[0].toInt() and 0xff
                val iv = bytes.copyOfRange(1, 1 + ivLen)
                val ct = bytes.copyOfRange(1 + ivLen, bytes.size)
                val cipher = Cipher.getInstance("AES/GCM/NoPadding")
                cipher.init(Cipher.DECRYPT_MODE, secretKey(), GCMParameterSpec(128, iv))
                String(cipher.doFinal(ct), StandardCharsets.UTF_8)
            }
        } catch (_: Exception) {
            ""
        }
        cached = pw
        return pw
    }

    override fun setPassword(password: String) {
        cached = password
        if (password.isEmpty()) {
            file.delete()
            return
        }
        try {
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.ENCRYPT_MODE, secretKey())
            val iv = cipher.iv
            val ct = cipher.doFinal(password.toByteArray(StandardCharsets.UTF_8))
            file.parentFile?.mkdirs()
            val out = ByteArray(1 + iv.size + ct.size)
            out[0] = iv.size.toByte()
            System.arraycopy(iv, 0, out, 1, iv.size)
            System.arraycopy(ct, 0, out, 1 + iv.size, ct.size)
            file.writeBytes(out)
        } catch (_: Exception) {
        }
    }

    private fun secretKey(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        val existing = ks.getKey(KEY_ALIAS, null) as? SecretKey
        if (existing != null) return existing
        val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        gen.init(
            KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build(),
        )
        return gen.generateKey()
    }

    private companion object {
        const val KEY_ALIAS = "robos_assistant_auth"
    }
}
