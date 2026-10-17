---
title: "RobOS GNOME Desktop App Installer"
package: gnome-desktop-installer
category: core-desktop
icon: gnome-desktop-installer.svg
summary: "Install, manage, and repair GNOME Desktop shortcuts, App Grid launchers, multi-scale icons, and Dock favorites for all RobOS apps."
description: "Centralized GNOME Linux desktop integration manager for the entire RobOS app suite: FreeDesktop 1.5 .desktop entries, GIO trusted ~/Desktop shortcuts, multi-scale hicolor PNG/SVG icons, ~/.local/bin launcher wrappers, and GNOME Shell Dock pinning."
---

RobOS GNOME Desktop App Installer provides a unified control center for managing GNOME Linux desktop integration across every application in the RobOS suite. Whether you want all RobOS apps searchable in the GNOME Activities Overview / App Grid, selected apps placed directly on `~/Desktop` with automatic GIO trust, or favorite tools pinned to the GNOME Shell Dash / Ubuntu Dock, this app handles the entire lifecycle in one click.

## Features

- **Automatic RobOS Suite Discovery**: Scans `packages/`, installed `/usr/local/share/robos/`, and FreeDesktop application directories to discover every GUI application in RobOS alongside its live GNOME integration status.
- **One-Click & Bulk GNOME App Grid Installation**: Generates compliant FreeDesktop 1.5 `.desktop` launchers in `~/.local/share/applications/` and resilient Electron wrapper scripts in `~/.local/bin/<app-id>`.
- **Trusted `~/Desktop` Shortcuts (GNOME DING)**: Creates or removes desktop shortcuts in `~/Desktop/<app-id>.desktop`, automatically applying executable permissions (`chmod +x`) and `gio set ... metadata::trusted true` so shortcuts launch immediately without "Untrusted Application" warnings.
- **GNOME Shell Favorites Dock Pinning**: Pin or unpin any RobOS application on the GNOME Shell Dash / Ubuntu Dock (`org.gnome.shell favorite-apps`).
- **Multi-Scale Hicolor Icon Rasterization**: Installs scalable SVGs and rasterizes `16x16` through `512x512` PNG icons across `~/.local/share/icons/hicolor/` and `~/.local/share/pixmaps/` for both `<app-id>` and `StartupWMClass` aliases, plus companion `icon.png` files for native X11 `_NET_WM_ICON` window icons.
- **Cache Repair & Inspector Modal**: Rebuild `gtk-update-icon-cache` and `update-desktop-database` in one click, or inspect the exact `.desktop` file, `StartupWMClass`, and `~/.local/bin/` wrapper script for any app.

## Files & Ports

- App directory: `packages/gnome-desktop-installer/`
- Core manager library: `packages/gnome-desktop-installer/lib/shortcut-manager.js`
- Snapshot debug port: `19201`
