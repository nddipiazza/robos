---
nav_exclude: true
---

# Story 22-02: Snapshot and Rollback System (Git-Backed)

**Epic:** [Desktop Customizer](epic.md)
**Status:** Not started
**Points:** 5

## Description

Git-backed snapshot system that captures desktop state before every customization change and allows instant rollback.

### What Gets Snapshotted

- `dconf dump /` — full GNOME settings database
- `~/.config/robos/settings.json` — RobOS config
- `~/.local/share/gnome-shell/extensions/` — extension state
- `~/.config/gtk-3.0/gtk.css` and `~/.config/gtk-4.0/gtk.css` — theme overrides
- `~/.config/robos/desktop-widgets/` — widget configs
- `/usr/share/applications/*.desktop` — app launcher entries
- Startup app list (`gnome-session-properties` equivalent)

### Snapshot Storage

```
~/.config/robos/desktop-snapshots/
├── .git/                    # git repo
├── dconf-dump.ini           # gsettings/dconf state
├── settings.json            # RobOS settings
├── extensions/              # extension configs
├── css/                     # theme overrides
├── widgets/                 # widget configs
├── desktop-files/           # .desktop entries
└── startup/                 # autostart entries
```

### Commands

- **Auto-snapshot**: taken before every customizer action (commit message = the command)
- `/snapshot save "my description"` — named checkpoint
- `/snapshot list` — show history with timestamps and descriptions
- `/snapshot diff [id]` — show what changed between snapshots
- `/restore last` — undo most recent change
- `/restore [id]` — restore to a specific snapshot
- `/restore "checkpoint name"` — restore by name

### Recovery Script

`robos-desktop-recover` — a standalone bash script (no Electron dependency) that can restore from any snapshot via TTY if the desktop is broken. Accessible via Ctrl+Alt+F2.

## Acceptance Criteria

- [ ] Auto-snapshot taken before every customizer command
- [ ] Named snapshots via `/snapshot save`
- [ ] Snapshot list shows history with timestamps
- [ ] Diff view shows changes between any two snapshots
- [ ] `/restore last` undoes the most recent change
- [ ] `/restore [id]` restores to specific snapshot
- [ ] Recovery script works from TTY without GUI
