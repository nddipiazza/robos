---
layout: default
title: Lang Manager
parent: RobOS App Suite
nav_order: 7
---

# Lang Manager

> Install, switch, and manage programming language runtimes — Node.js, Python, Java, Go, and more.

---

## Overview

Lang Manager provides a GUI for installing and switching between multiple versions of language runtimes. It abstracts over version managers (nvm, pyenv, sdkman, etc.) so developers can manage their whole stack from one dark-themed interface.

---

## Features

- Runtime catalogue covering Node.js, Python, Java (OpenJDK), Go, Rust, Ruby
- Install any version with a single click
- Set a runtime as the system-wide default or per-project default
- Shows currently active version for each language
- Uninstall old versions to reclaim disk space
- Underlying version managers (nvm, pyenv, sdkman) are installed automatically if not present

---

## How to Open

```bash
/usr/local/share/robos/lang-manager/launch.sh
```

---

## Usage

### Installing a runtime

1. Select a language tab (e.g., **Node.js**).
2. Choose a version from the list.
3. Click **Install**. A progress log streams to the output pane.

### Switching the active version

1. Select a language tab.
2. Click **Set Default** next to any installed version.
3. The active version badge updates immediately. New terminal sessions will pick up the change.

### Uninstalling

Select a version and click **Uninstall**. You cannot uninstall the currently active version.

---

## Configuration

No dedicated config file. Lang Manager reads/writes via the underlying version managers:

| Runtime | Manager | Default install location |
|---------|---------|--------------------------|
| Node.js | nvm | `~/.nvm/versions/node/` |
| Python | pyenv | `~/.pyenv/versions/` |
| Java | sdkman | `~/.sdkman/candidates/java/` |
| Go | manual tarball | `/usr/local/go/` |

---

## IPC Reference

| Channel | Direction | Description |
|---------|-----------|-------------|
| `get-runtimes` | Renderer → Main | Returns installed versions and active flag per language |
| `install-runtime` | Renderer → Main | Installs a version; streams progress events |
| `set-default-runtime` | Renderer → Main | Sets the active version for a language |
| `uninstall-runtime` | Renderer → Main | Removes an installed version |

---

## Data & Files

| Path | Description |
|------|-------------|
| `~/.config/robos/settings.json` | General settings (no lang-specific keys currently) |
| `~/.nvm/` | Node.js versions managed by nvm |
| `~/.pyenv/` | Python versions managed by pyenv |
| `~/.sdkman/` | Java versions managed by sdkman |
