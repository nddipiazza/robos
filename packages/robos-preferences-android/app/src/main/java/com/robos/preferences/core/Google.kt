package com.robos.preferences.core

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import java.io.IOException
import java.net.HttpURLConnection
import java.net.InetAddress
import java.net.ServerSocket
import java.net.SocketTimeoutException
import java.net.URL
import java.net.URLDecoder
import java.net.URLEncoder
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.spec.IvParameterSpec
import javax.crypto.spec.SecretKeySpec

// Google sign-in and Google Drive, done the way the desktop's cloud-accounts.js does it:
// the same public OAuth client (rclone's), full Drive access, and a sign-in page in the
// browser that hands the result to a small server on this phone at 127.0.0.1.

const val GOOGLE_CLIENT_ID = "202264815644.apps.googleusercontent.com"
const val DRIVE_SCOPE = "https://www.googleapis.com/auth/drive"

// The client secret of a public desktop OAuth client is not secret; rclone obscures it in
// its source the same way, and so does cloud-accounts.js.
private const val OBSCURED_CLIENT_SECRET = "eX8GpZTVx3vxMWVkuuBdDWmAUE6rGhTwVrvG9GhllYccSdj2-mvHVg"
private val OBSCURE_KEY = byteArrayOf(
    0x9c.toByte(), 0x93.toByte(), 0x5b, 0x48, 0x73, 0x0a, 0x55, 0x4d,
    0x6b, 0xfd.toByte(), 0x7c, 0x63, 0xc8.toByte(), 0x86.toByte(), 0xa9.toByte(), 0x2b,
    0xd3.toByte(), 0x90.toByte(), 0x19, 0x8e.toByte(), 0xb8.toByte(), 0x12, 0x8a.toByte(), 0xfb.toByte(),
    0xf4.toByte(), 0xde.toByte(), 0x16, 0x2b, 0x8b.toByte(), 0x95.toByte(), 0xf6.toByte(), 0x38,
)

fun revealObscured(obscured: String): String {
    val raw = Base64.getUrlDecoder().decode(obscured)
    val cipher = Cipher.getInstance("AES/CTR/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(OBSCURE_KEY, "AES"), IvParameterSpec(raw.copyOfRange(0, 16)))
    return cipher.doFinal(raw.copyOfRange(16, raw.size)).decodeToString()
}

val GOOGLE_CLIENT_SECRET: String by lazy { revealObscured(OBSCURED_CLIENT_SECRET) }

class GoogleException(message: String) : IOException(message)

// ── HTTP ─────────────────────────────────────────────────────────────────────

class WebReply(val status: Int, val body: ByteArray) {
    val text get() = body.decodeToString()
}

/** One HTTP request. Throws IOException when nothing answers. Tests replace it. */
fun interface WebHttp {
    fun request(method: String, url: String, headers: Map<String, String>, body: ByteArray?): WebReply
}

val DefaultWebHttp = WebHttp { method, url, headers, body ->
    val connection = URL(url).openConnection() as HttpURLConnection
    try {
        connection.connectTimeout = 20_000
        connection.readTimeout = 60_000
        connection.requestMethod = method
        headers.forEach { (k, v) -> connection.setRequestProperty(k, v) }
        if (body != null) {
            connection.doOutput = true
            connection.outputStream.use { it.write(body) }
        }
        val status = connection.responseCode
        val stream = if (status in 200..399) connection.inputStream else connection.errorStream
        WebReply(status, stream?.use { it.readBytes() } ?: ByteArray(0))
    } finally {
        connection.disconnect()
    }
}

private fun form(vararg pairs: Pair<String, String>) =
    pairs.joinToString("&") { (k, v) -> "${enc(k)}=${enc(v)}" }.toByteArray()

private fun enc(s: String) = URLEncoder.encode(s, "UTF-8")

// ── Sign-in ──────────────────────────────────────────────────────────────────

@Serializable
data class GoogleAccount(val email: String, val refreshToken: String)

/** A sign-in in progress: the page to open in the browser and the server waiting for Google's answer. */
class GoogleSignIn(private val http: WebHttp = DefaultWebHttp) {
    private val random = SecureRandom()
    private val server = ServerSocket(0, 1, InetAddress.getByName("127.0.0.1"))
    private val redirectUri = "http://127.0.0.1:${server.localPort}/"
    private val state = token(16)
    private val verifier = token(48)

    private fun token(bytes: Int): String =
        Base64.getUrlEncoder().withoutPadding().encodeToString(ByteArray(bytes).also(random::nextBytes))

    /** The Google page to open in the browser. */
    val authUrl: String = buildString {
        val challenge = Base64.getUrlEncoder().withoutPadding()
            .encodeToString(MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray()))
        append("https://accounts.google.com/o/oauth2/v2/auth?")
        append(
            listOf(
                "client_id" to GOOGLE_CLIENT_ID,
                "redirect_uri" to redirectUri,
                "response_type" to "code",
                "scope" to DRIVE_SCOPE,
                "access_type" to "offline",
                "prompt" to "consent select_account",
                "state" to state,
                "code_challenge" to challenge,
                "code_challenge_method" to "S256",
            ).joinToString("&") { (k, v) -> "$k=${enc(v)}" },
        )
    }

    /**
     * Waits for the browser to come back from Google, then trades the code for tokens.
     * Blocks; call it off the main thread.
     */
    fun awaitAccount(timeoutMs: Int = 10 * 60 * 1000): GoogleAccount {
        server.soTimeout = timeoutMs
        val code = try {
            server.accept().use { socket ->
                val requestLine = socket.getInputStream().bufferedReader().readLine().orEmpty()
                val query = requestLine.split(" ").getOrNull(1)?.substringAfter('?', "").orEmpty()
                val params = query.split("&").filter { "=" in it }.associate {
                    URLDecoder.decode(it.substringBefore("="), "UTF-8") to URLDecoder.decode(it.substringAfter("="), "UTF-8")
                }
                val ok = params["state"] == state && params["code"] != null
                socket.getOutputStream().write(resultPage(ok).toByteArray())
                socket.getOutputStream().flush()
                if (!ok) throw GoogleException(if (params["error"] == "access_denied") "Sign-in was cancelled." else "Google did not finish the sign-in. Try again.")
                params["code"]!!
            }
        } catch (_: SocketTimeoutException) {
            throw GoogleException("Sign-in timed out. Try again.")
        } finally {
            runCatching { server.close() }
        }
        val reply = http.request(
            "POST", "https://oauth2.googleapis.com/token",
            mapOf("Content-Type" to "application/x-www-form-urlencoded"),
            form(
                "code" to code,
                "client_id" to GOOGLE_CLIENT_ID,
                "client_secret" to GOOGLE_CLIENT_SECRET,
                "redirect_uri" to redirectUri,
                "grant_type" to "authorization_code",
                "code_verifier" to verifier,
            ),
        )
        val json = runCatching { Json.parseToJsonElement(reply.text).jsonObject }.getOrNull()
        val refresh = json?.get("refresh_token")?.jsonPrimitive?.contentOrNull
        val access = json?.get("access_token")?.jsonPrimitive?.contentOrNull
        if (refresh == null || access == null) {
            val why = json?.get("error_description")?.jsonPrimitive?.contentOrNull ?: json?.get("error")?.jsonPrimitive?.contentOrNull
            throw GoogleException("Google did not accept the sign-in${why?.let { ": $it" } ?: ""}.")
        }
        val about = http.request("GET", "https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)", mapOf("Authorization" to "Bearer $access"), null)
        val email = runCatching {
            Json.parseToJsonElement(about.text).jsonObject["user"]!!.jsonObject["emailAddress"]!!.jsonPrimitive.content
        }.getOrDefault("your Google account")
        return GoogleAccount(email, refresh)
    }

    fun cancel() {
        runCatching { server.close() }
    }

    private fun resultPage(ok: Boolean): String {
        val title = if (ok) "Signed in" else "Sign-in did not finish"
        val body = if (ok) "Go back to RobOS Preferences to choose your backup." else "Go back to RobOS Preferences and try again."
        val html = """<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>$title</title></head>
            <body style="font-family:sans-serif;background:#0d1117;color:#e6edf3;margin:0;padding:32px 20px;">
            <h2 style="margin:0 0 12px;">$title</h2><p style="color:#8b949e;line-height:1.5;">$body</p>
            <p><a href="robos-preferences://signed-in" style="display:inline-block;background:#00bcd4;color:#04222a;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600;">Back to RobOS Preferences</a></p>
            </body></html>"""
        val bytes = html.toByteArray()
        return "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: ${bytes.size}\r\nConnection: close\r\n\r\n$html"
    }
}

// ── Drive ────────────────────────────────────────────────────────────────────

data class DriveFile(val id: String, val name: String, val parents: List<String>, val modifiedTime: String?)

/** A RobOS settings folder found in Drive: a vault (full backup) or a share. */
data class DriveConfigFolder(
    val folderId: String,
    val name: String,
    val kind: String,
    val encrypted: Boolean,
    val updatedAt: String?,
    val updatedBy: String?,
)

class DriveClient(
    private val refreshToken: String,
    private val http: WebHttp = DefaultWebHttp,
    private val now: () -> Long = System::currentTimeMillis,
    private val sleep: (Long) -> Unit = Thread::sleep,
) {
    private var accessToken: String? = null
    private var expiresAt = 0L

    private fun token(): String {
        accessToken?.takeIf { now() < expiresAt - 60_000 }?.let { return it }
        val reply = http.request(
            "POST", "https://oauth2.googleapis.com/token",
            mapOf("Content-Type" to "application/x-www-form-urlencoded"),
            form("client_id" to GOOGLE_CLIENT_ID, "client_secret" to GOOGLE_CLIENT_SECRET, "refresh_token" to refreshToken, "grant_type" to "refresh_token"),
        )
        val json = runCatching { Json.parseToJsonElement(reply.text).jsonObject }.getOrNull()
        val access = json?.get("access_token")?.jsonPrimitive?.contentOrNull
            ?: throw GoogleException(
                if (json?.get("error")?.jsonPrimitive?.contentOrNull == "invalid_grant") "Google signed this phone out. Sign in again."
                else "Could not refresh the Google sign-in (HTTP ${reply.status}).",
            )
        accessToken = access
        expiresAt = now() + (json["expires_in"]?.jsonPrimitive?.longOrNull ?: 3600) * 1000
        return access
    }

    /** GET with the Drive retry rules: wait and retry on rate limits and server errors. */
    private fun get(url: String): WebReply {
        var wait = 1000L
        repeat(6) { attempt ->
            val reply = http.request("GET", url, mapOf("Authorization" to "Bearer ${token()}"), null)
            when {
                reply.status == 401 && attempt == 0 -> accessToken = null
                reply.status == 429 || reply.status == 403 && reply.text.contains("rateLimitExceeded") || reply.status >= 500 -> {
                    sleep(wait)
                    wait *= 2
                }
                reply.status in 200..299 -> return reply
                else -> throw GoogleException("Google Drive answered HTTP ${reply.status}.")
            }
        }
        throw GoogleException("Google Drive is busy. Try again in a minute.")
    }

    private fun json(url: String): JsonObject = Json.parseToJsonElement(get(url).text).jsonObject

    private fun q(text: String) = "'" + text.replace("\\", "\\\\").replace("'", "\\'") + "'"

    private val common = "supportsAllDrives=true&includeItemsFromAllDrives=true"

    private fun list(query: String, fields: String): List<JsonObject> {
        val out = mutableListOf<JsonObject>()
        var page = ""
        do {
            val url = "https://www.googleapis.com/drive/v3/files?q=${enc(query)}&fields=${enc("nextPageToken,files($fields)")}&pageSize=1000&$common" +
                (if (page.isNotEmpty()) "&pageToken=${enc(page)}" else "")
            val result = json(url)
            out += result["files"]?.jsonArray?.map { it.jsonObject }.orEmpty()
            page = result["nextPageToken"]?.jsonPrimitive?.contentOrNull.orEmpty()
        } while (page.isNotEmpty() && out.size < 20_000)
        return out
    }

    private fun JsonObject.toFile() = DriveFile(
        id = this["id"]!!.jsonPrimitive.content,
        name = this["name"]?.jsonPrimitive?.contentOrNull.orEmpty(),
        parents = this["parents"]?.jsonArray?.map { it.jsonPrimitive.content }.orEmpty(),
        modifiedTime = this["modifiedTime"]?.jsonPrimitive?.contentOrNull,
    )

    fun findByName(name: String): List<DriveFile> =
        list("name = ${q(name)} and trashed = false", "id,name,parents,modifiedTime").map { it.toFile() }

    fun children(folderId: String, name: String? = null): List<DriveFile> {
        val query = buildString {
            append("${q(folderId)} in parents and trashed = false")
            if (name != null) append(" and name = ${q(name)}")
        }
        return list(query, "id,name,parents,modifiedTime").map { it.toFile() }
    }

    fun folderName(folderId: String): String =
        runCatching { json("https://www.googleapis.com/drive/v3/files/${enc(folderId)}?fields=id,name&supportsAllDrives=true")["name"]!!.jsonPrimitive.content }
            .getOrDefault(folderId)

    fun download(fileId: String): ByteArray = get("https://www.googleapis.com/drive/v3/files/${enc(fileId)}?alt=media&supportsAllDrives=true").body

    /** Every RobOS settings folder this account can see, newest first, like findDriveConfigFolders on the desktop. */
    fun findConfigFolders(): List<DriveConfigFolder> =
        findByName(MANIFEST_NAME).mapNotNull { manifest ->
            val folderId = manifest.parents.firstOrNull() ?: return@mapNotNull null
            val outer = runCatching { Json.parseToJsonElement(download(manifest.id).decodeToString()).jsonObject }.getOrNull()
                ?: return@mapNotNull null
            DriveConfigFolder(
                folderId = folderId,
                name = folderName(folderId),
                kind = outer["kind"]?.jsonPrimitive?.contentOrNull ?: "vault",
                encrypted = outer["encrypted"] is JsonObject,
                updatedAt = outer["updatedAt"]?.jsonPrimitive?.contentOrNull ?: manifest.modifiedTime,
                updatedBy = (outer["updatedBy"] as? JsonObject)?.get("machineName")?.jsonPrimitive?.contentOrNull,
            )
        }.sortedByDescending { it.updatedAt.orEmpty() }
}

/** One settings folder in Drive, read on demand. */
class DriveVault(private val drive: DriveClient, val folderId: String) {
    private var blobIndex: Map<String, String>? = null

    fun outer(): OuterManifest {
        val file = drive.children(folderId, MANIFEST_NAME).firstOrNull()
            ?: throw VaultException("That folder no longer has RobOS settings in it.", "NO_MANIFEST")
        return parseOuterManifest(drive.download(file.id))
    }

    fun readBlob(id: String): ByteArray {
        val index = blobIndex ?: run {
            val blobs = drive.children(folderId, BLOBS_DIR).firstOrNull()
                ?: throw VaultException("The backup has no file bodies yet. Sync it from a computer first.", "NO_BLOBS")
            drive.children(blobs.id).associate { it.name to it.id }.also { blobIndex = it }
        }
        val fileId = index[id] ?: throw VaultException("The backup is missing a file body. Sync again from a computer that has it.", "MISSING_BLOB")
        return drive.download(fileId)
    }
}
