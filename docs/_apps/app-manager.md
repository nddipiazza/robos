---
title: "RobOS App Manager"
package: app-manager
category: core-desktop
icon: app-manager.svg
summary: "Choose, download, launch and remove RobOS apps"
description: "Choose, download, launch and remove RobOS apps"
---

Use the same RobOS App Manager on Windows, Ubuntu GNOME and macOS. The base download contains the manager and one shared Electron runtime. Apps are separate downloads for your OS and CPU.

1. Open the Windows installer, Linux AppImage or macOS DMG.
2. Expand a group and check the apps you want. Group checkboxes select their apps; partly selected groups show an intermediate state.
3. Review the download size and choose **Install selected apps**. Dependencies are included automatically and shared between apps.
4. Use **Installed apps** to open or uninstall an app. Each installed app also has a Windows Start menu entry or GNOME app entry.

On GNOME, first launch copies the AppImage to `~/.local/share/robos/RobOS.AppImage` and registers the manager in the app grid. Keep the original download only if you want a backup.

On macOS, use the Intel or Apple Silicon DMG matching your Mac. Launching from the mounted DMG installs a persistent manager in `~/Applications/RobOS.app`. Each selected app gets an application launcher under `~/Applications/RobOS Apps`.

Choose **Uninstall RobOS** to remove the manager, its downloaded apps and menu entries. Windows Settings can also uninstall RobOS. Personal app settings under `~/.config/robos/` are retained. An AppImage removed directly in a file manager cannot run cleanup; use the manager's uninstall action first.

Windows and Linux use platform-specific app payloads for native dependencies. Linux-specific apps still need their Linux services and tools. The optional appliance USB installer is a separate product.

See [the distribution build guide](https://github.com/nddipiazza/robos/blob/main/scripts/app-manager/README.md) for release packaging and validation.
