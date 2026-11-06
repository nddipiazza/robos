package com.robos.preferences.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.robos.preferences.android.AccountStore
import com.robos.preferences.android.PhoneApps
import com.robos.preferences.core.DriveClient
import com.robos.preferences.core.DriveConfigFolder
import com.robos.preferences.core.DriveVault
import com.robos.preferences.core.GoogleAccount
import com.robos.preferences.core.GoogleSignIn
import com.robos.preferences.core.Manifest
import com.robos.preferences.core.OuterManifest
import com.robos.preferences.core.PHONE_TARGETS
import com.robos.preferences.core.PhoneTarget
import com.robos.preferences.core.VaultException
import com.robos.preferences.core.deriveVaultKey
import com.robos.preferences.core.openManifest
import com.robos.preferences.core.unpackBlob
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

sealed interface Screen {
    data object SignedOut : Screen
    data class SigningIn(val url: String) : Screen
    data class Backups(val folders: List<DriveConfigFolder>?) : Screen
    data class Passphrase(val folder: DriveConfigFolder, val wrong: Boolean) : Screen
    data class Contents(val folder: DriveConfigFolder, val manifest: Manifest) : Screen
}

class PreferencesViewModel(application: Application) : AndroidViewModel(application) {
    private val store = AccountStore(File(application.noBackupFilesDir, "google.bin"))
    private var account: GoogleAccount? = store.load()
    private var signIn: GoogleSignIn? = null
    private var vault: DriveVault? = null
    private var key: ByteArray? = null

    val email = MutableStateFlow(account?.email)
    val screen = MutableStateFlow<Screen>(if (account == null) Screen.SignedOut else Screen.Backups(null))
    val busy = MutableStateFlow<String?>(null)
    val problem = MutableStateFlow<String?>(null)
    val restored = MutableStateFlow<Map<String, String>>(emptyMap())

    /** Whether the app is on screen. Android blocks its internet while it is not. */
    val onScreen = MutableStateFlow(false)

    /** Asks the activity to open a page in the browser. */
    val openPage = MutableStateFlow<String?>(null)

    init {
        if (account != null) loadBackups()
    }

    private fun drive() = DriveClient(account!!.refreshToken)

    private fun work(label: String, block: suspend () -> Unit) {
        viewModelScope.launch {
            busy.value = label
            problem.value = null
            try {
                block()
            } catch (e: Exception) {
                problem.value = e.message ?: "Something went wrong."
            } finally {
                busy.value = null
            }
        }
    }

    fun signIn() {
        val attempt = GoogleSignIn()
        signIn?.cancel()
        signIn = attempt
        screen.value = Screen.SigningIn(attempt.authUrl)
        openPage.value = attempt.authUrl
        viewModelScope.launch {
            problem.value = null
            try {
                val code = withContext(Dispatchers.IO) { attempt.awaitCode() }
                // Google's answer arrives while the browser is in front; finish once the app is back.
                onScreen.first { it }
                busy.value = "Finishing sign-in"
                val signedIn = withContext(Dispatchers.IO) { attempt.exchange(code) }
                busy.value = null
                store.save(signedIn)
                account = signedIn
                email.value = signedIn.email
                loadBackups()
            } catch (e: Exception) {
                if (signIn === attempt) {
                    problem.value = e.message
                    screen.value = Screen.SignedOut
                }
            }
        }
    }

    fun cancelSignIn() {
        signIn?.cancel()
        signIn = null
        screen.value = Screen.SignedOut
    }

    fun signOut() {
        signIn?.cancel()
        store.clear()
        account = null
        email.value = null
        restored.value = emptyMap()
        screen.value = Screen.SignedOut
    }

    fun loadBackups() = work("Looking for your RobOS backups in Google Drive") {
        screen.value = Screen.Backups(null)
        val folders = withContext(Dispatchers.IO) { drive().findConfigFolders() }
        screen.value = Screen.Backups(folders)
    }

    fun open(folder: DriveConfigFolder, passphrase: String? = null) = work("Opening ${folder.name}") {
        val v = DriveVault(drive(), folder.folderId)
        val outer: OuterManifest = withContext(Dispatchers.IO) { v.outer() }
        val k = when {
            outer.kdf == null -> null
            passphrase.isNullOrEmpty() -> {
                screen.value = Screen.Passphrase(folder, wrong = false)
                return@work
            }
            else -> withContext(Dispatchers.Default) { deriveVaultKey(passphrase, outer.kdf) }
        }
        val manifest = try {
            openManifest(outer, k)
        } catch (e: VaultException) {
            if (e.code == "WRONG_PASSPHRASE") {
                screen.value = Screen.Passphrase(folder, wrong = true)
                return@work
            }
            throw e
        }
        vault = v
        key = k
        restored.value = emptyMap()
        screen.value = Screen.Contents(folder, manifest)
    }

    fun isInstalled(target: PhoneTarget) = PhoneApps.isInstalled(getApplication(), target.packageName)

    fun restore(target: PhoneTarget, manifest: Manifest) = work("Restoring ${target.appName}") {
        val file = manifest.files.firstOrNull { it.path == target.path }
            ?: throw VaultException("This backup has no ${target.appName} settings.", "NOT_IN_BACKUP")
        val v = vault ?: return@work
        val text = withContext(Dispatchers.IO) { unpackBlob(v.readBlob(file.blob), key).decodeToString() }
        val result = withContext(Dispatchers.IO) { PhoneApps.importSettings(getApplication(), target.packageName, target.path, text) }
        if (!result.ok) throw VaultException(result.summary, "IMPORT_FAILED")
        restored.value = restored.value + (target.path to result.summary)
    }

    fun back() {
        screen.value = Screen.Backups((screen.value as? Screen.Backups)?.folders)
        loadBackups()
    }

    fun pageOpened() {
        openPage.value = null
    }

    val targets = PHONE_TARGETS
}
