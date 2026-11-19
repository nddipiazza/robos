package com.robos.ipcamera.ui

import android.app.Application
import androidx.compose.ui.graphics.ImageBitmap
import androidx.lifecycle.AndroidViewModel
import com.robos.ipcamera.android.IpCameraApp
import com.robos.ipcamera.core.CameraRuntimeStatus
import com.robos.ipcamera.core.IpCameraConfig
import com.robos.ipcamera.core.LensFacing
import com.robos.ipcamera.core.ResolutionPreset
import com.robos.ipcamera.core.RotationMode
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow

class CameraViewModel(application: Application) : AndroidViewModel(application) {
    private val app = application as IpCameraApp

    val config: StateFlow<IpCameraConfig> = app.config
    val status: StateFlow<CameraRuntimeStatus> = app.status
    val previewBitmap: StateFlow<ImageBitmap?> = app.previewBitmap

    private val _messages = MutableSharedFlow<String>(extraBufferCapacity = 4)
    val messages: SharedFlow<String> = _messages

    fun hasCameraPermission(): Boolean = app.hasCameraPermission()

    fun hasSavedPassword(): Boolean = app.authVault.getPassword().isNotEmpty()

    fun ensureRunningIfEnabled() {
        app.batteryMonitor.refresh()
        app.wifiMonitor.refreshNow()
        if (app.config.value.enabled && app.hasCameraPermission()) {
            app.startCameraService()
        }
    }

    fun setEnabled(enabled: Boolean) {
        app.updateConfig { it.copy(enabled = enabled) }
        _messages.tryEmit(if (enabled) "Camera stream started" else "Camera stream paused")
    }

    fun flipLens() {
        app.updateConfig { cur ->
            val next = if (cur.lensFacing == LensFacing.BACK) LensFacing.FRONT else LensFacing.BACK
            cur.copy(lensFacing = next, torchEnabled = if (next == LensFacing.FRONT) false else cur.torchEnabled)
        }
    }

    fun setLens(lens: LensFacing) {
        app.updateConfig { cur ->
            cur.copy(lensFacing = lens, torchEnabled = if (lens == LensFacing.FRONT) false else cur.torchEnabled)
        }
    }

    fun setZoom(zoom: Float) {
        app.updateConfig { cur ->
            cur.copy(
                zoomRatio = zoom.coerceIn(1f, 8f),
                panX = if (zoom <= 1.01f) 0f else cur.panX,
                tiltY = if (zoom <= 1.01f) 0f else cur.tiltY,
            )
        }
    }

    fun toggleTorch() {
        app.updateConfig { cur ->
            val next = !cur.torchEnabled
            cur.copy(torchEnabled = next, lensFacing = if (next) LensFacing.BACK else cur.lensFacing)
        }
    }

    fun saveIdentity(name: String, room: String) {
        app.updateConfig { it.copy(cameraName = name, room = room) }
        _messages.tryEmit("Camera identity saved")
    }

    fun setResolution(preset: ResolutionPreset) {
        app.updateConfig { it.copy(resolution = preset) }
    }

    fun setFps(fps: Int) {
        app.updateConfig { it.copy(fps = fps) }
    }

    fun setJpegQuality(quality: Int) {
        app.updateConfig { it.copy(jpegQuality = quality) }
    }

    fun setRotationMode(mode: RotationMode) {
        app.updateConfig { it.copy(rotationMode = mode) }
    }

    fun setOverlayTimestamp(enabled: Boolean) {
        app.updateConfig { it.copy(overlayTimestamp = enabled) }
    }

    fun setMotionEnabled(enabled: Boolean) {
        app.updateConfig { it.copy(motionEnabled = enabled) }
    }

    fun setMotionSensitivity(sensitivity: Int) {
        app.updateConfig { it.copy(motionSensitivity = sensitivity) }
    }

    fun setPort(port: Int) {
        app.updateConfig { it.copy(port = port) }
        _messages.tryEmit("Listening on port ${port.coerceIn(1024, 65535)}")
    }

    fun setOnvifDiscovery(enabled: Boolean) {
        app.updateConfig { it.copy(onvifDiscoveryEnabled = enabled) }
    }

    fun saveAuthentication(enabled: Boolean, username: String, newPassword: String) {
        if (newPassword.isNotEmpty()) {
            app.authVault.setPassword(newPassword)
        }
        val hasPw = app.authVault.getPassword().isNotEmpty()
        if (enabled && !hasPw) {
            _messages.tryEmit("Enter a password before turning authentication on.")
            return
        }
        app.updateConfig { it.copy(authEnabled = enabled, username = username) }
        _messages.tryEmit(if (enabled) "Stream authentication enabled" else "Open LAN access enabled")
    }

    fun setAutoStartOnBoot(enabled: Boolean) {
        app.updateConfig { it.copy(autoStartOnBoot = enabled) }
    }

    fun setKeepScreenAwake(enabled: Boolean) {
        app.updateConfig { it.copy(keepScreenAwake = enabled) }
    }

    fun notifyMessage(msg: String) {
        _messages.tryEmit(msg)
    }

    fun refreshSystemState() {
        app.wifiMonitor.refreshNow()
        app.batteryMonitor.refresh()
    }
}
