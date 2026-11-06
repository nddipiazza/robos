package com.robos.smarthome.android

import android.content.Context
import android.net.ConnectivityManager
import android.net.LinkProperties
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.net.wifi.WifiManager
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import com.robos.smarthome.core.NetworkBinder
import com.robos.smarthome.core.ThinqCredentials
import com.robos.smarthome.core.ThinqVault
import com.robos.smarthome.core.TuyaSecrets
import com.robos.smarthome.core.TuyaVault
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.File
import java.net.DatagramSocket
import java.net.HttpURLConnection
import java.net.Inet4Address
import java.net.InetAddress
import java.net.Socket
import java.net.URL
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

data class WifiStatus(
    val network: Network? = null,
    val broadcast: List<String> = listOf("255.255.255.255"),
) {
    val connected: Boolean get() = network != null
}

/** Tracks the Wi-Fi network and keeps light traffic on it. */
class WifiMonitor(context: Context) : NetworkBinder {
    private val manager = context.getSystemService(ConnectivityManager::class.java)
    private val _status = MutableStateFlow(WifiStatus())
    val status: StateFlow<WifiStatus> = _status

    init {
        val request = NetworkRequest.Builder().addTransportType(NetworkCapabilities.TRANSPORT_WIFI).build()
        manager.registerNetworkCallback(
            request,
            object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) {
                    _status.value = WifiStatus(network, broadcastFor(manager.getLinkProperties(network)))
                }

                override fun onLinkPropertiesChanged(network: Network, properties: LinkProperties) {
                    _status.value = WifiStatus(network, broadcastFor(properties))
                }

                override fun onLost(network: Network) {
                    if (_status.value.network == network) _status.value = WifiStatus()
                }
            },
        )
    }

    override fun bind(socket: DatagramSocket) {
        _status.value.network?.bindSocket(socket)
    }

    override fun bind(socket: Socket) {
        _status.value.network?.bindSocket(socket)
    }

    override fun open(url: URL): HttpURLConnection =
        (_status.value.network?.openConnection(url) ?: url.openConnection()) as HttpURLConnection

    private fun broadcastFor(properties: LinkProperties?): List<String> {
        val subnet = properties?.linkAddresses?.firstOrNull { it.address is Inet4Address }?.let { link ->
            val bytes = link.address.address
            val value = bytes.fold(0) { acc, b -> (acc shl 8) or (b.toInt() and 0xff) }
            val mask = if (link.prefixLength == 0) 0 else -1 shl (32 - link.prefixLength)
            val broadcast = value or mask.inv()
            InetAddress.getByAddress(
                byteArrayOf((broadcast ushr 24).toByte(), (broadcast ushr 16).toByte(), (broadcast ushr 8).toByte(), broadcast.toByte()),
            ).hostAddress
        }
        return listOfNotNull(subnet, "255.255.255.255").distinct()
    }
}

/** Android drops multicast packets unless an app asks for them, to save battery. */
inline fun <T> withMulticast(context: Context, block: () -> T): T {
    val lock = context.applicationContext.getSystemService(WifiManager::class.java).createMulticastLock("robos-scan")
    lock.setReferenceCounted(false)
    lock.acquire()
    try {
        return block()
    } finally {
        lock.release()
    }
}

data class MdnsService(val type: String, val ip: String, val port: Int, val name: String)

const val MDNS_WLED = "_wled._tcp."
const val MDNS_ELGATO = "_elg._tcp."
const val MDNS_SHELLY = "_shelly._tcp."
const val MDNS_HUE = "_hue._tcp."

/** Listens for devices that announce themselves on the Wi-Fi network. */
class MdnsBrowser(context: Context) {
    private val manager = context.applicationContext.getSystemService(NsdManager::class.java)
    private val resolveLock = Mutex()

    suspend fun browse(types: List<String>, windowMs: Long): List<MdnsService> {
        val seen = java.util.concurrent.ConcurrentLinkedQueue<NsdServiceInfo>()
        val listeners = types.map { type ->
            object : NsdManager.DiscoveryListener {
                override fun onServiceFound(info: NsdServiceInfo) {
                    seen += info
                }

                override fun onDiscoveryStarted(serviceType: String) {}
                override fun onDiscoveryStopped(serviceType: String) {}
                override fun onServiceLost(info: NsdServiceInfo) {}
                override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {}
                override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {}
            }.also { manager.discoverServices(type, NsdManager.PROTOCOL_DNS_SD, it) }
        }
        delay(windowMs)
        listeners.forEach { runCatching { manager.stopServiceDiscovery(it) } }
        return seen.distinctBy { it.serviceType + it.serviceName }.mapNotNull { resolve(it) }
    }

    /** Android can only resolve one service at a time on the versions this app supports. */
    @Suppress("DEPRECATION")
    private suspend fun resolve(info: NsdServiceInfo): MdnsService? = resolveLock.withLock {
        val result = CompletableDeferred<NsdServiceInfo?>()
        manager.resolveService(
            info,
            object : NsdManager.ResolveListener {
                override fun onServiceResolved(resolved: NsdServiceInfo) {
                    result.complete(resolved)
                }

                override fun onResolveFailed(failed: NsdServiceInfo, errorCode: Int) {
                    result.complete(null)
                }
            },
        )
        val resolved = withTimeoutOrNull(2000) { result.await() } ?: return@withLock null
        val ip = resolved.host?.hostAddress?.takeIf { '.' in it } ?: return@withLock null
        val type = resolved.serviceType.trimStart('.').let { if (it.endsWith(".")) it else "$it." }
        MdnsService(type, ip, resolved.port, resolved.serviceName)
    }
}

@Serializable
private data class StoredCredentials(val token: String, val countryCode: String, val clientId: String)

/** Keeps the LG token encrypted with a key that never leaves the phone's Keystore. */
class KeystoreThinqVault(private val file: File) : ThinqVault {
    private val alias = "robos-thinq-token"

    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(alias, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").run {
            init(
                KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .build(),
            )
            generateKey()
        }
    }

    override fun load(): ThinqCredentials? = runCatching {
        if (!file.exists()) return null
        val data = file.readBytes()
        val ivSize = data[0].toInt()
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, data, 1, ivSize))
        val plain = cipher.doFinal(data, 1 + ivSize, data.size - 1 - ivSize).decodeToString()
        val stored = Json.decodeFromString<StoredCredentials>(plain)
        ThinqCredentials(stored.token, stored.countryCode, stored.clientId)
    }.getOrNull()

    override fun save(credentials: ThinqCredentials) {
        val plain = Json.encodeToString(
            StoredCredentials.serializer(),
            StoredCredentials(credentials.token, credentials.countryCode, credentials.clientId),
        ).toByteArray()
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val encrypted = cipher.doFinal(plain)
        file.parentFile?.mkdirs()
        val temp = File(file.parentFile, "${file.name}.tmp")
        temp.writeBytes(byteArrayOf(cipher.iv.size.toByte()) + cipher.iv + encrypted)
        temp.renameTo(file)
    }

    override fun clear() {
        file.delete()
    }
}

/** Keeps the Tuya cloud keys and each light's local key in a file encrypted with an Android Keystore key. */
class KeystoreTuyaVault(private val file: File) : TuyaVault {
    private val alias = "robos-tuya-keys"

    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(alias, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").run {
            init(
                KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .build(),
            )
            generateKey()
        }
    }

    override fun load(): TuyaSecrets? = runCatching {
        if (!file.exists()) return null
        val data = file.readBytes()
        val ivSize = data[0].toInt()
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, data, 1, ivSize))
        Json.decodeFromString(TuyaSecrets.serializer(), cipher.doFinal(data, 1 + ivSize, data.size - 1 - ivSize).decodeToString())
    }.getOrNull()

    override fun save(secrets: TuyaSecrets) {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val encrypted = cipher.doFinal(Json.encodeToString(TuyaSecrets.serializer(), secrets).toByteArray())
        file.parentFile?.mkdirs()
        val temp = File(file.parentFile, "${file.name}.tmp")
        temp.writeBytes(byteArrayOf(cipher.iv.size.toByte()) + cipher.iv + encrypted)
        temp.renameTo(file)
    }

    override fun clear() {
        file.delete()
    }
}
