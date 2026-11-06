package com.robos.smarthome.android

import android.content.ContentProvider
import android.content.ContentValues
import android.database.Cursor
import android.net.Uri
import android.os.Bundle
import kotlinx.coroutines.runBlocking
import java.util.concurrent.TimeUnit

/**
 * Takes settings that RobOS Preferences restored from a Google Drive backup. Only apps
 * signed with the same key as this one hold com.robos.permission.MANAGE_SETTINGS.
 *
 *   call("import", "config/smart-lights.json", { json }) → { summary } or { error }
 */
class SettingsProvider : ContentProvider() {
    override fun onCreate() = true

    override fun call(method: String, arg: String?, extras: Bundle?): Bundle {
        if (method != "import") return Bundle().apply { putString("error", "Unknown request: $method") }
        if (arg != "config/smart-lights.json") return Bundle().apply { putString("error", "Smart Home does not use $arg.") }
        val json = extras?.getString("json") ?: return Bundle().apply { putString("error", "Nothing to restore.") }
        val app = context!!.applicationContext as HomeApp
        if (!app.ready.await(15, TimeUnit.SECONDS)) {
            return Bundle().apply { putString("error", "Smart Home is still starting. Try again in a moment.") }
        }
        return try {
            val summary = runBlocking { app.engine.importDesktopHome(json) }
            Bundle().apply { putString("summary", "Smart Home: ${summary.describe()}") }
        } catch (e: Exception) {
            Bundle().apply { putString("error", "Smart Home could not read the backed-up settings: ${e.message}") }
        }
    }

    override fun query(uri: Uri, projection: Array<out String>?, selection: String?, selectionArgs: Array<out String>?, sortOrder: String?): Cursor? = null
    override fun getType(uri: Uri): String? = null
    override fun insert(uri: Uri, values: ContentValues?): Uri? = null
    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?) = 0
    override fun update(uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<out String>?) = 0
}
