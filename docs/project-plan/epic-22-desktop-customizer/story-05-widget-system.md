# Story 22-05: Widget System — Add/Remove/Configure Desktop Widgets

**Epic:** [Desktop Customizer](epic.md)
**Status:** Not started
**Points:** 5

## Description

A widget framework for adding interactive widgets to the desktop surface. Widgets are mini Electron apps that render in borderless, always-on-bottom windows.

### Built-in Widgets

| Widget | Description |
|--------|-------------|
| `clock` | Large analog or digital clock |
| `weather` | Current weather + 3-day forecast (location-based) |
| `system-monitor` | CPU, RAM, disk, network gauges |
| `calendar` | Monthly calendar with event highlights |
| `notes` | Sticky notes (persisted to `~/.config/robos/`) |
| `todo` | Simple checklist |
| `quote` | Random motivational/programming quotes |
| `spotify` | Now-playing display (reads from D-Bus) |
| `pomodoro` | Configurable focus timer |

### Commands

```
/widget add weather --position top-right --size 300x200
/widget add system-monitor --position bottom-left
/widget add notes --position center --opacity 0.9
/widget list                              # Show all active widgets
/widget remove weather                    # Remove a widget
/widget move weather bottom-right         # Reposition
/widget resize weather 400x250            # Resize
/widget configure weather --location "Austin, TX" --units fahrenheit
```

### Custom Widgets

Users can create custom widgets via `/build-app` (Story 06) or by describing them in natural language to the AI:

> "Add a widget that shows my GitHub notification count, refreshing every 5 minutes"

The AI scaffolds a mini Electron widget, registers it, and places it on the desktop.

### Widget Configuration

```json
// ~/.config/robos/desktop-widgets/widgets.json
[
  {
    "id": "weather-1",
    "type": "weather",
    "position": { "x": "right-20", "y": "top+20" },
    "size": { "w": 300, "h": 200 },
    "config": { "location": "Austin, TX", "units": "fahrenheit" },
    "opacity": 1.0
  }
]
```

## Acceptance Criteria

- [ ] At least 5 built-in widgets available
- [ ] `/widget add` places a widget at the specified position
- [ ] `/widget remove` cleans up the widget
- [ ] `/widget list` shows all active widgets
- [ ] Widgets survive logout/restart (config persisted)
- [ ] Widgets render in borderless always-on-bottom windows
- [ ] Widget positions and sizes are configurable
