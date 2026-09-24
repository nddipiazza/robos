# Install Desktop App & .desktop Icon on GNOME Linux

Install and configure desktop applications, FreeDesktop `.desktop` entries, icons, GNOME Desktop shortcuts, and Ubuntu Dock favorites on GNOME Linux.

## Input

$ARGUMENTS — Flags and options for installation:
- `-a, --app-id <id>`: Unique application identifier (e.g. `robos-crpg`)
- `-n, --name <name>`: Human-readable display name (e.g. `"RobOS cRPG: Realm of Heroes"`)
- `-e, --exec <command>`: Execution command or binary path
- `-i, --icon <path>`: Path to `.svg` or `.png` icon file
- `-d, --desktop`: Create trusted desktop shortcut in `~/Desktop/`
- `-f, --favorite`: Pin application to GNOME Shell favorites dock
- `-p, --path <dir>`: Process working directory

## Procedure

Follow instructions and automation in [`plugins/robos/skills/install-desktop-app/SKILL.md`](../skills/install-desktop-app/SKILL.md) or execute the bundled utility:

```bash
plugins/robos/skills/install-desktop-app/scripts/install-desktop-app.sh $ARGUMENTS
```
