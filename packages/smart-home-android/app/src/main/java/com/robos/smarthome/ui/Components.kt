package com.robos.smarthome.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.robos.smarthome.core.hexToRgb

// The same colors as the RobOS desktop apps.
val Background = Color(0xFF0D1117)
val CardColor = Color(0xFF161B22)
val Elevated = Color(0xFF1F2630)
val Border = Color(0xFF30363D)
val TextColor = Color(0xFFE6EDF3)
val Muted = Color(0xFF8B949E)
val Accent = Color(0xFF00BCD4)
val Danger = Color(0xFFEF4444)
val Success = Color(0xFF22C55E)

val RobosColors: ColorScheme = darkColorScheme(
    primary = Accent,
    onPrimary = Color(0xFF04222A),
    primaryContainer = Color(0xFF0B3A44),
    onPrimaryContainer = TextColor,
    secondary = Accent,
    onSecondary = Color(0xFF04222A),
    secondaryContainer = Color(0xFF0B3A44),
    onSecondaryContainer = TextColor,
    background = Background,
    onBackground = TextColor,
    surface = Background,
    onSurface = TextColor,
    surfaceVariant = Elevated,
    onSurfaceVariant = Muted,
    surfaceContainer = CardColor,
    surfaceContainerHigh = Elevated,
    surfaceContainerHighest = Elevated,
    surfaceContainerLow = CardColor,
    outline = Border,
    outlineVariant = Border,
    error = Danger,
    inverseSurface = Elevated,
    inverseOnSurface = TextColor,
    inversePrimary = Accent,
)

fun hexColor(hex: String): Color {
    val rgb = hexToRgb(hex)
    return Color(rgb.r, rgb.g, rgb.b)
}

@Composable
fun SectionCard(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = CardColor),
        shape = RoundedCornerShape(12.dp),
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) { content() }
    }
}

@Composable
fun ColorDot(color: Color, size: Int = 14) {
    Box(
        Modifier
            .size(size.dp)
            .clip(CircleShape)
            .background(color),
    )
}

@Composable
fun MutedText(text: String, modifier: Modifier = Modifier) {
    Text(text, modifier = modifier, color = Muted, style = MaterialTheme.typography.bodyMedium)
}

@Composable
fun ErrorText(text: String, modifier: Modifier = Modifier) {
    Text(text, modifier = modifier, color = Danger, style = MaterialTheme.typography.bodyMedium)
}

/** A labeled button that opens a list of choices. */
@Composable
fun <T> Choice(
    label: String,
    options: List<Pair<T, String>>,
    selected: T,
    onSelect: (T) -> Unit,
    modifier: Modifier = Modifier,
    tag: String = label,
) {
    var open by remember { mutableStateOf(false) }
    Column(modifier) {
        if (label.isNotEmpty()) MutedText(label, Modifier.padding(bottom = 4.dp))
        Box {
            OutlinedButton(
                onClick = { open = true },
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("choice:$tag"),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        options.firstOrNull { it.first == selected }?.second ?: "Choose",
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f),
                    )
                    Spacer(Modifier.width(8.dp))
                    Text("▾", color = Muted)
                }
            }
            DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
                options.forEach { (value, text) ->
                    DropdownMenuItem(
                        text = { Text(text) },
                        onClick = {
                            open = false
                            onSelect(value)
                        },
                    )
                }
            }
        }
    }
}
