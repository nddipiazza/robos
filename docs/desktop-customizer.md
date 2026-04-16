---
title: Desktop Customizer
layout: default
nav_order: 4
---

# Desktop Customizer
{: .no_toc }

Reshape your entire GNOME desktop through slash commands and natural language — no config files, no StackOverflow, no rebooting.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

![Desktop Customizer]({{ '/assets/images/screenshots/desktop-customizer.png' | relative_url }})

## What It Is

The Desktop Customizer is a chat-style Electron app that lets you modify every aspect of the GNOME desktop through slash commands or plain English. Type what you want, see a preview, and it happens. Every change is automatically snapshotted in a git repo so you can roll back instantly.

{: .warning }
> **Power tool.** The Desktop Customizer gives you full control over your desktop — including the ability to break things. Every change is snapshotted automatically, but some modifications require a logout to take effect. Type `/restore last` to undo.

---

## Slash Commands

### `/move-clock` — Reposition the GNOME Clock

```
/move-clock left          Move clock to left side of top bar
/move-clock center        Center the clock (default)
/move-clock right         Move clock to right side
/move-clock hide          Hide the clock
/move-clock show          Show the clock
/move-clock format 24h    Switch to 24-hour format
/move-clock show-seconds  Show seconds
/move-clock show-date     Show date next to time
```

### `/taskbar` — Customize the Panel

```
/taskbar height 48px              Set panel height
/taskbar autohide on              Auto-hide when not in use
/taskbar autohide off             Always visible
/taskbar add-favorite task-board  Pin an app to the taskbar
/taskbar remove-favorite calculator  Unpin an app
```

### `/theme` — Colors, Fonts, and Style

```
/theme dark                            Dark mode
/theme light                           Light mode
/theme accent #ff6b6b                  Change accent color
/theme font-size 16px                  Change default font size
/theme window-buttons left             Mac-style close/min/max on left
/theme window-buttons right            Windows-style on right
/theme css ".panel { background: #1a1a2e; }"   Raw CSS injection
```

### `/shortcut` — Keyboard Shortcuts

```
/shortcut ctrl+shift+t open tilix      Open terminal
/shortcut super+1 open task-board      Launch Task Board
/shortcut list                         Show all custom shortcuts
```

### `/startup` — Startup Applications

```
/startup list                          Show all startup apps
/startup add dev-central               Launch Dev Central at login
/startup add terminal --delay 3s       Launch with a delay
/startup remove dev-central            Remove from startup
```

### `/snapshot` — Desktop State Snapshots

```
/snapshot save "before I experiment"   Named checkpoint
/snapshot list                         Show snapshot history
/snapshot diff                         Show changes since last snapshot
```

### `/restore` — Roll Back Changes

```
/restore last                          Undo the most recent change
/restore a1b2c3d                       Restore to a specific snapshot hash
```

### `/gsettings` — Direct GNOME Settings Access

```
/gsettings get org.gnome.desktop.interface clock-show-date
/gsettings set org.gnome.desktop.interface clock-format '24h'
```

### `/exec` — Run Any Shell Command

```
/exec gsettings list-schemas | grep shell
/exec cat ~/.config/gtk-3.0/gtk.css
/exec gnome-extensions list
```

---

## Safety & Versioning

Every destructive command automatically takes a **git snapshot** of your desktop state before executing. The snapshot captures:

- Full `dconf` database dump (all GNOME settings)
- GTK CSS overrides (`gtk-3.0/gtk.css`, `gtk-4.0/gtk.css`)
- Autostart entries (`~/.config/autostart/*.desktop`)
- RobOS settings (`~/.config/robos/settings.json`)

Snapshots are stored in `~/.config/robos/desktop-snapshots/` as a git repository. You can:

- **Browse history**: `/snapshot list` shows all snapshots with timestamps
- **Compare changes**: `/snapshot diff` shows what changed
- **Instant rollback**: `/restore last` undoes the most recent change
- **Named checkpoints**: `/snapshot save "my description"` before experimenting
- **Restore any point**: `/restore <hash>` goes back to any snapshot

---

## Coming Soon

### Natural Language Mode (Story 22-10)

Instead of memorizing slash commands, just describe what you want:

> "I want the clock on the left, a bigger taskbar, and dark red accent color"

The AI translates this to:
1. `/move-clock left`
2. `/taskbar height 48px`
3. `/theme accent #dc2626`

You see the plan, approve it, and it executes.

### On-the-Fly App Builder (Story 22-06)

Describe an app and the AI builds it:

> "Build me a Pomodoro timer with 25/5/15 intervals, a circular progress ring, and a sound notification"

The AI scaffolds a complete Electron app — `main.js`, `preload.js`, renderer, icon, `.desktop` file — and registers it in the App Launcher. Iterate with follow-up prompts.

### Desktop Widgets (Story 22-05)

Add interactive widgets to the desktop surface:

```
/widget add weather --position top-right
/widget add system-monitor --position bottom-left
/widget add notes --position center
```

### Taskbar Widgets (Story 22-07)

Tiny panel applets showing live data:

```
/taskbar-widget add cpu-bar
/taskbar-widget add "show my open PR count"
```

### Language Mixing (Story 22-08)

Mix UI languages across apps:

```
/language menu es,en           App menu in Spanish, English fallback
/language terminal en          Terminal stays English
/language app task-board ja    Task Board in Japanese
```
