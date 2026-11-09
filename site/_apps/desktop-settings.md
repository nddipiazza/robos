---
title: "Desktop Settings"
package: desktop-settings
category: "libraries"
component_type: component
permalink: /desktop-settings/
redirect_from:
  - /apps/desktop-settings/
summary: "Legacy placeholder manifest superseded by RobOS Preferences and GNOME Desktop App Installer."
description: "Legacy placeholder package in packages/desktop-settings; active desktop configuration, theme settings, dock pins, and Config Sync live in RobOS Preferences and Desktop Customizer."
related:
  - /robos-preferences/
  - /desktop-customizer/
  - /robos-desktop/
---

`packages/desktop-settings` is a retained placeholder manifest from an early layout of the desktop shell. Its `package.json` declares an Electron entry point (`main.js`), and no runtime implementation lives in this directory.

## Where desktop configuration lives instead

Active workstation, theme, launcher, and synchronization settings are split across dedicated RobOS applications:

- **[RobOS Preferences](/robos-preferences/)** (`packages/robos-preferences`): System-wide AI provider selection, credential store integration, prompt security policy (`redact`, `block`, `warn`, `audit-only`), and encrypted **Config Sync & Sharing** (`robos-lib/config-sync.js`).
- **[GNOME Desktop App Installer](/desktop-customizer/)** (`packages/desktop-customizer`): Manages `~/Desktop` shortcuts, FreeDesktop `.desktop` launchers, hicolor SVG/PNG icon themes, and GNOME Dock favorites.
- **[RobOS Desktop](/robos-desktop/)** (`packages/robos-desktop`): Runs the RobOS panel, taskbar widgets, and session services inside the Ubuntu appliance VM.

Source: [`packages/desktop-settings`](https://github.com/nddipiazza/robos/tree/main/packages/desktop-settings).
