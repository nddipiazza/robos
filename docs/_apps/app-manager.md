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
3. Review the download size and choose **Install selected**. Install one app, several checked apps, or use **Select all apps** to install the whole library. Shared dependencies download once.
4. Use **Uninstall selected** to remove one or several installed apps in one batch, with one confirmation. Shared components needed by remaining apps are kept.
5. In **Installed**, use **Uninstall all apps** to clear the entire library while keeping App Manager ready to install apps again. This also works offline.
6. Choose **Uninstall RobOS** to remove App Manager and its entire managed library together. Personal settings are retained.

Each installed app has its own native launcher. The table header checkbox selects visible rows; **Select all apps** selects the entire library even when search hides some apps. In the Installed view, **Select all installed** selects every installed app.

On GNOME, first launch copies the AppImage to `~/.local/share/robos/RobOS.AppImage` and registers the manager in the app grid. Keep the original download only if you want a backup.

On macOS, use the Intel or Apple Silicon DMG matching your Mac. Launching from the mounted DMG installs a persistent manager in `~/Applications/RobOS.app`. Each selected app gets an application launcher under `~/Applications/RobOS Apps`.

Choose **Uninstall RobOS** to remove the manager, its downloaded apps and menu entries. Windows Settings can also uninstall RobOS. Personal app settings under `~/.config/robos/` are retained. An AppImage removed directly in a file manager cannot run cleanup; use the manager's uninstall action first.

Windows and Linux use platform-specific app payloads for native dependencies. Linux-specific apps still need their Linux services and tools. The optional appliance USB installer is a separate product.

See [the distribution build guide](https://github.com/nddipiazza/robos/blob/main/scripts/app-manager/README.md) for release packaging and validation.
