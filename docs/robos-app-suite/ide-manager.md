---
layout: default
title: IDE Manager
parent: RobOS App Suite
nav_order: 5
---

# IDE Manager

> Install, update, and manage IDEs on RobOS, including the RobOS IntelliJ plugin.

---

## Overview

IDE Manager provides a GUI for discovering, installing, and removing IDE distributions on the RobOS machine. It also manages the lifecycle of the **RobOS IntelliJ Plugin** — the bridge that allows other RobOS apps to control IntelliJ over HTTP IPC.

---

## Features

- **IDE catalogue** — lists supported IDEs (IntelliJ IDEA Community, VS Code, Cursor, etc.)
- **Install / Uninstall** — downloads and extracts IDE archives to `/opt/<ide>/`
- **Plugin management** — installs the RobOS IntelliJ plugin JAR into the correct JetBrains plugin directory and shows install status
- **Version display** — shows currently installed version for each IDE
- **Active detection** — detects whether an IDE process is currently running

---

## How to Open

```bash
/usr/local/share/robos/ide-manager/launch.sh
```

---

## Usage

### Installing an IDE

1. Select an IDE from the catalogue list.
2. Click **Install**.
3. The app downloads the archive, extracts it to `/opt/<ide-slug>/`, and creates a symlink in `/usr/local/bin/`.

### Installing the RobOS IntelliJ Plugin

1. Select **IntelliJ IDEA** from the list.
2. Under **Plugin**, click **Install Plugin**.
3. The app locates the plugin JAR bundled with RobOS and copies it to:
   ```
   ~/.local/share/JetBrains/IdeaIC<Version>/<plugin-name>/
   ```
4. Status updates to **Installed ✓**.

### Uninstalling

Select an IDE and click **Uninstall**. The app removes the installation directory and any created symlinks. The plugin directory is also cleaned up.

---

## Configuration

IDE Manager reads `settings.json` for the `intellij_binary` path used by other apps.

| Setting key | Description |
|-------------|-------------|
| `intellij_binary` | Absolute path to the `idea` launch script |

---

## IPC Reference

| Channel | Direction | Description |
|---------|-----------|-------------|
| `get-installed-ides` | Renderer → Main | Returns list of IDEs with install status and version |
| `install-ide` | Renderer → Main | Downloads and installs an IDE by key |
| `uninstall-ide` | Renderer → Main | Removes an installed IDE |
| `install-plugin` | Renderer → Main | Copies the RobOS plugin JAR into JetBrains plugin dir |
| `uninstall-plugin` | Renderer → Main | Removes the RobOS plugin from JetBrains plugin dir |
| `get-plugin-status` | Renderer → Main | Returns `{ installed: bool, path: string }` |

---

## Data & Files

| Path | Description |
|------|-------------|
| `~/.config/robos/settings.json` | Stores `intellij_binary` after install |
| `/opt/<ide-slug>/` | IDE installation directory |
| `~/.local/share/JetBrains/IdeaIC<Ver>/<plugin>/` | RobOS IntelliJ plugin location |

---

## Notes

- The JetBrains plugin directory uses `IdeaIC<Version>` with no `plugins/` subdirectory — the plugin folder is placed **directly** inside the versioned directory.
- `~/.config/JetBrains/` contains IDE settings only; plugins placed there will **not** be loaded.
