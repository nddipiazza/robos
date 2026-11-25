package com.robos.assistant.ui

import android.Manifest
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
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
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
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.robos.assistant.R
import kotlinx.coroutines.flow.collectLatest

private enum class AssistantTab(val label: String, val icon: Int) {
    Listen("Listen", R.drawable.ic_tab_listen),
    Recordings("Recordings", R.drawable.ic_tab_recordings),
    Assistant("Assistant", R.drawable.ic_tab_assistant),
    Server("Server", R.drawable.ic_tab_server),
}

class MainActivity : ComponentActivity() {
    private val vm: AssistantViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        setShowWhenLocked(true)
        enableEdgeToEdge()
        setContent {
            MaterialTheme(colorScheme = RobosColors) {
                RobosAssistantRoot(
                    activity = this,
                    vm = vm,
                )
            }
        }
    }

    override fun onStart() {
        super.onStart()
        vm.refreshSystemState()
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun RobosAssistantRoot(
    activity: ComponentActivity,
    vm: AssistantViewModel,
) {
    val config by vm.config.collectAsStateWithLifecycle()
    val status by vm.status.collectAsStateWithLifecycle()
    val recordings by vm.filteredRecordings.collectAsStateWithLifecycle()
    val searchQuery by vm.searchQuery.collectAsStateWithLifecycle()
    val filter by vm.filter.collectAsStateWithLifecycle()

    var tab by rememberSaveable { mutableStateOf(AssistantTab.Listen) }
    var blackout by rememberSaveable { mutableStateOf(false) }
    val snackbars = remember { SnackbarHostState() }

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions(),
    ) {
        vm.ensureRunningIfEnabled()
    }

    val requestPermissions = {
        val perms = buildList {
            add(Manifest.permission.RECORD_AUDIO)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                add(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
        permissionLauncher.launch(perms.toTypedArray())
    }

    LaunchedEffect(Unit) {
        if (!vm.hasAudioPermission()) {
            requestPermissions()
        } else {
            vm.ensureRunningIfEnabled()
        }
    }

    LaunchedEffect(Unit) {
        vm.messages.collectLatest { snackbars.showSnackbar(it) }
    }

    DisposableEffect(blackout, config.keepScreenAwake) {
        val win = activity.window
        val insetsController = WindowCompat.getInsetsController(win, win.decorView)
        if (blackout) {
            insetsController.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            insetsController.hide(WindowInsetsCompat.Type.systemBars())
        } else {
            insetsController.show(WindowInsetsCompat.Type.systemBars())
        }

        if (blackout || config.keepScreenAwake) {
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
        OledBlackoutScreen(
            config = config,
            status = status,
            onExit = { blackout = false },
        )
        return
    }

    Scaffold(
        containerColor = Background,
        snackbarHost = { SnackbarHost(snackbars) },
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = config.assistantName,
                        maxLines = 1,
                    )
                },
                actions = {
                    TextButton(
                        onClick = { blackout = true },
                        modifier = Modifier.testTag("btn:blackout"),
                    ) {
                        Text("OLED Blackout", color = Accent)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Background,
                    titleContentColor = TextColor,
                ),
            )
        },
        bottomBar = {
            NavigationBar(containerColor = CardColor) {
                AssistantTab.entries.forEach { item ->
                    NavigationBarItem(
                        selected = tab == item,
                        onClick = { tab = item },
                        icon = { Icon(painterResource(item.icon), contentDescription = item.label) },
                        label = {
                            val badgeSuffix = if (item == AssistantTab.Recordings && status.totalRecordings > 0) {
                                " (${status.totalRecordings})"
                            } else {
                                ""
                            }
                            Text("${item.label}$badgeSuffix", maxLines = 1)
                        },
                        modifier = Modifier.testTag("tab:${item.name}"),
                    )
                }
            }
        },
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
        ) {
            when (tab) {
                AssistantTab.Listen -> ListenTabScreen(
                    config = config,
                    status = status,
                    latestRecording = recordings.firstOrNull(),
                    onRequestPermission = requestPermissions,
                    onToggleEnabled = vm::setListeningEnabled,
                    onDiscoverServer = vm::discoverRobosServer,
                    onOpenServerTab = { tab = AssistantTab.Server },
                    onOpenRecordingsTab = { tab = AssistantTab.Recordings },
                    onSendCommand = vm::sendManualAssistantCommand,
                    onPlayClip = vm::playOrStopClip,
                    onEnrollSpeaker = vm::enrollClipSpeaker,
                    onDownloadModel = vm::downloadOfflineSttModel,
                    onCopyUrl = vm::copyToClipboard,
                    onRequestUnrestrictedBattery = {
                        try {
                            activity.startActivity(vm.requestUnrestrictedBatteryIntent())
                        } catch (_: Exception) {
                        }
                    },
                )

                AssistantTab.Recordings -> RecordingsTabScreen(
                    recordings = recordings,
                    status = status,
                    config = config,
                    searchQuery = searchQuery,
                    selectedFilter = filter,
                    onSearchChange = vm::setSearchQuery,
                    onFilterChange = vm::setFilter,
                    onPlayClip = vm::playOrStopClip,
                    onEnrollSpeaker = vm::enrollClipSpeaker,
                    onCopyText = { txt -> vm.copyToClipboard("transcript", txt) },
                    onDeleteClip = vm::deleteClip,
                    onClearAll = vm::clearAllRecordings,
                )

                AssistantTab.Assistant -> AssistantTabScreen(
                    config = config,
                    status = status,
                    onUpdateConfig = vm::updateConfig,
                    onDownloadModel = vm::downloadOfflineSttModel,
                )

                AssistantTab.Server -> ServerTabScreen(
                    config = config,
                    status = status,
                    hasPassword = vm.hasHttpPassword(),
                    onUpdateConfig = vm::updateConfig,
                    onConnectServer = vm::connectToHost,
                    onDiscoverServer = vm::discoverRobosServer,
                    onSetPassword = vm::setHttpPassword,
                    onCopyUrl = vm::copyToClipboard,
                )
            }
        }
    }
}
