package com.robos.ipcamera.android

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.BitmapFactory
import android.graphics.ImageFormat
import android.graphics.Rect
import android.graphics.YuvImage
import android.hardware.camera2.CameraCaptureSession
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraDevice
import android.hardware.camera2.CameraManager
import android.hardware.camera2.CaptureRequest
import android.hardware.camera2.params.OutputConfiguration
import android.hardware.camera2.params.SessionConfiguration
import android.media.Image
import android.media.ImageReader
import android.os.Handler
import android.os.HandlerThread
import android.os.SystemClock
import android.util.Range
import android.util.Size
import android.view.OrientationEventListener
import android.view.Surface
import android.view.WindowManager
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import com.robos.ipcamera.core.FrameHub
import com.robos.ipcamera.core.IpCameraConfig
import com.robos.ipcamera.core.LensFacing
import com.robos.ipcamera.core.LumaMotionDetector
import com.robos.ipcamera.core.MotionResult
import com.robos.ipcamera.core.Nv21Overlay
import com.robos.ipcamera.core.StreamState
import com.robos.ipcamera.core.YuvToNv21Converter
import com.robos.ipcamera.core.computeRotationDegrees
import java.io.ByteArrayOutputStream
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.util.concurrent.Executor
import kotlin.math.abs
import kotlin.math.roundToInt

/**
 * Off-screen Camera2 capture pipeline running on a dedicated HandlerThread.
 *
 * Uses an ImageReader (YUV_420_888) with no Activity Surface dependency, so locking the phone,
 * leaving the app, or turning the physical display completely OFF never interrupts video capture.
 */
class Camera2Engine(
    context: Context,
    private val hub: FrameHub,
    private val onStateChanged: (state: StreamState, error: String, width: Int, height: Int, fps: Float) -> Unit,
    private val onMotionResult: (MotionResult) -> Unit,
    private val onPreviewBitmap: (ImageBitmap) -> Unit,
) {
    private val appContext = context.applicationContext
    private val cameraManager = appContext.getSystemService(CameraManager::class.java)

    private var thread: HandlerThread? = null
    private var handler: Handler? = null
    private var executor: Executor? = null

    private var cameraDevice: CameraDevice? = null
    private var captureSession: CameraCaptureSession? = null
    private var imageReader: ImageReader? = null

    private var activeCameraId: String? = null
    private var sensorOrientation: Int = 90
    private var isFrontFacing: Boolean = false
    private var sensorRect: Rect = Rect(0, 0, 1920, 1080)
    private var flashAvailable: Boolean = false

    @Volatile
    private var currentConfig: IpCameraConfig = IpCameraConfig()

    @Volatile
    private var deviceOrientationDegrees: Int = readDisplayOrientationDegrees(appContext)

    @Volatile
    var uiPreviewActive: Boolean = false

    @Volatile
    var lastFrameElapsedMs: Long = 0L
        private set

    private var lastEncodedElapsedMs: Long = 0L
    private var lastPreviewElapsedMs: Long = 0L
    private var fpsWindowStartMs: Long = 0L
    private var fpsFrameCount: Int = 0
    private var measuredFps: Float = 0f

    private var yScratch = ByteArray(0)
    private var uScratch = ByteArray(0)
    private var vScratch = ByteArray(0)
    private val mainJpegOut = ByteArrayOutputStream(256 * 1024)
    private val subJpegOut = ByteArrayOutputStream(96 * 1024)
    private val yuvConverter = YuvToNv21Converter()
    private val motionDetector = LumaMotionDetector()

    private val osdFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")

    private val orientationListener = object : OrientationEventListener(appContext) {
        override fun onOrientationChanged(orientation: Int) {
            if (orientation == ORIENTATION_UNKNOWN) return
            val snapped = ((orientation + 45) / 90 * 90) % 360
            deviceOrientationDegrees = snapped
        }
    }

    fun start(config: IpCameraConfig) {
        currentConfig = config
        motionDetector.configure(config.motionSensitivity, config.motionMinAreaPercent)
        ensureThread()
        try {
            if (orientationListener.canDetectOrientation()) orientationListener.enable()
        } catch (_: Exception) {
        }
        handler?.post { openCameraInternal(config) }
    }

    /**
     * Applies config updates. If lens or resolution changed, reopens the session; otherwise updates
     * zoom, pan/tilt crop, torch, FPS and motion sensitivity live without dropping the stream.
     */
    fun updateConfig(newConfig: IpCameraConfig) {
        val prev = currentConfig
        currentConfig = newConfig
        motionDetector.configure(newConfig.motionSensitivity, newConfig.motionMinAreaPercent)
        val needsReopen = prev.lensFacing != newConfig.lensFacing ||
            prev.resolution != newConfig.resolution ||
            cameraDevice == null
        handler?.post {
            if (needsReopen) {
                openCameraInternal(newConfig)
            } else {
                applyRepeatingRequest(newConfig)
            }
        }
    }

    fun restart() {
        val cfg = currentConfig
        handler?.post { openCameraInternal(cfg) }
    }

    fun stop() {
        try {
            orientationListener.disable()
        } catch (_: Exception) {
        }
        val h = handler
        if (h != null) {
            h.post { closeCameraInternal() }
        }
        thread?.quitSafely()
        thread = null
        handler = null
        executor = null
    }

    private fun ensureThread() {
        if (thread?.isAlive == true && handler != null) return
        val t = HandlerThread("robos-camera2").apply { start() }
        val h = Handler(t.looper)
        thread = t
        handler = h
        executor = Executor { r -> h.post(r) }
    }

    @SuppressLint("MissingPermission")
    private fun openCameraInternal(config: IpCameraConfig) {
        closeCameraInternal()
        onStateChanged(StreamState.STARTING, "", config.resolution.width, config.resolution.height, 0f)

        val chosen = selectCamera(config.lensFacing, config.resolution.width, config.resolution.height)
        if (chosen == null) {
            onStateChanged(StreamState.ERROR, "No camera found on this device.", 0, 0, 0f)
            return
        }

        activeCameraId = chosen.cameraId
        sensorOrientation = chosen.sensorOrientation
        isFrontFacing = chosen.isFront
        sensorRect = chosen.activeRect
        flashAvailable = chosen.hasFlash
        motionDetector.reset()
        fpsWindowStartMs = SystemClock.elapsedRealtime()
        fpsFrameCount = 0
        measuredFps = 0f

        val reader = ImageReader.newInstance(chosen.size.width, chosen.size.height, ImageFormat.YUV_420_888, 3)
        reader.setOnImageAvailableListener({ ir -> onImageAvailable(ir) }, handler)
        imageReader = reader

        try {
            cameraManager.openCamera(
                chosen.cameraId,
                object : CameraDevice.StateCallback() {
                    override fun onOpened(camera: CameraDevice) {
                        cameraDevice = camera
                        createCaptureSession(camera, reader, currentConfig)
                    }

                    override fun onDisconnected(camera: CameraDevice) {
                        try {
                            camera.close()
                        } catch (_: Exception) {
                        }
                        if (cameraDevice === camera) cameraDevice = null
                        onStateChanged(StreamState.RECONNECTING, "Camera disconnected — reconnecting…", chosen.size.width, chosen.size.height, 0f)
                    }

                    override fun onError(camera: CameraDevice, error: Int) {
                        try {
                            camera.close()
                        } catch (_: Exception) {
                        }
                        if (cameraDevice === camera) cameraDevice = null
                        onStateChanged(StreamState.ERROR, "Camera hardware error ($error) — retrying…", chosen.size.width, chosen.size.height, 0f)
                    }
                },
                handler,
            )
        } catch (se: SecurityException) {
            onStateChanged(StreamState.PERMISSION_NEEDED, "Camera permission is required.", 0, 0, 0f)
        } catch (e: Exception) {
            onStateChanged(StreamState.ERROR, e.message ?: "Could not open camera.", 0, 0, 0f)
        }
    }

    private fun createCaptureSession(camera: CameraDevice, reader: ImageReader, config: IpCameraConfig) {
        val exec = executor ?: return
        try {
            val sessionConfig = SessionConfiguration(
                SessionConfiguration.SESSION_REGULAR,
                listOf(OutputConfiguration(reader.surface)),
                exec,
                object : CameraCaptureSession.StateCallback() {
                    override fun onConfigured(session: CameraCaptureSession) {
                        if (cameraDevice !== camera) return
                        captureSession = session
                        applyRepeatingRequest(config)
                    }

                    override fun onConfigureFailed(session: CameraCaptureSession) {
                        onStateChanged(StreamState.ERROR, "Camera session configuration failed.", reader.width, reader.height, 0f)
                    }
                },
            )
            camera.createCaptureSession(sessionConfig)
        } catch (e: Exception) {
            onStateChanged(StreamState.ERROR, e.message ?: "Could not configure camera session.", reader.width, reader.height, 0f)
        }
    }

    private fun applyRepeatingRequest(config: IpCameraConfig) {
        val camera = cameraDevice ?: return
        val session = captureSession ?: return
        val reader = imageReader ?: return
        try {
            val builder = try {
                camera.createCaptureRequest(CameraDevice.TEMPLATE_RECORD)
            } catch (_: Exception) {
                camera.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW)
            }
            builder.addTarget(reader.surface)
            builder.set(CaptureRequest.CONTROL_MODE, CaptureRequest.CONTROL_MODE_AUTO)
            builder.set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_VIDEO)
            builder.set(CaptureRequest.CONTROL_AE_MODE, CaptureRequest.CONTROL_AE_MODE_ON)

            selectFpsRange(activeCameraId, config.fps)?.let { range ->
                builder.set(CaptureRequest.CONTROL_AE_TARGET_FPS_RANGE, range)
            }

            if (flashAvailable && !isFrontFacing) {
                builder.set(
                    CaptureRequest.FLASH_MODE,
                    if (config.torchEnabled) CaptureRequest.FLASH_MODE_TORCH else CaptureRequest.FLASH_MODE_OFF,
                )
            }

            // Hardware sensor crop for crisp solid-state Pan-Tilt-Zoom across the sensor array.
            val crop = computeSensorCropRect(
                activeRect = sensorRect,
                zoom = config.zoomRatio,
                panX = config.panX,
                tiltY = config.tiltY,
                rotationDegrees = computeRotationDegrees(sensorOrientation, isFrontFacing, deviceOrientationDegrees, config.rotationMode),
            )
            builder.set(CaptureRequest.SCALER_CROP_REGION, crop)

            session.setRepeatingRequest(builder.build(), null, handler)
        } catch (e: Exception) {
            onStateChanged(StreamState.ERROR, e.message ?: "Camera capture failed.", reader.width, reader.height, measuredFps)
        }
    }

    private fun onImageAvailable(reader: ImageReader) {
        val image: Image = try {
            reader.acquireLatestImage()
        } catch (_: Exception) {
            null
        } ?: return

        try {
            val nowElapsed = SystemClock.elapsedRealtime()
            val cfg = currentConfig
            val minFrameIntervalMs = (1000L / cfg.fps.coerceIn(1, 30)) - 6L
            if (nowElapsed - lastEncodedElapsedMs < minFrameIntervalMs) {
                return
            }
            lastEncodedElapsedMs = nowElapsed
            lastFrameElapsedMs = nowElapsed

            val planes = image.planes
            if (planes.size < 3) return

            val yBuf = planes[0].buffer
            val uBuf = planes[1].buffer
            val vBuf = planes[2].buffer

            val yLen = yBuf.remaining()
            val uLen = uBuf.remaining()
            val vLen = vBuf.remaining()

            if (yScratch.size < yLen) yScratch = ByteArray(yLen)
            if (uScratch.size < uLen) uScratch = ByteArray(uLen)
            if (vScratch.size < vLen) vScratch = ByteArray(vLen)

            yBuf.get(yScratch, 0, yLen)
            uBuf.get(uScratch, 0, uLen)
            vBuf.get(vScratch, 0, vLen)

            val rot = computeRotationDegrees(
                sensorOrientation = sensorOrientation,
                isFrontFacing = isFrontFacing,
                deviceDegrees = deviceOrientationDegrees,
                mode = cfg.rotationMode,
            )

            val nv21 = yuvConverter.convert(
                yPlane = yScratch,
                yRowStride = planes[0].rowStride,
                uPlane = uScratch,
                uRowStride = planes[1].rowStride,
                uPixelStride = planes[1].pixelStride,
                vPlane = vScratch,
                vRowStride = planes[2].rowStride,
                vPixelStride = planes[2].pixelStride,
                srcWidth = image.width,
                srcHeight = image.height,
                rotationDegrees = rot,
            )

            if (cfg.motionEnabled) {
                val mr = motionDetector.feedNv21(nv21, nowElapsed)
                onMotionResult(mr)
            }

            if (cfg.overlayTimestamp && !hub.hasCleanViewers) {
                val stampText = "${cfg.cameraName} | ${LocalDateTime.now().format(osdFormatter)}"
                Nv21Overlay.stamp(nv21, stampText)
            }

            mainJpegOut.reset()
            val yuvImg = YuvImage(nv21.bytes, ImageFormat.NV21, nv21.width, nv21.height, null)
            yuvImg.compressToJpeg(Rect(0, 0, nv21.width, nv21.height), cfg.jpegQuality, mainJpegOut)
            val mainJpeg = mainJpegOut.toByteArray()
            hub.publishMain(mainJpeg)

            if (hub.hasSubViewers) {
                val subNv21 = yuvConverter.downsampleHalf(nv21)
                subJpegOut.reset()
                YuvImage(subNv21.bytes, ImageFormat.NV21, subNv21.width, subNv21.height, null)
                    .compressToJpeg(Rect(0, 0, subNv21.width, subNv21.height), (cfg.jpegQuality - 10).coerceAtLeast(50), subJpegOut)
                hub.publishSub(subJpegOut.toByteArray())
            }

            fpsFrameCount++
            val windowMs = nowElapsed - fpsWindowStartMs
            if (windowMs >= 1500L) {
                measuredFps = ((fpsFrameCount * 10000L) / windowMs) / 10f
                fpsFrameCount = 0
                fpsWindowStartMs = nowElapsed
                onStateChanged(StreamState.LIVE, "", nv21.width, nv21.height, measuredFps)
            } else if (measuredFps == 0f) {
                measuredFps = cfg.fps.toFloat()
                onStateChanged(StreamState.LIVE, "", nv21.width, nv21.height, measuredFps)
            }

            // Decode preview bitmap only while the phone's Live screen is visible (~4 fps).
            if (uiPreviewActive && nowElapsed - lastPreviewElapsedMs >= 240L) {
                lastPreviewElapsedMs = nowElapsed
                val opts = BitmapFactory.Options().apply {
                    inSampleSize = if (nv21.width > 960) 2 else 1
                }
                BitmapFactory.decodeByteArray(mainJpeg, 0, mainJpeg.size, opts)?.let { bmp ->
                    onPreviewBitmap(bmp.asImageBitmap())
                }
            }
        } catch (_: Exception) {
        } finally {
            try {
                image.close()
            } catch (_: Exception) {
            }
        }
    }

    private fun closeCameraInternal() {
        try {
            captureSession?.close()
        } catch (_: Exception) {
        }
        captureSession = null
        try {
            cameraDevice?.close()
        } catch (_: Exception) {
        }
        cameraDevice = null
        try {
            imageReader?.close()
        } catch (_: Exception) {
        }
        imageReader = null
    }

    private data class ChosenCamera(
        val cameraId: String,
        val size: Size,
        val sensorOrientation: Int,
        val isFront: Boolean,
        val activeRect: Rect,
        val hasFlash: Boolean,
    )

    private fun selectCamera(wantedFacing: LensFacing, targetW: Int, targetH: Int): ChosenCamera? {
        val wantedConst = if (wantedFacing == LensFacing.FRONT) {
            CameraCharacteristics.LENS_FACING_FRONT
        } else {
            CameraCharacteristics.LENS_FACING_BACK
        }
        val ids = try {
            cameraManager.cameraIdList.toList()
        } catch (_: Exception) {
            emptyList()
        }
        if (ids.isEmpty()) return null

        val chosenId = ids.firstOrNull { id ->
            cameraManager.getCameraCharacteristics(id).get(CameraCharacteristics.LENS_FACING) == wantedConst
        } ?: ids.first()

        val chars = cameraManager.getCameraCharacteristics(chosenId)
        val map = chars.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP)
        val candidates = map?.getOutputSizes(ImageFormat.YUV_420_888)?.toList().orEmpty()
        val chosenSize = candidates
            .filter { it.width <= 1920 && it.height <= 1920 && it.width % 2 == 0 && it.height % 2 == 0 }
            .minByOrNull { abs(it.width - targetW) + abs(it.height - targetH) }
            ?: Size(1280, 720)

        val orient = chars.get(CameraCharacteristics.SENSOR_ORIENTATION) ?: 90
        val isFront = chars.get(CameraCharacteristics.LENS_FACING) == CameraCharacteristics.LENS_FACING_FRONT
        val rect = chars.get(CameraCharacteristics.SENSOR_INFO_ACTIVE_ARRAY_SIZE) ?: Rect(0, 0, chosenSize.width, chosenSize.height)
        val flash = chars.get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true
        return ChosenCamera(chosenId, chosenSize, orient, isFront, rect, flash)
    }

    private fun selectFpsRange(cameraId: String?, targetFps: Int): Range<Int>? {
        if (cameraId == null) return null
        val ranges = try {
            cameraManager.getCameraCharacteristics(cameraId)
                .get(CameraCharacteristics.CONTROL_AE_AVAILABLE_TARGET_FPS_RANGES)
                ?.toList().orEmpty()
        } catch (_: Exception) {
            emptyList()
        }
        if (ranges.isEmpty()) return null
        return ranges.minByOrNull { r ->
            val upperPenalty = abs(r.upper - targetFps) * 2
            val lowerPenalty = if (r.lower > targetFps) (r.lower - targetFps) * 4 else 0
            upperPenalty + lowerPenalty
        }
    }

    companion object {
        @Suppress("DEPRECATION")
        private fun readDisplayOrientationDegrees(context: Context): Int = try {
            when (context.getSystemService(WindowManager::class.java)?.defaultDisplay?.rotation) {
                Surface.ROTATION_90 -> 270
                Surface.ROTATION_180 -> 180
                Surface.ROTATION_270 -> 90
                else -> 0
            }
        } catch (_: Exception) {
            0
        }

        fun computeSensorCropRect(
            activeRect: Rect,
            zoom: Float,
            panX: Float,
            tiltY: Float,
            rotationDegrees: Int,
        ): Rect {
            val z = zoom.coerceIn(1.0f, 8.0f)
            if (z <= 1.01f) return activeRect
            val fullW = activeRect.width()
            val fullH = activeRect.height()
            val cropW = ((fullW / z).roundToInt() and -2).coerceIn(64, fullW)
            val cropH = ((fullH / z).roundToInt() and -2).coerceIn(64, fullH)
            val maxDx = (fullW - cropW) / 2
            val maxDy = (fullH - cropH) / 2
            val (sPan, sTilt) = when (((rotationDegrees % 360) + 360) % 360) {
                90 -> -tiltY to panX
                180 -> -panX to tiltY
                270 -> tiltY to -panX
                else -> panX to -tiltY
            }
            val left = (activeRect.left + (fullW - cropW) / 2 + (sPan.coerceIn(-1f, 1f) * maxDx).roundToInt())
                .coerceIn(activeRect.left, activeRect.right - cropW)
            val top = (activeRect.top + (fullH - cropH) / 2 + (sTilt.coerceIn(-1f, 1f) * maxDy).roundToInt())
                .coerceIn(activeRect.top, activeRect.bottom - cropH)
            return Rect(left, top, left + cropW, top + cropH)
        }
    }
}
