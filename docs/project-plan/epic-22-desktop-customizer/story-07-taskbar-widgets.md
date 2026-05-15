---
nav_exclude: true
---

# Story 22-07: Taskbar Widget Builder (Custom Panel Applets)

**Epic:** [Desktop Customizer](epic.md)
**Status:** Not started
**Points:** 5

## Description

Create custom widgets that live in the GNOME panel/taskbar — small, always-visible indicators and controls.

### How It Works

```
User: /taskbar-widget "CPU usage as a tiny bar chart, updates every 2 seconds"
```

The AI generates a small Electron window configured as a panel applet:
- Fixed size (e.g., 80x28 px)
- `alwaysOnTop: true`, `skipTaskbar: true`, `type: 'toolbar'`
- Positioned in the GNOME panel area
- Auto-starts on login

### Built-in Taskbar Widgets

| Widget | Description |
|--------|-------------|
| `cpu-bar` | Tiny CPU usage bar chart |
| `mem-gauge` | Memory usage percentage |
| `net-speed` | Upload/download speed |
| `battery` | Battery with estimated time |
| `active-task` | Current RobOS task name + timer |
| `pr-count` | Open PR count badge |
| `ci-status` | Latest CI run status dot |

### Commands

```
/taskbar-widget add cpu-bar
/taskbar-widget add "Custom: show git branch of active workspace"
/taskbar-widget list
/taskbar-widget remove cpu-bar
/taskbar-widget reorder cpu-bar pr-count ci-status
```

## Acceptance Criteria

- [ ] Built-in taskbar widgets render in the panel area
- [ ] Custom taskbar widgets can be described in natural language
- [ ] Widgets auto-start on login
- [ ] `/taskbar-widget list` shows active widgets
- [ ] Widgets can be removed and reordered
