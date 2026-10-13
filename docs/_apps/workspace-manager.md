---
title: "Workspace Manager"
package: workspace-manager
category: core-desktop
icon: workspace-manager.svg
summary: "Window showing a sample multi-repo task workspace with sync, teardown and open-in-IDE buttons that return canned results. Discovery helpers exist in the code but are not wired to the window."
description: "The interface is a prototype with built-in sample data. The main process also contains working helpers to find .vscode and .idea workspaces and detect installed IDEs."
---

Workspace Manager is partly a prototype. What you see in the window is sample data; some useful code exists behind it but the window does not call it yet.

## What the window shows

The header carries a branch drop-down with three sample branch names and a commit badge. Below it are stat cards and a **Multi-Repo Projects** list with one sample project, and a panel titled "Task Worktree Environment & Multi-Root IDE Bridge" for a sample task workspace (`TASK-102-order-sync`, three repositories).

| Button | Behavior today |
|---|---|
| **Sync Worktrees** | Marks the sample workspace active and reports "3 worktrees created in 180ms". No `git worktree` command runs. |
| **Teardown Workspace** | Marks the sample workspace cleaned and reports that worktrees were removed. Nothing is removed. |
| **Open in IDE** | Reports that a multi-root workspace was opened. It returns a path but does not start an IDE. |
| Branch drop-down | Changes the commit badge only. |

The `.robos/projects.yaml` file mentioned in the header is not read.

## What exists in the main process

`main.js` and `preload.js` also expose handlers that the current window does not use:

- `scan-workspaces` walks `~`, `~/source` and `/usr/local/share/robos` (up to six levels deep, skipping `node_modules`, `.git` and other dot folders) and lists every folder that contains `.vscode` or `.idea`, newest first.
- `detect-ides` checks for Cursor, VS Code, IntelliJ IDEA, WebStorm, PyCharm, GoLand, CLion and Rider commands on the PATH. `open-in-ide`, `open-terminal` (Tilix) and `open-in-files` start them on a path.
- `get-git-info` returns the branch, `origin` URL and dirty state of a folder. Scan roots and depth are stored under `workspace_manager` in `~/.config/robos/settings.json`, and per-workspace state under `~/.config/robos/workspace-states/`.
- A Unix socket at `/run/user/<uid>/robos-wm.sock` answers `{"listDesktops": true}` with the contents of `~/.config/robos/desktops/*.json`.

## Related

[Workspace Manager MCP Server]({{ '/apps/workspace-manager-mcp/' | relative_url }}) is the agent-facing counterpart and is also a prototype. To work on a real repository today, use Git Projects or open the folder in your IDE directly.

## Run it

Launch **RobOS Workspace Manager** from the app launcher, or run `npm start` in `packages/workspace-manager`.
