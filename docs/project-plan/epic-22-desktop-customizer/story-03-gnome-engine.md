---
nav_exclude: true
---

# Story 22-03: GNOME Settings Engine (gsettings, dconf, Extensions)

**Epic:** [Desktop Customizer](epic.md)
**Status:** Not started
**Points:** 8

## Description

The execution engine that translates high-level customization intents into GNOME desktop modifications. This is the backend that all slash commands and AI prompts call into.

### Capabilities

**gsettings/dconf layer:**
- Read/write any gsettings key (e.g., `org.gnome.desktop.interface`, `org.gnome.shell`)
- Clock position, format, show-date, show-seconds
- Taskbar/panel size, position, favorite apps
- Wallpaper, lock screen, screen timeout
- Font settings, scaling factor, cursor theme
- Window behavior (focus-follows-mouse, button layout, titlebar actions)

**GNOME Shell extension management:**
- List installed extensions and their state
- Enable/disable extensions
- Install extensions from extensions.gnome.org by UUID
- Configure extension settings via dconf

**CSS override layer:**
- Write custom GTK3/GTK4 CSS to `~/.config/gtk-{3,4}.0/gtk.css`
- GNOME Shell CSS overrides via `~/.local/share/gnome-shell/extensions/user-theme@gnome-shell-extensions.gcampax.github.com/`
- Live-reload: `gsettings reset org.gnome.desktop.interface gtk-theme && gsettings set ...` trick

**Shell script execution:**
- Run arbitrary shell commands for things gsettings can't do
- Sandboxed with snapshot-before-execute
- Output streamed back to the chat UI

### Safety

Every engine method:
1. Takes a snapshot first
2. Validates the change is syntactically correct
3. Executes the change
4. Verifies the change took effect (reads back the value)
5. Reports success/failure to the chat UI

### API

```javascript
const engine = require('./gnome-engine');

await engine.gsettings.set('org.gnome.desktop.interface', 'clock-show-date', true);
await engine.gsettings.get('org.gnome.desktop.interface', 'clock-show-date');
await engine.dconf.dump('/org/gnome/shell/');
await engine.extensions.enable('dash-to-dock@micxgx.gmail.com');
await engine.css.append('.panel { height: 40px; }');
await engine.exec('xdotool key super');
```

## Acceptance Criteria

- [ ] Can read/write any gsettings key with validation
- [ ] Can dump and load dconf paths
- [ ] Can list, enable, disable, and install GNOME extensions
- [ ] Can write and live-reload GTK CSS overrides
- [ ] Can execute shell commands with output streaming
- [ ] Every modification auto-snapshots first
- [ ] Verification step confirms change took effect
