package com.robos.ipcamera.ui

import android.app.Application
import androidx.compose.ui.graphics.ImageBitmap
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.robos.ipcamera.android.IpCameraApp
import com.robos.ipcamera.core.CameraRuntimeStatus
import com.robos.ipcamera.core.IpCameraConfig
import com.robos.ipcamera.core.LensFacing
import com.robos.ipcamera.core.ResolutionPreset
import com.robos.ipcamera.core.RobosHubClient
import com.robos.ipcamera.core.RobosUserItem
import com.robos.ipcamera.core.RotationMode
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class RobosShareUiState(
    val open: Boolean = false,
    val loading: Boolean = false,
    val busyKey: String = "",
    val hubHostIp: String = "",
    val docUrl: String = "",
    val docTitle: String = "",
    val publicTunnelUrl: String = "",
    val users: List<RobosUserItem> = emptyList(),
    val statusMessage: String = "",
    val errorMessage: String = "",
)

class CameraViewModel(application: Application) : AndroidViewModel(application) {
    private val app = application as IpCameraApp
    private val hubClient = RobosHubClient()

    val config: StateFlow<IpCameraConfig> = app.config
    val status: StateFlow<CameraRuntimeStatus> = app.status
    val previewBitmap: StateFlow<ImageBitmap?> = app.previewBitmap

    private val _shareState = MutableStateFlow(RobosShareUiState())
    val shareState: StateFlow<RobosShareUiState> = _shareState

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

    fun openShareDialog() {
        _shareState.update {
            it.copy(open = true, loading = true, statusMessage = "", errorMessage = "")
        }
        viewModelScope.launch {
            val wifiIp = status.value.wifiIp
            if (wifiIp.isBlank()) {
                _shareState.update {
                    it.copy(loading = false, errorMessage = "Connect this phone to your home Wi-Fi to reach RobOS Camera Watch.")
                }
                return@launch
            }
            val hubIp = hubClient.discoverHubHostIp(wifiIp = wifiIp, cachedHostIp = config.value.hubHostIp)
            if (hubIp.isNullOrBlank()) {
                _shareState.update {
                    it.copy(
                        loading = false,
                        errorMessage = "Could not find RobOS Camera Watch Web Server on Wi-Fi (:19227). Make sure Camera Watch is running on your RobOS computer.",
                    )
                }
                return@launch
            }
            app.saveHubHostIp(hubIp)
            try {
                val res = hubClient.listUsers(hubIp, config.value.deviceUuid, config.value.port)
                _shareState.update {
                    it.copy(
                        loading = false,
                        hubHostIp = hubIp,
                        docUrl = res.docUrl,
                        docTitle = res.docTitle,
                        publicTunnelUrl = res.publicTunnelUrl,
                        users = res.users,
                        errorMessage = "",
                    )
                }
            } catch (e: Exception) {
                _shareState.update {
                    it.copy(loading = false, hubHostIp = hubIp, errorMessage = e.message ?: "Could not load RobOS users.")
                }
            }
        }
    }

    fun closeShareDialog() {
        _shareState.update { it.copy(open = false, busyKey = "", statusMessage = "", errorMessage = "") }
    }

    fun shareWithRobosUser(uid: String = "", email: String = "") {
        val key = uid.ifBlank { email }
        if (key.isBlank()) return
        _shareState.update { it.copy(busyKey = key, statusMessage = "", errorMessage = "") }
        viewModelScope.launch {
            val hubIp = _shareState.value.hubHostIp.ifBlank {
                hubClient.discoverHubHostIp(status.value.wifiIp, config.value.hubHostIp).orEmpty()
            }
            if (hubIp.isBlank()) {
                _shareState.update { it.copy(busyKey = "", errorMessage = "RobOS Camera Watch host not reachable on Wi-Fi.") }
                return@launch
            }
            app.saveHubHostIp(hubIp)
            try {
                val res = hubClient.shareWithUser(
                    hostIp = hubIp,
                    deviceUuid = config.value.deviceUuid,
                    cameraPort = config.value.port,
                    uid = uid,
                    email = email,
                )
                val targetName = res.sharedWith?.name?.takeIf { it.isNotBlank() } ?: key
                _shareState.update {
                    it.copy(
                        busyKey = "",
                        hubHostIp = hubIp,
                        docUrl = res.docUrl,
                        docTitle = res.docTitle,
                        publicTunnelUrl = res.publicTunnelUrl,
                        users = res.users,
                        statusMessage = "Shared Google Drive Doc with $targetName!",
                        errorMessage = "",
                    )
                }
                _messages.tryEmit("Shared Google Doc with $targetName")
            } catch (e: Exception) {
                _shareState.update {
                    it.copy(busyKey = "", errorMessage = e.message ?: "Could not share Google Doc.")
                }
            }
        }
    }

    fun revokeRobosUser(uid: String, permissionId: String) {
        _shareState.update { it.copy(busyKey = uid, statusMessage = "", errorMessage = "") }
        viewModelScope.launch {
            val hubIp = _shareState.value.hubHostIp.ifBlank { config.value.hubHostIp }
            if (hubIp.isBlank()) {
                _shareState.update { it.copy(busyKey = "", errorMessage = "RobOS Camera Watch host not reachable.") }
                return@launch
            }
            try {
                val res = hubClient.revokeUser(
                    hostIp = hubIp,
                    deviceUuid = config.value.deviceUuid,
                    cameraPort = config.value.port,
                    uid = uid,
                    permissionId = permissionId,
                )
                _shareState.update {
                    it.copy(
                        busyKey = "",
                        docUrl = res.docUrl,
                        docTitle = res.docTitle,
                        users = res.users,
                        statusMessage = "Revoked Google Doc access and rotated browser key.",
                        errorMessage = "",
                    )
                }
                _messages.tryEmit("Revoked Google Doc access")
            } catch (e: Exception) {
                _shareState.update {
                    it.copy(busyKey = "", errorMessage = e.message ?: "Could not revoke access.")
                }
            }
        }
    }
}
