package com.robos.smarthome.ui

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.robos.smarthome.R
import kotlinx.coroutines.flow.collectLatest

private enum class Tab(val label: String, val icon: Int) {
    Lights("Lights", R.drawable.ic_tab_lights),
    Scenes("Scenes", R.drawable.ic_tab_scenes),
    Schedules("Schedules", R.drawable.ic_tab_schedules),
    Appliances("Appliances", R.drawable.ic_tab_appliances),
}

class MainActivity : ComponentActivity() {
    private val vm: HomeViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            MaterialTheme(colorScheme = RobosColors) {
                SmartHomeApp(vm)
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SmartHomeApp(vm: HomeViewModel) {
    val home by vm.state.collectAsStateWithLifecycle()
    val wifi by vm.wifi.collectAsStateWithLifecycle()
    val scanning by vm.scanning.collectAsStateWithLifecycle()
    val hueBridge by vm.hueBridge.collectAsStateWithLifecycle()
    val appliances by vm.appliances.collectAsStateWithLifecycle()
    var tab by rememberSaveable { mutableStateOf(Tab.Lights) }
    val snackbars = remember { SnackbarHostState() }

    LaunchedEffect(Unit) {
        // A new message replaces the one on screen, so a result never waits behind an old one.
        vm.messageFlow.collectLatest { snackbars.showSnackbar(it) }
    }

    Scaffold(
        containerColor = Background,
        snackbarHost = { SnackbarHost(snackbars) },
        topBar = {
            Column {
                TopAppBar(
                    title = { Text(tab.label.takeIf { tab != Tab.Lights } ?: "Smart Home") },
                    colors = TopAppBarDefaults.topAppBarColors(containerColor = Background),
                    actions = {
                        if (tab == Tab.Lights && home.lights.isNotEmpty()) {
                            TextButton(onClick = vm::scan, enabled = !scanning, modifier = Modifier.testTag("scan")) {
                                Text(if (scanning) "Scanning" else "Scan")
                            }
                        }
                    },
                )
                if (scanning) LinearProgressIndicator(Modifier.fillMaxWidth())
                if (!wifi.connected) {
                    ErrorText(
                        "Not connected to Wi-Fi. Connect to the same network as your lights to control them.",
                        Modifier
                            .padding(horizontal = 16.dp, vertical = 8.dp)
                            .testTag("no-wifi"),
                    )
                }
            }
        },
        bottomBar = {
            NavigationBar(containerColor = CardColor) {
                Tab.entries.forEach { item ->
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
            Tab.Lights -> LightsScreen(vm, home, hueBridge, scanning, padding)
            Tab.Scenes -> ScenesScreen(vm, home, padding)
            Tab.Schedules -> SchedulesScreen(vm, home, padding)
            Tab.Appliances -> AppliancesScreen(vm, appliances, padding)
        }
    }
}
