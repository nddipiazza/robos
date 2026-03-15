---
layout: default
title: RobOS App Suite
nav_order: 2
has_children: true
permalink: /robos-app-suite/
---

# RobOS App Suite

RobOS ships a suite of purpose-built Electron applications that together cover every phase of the software delivery lifecycle. Each app is a standalone dark-themed desktop window deployable to `/usr/local/share/robos/<app>/` and launchable from the tint2 panel or the App Launcher.

---

## App Inventory

| App | Purpose | Tint2 Icon |
|-----|---------|------------|
| [App Launcher](app-launcher) | Searchable grid of all RobOS apps | ✅ |
| [Dev Central](dev-central) | Daily developer dashboard — sprint, PRs, meetings | ✅ |
| [Issue Manager](issue-manager) | GitHub Issues browser, swim-lane board, AI breakdown | ✅ |
| [Git Projects](git-projects) | Repo manager, AI dev-setup scripts, Run in IntelliJ | ✅ |
| [IDE Manager](ide-manager) | Install/manage IDEs and the RobOS IntelliJ plugin | — |
| [Workspace Manager](workspace-manager) | Scan and open local workspaces in any IDE | — |
| [Lang Manager](lang-manager) | Install/switch language runtimes (Node, Python, Java…) | — |
| [Agents Manager](agents-manager) | Manage Copilot CLI agent sessions | ✅ |
| [Context Manager](context-manager) | Curate AI context sources for agent prompts | — |
| [Tech Workbench](tech-workbench) | AI-assisted technical spike / TPS sessions | — |
| [Work Journal](work-journal) | Git-backed developer journal with AI activity feed | — |
| [Pass Manager](pass-manager) | GUI for the `pass` GPG password store | — |
| [Pass Unlock](pass-unlock) | Daily GPG passphrase unlock dialog | — |
| [Security Setup](security-setup) | First-run GPG key + `pass` initialiser | — |
| [People Directory](people-directory) | Team directory linked to GitHub profiles | — |
| [Group Dev Settings](group-dev-settings) | Shared dev settings across a team group | — |
| [RobOS Preferences](robos-preferences) | System-wide RobOS settings (Jira, GitHub, AI) | — |
| [RobOS Applications](robos-applications) | Software registry — add/manage app shortcuts | — |
| [Auth Manager](robos-auth) | OAuth provider and identity configuration | — |
| [File Explorer](file-explorer) | Dark-themed file browser, navigable from other apps | — |
| [Notifications](notifications) | Full notification history viewer | — |
| [Toast Daemon](robos-toast) | System-wide overlay toast notification engine | — |
| [Agent Scheduler](agent-scheduler) | Cron-based AI agent job scheduler | — |
| [Task Servers](task-servers) | Configure Jira / GitHub task server connections | — |
| [Copilot Session Viewer](copilot-session-viewer) | Replay and inspect Copilot CLI session logs | — |
| [Search Index](search-index) | File system search index for `@`-search in AI textareas | — |

---

## Common Conventions

All apps share:

- **Dark theme** — `#0d1117` background, `#388bfd` accent, consistent component library
- **Electron IPC** — renderer ↔ main via `contextBridge` + `ipcRenderer.invoke`; never `nodeIntegration: true`
- **Required VM flags** — `--no-sandbox --disable-gpu --disable-dev-shm-usage`
- **Config location** — `~/.config/robos/` for all persistent data
- **Single-instance** — apps use `app.requestSingleInstanceLock()` where appropriate; a second launch focuses the existing window
