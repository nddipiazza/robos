---
title: "Desktop Dashboard"
package: desktop-dashboard
category: core-desktop
icon: desktop-dashboard.svg
summary: "A full-screen window that sits at desktop level and shows a grid of widgets; today it contains one clock and date widget."
description: "Desktop Dashboard is the beginning of a widget-based desktop background. It has a widget registry and a single built-in Welcome widget. It shows no system statistics or launchers yet."
---

Desktop Dashboard creates a borderless window the size of the primary display's work area, with the X11 window type set to `DESKTOP` so it stays behind other windows and out of the task bar. It is visible on all workspaces and cannot be moved or resized.

## What is in it

`renderer/app.js` keeps a list of widgets. Each widget is an object with an `id`, a `title` and a `render()` function that returns HTML, and the grid is redrawn every 30 seconds. One widget is registered: **Welcome**, which shows the current time, the date and the text "RobOS Desktop Dashboard". There is no CPU, memory, workspace or shortcut widget in the code, and nothing in the window is clickable.

To add a widget, call `registerWidget({ id, title, render })` in `app.js`. For widgets that show sprint, review and blocker data on the desktop, see [Desktop Widgets]({{ '/apps/desktop-widgets/' | relative_url }}).

## Requirements and behavior

- Linux with X11. The window type is set with `xdotool` and `xprop`, which must be installed, and `DISPLAY` is forced to `:0`.
- On GNOME the work-area size can be wrong right after login, so the app re-checks the display size for the first 30 seconds and on every display change.
- One instance runs at a time. Nothing is stored on disk apart from Electron's own profile in `~/.config/robos/electron/desktop-dashboard`.

```bash
electron packages/desktop-dashboard
```

Source: [`packages/desktop-dashboard`](https://github.com/nddipiazza/robos/tree/main/packages/desktop-dashboard).
