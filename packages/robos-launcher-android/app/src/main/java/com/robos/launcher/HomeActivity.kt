package com.robos.launcher

import android.content.ComponentName
import android.content.pm.LauncherApps
import android.os.Bundle
import android.os.Process
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.graphics.drawable.toBitmap
import kotlinx.coroutines.delay
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

private val Background = Color(0xFF0D1117)
private val TextColor = Color(0xFFE6EDF3)
private val Muted = Color(0xFF8B949E)

private class HomeApp(val label: String, val icon: ImageBitmap, val component: ComponentName)

/** RobOS apps, plus Settings because a phone with no other way to join Wi-Fi needs it. */
internal fun belongsOnHome(packageName: String): Boolean =
    packageName == "com.android.settings" ||
        (packageName.startsWith("com.robos.") && packageName != "com.robos.launcher")

class HomeActivity : ComponentActivity() {
    private var apps by mutableStateOf(emptyList<HomeApp>())

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            MaterialTheme(colorScheme = darkColorScheme(background = Background)) {
                HomeScreen(apps, ::open)
            }
        }
    }

    override fun onResume() {
        super.onResume()
        apps = loadApps()
    }

    private fun loadApps(): List<HomeApp> =
        getSystemService(LauncherApps::class.java)
            .getActivityList(null, Process.myUserHandle())
            .filter { belongsOnHome(it.applicationInfo.packageName) }
            // Settings goes last, after the apps people opened the phone for.
            .sortedWith(compareBy({ it.applicationInfo.packageName == "com.android.settings" }, { it.label.toString() }))
            .map { HomeApp(it.label.toString(), it.getIcon(0).toBitmap(192, 192).asImageBitmap(), it.componentName) }

    private fun open(app: HomeApp) {
        getSystemService(LauncherApps::class.java)
            .startMainActivity(app.component, Process.myUserHandle(), null, null)
    }
}

@Composable
private fun HomeScreen(apps: List<HomeApp>, onOpen: (HomeApp) -> Unit) {
    // Home is the bottom of the stack, so back has nowhere to go.
    BackHandler {}

    var now by androidx.compose.runtime.remember { mutableStateOf(LocalDateTime.now()) }
    LaunchedEffect(Unit) {
        while (true) {
            now = LocalDateTime.now()
            delay(1000)
        }
    }

    Column(
        Modifier
            .fillMaxSize()
            .background(Background)
            .safeDrawingPadding()
            .padding(horizontal = 16.dp),
    ) {
        Text(
            now.format(DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT)),
            color = TextColor,
            fontSize = 56.sp,
            fontWeight = FontWeight.Light,
            modifier = Modifier.padding(top = 32.dp),
        )
        Text(
            now.format(DateTimeFormatter.ofPattern("EEEE, MMMM d")),
            color = Muted,
            fontSize = 16.sp,
            modifier = Modifier.padding(bottom = 32.dp),
        )
        LazyVerticalGrid(
            columns = GridCells.Fixed(4),
            contentPadding = PaddingValues(bottom = 16.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            items(apps, key = { it.component.flattenToString() }) { app ->
                Column(
                    Modifier
                        .clickable { onOpen(app) }
                        .padding(4.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Image(app.icon, contentDescription = null, Modifier.size(60.dp))
                    Text(
                        app.label,
                        color = TextColor,
                        fontSize = 13.sp,
                        textAlign = TextAlign.Center,
                        maxLines = 2,
                        modifier = Modifier.padding(top = 6.dp),
                    )
                }
            }
        }
    }
}
