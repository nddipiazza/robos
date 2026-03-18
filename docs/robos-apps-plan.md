# RobOS Apps Plan — AI-Assisted Engineering Workflow

Based on the RobOS Requirements wiki, this document maps each requirement area to concrete RobOS Electron apps that need to be built.

## Overview

The requirements describe an end-to-end AI-assisted SDLC platform serving four personas: **Product Owners**, **Developers**, **Dev Leads**, and **Managers**. The system is built around a **Task Workflow** that progresses from requirements → AI draft → human review → PR → deploy, with AI assistance at every step.

---

## Core Apps

### 1. Task Manager
**Category:** Dev | **Priority:** Critical

The central hub. Connects to task servers (Jira, GitHub Issues) and drives the entire workflow.

- Browse/search tasks from connected task servers (epics, stories, tickets)
- Display task workflow progress (setup → AI questionnaire → AI draft → review → PR → CI → deploy)
- Advance tasks through workflow stages with validation gates
- Auto-update task server: status changes, hours logged, comments added
- Assign/track workspaces per task
- Show task-level deployment tracking

**IPC:** task server APIs (Jira REST, GitHub Issues), workspace manager, IDE manager

---

### 2. Task Servers
**Category:** Dev | **Priority:** Critical

Configure and authenticate with external task tracking systems.

- Connect to Jira, GitHub Issues, Linear, etc.
- Configure project mappings, authentication (OAuth, API tokens)
- Sync tasks bidirectionally
- Map external statuses to RobOS Task Workflow stages

**IPC:** Task Manager consumes this

---

### 3. Workspace Manager
**Category:** Dev | **Priority:** Critical

Each task gets an isolated workspace. This app manages them.

- Create workspace from task (clone repo, checkout branch, install deps)
- Track workspace state per task (synced to RobOS distributed config)
- Resume workspace — pull latest, restore IDE state, start dev servers
- Progress workspace through task workflow stages
- Auto-setup: run local dev instructions, start services, set breakpoints at issue reproduction point
- List all active workspaces with task links

**IPC:** Task Manager, Dev Tools, Git Projects

---

### 4. Dev Tools *(already built)*
**Category:** Dev | **Priority:** Critical | **Status: Done**

Install, manage, and configure the full developer toolchain — IDEs, CLIs, runtimes, containers, and utilities. This is the existing `packages/dev-tools/` app.

- Category-filtered catalog: AI, IDE, Dev, CLI
- Install/uninstall with real-time streaming logs
- 19 tools: Claude CLI, Copilot CLI, VS Code, JetBrains suite (7 IDEs), GitHub CLI, Docker, Lazygit, ripgrep, fd, bat, jq, fzf, htop
- JetBrains installers auto-create .desktop files with icons
- Debug server on port 19122 for DOM snapshots

**IPC:** Workspace Manager, Task Manager

---

### 5. AI Agent Manager
**Category:** AI | **Priority:** Critical

Manage AI agent sessions that do the actual coding work.

- Start/stop/monitor AI agent sessions (Claude Code, Copilot, etc.)
- Assign agents to tasks — agent works the task through the workflow
- AI Questionnaire stage: agent asks clarifying questions before coding
- AI Draft stage: agent implements the task, creates PR draft
- AI Review-Fix cycles: agent responds to review feedback
- Show agent session logs, token usage, context

**IPC:** Task Manager, Workspace Manager, Context Manager

---

### 6. Context Manager
**Category:** AI | **Priority:** High

Curate and manage AI context sources for agent sessions.

- Add context from: files, folders, URLs, repos, tickets, EKGraph nodes
- Create named context bundles per task or project
- Auto-attach relevant context when agent starts working on a task
- Voice-to-text transcription feeds into context (local, offline STT)
- Convert conversations with AI into EKGraph knowledge nodes

**IPC:** AI Agent Manager, EKGraph, Voice Dictation

---

### 7. EKGraph (Engineering Knowledge Graph)
**Category:** Dev | **Priority:** High

The structured company wiki — machine-readable, AI-indexed.

- Define schema for all software engineering concepts: repos, services, environments, people, processes, logging, monitoring
- Browse/search the knowledge graph visually
- AI indexes and files new knowledge automatically (no manual organization)
- Schema editor (protobuf/JSON Schema based)
- Link nodes to tasks, repos, services, people
- Versioned and distributed via RobOS Distributed Store (git-backed)

**IPC:** Context Manager, Task Manager, all apps can query EKGraph

---

### 8. Workflow Studio
**Category:** Dev | **Priority:** Medium

Design and customize task workflows.

- Visual workflow editor: define stages, gates, transitions
- Default workflow: setup → questionnaire → AI draft → review → quiz → PR → CI → fix cycles → approve → merge → deploy
- AI can suggest/create workflows based on team patterns
- Workflows saved to RobOS distributed config
- Per-project workflow overrides

**IPC:** Task Manager (consumes workflows)

---

### 9. PR Review Board
**Category:** Dev | **Priority:** High

AI-assisted code review experience.

- List open PRs with review status
- AI-assisted review: summarize changes, flag issues, suggest improvements
- Dev Lead mode: AI creates e2e test and sets breakpoint at relevant code for hands-on review
- Review-fix cycle tracking (linked to task workflow)
- Approve/request changes directly from the app

**IPC:** Task Manager, Git Projects, Dev Tools

---

### 10. CI Monitor
**Category:** Dev | **Priority:** Medium

Monitor CI/CD pipelines and deployments.

- Watch CI runs for open PRs (GitHub Actions, Jenkins, etc.)
- Real-time build/test logs
- Deployment tracking per task, per developer
- AI agent can auto-fix CI failures and push fixes
- Notify when deployments complete or fail

**IPC:** Task Manager, AI Agent Manager

---

### 11. Dev Central (Dashboard)
**Category:** Dev | **Priority:** Medium

Daily developer dashboard — the home screen.

- Sprint board summary (from task server)
- Active tasks with workflow progress
- Open PRs and their CI status
- AI standup summary (what you did yesterday, what's planned)
- Blocker radar
- Calendar integration
- Quick links to active workspaces

**IPC:** Task Manager, PR Review Board, CI Monitor, Workspace Manager

---

### 12. Git Projects
**Category:** Dev | **Priority:** High

Repository manager with AI-powered setup.

- Clone, pull, manage local repos
- AI generates dev-setup instructions from repo analysis
- Monaco code editor for quick edits
- Terminal runner
- Open in IDE

**IPC:** Workspace Manager, Dev Tools

---

### 13. Work Journal
**Category:** Journal | **Priority:** Medium

Git-backed developer journal with AI activity feed.

- Auto-capture IDE and OS events
- Daily entries with AI-generated summaries
- Shareable with team via distributed store
- Voice dictation for quick notes
- Link journal entries to tasks

**IPC:** Dev Tools, Task Manager, Voice Dictation

---

### 14. Voice Dictation Service
**Category:** System | **Priority:** Medium

Local, offline speech-to-text that feeds into any focused RobOS text area.

- Uses local open-source STT model (Whisper, Vosk, etc.) — no network required
- Streams transcribed text to whatever app/field has focus
- RobOS apps show voice input indicator on AI text areas
- Conversations with AI get converted to EKGraph nodes

**IPC:** All apps (system service), EKGraph, Context Manager

---

### 15. Manager Dashboard
**Category:** System | **Priority:** Low

Management reporting and monitoring.

- Track task progress at granular level across team
- Deployment stats per developer, per task
- Configurable reports — AI can create new report types
- System health monitoring
- AI can create new monitors on demand

**IPC:** Task Manager, CI Monitor, EKGraph

---

### 16. Stage Demo Viewer
**Category:** Dev | **Priority:** Low

AI-powered demo of product changes in staging.

- AI generates demo walkthroughs for each change reaching staging
- Product owners can review before production
- Linked to tasks and PRs
- Screen recording / annotated screenshots

**IPC:** CI Monitor, Task Manager

---

### 17. RobOS Config Manager
**Category:** System | **Priority:** High

Manage distributed, versioned RobOS configuration.

- All team-shared configs stored in git (RobOS Distributed Store)
- Browse/edit config: task server settings, workflows, EKGraph schema, AI preferences
- Version history with diff view
- Sync/pull team configs
- Interface supports multiple backends (git default, could swap to other)

**IPC:** All apps read config from here

---

---

### 18. Desktop Manager
**Category:** System | **Priority:** High

System tray IPC hub that manages app lifecycle.

- Runs in system tray, manages app launch/kill/restart
- Unix socket IPC at /run/user/{uid}/robos-dm.sock for inter-app communication
- APP_REGISTRY defines all known apps with categories and keep-alive flags
- Keep-alive apps (Toast Daemon, Notifications) auto-restart on crash
- Process health monitoring

**IPC:** All apps communicate through Desktop Manager

---

### 19. Toast Daemon
**Category:** System | **Priority:** Medium

System-wide overlay notification toasts.

- Keep-alive background Electron process
- Top-right corner overlay toasts (info/warning/error/success)
- Other apps send via robos-notify CLI or IPC
- Auto-dismiss timers, click actions, custom icons

**IPC:** Desktop Manager, robos-cli

---

### 20. Notifications
**Category:** System | **Priority:** Low

Notification history viewer.

- Reverse-chronological list of all past notifications
- Filter by app, type, date range
- Read from ~/.config/robos/notifications.json

**IPC:** Toast Daemon

---

### 21. Security Setup
**Category:** Security | **Priority:** High

First-run GPG + SSH key initialization.

- Generate RSA-4096 GPG key, Ed25519 SSH key
- Initialize pass password store
- Add SSH key to GitHub
- Guided wizard with verification at each step

**IPC:** Pass Manager, Git Projects

---

### 22. Pass Manager
**Category:** Security | **Priority:** Medium

GUI for GPG-encrypted password store (pass).

- Browse password tree, copy to clipboard, add/edit/delete
- Generate random passwords
- Auto-clear clipboard after 45 seconds
- Pass Unlock dialog on login for all-day GPG cache

**IPC:** Security Setup

---

### 23. RobOS Preferences
**Category:** System | **Priority:** High

System-wide settings.

- AI provider credentials (Claude, GitHub tokens)
- Default IDE, theme, notification settings
- Keyboard shortcuts, task server defaults
- Voice dictation model selection
- Settings stored in ~/.config/robos/settings.json

**IPC:** All apps read preferences

---

### 24. Search Index
**Category:** System | **Priority:** Medium

File system indexer for @-mention search in AI text areas.

- Indexes: file names, directories, git repos, .desktop apps
- Fast fuzzy search via pre-built index
- Incremental updates on file change (inotify)
- Powers @-mention autocomplete across all RobOS AI inputs

**IPC:** All apps with AI text areas

---

### 25. Dev Harness
**Category:** Dev | **Priority:** Medium

Test RobOS apps outside the VM.

- Sandbox home directory with stub CLI binaries
- Scenarios: all-good, no-gh-auth, no-ssh-key, all-broken, etc.
- Usage: `node packages/dev-harness/harness.js --app <app-id> --scenario <scenario>`

**IPC:** None (development tool)

---

### 26. robos-ui Shared Component Library
**Category:** Dev | **Priority:** High

Dark-theme Web Components library for all RobOS apps.

- Buttons, inputs, dropdowns, modals, tabs, cards, tables, toasts, progress bars
- RobOS design tokens (--bg-primary, --accent, etc.)
- Vanilla JS Web Components (no framework)

**IPC:** None (imported by all apps)

---

### 27. People Directory
**Category:** People | **Priority:** Low

Team member lookup.

- Name, role, GitHub username, Slack handle, timezone
- Search and filter
- Recent activity (PRs, tasks)
- Data from EKGraph people nodes

**IPC:** EKGraph

---

### 28. MCP Server
**Category:** AI | **Priority:** Medium

Model Context Protocol server for Claude Code integration.

- Exposes RobOS data: active task, EKGraph, workspace state, CI status
- Tools: create-task, advance-workflow, open-file-in-ide, run-tests
- Deep Claude Code ↔ RobOS workflow integration

**IPC:** Task Manager, EKGraph, Workspace Manager

---

### 29. IntelliJ Plugin
**Category:** Dev | **Priority:** Medium

Kotlin/Java IntelliJ platform plugin.

- IPC HTTP server on port 63343
- Endpoints: open-project, open-file, navigate, run, stop, workspace
- RobOS tool window showing active task and workflow stage
- Run configuration injection, notification bridge

**IPC:** Workspace Manager, Task Manager

---

## Shared Libraries

### Already Built
| Library | Purpose |
|---------|---------|
| `robos-lib` | Categories, .desktop parsing, displayName, shared utils |
| `robos-icons` | SVG icon registry for all apps |
| `robos-lib/dom-snapshot` | Playwright-style debugging for Electron apps |

### To Build
| Library | Purpose |
|---------|---------|
| `robos-ui` | Dark-theme Web Components library |
| `robos-store` | Distributed git-backed versioned config store |
| `robos-task-client` | Generic task server client (Jira, GitHub Issues, Linear) |
| `robos-ai-client` | AI agent session management (Claude Code, Copilot) |
| `robos-ekgraph` | Knowledge graph query/mutation API |
| `robos-voice` | Local STT service integration |
| `robos-ipc` | Cross-app IPC bus (events, queries between apps) |
| `robos-cli` | CLI tools (robos-notify, robos-active-task, robos-journal-append) |

---

## Build Order (recommended)

### Phase 1 — Foundation ✓
- [x] App Launcher
- [x] Dev Tools (19 tools, categories, install/uninstall)
- [x] DOM Snapshot debugging

### Phase 2 — Parallel (agents can work all of these simultaneously)
- [ ] RobOS Config Manager + robos-store library
- [ ] Task Servers + robos-task-client library
- [ ] Security Setup + Pass Manager
- [ ] Desktop Manager + Toast Daemon
- [ ] robos-ui shared components
- [ ] Dev Harness
- [ ] EKGraph schema + data store
- [ ] RobOS Preferences
- [ ] Search Index

### Phase 3 — Core Workflow (after Phase 2)
- [ ] Task Manager (kanban + list views)
- [ ] Workspace Manager
- [ ] Git Projects

### Phase 4 — AI Integration (after Phase 3)
- [ ] AI Agent Manager + Claude Code integration
- [ ] Context Manager
- [ ] MCP Server
- [ ] AI Questionnaire, Draft, Quiz stages

### Phase 5 — Review & Deploy (after Phase 4)
- [ ] PR Review Board + AI review assistant
- [ ] CI Monitor + AI auto-fix
- [ ] Workflow Studio
- [ ] IntelliJ Plugin

### Phase 6 — Polish
- [ ] Dev Central (Dashboard)
- [ ] Work Journal
- [ ] Voice Dictation Service
- [ ] Manager Dashboard
- [ ] People Directory
- [ ] Stage Demo Viewer
- [ ] Notifications history
- [ ] robos-cli tools
