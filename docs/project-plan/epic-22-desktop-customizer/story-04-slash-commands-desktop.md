# Story 22-04: Slash Commands — Clock, Taskbar, Theme, Shortcuts

**Epic:** [Desktop Customizer](epic.md)
**Status:** Not started
**Points:** 5

## Description

Implement the core set of slash commands for desktop customization.

### `/move-clock`

```
/move-clock left          # Move clock to left side of top bar
/move-clock center        # Center the clock (default)
/move-clock right         # Move clock to right side
/move-clock hide          # Hide the clock entirely
/move-clock show          # Show the clock
/move-clock format 24h    # Switch to 24-hour format
/move-clock show-seconds  # Show seconds
/move-clock show-date     # Show date next to time
```

### `/taskbar`

```
/taskbar position bottom        # Move panel to bottom
/taskbar position top            # Move panel to top (default)
/taskbar width 100%              # Full-width panel
/taskbar height 48px             # Set panel height
/taskbar autohide on             # Auto-hide when not in use
/taskbar autohide off            # Always visible
/taskbar icons-only              # Remove text labels
/taskbar add-favorite task-board # Pin app to taskbar
/taskbar remove-favorite calculator
```

### `/theme`

```
/theme accent #ff6b6b                  # Change accent color
/theme dark                            # Switch to dark mode
/theme light                           # Switch to light mode
/theme font-size 14px                  # Change default font size
/theme font "JetBrains Mono"           # Change monospace font
/theme cursor-size 32                  # Enlarge cursor
/theme window-buttons left             # Move close/min/max to left (Mac-style)
/theme window-buttons right            # Move to right (Windows-style)
/theme panel-opacity 0.8               # Semi-transparent panel
/theme css ".panel { background: #1a1a2e; }"  # Raw CSS injection
```

### `/shortcut`

```
/shortcut ctrl+shift+t open terminal          # Open terminal
/shortcut super+e open file-explorer           # Open files
/shortcut ctrl+alt+d show-desktop              # Show desktop
/shortcut super+1 open task-board              # Open specific app
/shortcut list                                 # Show all custom shortcuts
/shortcut remove ctrl+shift+t                  # Remove shortcut
```

### Implementation

Each command:
1. Parses arguments (positional + named flags)
2. Maps to one or more GNOME Engine calls
3. Shows a preview of what will change
4. Executes with auto-snapshot
5. Reports result in the chat

## Acceptance Criteria

- [ ] `/move-clock` supports left/center/right/hide/show/format
- [ ] `/taskbar` supports position, width, height, autohide, favorites
- [ ] `/theme` supports accent color, dark/light, fonts, window buttons, raw CSS
- [ ] `/shortcut` supports create, list, and remove custom keyboard shortcuts
- [ ] Each command auto-snapshots before execution
- [ ] Each command shows confirmation of what changed
