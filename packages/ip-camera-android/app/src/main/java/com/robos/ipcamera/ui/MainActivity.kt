package com.robos.ipcamera.ui

import android.Manifest
import android.content.res.Configuration
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.robos.ipcamera.R
import com.robos.ipcamera.android.CameraServerService
import kotlinx.coroutines.flow.collectLatest

private enum class IpCamTab(val label: String, val icon: Int) {
    Live("Live", R.drawable.ic_tab_live),
    Camera("Camera", R.drawable.ic_tab_camera),
    Network("Network", R.drawable.ic_tab_network),
}

class MainActivity : ComponentActivity() {
    private val vm: CameraViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        setShowWhenLocked(true)
        enableEdgeToEdge()
        setContent {
            MaterialTheme(colorScheme = RobosColors) {
                IpCameraRoot(
                    activity = this,
                    vm = vm,
                )
            }
        }
    }

    override fun onStart() {
        super.onStart()
        CameraServerService.setUiVisible(true)
        vm.refreshSystemState()
    }

    override fun onStop() {
        CameraServerService.setUiVisible(false)
        super.onStop()
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun IpCameraRoot(
    activity: ComponentActivity,
    vm: CameraViewModel,
) {
    val config by vm.config.collectAsStateWithLifecycle()
    val status by vm.status.collectAsStateWithLifecycle()
    val preview by vm.previewBitmap.collectAsStateWithLifecycle()

    var tab by rememberSaveable { mutableStateOf(IpCamTab.Live) }
    var blackout by rememberSaveable { mutableStateOf(false) }
    var manualFullscreen by rememberSaveable { mutableStateOf(false) }
    val snackbars = remember { SnackbarHostState() }

    val isFullscreenVideo = !blackout && manualFullscreen

    val enterFullscreen = {
        manualFullscreen = true
    }
    val exitFullscreen = {
        manualFullscreen = false
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions(),
    ) {
        vm.ensureRunningIfEnabled()
    }

    val requestPermissions = {
        val perms = buildList {
            add(Manifest.permission.CAMERA)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                add(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
        permissionLauncher.launch(perms.toTypedArray())
    }

    LaunchedEffect(Unit) {
        if (!vm.hasCameraPermission()) {
            requestPermissions()
        } else {
            vm.ensureRunningIfEnabled()
        }
    }

    LaunchedEffect(Unit) {
        vm.messages.collectLatest { snackbars.showSnackbar(it) }
    }

    // Keep screen awake, manage immersive system bars in fullscreen, & dim brightness in OLED blackout mode.
    DisposableEffect(blackout, isFullscreenVideo, config.keepScreenAwake) {
        val win = activity.window
        val insetsController = WindowCompat.getInsetsController(win, win.decorView)
        if (blackout || isFullscreenVideo) {
            insetsController.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            insetsController.hide(WindowInsetsCompat.Type.systemBars())
        } else {
            insetsController.show(WindowInsetsCompat.Type.systemBars())
        }

        if (blackout || isFullscreenVideo || config.keepScreenAwake) {
            win.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        } else {
            win.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
        val lp = win.attributes
        lp.screenBrightness = if (blackout) 0.01f else WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE
        win.attributes = lp
        onDispose {
            insetsController.show(WindowInsetsCompat.Type.systemBars())
            val resetLp = win.attributes
            resetLp.screenBrightness = WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE
            win.attributes = resetLp
        }
    }

    if (blackout) {
        BackHandler { blackout = false }
        BlackoutOverlay(
            config = config,
            status = status,
            onExit = { blackout = false },
        )
        return
    }

    if (isFullscreenVideo) {
        BackHandler { exitFullscreen() }
        FullscreenVideoOverlay(
            vm = vm,
            config = config,
            status = status,
            preview = preview,
            onExitFullscreen = exitFullscreen,
            onEnterBlackout = { blackout = true },
        )
        return
    }

    Box(Modifier.fillMaxSize()) {
        Scaffold(
            containerColor = Background,
            snackbarHost = { SnackbarHost(snackbars) },
            topBar = {
                TopAppBar(
                    title = { Text(if (tab == IpCamTab.Live) "IP Camera" else tab.label) },
                    colors = TopAppBarDefaults.topAppBarColors(containerColor = Background),
                    actions = {
                        if (tab == IpCamTab.Live && config.enabled) {
                            TextButton(
                                onClick = enterFullscreen,
                                modifier = Modifier.testTag("top-fullscreen"),
                            ) {
                                Text("Fullscreen")
                            }
                        }
                        TextButton(
                            onClick = { blackout = true },
                            modifier = Modifier.testTag("top-blackout"),
                        ) {
                            Text("Dim Screen")
                        }
                    },
                )
            },
            bottomBar = {
                NavigationBar(containerColor = CardColor) {
                    IpCamTab.entries.forEach { item ->
                        NavigationBarItem(
                            selected = tab == item,
                            onClick = { tab = item },
                            icon = { Icon(painterResource(item.icon), contentDescription = null) },
                            label = { Text(item.label) },
                            modifier = Modifier.testTag("tab:${item.label}"),
                        )
                    }
                }
            },
        ) { padding: PaddingValues ->
            when (tab) {
                IpCamTab.Live -> LiveScreen(
                    vm = vm,
                    config = config,
                    status = status,
                    preview = preview,
                    padding = padding,
                    onRequestPermission = requestPermissions,
                    onEnterBlackout = { blackout = true },
                    onEnterFullscreen = enterFullscreen,
                )
                IpCamTab.Camera -> CameraSettingsScreen(
                    vm = vm,
                    config = config,
                    status = status,
                    padding = padding,
                )
                IpCamTab.Network -> NetworkScreen(
                    vm = vm,
                    config = config,
                    status = status,
                    padding = padding,
                )
            }
        }
    }
}
