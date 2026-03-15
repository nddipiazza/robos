---
layout: default
title: Git Projects
parent: RobOS App Suite
nav_order: 4
---

# Git Projects

> Repository manager with AI-generated dev-setup scripts, one-click IntelliJ integration, and local environment bootstrapping.

---

## Overview

Git Projects is the developer's primary interface for managing code repositories. You register GitHub repositories, clone them locally, and use the app to generate (via AI), store, and execute the scripts needed to get a local development environment running. Scripts are kept in a shared storage folder alongside IDE launch configurations, so every repository's dev setup is captured, repeatable, and runnable from IntelliJ without context-switching.

---

## Features

- **Repository registry** — add any GitHub org/repo; stores metadata and local clone path
- **AI dev-setup generation** — Copilot CLI analyses the repo and writes four scripts: Setup, Start, Test, and E2E
- **Monaco editor** — edit scripts directly in the app with syntax highlighting
- **Run in Terminal** — executes scripts in a desktop terminal emulator
- **Run in IntelliJ** — writes an IntelliJ Run Configuration XML into the project's `.idea/runConfigurations/` folder, opens the project in IntelliJ, then triggers the run config via the RobOS IntelliJ plugin IPC
- **IntelliJ startup wait** — if IntelliJ is not running, launches it and polls the plugin health endpoint (every 3 s, up to 3 min) showing a pulsing progress banner
- **Shared scripts folder** — all scripts saved to `~/.config/robos/project-scripts/<project-id>/`; a single VS Code / IntelliJ workspace can open this folder to view or debug all project scripts

---

## How to Open

```bash
/usr/local/share/robos/git-projects/launch.sh
```

---

## Usage

### Registering a repository

1. Click **+ Add Project**.
2. Enter the GitHub URL and the desired local clone path.
3. Click **Save**. The app clones the repository if the path does not yet exist.

### Generating dev-setup scripts

1. Select a project from the sidebar.
2. Go to the **Local Environment Setup** tab.
3. Click **✨ Generate Scripts**. The AI analyses `package.json`, `Makefile`, `pom.xml`, `README.md`, etc. and produces four scripts.
4. Review and edit each script in the Monaco editor.
5. Click **Save Scripts** to persist them.

### Running a script

Each script tab (Setup / Start / Test / E2E) has two run buttons:

- **▶ Run in Terminal** — opens a gnome-terminal and executes the script.
- **🧠 Run in IntelliJ** — writes the run config XML, ensures IntelliJ is running, then triggers the run via the plugin HTTP IPC.

### IntelliJ startup wait

If IntelliJ is not running when **Run in IntelliJ** is clicked, a blue pulsing banner appears at the top of the window:

```
🧠 Waiting for IntelliJ plugin… attempt 4 / 60 · 168 s remaining
```

The app polls `GET http://localhost:63343/robos/health` every 3 seconds. Once the plugin responds, the run proceeds automatically.

---

## Configuration

| Setting key | Description |
|-------------|-------------|
| `github_token` | GitHub token for repo metadata fetches |
| `intellij_binary` | Path to the `idea` executable (default: auto-detected) |

Settings read from `~/.config/robos/settings.json`.

---

## IPC Reference

| Channel | Direction | Description |
|---------|-----------|-------------|
| `get-projects` | Renderer → Main | Returns all registered projects |
| `add-project` | Renderer → Main | Registers a new repo and optionally clones it |
| `delete-project` | Renderer → Main | Removes a project from the registry |
| `load-scripts` | Renderer → Main | Reads saved scripts for a project |
| `save-scripts-to-disk` | Renderer → Main | Persists script text files and IDE config files |
| `generate-scripts` | Renderer → Main | Streams AI-generated scripts for the repo |
| `run-script` | Renderer → Main | Spawns gnome-terminal to run a script |
| `run-in-intellij` | Renderer → Main | Writes run config XML, starts IntelliJ if needed, triggers run via plugin |
| `run-dev-setup` | Renderer → Main | Runs all four scripts in sequence |
| `intellij-wait` | Main → Renderer | Emitted each poll cycle with `{ attempt, remaining }` |

---

## Data & Files

| Path | Description |
|------|-------------|
| `~/.config/robos/git-projects.json` | Project registry (id, url, localPath, name) |
| `~/.config/robos/project-scripts/<id>/setup.sh` | Setup script |
| `~/.config/robos/project-scripts/<id>/start.sh` | Start/dev-server script |
| `~/.config/robos/project-scripts/<id>/test.sh` | Test runner script |
| `~/.config/robos/project-scripts/<id>/e2e.sh` | E2E test script |
| `<localPath>/.idea/runConfigurations/robos-*.xml` | IntelliJ run config XMLs (written into the cloned repo) |
| `<localPath>/.vscode/launch.json` | VS Code launch config (written into the cloned repo) |

---

## IntelliJ Plugin IPC

Git Projects communicates with IntelliJ via the **RobOS IntelliJ Plugin** HTTP server running on `localhost:63343`.

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/robos/health` | GET | Plugin heartbeat — `{ ok: true }` |
| `/robos/open-project` | POST | Open a project directory in IntelliJ |
| `/robos/open-file` | POST | Focus a specific source file |
| `/robos/run` | POST | Trigger a named run configuration |

See [IntelliJ Plugin](../intellij-plugin) for full API reference.
