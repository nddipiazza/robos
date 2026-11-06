package com.robos.preferences.core

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import java.io.ByteArrayInputStream
import java.util.Base64
import java.util.zip.GZIPInputStream
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

// Reads a RobOS Config Sync folder: robos-config.json plus content-addressed blobs.
// The format is defined by packages/robos-lib/config-sync.js; VaultTest checks this
// port against files that code wrote.

const val CONFIG_FORMAT = "robos-config/1"
const val MANIFEST_NAME = "robos-config.json"
const val BLOBS_DIR = "blobs"

class VaultException(message: String, val code: String) : Exception(message)

/** The passphrase settings stored in an encrypted folder's robos-config.json. */
data class Kdf(val n: Int, val r: Int, val p: Int, val salt: ByteArray)

/** robos-config.json before decryption: enough to show the folder in a list. */
data class OuterManifest(val kind: String, val id: String, val kdf: Kdf?, val payload: String?, val plain: JsonObject?)

data class VaultFile(val path: String, val blob: String, val size: Long, val category: String, val by: String?)

data class Manifest(
    val kind: String,
    val name: String,
    val updatedAt: String?,
    val files: List<VaultFile>,
)

fun parseOuterManifest(bytes: ByteArray): OuterManifest {
    val json = runCatching { Json.parseToJsonElement(bytes.decodeToString()).jsonObject }.getOrNull()
        ?: throw VaultException("robos-config.json in that folder is not valid JSON.", "BAD_MANIFEST")
    val format = json["format"]?.jsonPrimitive?.contentOrNull
    if (format != CONFIG_FORMAT) throw VaultException("That folder holds \"${format ?: "unknown"}\" data, not RobOS settings.", "BAD_MANIFEST")
    val enc = json["encrypted"] as? JsonObject
    val kdf = enc?.let {
        Kdf(
            n = it["N"]!!.jsonPrimitive.intOrNull!!,
            r = it["r"]!!.jsonPrimitive.intOrNull!!,
            p = it["p"]!!.jsonPrimitive.intOrNull!!,
            salt = Base64.getDecoder().decode(it["salt"]!!.jsonPrimitive.content),
        )
    }
    return OuterManifest(
        kind = json["kind"]?.jsonPrimitive?.contentOrNull ?: "vault",
        id = json["id"]?.jsonPrimitive?.contentOrNull.orEmpty(),
        kdf = kdf,
        payload = json["payload"]?.jsonPrimitive?.contentOrNull,
        plain = if (kdf == null) json else null,
    )
}

/** The 32-byte key for an encrypted folder. Takes a second or two on a phone. */
fun deriveVaultKey(passphrase: String, kdf: Kdf): ByteArray =
    Scrypt.derive(passphrase.toByteArray(), kdf.salt, kdf.n, kdf.r, kdf.p, 32)

/** AES-256-GCM laid out as the desktop writes it: IV (12), tag (16), then the ciphertext. */
fun vaultDecrypt(key: ByteArray, buf: ByteArray): ByteArray {
    val iv = buf.copyOfRange(0, 12)
    val tag = buf.copyOfRange(12, 28)
    val body = buf.copyOfRange(28, buf.size)
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, iv))
    return cipher.doFinal(body + tag)
}

/** Opens the manifest; needs the key when the folder is encrypted. */
fun openManifest(outer: OuterManifest, key: ByteArray?): Manifest {
    val json = if (outer.kdf == null) {
        outer.plain!!
    } else {
        key ?: throw VaultException("This backup is encrypted. Enter its passphrase.", "PASSPHRASE_REQUIRED")
        val plain = try {
            vaultDecrypt(key, Base64.getDecoder().decode(outer.payload.orEmpty()))
        } catch (_: Exception) {
            throw VaultException("Wrong passphrase for this backup.", "WRONG_PASSPHRASE")
        }
        Json.parseToJsonElement(plain.decodeToString()).jsonObject
    }
    val files = (json["files"] as? JsonObject).orEmpty().mapNotNull { (path, value) ->
        val f = value as? JsonObject ?: return@mapNotNull null
        VaultFile(
            path = path,
            blob = f["blob"]?.jsonPrimitive?.contentOrNull ?: f["sha"]?.jsonPrimitive?.contentOrNull ?: return@mapNotNull null,
            size = f["size"]?.jsonPrimitive?.longOrNull ?: 0,
            category = f["category"]?.jsonPrimitive?.contentOrNull ?: "other",
            by = f["by"]?.jsonPrimitive?.contentOrNull,
        )
    }.sortedBy { it.path }
    return Manifest(
        kind = json["kind"]?.jsonPrimitive?.contentOrNull ?: outer.kind,
        name = json["name"]?.jsonPrimitive?.contentOrNull.orEmpty(),
        updatedAt = json["updatedAt"]?.jsonPrimitive?.contentOrNull,
        files = files,
    )
}

/** A file body as stored in blobs/: gzip, then encrypted when the folder has a passphrase. */
fun unpackBlob(buf: ByteArray, key: ByteArray?): ByteArray {
    val zipped = if (key != null) vaultDecrypt(key, buf) else buf
    return GZIPInputStream(ByteArrayInputStream(zipped)).use { it.readBytes() }
}

/** The categories of the desktop's config-sync-catalog.js, in its order. CatalogTest keeps them in step. */
val CATEGORY_LABELS = linkedMapOf(
    "preferences" to "Preferences",
    "profile" to "Your profile",
    "cloud-accounts" to "Cloud accounts & data sources",
    "movie-library" to "Movie Player library",
    "audio-library" to "Audio Player library",
    "private-network" to "Private Network & App Mesh",
    "smart-home" to "Smart home & TVs",
    "developer" to "Developer tools",
    "agents" to "Agents & skills",
    "team" to "Team & organization",
    "kgraph" to "Knowledge Graph workspace",
    "business" to "Business apps",
    "games" to "Games",
    "other" to "Other app settings",
)

fun categoryLabel(id: String): String = CATEGORY_LABELS[id] ?: id

/** Where each backed-up file goes on the phone. Only files a phone app uses are listed. */
data class PhoneTarget(val path: String, val appName: String, val packageName: String, val what: String)

val PHONE_TARGETS = listOf(
    PhoneTarget("config/smart-lights.json", "Smart Home", "com.robos.smarthome", "lights, rooms, scenes and schedules"),
)
