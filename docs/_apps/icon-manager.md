---
title: "Icon Manager"
package: icon-manager
category: core-desktop
icon: icon-manager.svg
summary: "Shows the icon of every installed RobOS app, lets you replace one, and rewrites the apps' installed icon.svg and .desktop Icon= lines."
description: "Icon Manager finds RobOS apps from their .desktop files, shows each icon in a grid, and writes a chosen icon into /usr/local/share/robos using sudo when needed."
---

Icon Manager is for changing how RobOS apps look in the launcher and dock. It is not a general icon library.

## What you do in it

1. The window scans `/usr/share/applications` and `/usr/local/share/applications` for `.desktop` files that contain `X-RobOS-App=true` and shows one card per app: icon, label, app id, category and icon path. **Filter apps...** matches the id, label or category, and the header shows the count.
2. Click a card to choose a replacement image (`svg`, `png`, `jpg`, `jpeg` or `ico`). The choice is recorded in `~/.config/robos/icon-registry.json`.
3. If the new file is an SVG and the app is installed under `/usr/local/share/robos/<app id>`, the app also copies it to `<app dir>/icon.svg` and changes the `Icon=` line of the app's `.desktop` file to that path. Other image types are only recorded in the registry; they are shown in the grid but do not change the installed icon.
4. **Push Icons** goes through every app, writes each app's SVG into its install folder (a 48 by 48 SVG is rewritten as 64 by 64), points the `.desktop` file at it and runs `update-desktop-database /usr/share/applications`. A row that has no SVG source is reported as failed. **Refresh** rescans.

Writes to `/usr/local/share/robos` and `/usr/share/applications` fall back to `sudo cp` when the file is not writable, so the user needs passwordless sudo. Without it, replacing a single icon fails silently, while **Push Icons** reports the failed rows. There is no undo; keep a copy of the original icon if you may want it back. To change one app's icon from the command line instead, see the `update-app-icon` skill under [Skills]({{ '/robos-skills.html' | relative_url }}).

## Requirements

A Linux desktop with RobOS apps installed under `/usr/local/share/robos`. Run it with `electron packages/icon-manager`. Source: [`packages/icon-manager`](https://github.com/nddipiazza/robos/tree/main/packages/icon-manager).
