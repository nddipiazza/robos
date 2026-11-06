package com.robos.preferences.core

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import java.net.Socket
import java.net.URLDecoder
import java.security.MessageDigest
import java.util.Base64
import kotlin.concurrent.thread

/** The phone's port of Config Sync and Google sign-in, checked against tools/export-golden.js. */
class PreferencesTest {
    private val golden: JsonObject = Json.parseToJsonElement(
        javaClass.classLoader!!.getResource("golden.json")!!.readText(),
    ).jsonObject

    private fun hex(text: String) = ByteArray(text.length / 2) { text.substring(it * 2, it * 2 + 2).toInt(16).toByte() }
    private fun ByteArray.hex() = joinToString("") { "%02x".format(it) }
    private val vault get() = golden["vault"]!!.jsonObject

    @Test
    fun scryptMatchesNode() {
        for (case in golden["scrypt"]!!.jsonArray.map { it.jsonObject }) {
            val salt = case["salt"]!!.jsonPrimitive.content
            val saltBytes = if (case["saltBase64"] != null) Base64.getDecoder().decode(salt) else salt.toByteArray()
            val key = Scrypt.derive(
                case["password"]!!.jsonPrimitive.content.toByteArray(), saltBytes,
                case["N"]!!.jsonPrimitive.int, case["r"]!!.jsonPrimitive.int, case["p"]!!.jsonPrimitive.int, case["dkLen"]!!.jsonPrimitive.int,
            )
            assertEquals(case["keyHex"]!!.jsonPrimitive.content, key.hex())
        }
    }

    @Test
    fun opensAnEncryptedDesktopBackup() {
        val outer = parseOuterManifest(vault["outerEncrypted"].toString().toByteArray())
        val key = deriveVaultKey(vault["passphrase"]!!.jsonPrimitive.content, outer.kdf!!)
        assertEquals(vault["keyHex"]!!.jsonPrimitive.content, key.hex())
        val manifest = openManifest(outer, key)
        assertEquals("Home backup", manifest.name)
        val file = manifest.files.single()
        assertEquals("config/smart-lights.json", file.path)
        assertEquals("smart-home", file.category)
        val content = unpackBlob(hex(vault["blobEncryptedHex"]!!.jsonPrimitive.content), key).decodeToString()
        assertEquals(vault["content"]!!.jsonPrimitive.content, content)
    }

    @Test
    fun aWrongPassphraseIsSaidPlainly() {
        val outer = parseOuterManifest(vault["outerEncrypted"].toString().toByteArray())
        try {
            openManifest(outer, deriveVaultKey("not it", outer.kdf!!))
            fail("A wrong passphrase must not open the backup.")
        } catch (e: VaultException) {
            assertEquals("WRONG_PASSPHRASE", e.code)
        }
    }

    @Test
    fun opensAPlainBackup() {
        val manifest = openManifest(parseOuterManifest(vault["outerPlain"].toString().toByteArray()), null)
        assertEquals(vault["content"]!!.jsonPrimitive.content, unpackBlob(hex(vault["blobPlainHex"]!!.jsonPrimitive.content), null).decodeToString())
        assertEquals(1, manifest.files.size)
    }

    @Test
    fun categoriesMatchTheDesktopCatalog() {
        val desktop = golden["categories"]!!.jsonArray.map { it.jsonObject["id"]!!.jsonPrimitive.content to it.jsonObject["label"]!!.jsonPrimitive.content }
        assertEquals(desktop, CATEGORY_LABELS.toList())
    }

    @Test
    fun usesTheSameGoogleClientAsTheDesktop() {
        val sha = MessageDigest.getInstance("SHA-256").digest(GOOGLE_CLIENT_SECRET.toByteArray()).hex()
        assertEquals(golden["clientSecretSha256"]!!.jsonPrimitive.content, sha)
    }

    // ── Google sign-in and Drive, against a stand-in for Google ─────────────

    private class FakeGoogle(private val files: Map<String, Pair<String, ByteArray>>, private val parents: Map<String, String>) : WebHttp {
        val calls = mutableListOf<String>()
        override fun request(method: String, url: String, headers: Map<String, String>, body: ByteArray?): WebReply {
            calls += "$method $url"
            fun ok(text: String) = WebReply(200, text.toByteArray())
            if (url == "https://oauth2.googleapis.com/token") {
                val form = body!!.decodeToString().split("&").associate { URLDecoder.decode(it.substringBefore("="), "UTF-8") to URLDecoder.decode(it.substringAfter("="), "UTF-8") }
                if (form["client_id"] != GOOGLE_CLIENT_ID || form["client_secret"] != GOOGLE_CLIENT_SECRET) return WebReply(401, """{"error":"invalid_client"}""".toByteArray())
                return if (form["grant_type"] == "authorization_code") {
                    if (form["code"] != "CODE123" || form["code_verifier"].isNullOrEmpty()) WebReply(400, """{"error":"invalid_grant"}""".toByteArray())
                    else ok("""{"access_token":"AT","refresh_token":"RT","expires_in":3600}""")
                } else {
                    if (form["refresh_token"] != "RT") WebReply(400, """{"error":"invalid_grant"}""".toByteArray()) else ok("""{"access_token":"AT2","expires_in":3600}""")
                }
            }
            if (!headers["Authorization"].orEmpty().startsWith("Bearer AT")) return WebReply(401, ByteArray(0))
            if (url.startsWith("https://www.googleapis.com/drive/v3/about")) return ok("""{"user":{"emailAddress":"me@example.com"}}""")
            val q = Regex("q=([^&]*)").find(url)?.groupValues?.get(1)?.let { URLDecoder.decode(it, "UTF-8") }
            if (q != null) {
                val name = Regex("name = '([^']*)'").find(q)?.groupValues?.get(1)
                val parent = Regex("'([^']*)' in parents").find(q)?.groupValues?.get(1)
                val matches = files.filter { (id, f) -> (name == null || f.first == name) && (parent == null || parents[id] == parent) }
                val list = matches.keys.joinToString(",") { id -> """{"id":"$id","name":"${files[id]!!.first}","parents":["${parents[id]}"]}""" }
                return ok("""{"files":[$list]}""")
            }
            val id = Regex("/files/([^?]*)").find(url)!!.groupValues[1]
            if ("alt=media" in url) return WebReply(200, files[id]!!.second)
            return ok("""{"id":"$id","name":"${if (id == "folder1") "RobOS backup" else id}"}""")
        }
    }

    @Test
    fun signsInThroughTheBrowserAndFindsTheBackup() {
        val manifest = vault["outerEncrypted"].toString().toByteArray()
        val blobId = Json.parseToJsonElement(
            openManifest(parseOuterManifest(manifest), hex(vault["keyHex"]!!.jsonPrimitive.content)).let { """{"b":"${it.files.single().blob}"}""" },
        ).jsonObject["b"]!!.jsonPrimitive.content
        val google = FakeGoogle(
            files = mapOf(
                "m1" to (MANIFEST_NAME to manifest),
                "blobs1" to (BLOBS_DIR to ByteArray(0)),
                "b1" to (blobId to hex(vault["blobEncryptedHex"]!!.jsonPrimitive.content)),
            ),
            parents = mapOf("m1" to "folder1", "blobs1" to "folder1", "b1" to "blobs1"),
        )
        val signIn = GoogleSignIn(google)
        val url = signIn.authUrl
        assertTrue(url, url.startsWith("https://accounts.google.com/o/oauth2/v2/auth?client_id=202264815644.apps.googleusercontent.com"))
        val redirect = URLDecoder.decode(Regex("redirect_uri=([^&]*)").find(url)!!.groupValues[1], "UTF-8")
        val state = URLDecoder.decode(Regex("state=([^&]*)").find(url)!!.groupValues[1], "UTF-8")
        assertTrue(redirect, redirect.startsWith("http://127.0.0.1:"))

        // The browser comes back from Google to the server on this phone.
        var page = ""
        val browser = thread {
            Thread.sleep(200)
            val port = redirect.removePrefix("http://127.0.0.1:").trimEnd('/').toInt()
            Socket("127.0.0.1", port).use { s ->
                s.getOutputStream().write("GET /?state=$state&code=CODE123&scope=drive HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n".toByteArray())
                page = s.getInputStream().readBytes().decodeToString()
            }
        }
        val account = signIn.awaitAccount(timeoutMs = 5000)
        browser.join()
        assertEquals(GoogleAccount("me@example.com", "RT"), account)
        assertTrue(page, page.contains("robos-preferences://signed-in"))

        val drive = DriveClient(account.refreshToken, google, sleep = {})
        val folders = drive.findConfigFolders()
        assertEquals(listOf("RobOS backup"), folders.map { it.name })
        assertTrue(folders.single().encrypted)

        val v = DriveVault(drive, folders.single().folderId)
        val outer = v.outer()
        val key = deriveVaultKey(vault["passphrase"]!!.jsonPrimitive.content, outer.kdf!!)
        val file = openManifest(outer, key).files.single()
        assertEquals(vault["content"]!!.jsonPrimitive.content, unpackBlob(v.readBlob(file.blob), key).decodeToString())
    }

    @Test
    fun aForgedReturnFromTheBrowserIsRefused() {
        val signIn = GoogleSignIn(FakeGoogle(emptyMap(), emptyMap()))
        val redirect = URLDecoder.decode(Regex("redirect_uri=([^&]*)").find(signIn.authUrl)!!.groupValues[1], "UTF-8")
        thread {
            Thread.sleep(200)
            Socket("127.0.0.1", redirect.removePrefix("http://127.0.0.1:").trimEnd('/').toInt()).use { s ->
                s.getOutputStream().write("GET /?state=WRONG&code=CODE123 HTTP/1.1\r\n\r\n".toByteArray())
                s.getInputStream().readBytes()
            }
        }
        try {
            signIn.awaitAccount(timeoutMs = 5000)
            fail("A return with the wrong state must not sign in.")
        } catch (e: GoogleException) {
            assertTrue(e.message, e.message!!.contains("did not finish"))
        }
    }

    @Test
    fun keyDerivationIsTheSameBytesAsNode() {
        val case = golden["scrypt"]!!.jsonArray[0].jsonObject
        assertArrayEquals(
            hex(case["keyHex"]!!.jsonPrimitive.content),
            Scrypt.derive("password".toByteArray(), "NaCl".toByteArray(), 1024, 8, 16, 64),
        )
    }
}
