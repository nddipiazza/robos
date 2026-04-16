# Story 22-09: Startup Manager and Desktop Replacement Mode

**Epic:** [Desktop Customizer](epic.md)
**Status:** Not started
**Points:** 3

## Description

Control what launches at login and support replacing the entire desktop with a single full-screen app.

### Startup Manager

```
/startup list                              # Show all startup apps
/startup add terminal --delay 3s           # Launch terminal 3s after login
/startup add dev-central                   # Launch Dev Central at login
/startup remove dev-central                # Remove from startup
/startup order terminal dev-central task-board  # Set launch order
/startup delay task-board 5s               # Add delay before launch
```

Implementation: manage `.desktop` files in `~/.config/autostart/` with `X-GNOME-Autostart-Delay`.

### Desktop Replacement Mode

Replace the standard desktop with a single app that fills the entire screen. Useful for kiosk-style setups, focused dashboards, or custom workflows.

```
/replace-desktop dev-central               # Dev Central becomes the desktop
/replace-desktop manager-dashboard         # Manager Dashboard as full-screen desktop
/replace-desktop off                       # Restore normal desktop
```

Implementation:
- Set the app window to `type: 'desktop'`, full screen, no decorations
- Disable the desktop icons extension
- App renders behind all other windows (like a wallpaper replacement)
- Other apps can still be launched on top

### Safety

- `/replace-desktop` shows a confirmation: "This will replace your desktop background with [app]. You can restore with `/replace-desktop off` or `/restore last`. Proceed?"
- A keybinding (Super+Escape) always restores the normal desktop

## Acceptance Criteria

- [ ] `/startup list/add/remove` manages autostart applications
- [ ] `/startup delay` controls launch timing
- [ ] `/replace-desktop [app]` replaces desktop with full-screen app
- [ ] `/replace-desktop off` restores normal desktop
- [ ] Super+Escape emergency restore always works
- [ ] Confirmation prompt shown before desktop replacement
