---
title: "Desktop Shell"
package: robos-desktop
category: core-desktop
icon: robos-desktop.svg
summary: "Full-screen top bar and bottom dock for RobOS on a GNOME/X11 session, replacing the GNOME panel while it runs."
description: "Shows a clock, notifications button, running-agent count and a dock of pinned and running windows. It hides the GNOME panel on start and restores it when you choose Back to GNOME."
---

Desktop Shell is the taskbar layer of the RobOS appliance desktop. It opens a full-screen window behind your other windows with a thin menu bar on top and a dock along the bottom. It targets the Ubuntu and GNOME session that the RobOS VM image provides.

## What is on screen

- **Menu bar (top).** The RobOS logo button opens a menu with **Back to GNOME**. On the right: the Ephemeral Agents chip, a notifications button, the date and time, and a thin strip that toggles Show Desktop (minimize all, restore).
- **Dock (bottom).** The launcher button opens the App Launcher. Next to it are pinned apps and the windows that are currently open. Right-click a dock icon for pin, unpin and window actions. Drag the handle in the dock to resize it.
- **Ephemeral Agents chip.** It lists profiles from `~/.config/robos/profiled/profiles.json` (the file written by [Agent Profile Daemon]({{ '/apps/robos-profiled/' | relative_url }})). **Clean All** marks every profile in that file as terminated.

The notifications button launches the `notifications` app. The dock has no tray icons.

## How it works

- On start it runs `sudo /usr/local/bin/robos-desktop-panel hide`. That script (in `packages/robos-desktop/scripts`) disables the dash-to-panel GNOME extension and applies a theme that hides the top bar. **Back to GNOME** runs the matching `show` command and quits. The panel commands are skipped when `ROBOS_SCENARIO`, `ROBOS_TEST_MODE` or `ROBOS_HEADLESS` is set.
- Window lists and window actions (focus, minimize, maximize, close) go through the X11 tools `wmctrl` and `xdotool`, so it needs an X11 session with those installed.
- Apps start as Electron processes from `/usr/local/share/robos/<app>` (or from the sibling folder in a checkout). Running apps are found by scanning `/proc` for that path.
- On **Back to GNOME** it also asks the desktop manager, over `/run/user/<uid>/robos-dm.sock`, to pause its watchdog for `robos-desktop` so the shell is not restarted. If the socket is not there, the request fails and a warning is logged.
- Pinned apps are remembered by the shell window in its local storage (`robos-pinned-apps`).

## Keyboard shortcuts

The shell registers global shortcuts that mirror the GNOME ones.

| Keys | Action |
|---|---|
| `Super+D` | Show desktop / restore |
| `Super+Up`, `Super+Down` | Maximize / unmaximize the active window |
| `Alt+F10` | Toggle maximize |
| `Super+H`, `Alt+F9` | Minimize the active window |
| `Alt+F4` | Close the active window |

## Run it

Launch **RobOS Desktop** from the app launcher, or run `npm start` in `packages/robos-desktop`. Only one instance runs at a time.
