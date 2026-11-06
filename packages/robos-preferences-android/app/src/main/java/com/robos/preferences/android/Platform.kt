package com.robos.preferences.android

import android.content.Context
import android.net.Uri
import android.os.Bundle
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import com.robos.preferences.core.GoogleAccount
import kotlinx.serialization.json.Json
import java.io.File
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Keeps the Google sign-in in a file encrypted with an Android Keystore key. */
class AccountStore(private val file: File) {
    private val alias = "robos-preferences-google"

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

    fun load(): GoogleAccount? = runCatching {
        if (!file.exists()) return null
        val data = file.readBytes()
        val ivSize = data[0].toInt()
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, data, 1, ivSize))
        Json.decodeFromString(GoogleAccount.serializer(), cipher.doFinal(data, 1 + ivSize, data.size - 1 - ivSize).decodeToString())
    }.getOrNull()

    fun save(account: GoogleAccount) {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val encrypted = cipher.doFinal(Json.encodeToString(GoogleAccount.serializer(), account).toByteArray())
        file.parentFile?.mkdirs()
        val temp = File(file.parentFile, "${file.name}.tmp")
        temp.writeBytes(byteArrayOf(cipher.iv.size.toByte()) + cipher.iv + encrypted)
        temp.renameTo(file)
    }

    fun clear() {
        file.delete()
    }
}

/** What a phone app reported after taking restored settings. */
data class ImportResult(val ok: Boolean, val summary: String)

/**
 * Hands a restored settings file to the phone app that uses it. The app's settings
 * provider is guarded by a permission only RobOS apps signed with the same key hold.
 */
object PhoneApps {
    fun isInstalled(context: Context, packageName: String): Boolean =
        runCatching { context.packageManager.getPackageInfo(packageName, 0) }.isSuccess

    fun importSettings(context: Context, packageName: String, path: String, json: String): ImportResult = try {
        val reply = context.contentResolver.call(
            Uri.parse("content://$packageName.settings"),
            "import",
            path,
            Bundle().apply { putString("json", json) },
        )
        val error = reply?.getString("error")
        when {
            reply == null -> ImportResult(false, "The app did not answer. Update it and try again.")
            error != null -> ImportResult(false, error)
            else -> ImportResult(true, reply.getString("summary") ?: "Restored.")
        }
    } catch (e: SecurityException) {
        ImportResult(false, "The app would not take settings from Preferences. Both apps need to come from the same RobOS build.")
    } catch (e: IllegalArgumentException) {
        ImportResult(false, "This version of the app cannot take restored settings yet. Update it and try again.")
    }
}
