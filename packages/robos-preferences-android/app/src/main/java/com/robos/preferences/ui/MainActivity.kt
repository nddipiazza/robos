package com.robos.preferences.ui

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.robos.preferences.core.DriveConfigFolder
import com.robos.preferences.core.Manifest
import com.robos.preferences.core.categoryLabel

// The same colors as the RobOS desktop apps.
private val Background = Color(0xFF0D1117)
private val CardColor = Color(0xFF161B22)
private val Elevated = Color(0xFF1F2630)
private val TextColor = Color(0xFFE6EDF3)
private val Muted = Color(0xFF8B949E)
private val Accent = Color(0xFF00BCD4)
private val Danger = Color(0xFFEF4444)
private val Success = Color(0xFF22C55E)

private val Colors = darkColorScheme(
    primary = Accent, onPrimary = Color(0xFF04222A), background = Background, onBackground = TextColor,
    surface = Background, onSurface = TextColor, surfaceVariant = Elevated, onSurfaceVariant = Muted,
    surfaceContainer = CardColor, surfaceContainerHigh = Elevated, outline = Color(0xFF30363D), error = Danger,
)

class MainActivity : ComponentActivity() {
    private val vm: PreferencesViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            MaterialTheme(colorScheme = Colors) {
                val page by vm.openPage.collectAsStateWithLifecycle()
                LaunchedEffect(page) {
                    page?.let { url ->
                        try {
                            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addCategory(Intent.CATEGORY_BROWSABLE))
                        } catch (_: ActivityNotFoundException) {
                            vm.problem.value = "This phone has no web browser to show Google's sign-in page. Install Firefox, then try again."
                        }
                        vm.pageOpened()
                    }
                }
                PreferencesApp(vm)
            }
        }
    }
}

@Composable
private fun Muted(text: String, modifier: Modifier = Modifier) =
    Text(text, modifier = modifier, color = Muted, style = MaterialTheme.typography.bodyMedium)

@Composable
private fun Section(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = CardColor),
        shape = RoundedCornerShape(12.dp),
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) { content() }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PreferencesApp(vm: PreferencesViewModel) {
    val screen by vm.screen.collectAsStateWithLifecycle()
    val busy by vm.busy.collectAsStateWithLifecycle()
    val problem by vm.problem.collectAsStateWithLifecycle()
    val email by vm.email.collectAsStateWithLifecycle()

    BackHandler(enabled = screen is Screen.Contents || screen is Screen.Passphrase) { vm.back() }

    Scaffold(
        containerColor = Background,
        topBar = {
            Column {
                TopAppBar(
                    title = { Text("Preferences") },
                    colors = TopAppBarDefaults.topAppBarColors(containerColor = Background),
                )
                if (busy != null) LinearProgressIndicator(Modifier.fillMaxWidth())
            }
        },
    ) { padding ->
        LazyColumn(
            Modifier
                .fillMaxSize()
                .padding(padding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            busy?.let { item { Muted("$it...") } }
            problem?.let { item { Text(it, color = Danger, modifier = Modifier.testTag("problem")) } }
            when (val s = screen) {
                Screen.SignedOut -> item { SignedOut(vm) }
                is Screen.SigningIn -> item { SigningIn(vm, s.url) }
                is Screen.Backups -> {
                    item { Account(email, vm) }
                    val folders = s.folders
                    if (folders != null && folders.isEmpty()) {
                        item {
                            Section {
                                Text("No backups yet", style = MaterialTheme.typography.titleMedium)
                                Muted("This Google account has no RobOS backup. On a RobOS computer, open Preferences, then Config Sync, and choose Back up to my Google Drive. Then look again.")
                                OutlinedButton(onClick = { vm.loadBackups() }) { Text("Look again") }
                            }
                        }
                    }
                    items(folders.orEmpty(), key = { it.folderId }) { folder -> BackupRow(folder) { vm.open(folder) } }
                }
                is Screen.Passphrase -> item { Passphrase(vm, s.folder, s.wrong) }
                is Screen.Contents -> contents(vm, s.folder, s.manifest)
            }
        }
    }
}

@Composable
private fun SignedOut(vm: PreferencesViewModel) {
    Section {
        Text("Your RobOS settings", style = MaterialTheme.typography.titleLarge)
        Muted("Sign in with the Google account your RobOS computers back up to. Preferences finds the backup in your Google Drive and loads the settings this phone's apps use.")
        Muted("Google's sign-in page opens in your browser. When it says you are signed in, come back here.")
        Button(onClick = vm::signIn, modifier = Modifier
            .fillMaxWidth()
            .testTag("sign-in")) { Text("Sign in with Google") }
    }
}

@Composable
private fun SigningIn(vm: PreferencesViewModel, url: String) {
    Section {
        Text("Finish signing in", style = MaterialTheme.typography.titleMedium)
        Muted("Google's sign-in page is open in your browser. Choose your account and allow access to Google Drive. Google shows the app's name as \"rclone\": RobOS uses the same sign-in as RobOS on your computers, which comes from the open-source rclone project.")
        Muted("When the page says you are signed in, tap Back to RobOS Preferences.")
        OutlinedButton(onClick = { vm.openPage.value = url }) { Text("Open the sign-in page again") }
        TextButton(onClick = vm::cancelSignIn) { Text("Cancel") }
    }
}

@Composable
private fun Account(email: String?, vm: PreferencesViewModel) {
    Section {
        Muted("Signed in as ${email ?: "your Google account"}")
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = { vm.loadBackups() }) { Text("Look again") }
            TextButton(onClick = vm::signOut, modifier = Modifier.testTag("sign-out")) { Text("Sign out") }
        }
    }
}

private fun describe(folder: DriveConfigFolder): String = buildList {
    add(if (folder.kind == "share") "Shared with you" else "Backup")
    folder.updatedAt?.let { add("updated ${it.take(10)}") }
    folder.updatedBy?.let { add("by $it") }
    if (folder.encrypted) add("passphrase")
}.joinToString(" · ")

@Composable
private fun BackupRow(folder: DriveConfigFolder, onOpen: () -> Unit) {
    Section(Modifier
        .clickable(onClick = onOpen)
        .testTag("backup:${folder.name}")) {
        Text(folder.name, style = MaterialTheme.typography.titleMedium)
        Muted(describe(folder))
    }
}

@Composable
private fun Passphrase(vm: PreferencesViewModel, folder: DriveConfigFolder, wrong: Boolean) {
    var passphrase by rememberSaveable { mutableStateOf("") }
    Section {
        Text(folder.name, style = MaterialTheme.typography.titleMedium)
        Muted("This backup is locked with a passphrase. It is the one you chose when you set up Config Sync on your computer.")
        OutlinedTextField(
            value = passphrase, onValueChange = { passphrase = it }, singleLine = true,
            label = { Text("Passphrase") },
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            modifier = Modifier
                .fillMaxWidth()
                .testTag("field-passphrase"),
        )
        if (wrong) Text("That passphrase does not open this backup.", color = Danger)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(enabled = passphrase.isNotEmpty(), onClick = { vm.open(folder, passphrase) }) { Text("Open") }
            TextButton(onClick = vm::back) { Text("Back") }
        }
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.contents(vm: PreferencesViewModel, folder: DriveConfigFolder, manifest: Manifest) {
    item {
        Section {
            Text(folder.name, style = MaterialTheme.typography.titleLarge)
            Muted(describe(folder))
            TextButton(onClick = vm::back) { Text("Choose another backup") }
        }
    }
    item { Text("Use on this phone", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 8.dp)) }
    items(vm.targets, key = { it.path }) { target ->
        val restored by vm.restored.collectAsStateWithLifecycle()
        val inBackup = manifest.files.any { it.path == target.path }
        Section {
            Text(target.appName, style = MaterialTheme.typography.titleMedium)
            when {
                !inBackup -> Muted("This backup has no ${target.appName} settings.")
                !vm.isInstalled(target) -> Muted("Install RobOS ${target.appName} on this phone to use its settings.")
                else -> {
                    Muted("Adds the ${target.what} from your computers. Lights and scenes already on this phone stay.")
                    restored[target.path]?.let { Text(it, color = Success) }
                    Button(onClick = { vm.restore(target, manifest) }, modifier = Modifier.testTag("restore:${target.appName}")) {
                        Text(if (restored.containsKey(target.path)) "Restore again" else "Restore to this phone")
                    }
                }
            }
        }
    }
    val byCategory = manifest.files.groupBy { it.category }
    item { Text("In this backup", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 8.dp)) }
    item {
        Section {
            Muted("Other settings stay on your computers for now. Phone apps will use them as they are added.")
            byCategory.entries.sortedBy { categoryLabel(it.key) }.forEach { (category, files) ->
                Row {
                    Text(categoryLabel(category), Modifier.weight(1f))
                    Muted("${files.size} file${if (files.size == 1) "" else "s"}")
                }
            }
        }
    }
}
