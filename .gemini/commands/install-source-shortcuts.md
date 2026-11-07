# Run RobOS Apps From Source & Install "(From Source)" Shortcuts

Run RobOS apps from this git clone, and create `RobOS <App> (From Source)` Start menu (Windows), GNOME app grid (Linux) or `~/Applications` (macOS) entries, plus optional desktop icons. Each one uses the app's own icon on the entry, the desktop icon, the taskbar/dock button and the window.

## Input

$ARGUMENTS: `install [app-id ...] [--desktop] [--no-install] [--dry-run]`, `remove [app-id ...]`, or `list`. With no arguments, run `list` and ask which apps to add and whether to add desktop icons.

## Procedure

Follow [`plugins/robos/skills/install-source-shortcuts/SKILL.md`](../skills/install-source-shortcuts/SKILL.md), which runs:

```bash
node scripts/source-shortcuts/source-shortcuts.cjs $ARGUMENTS
```
