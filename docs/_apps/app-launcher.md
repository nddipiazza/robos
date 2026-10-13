---
title: "App Launcher"
package: app-launcher
category: core-desktop
icon: app-launcher.svg
summary: "A searchable grid of the desktop applications installed on the machine, including the RobOS apps."
description: "App Launcher reads the standard .desktop files on the system, groups them by category and starts the one you pick. It is not limited to RobOS apps."
---

App Launcher is a centered 800 by 600 window with a search box, a row of category buttons and a grid of application icons. It closes when it loses focus, so it behaves like a menu.

## What you do in it

1. Open it from the panel or dock. Starting it again while it is open closes it, so a keyboard shortcut bound to the launcher toggles the window.
2. Start typing. Any letter focuses the **Search applications...** box. Search matches the name (with a leading "RobOS " ignored), the comment line and the category list of each entry.
3. Optionally click a category button (All, Utilities, System, Internet, Development, Graphics, Media, Office, Games, Education, Accessibility, Other). Only categories that contain at least one app are shown.
4. Click an icon, or use the arrow keys and `Enter`. If the search leaves exactly one result, `Enter` starts it. `Esc` closes the window.

The launcher runs the entry's `Exec` line (with `%f`, `%u` style field codes removed) in a detached shell and then closes.

## Where the list comes from

The app scans these folders for `.desktop` files with `Type=Application`, skipping entries marked `NoDisplay` or `Hidden`:

- `/usr/share/applications`
- `/usr/local/share/applications`
- `/var/lib/snapd/desktop/applications`
- `~/.local/share/applications`

If two files launch the same program, only the first is kept. Each RobOS app ships its own `.desktop` file (for example `packages/agent-chat/agent-chat.desktop`), which is how it appears here. Icons are looked up in the Yaru, hicolor and Adwaita themes, `~/.local/share/icons` and `/usr/share/pixmaps`.

## Requirements and notes

- Linux with an X11 or Wayland session. The window hides itself from the task bar using `xdotool` and `wmctrl` when they are installed; without them it may show up in the task bar.
- Settings are not stored. The only persistent file is Electron's own profile in `~/.config/robos/electron/app-launcher`.
- `packages/app-launcher/deploy.sh` copies the app to a running RobOS VM over SSH (port 2224 by default; override with `SSH_PORT` and `SSH_HOST`).

Source: [`packages/app-launcher`](https://github.com/nddipiazza/robos/tree/main/packages/app-launcher).
