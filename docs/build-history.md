---
layout: default
title: Build History
nav_order: 4
---

# RobOS Build History

> A chronological record of every prompt and feature decision that built RobOS — from blank repo to full SDLC operating system.

This document captures the prompts, intent, and outcomes of each major development session. It exists so that any future rebuild, refactor, or extension can understand *why* things were built the way they were, not just *what* was built.

---

## The Original Prompt

The entire project was initiated with a single prompt in March 2026:

> *"I want to create a copilot instructions for this currently blank workspace — here we are going to create sdlcOS which is basically a super software developer lifecycle centric operating system. MVP is any developer friendly version of linux set up with a desktop… the entire desktop experience is limited to working jiras as a developer, reviewing the PR as a reviewer, merging the PR, managing the jiras tracking along the way. We will be focused on trying to make multiple desktops loaded with tickets assigned to the user in sprint. So you assign a jira, the agent AI will build the desktop workspace, load cursor, fire up the react server, connect to vpn, etc and then get to the issue, use the steps in the jira to reproduce the problem, create a working attempt to fix the issue… we will support dev manager role, developer role. We will have a feature to 'become a feature reviewer'. The AI will build little training exercises, and sample PR reviews. MCP is a very powerful thing. MCP fuels this entire thing via claude/etc."*

A second prompt followed shortly after, adding ambient and social features:

> *"Some iteration — add camera integration to track time actually focused on jiras. Some other iteration — add audio agent personality able to talk to you and remind you of stuff. Calendar will integrate with google, outlook etc and when a meeting comes it is much more 'take over your PC'. Tickets are encouraged to be worked by multiple people. Multiple workflows will be created so that the notifications within the operating system can toast outlook reminder-like things for PR review needed, developer reported issue with something you worked on, bi-daily schedules of PRs that need merged or closed if they get too old, daily stats available in a simple desktop widget value added to company this month. Blockers detected. etc."*

These two prompts defined the entire product vision and became the `copilot-instructions.md` that guides every AI session.

---

## Phase 1 — MVP: QEMU VM + Openbox Desktop
*Checkpoints 1–3 · Git: `e7a9e38` → `38bb937`*

### Prompt intent
Get any working Linux desktop running in a VM with a custom AI agent launcher. Prove the "OS as an AI agent shell" concept before building real apps.

### What was built

**Checkpoint 1 — QEMU sdlcOS Desktop MVP Working**
- Chose Ubuntu 22.04 cloud image as the base (no installer needed — first boot via cloud-init)
- `infra/desktop/build.sh` — downloads base image, resizes to 20 GB qcow2, builds cloud-init ISO
- `infra/desktop/run.sh` — launches QEMU with virtio display, SSH port forward (`:2222`), optional KVM
- `infra/desktop/cloud-init/user-data` — provisions the entire OS on first boot: packages, users, files, runcmd
- `infra/desktop/gen-userdata.py` — central build script that embeds source files into user-data YAML
- Openbox WM + LightDM + tint2 taskbar
- GTK3 Agent Control Panel (Python) — first RobOS UI, showing a placeholder job list

**Checkpoint 2 — RobOS VM Desktop Apps and Fixes**
- Added Tilix terminal + zsh + oh-my-zsh as default shell
- Added VS Code from Microsoft APT repo
- Added Chromium browser

**Checkpoint 3 — Splash Checklist, Chrome, UI Fixes**
- Two-phase boot splash: `bootcmd` ASCII banner loop → `install_splash.py` Python checklist
- Plymouth boot theme with RobOS logo and progress bar
- Switched Chromium → Google Chrome (`.deb` package)
- `robos-chrome` wrapper for `--use-system-title-bar`
- GTK3 dark theme (`gtk.css`) to fix white window border bleed
- `~/.Xresources` for DPI/font antialiasing

---

## Phase 2 — Control Panel + GitHub Integration
*Checkpoints 4–6 · Git: `53320b6` → `4c88c4f`*

### Prompt intent
> *"The mode switcher should switch between Developer, Dev Manager, and Reviewer modes and reload the tint2 taskbar with the appropriate apps for each role."*

### What was built

**Checkpoint 4 — Mode Switcher and Generic Task Servers**
- Role mode switcher: Developer / Dev Manager / Reviewer
- tint2 taskbar reloads per-role with appropriate app launchers
- GitHub Issues added as a task server (alongside Jira)
- Task servers made a generic interface (not Jira-specific)

**Checkpoint 5 — RobOS Panel Redesign and Theme Polish**
- RobOS Control Panel rebuilt with tree navigation (replaced flat GTK3 panel)
- Dark Openbox window theme polished
- GitHub CLI (`gh`) installed + Copilot CLI extension bootstrapped

**Checkpoint 6 — Copilot CLI, Agents Panel, System Monitor**
- Copilot CLI launcher in tint2
- Jobs page redesigned
- GNOME System Monitor added with `GTK_CSD=0` flag (so xfwm4 draws its borders)
- Live tint2 taskbar reload on mode switch working

---

## Phase 3 — First Electron Apps: Issue Manager + Dev Central
*Checkpoints 7–9 · Git: `2e88017` → `c6d362c`*

### Prompt intent
> *"We need a real issue tracking UI, not a GTK placeholder. And a developer dashboard — like a cockpit view of your day."*

### What was built

**Checkpoint 7 — Issue Progress Manager and GitHub Workflow**
- `issue-progress.py` — GTK app tracking issues through a formal workflow state machine (later replaced)
- GitHub Issues dynamic query system with multi-criteria filtering
- xfwm4 window manager replacing Openbox (smoother compositing, better theme support)

**Checkpoint 8 — App Launcher, Dev Central, Workflow Types**
- `dev-central` — first Electron app: developer status dashboard (PRs, issues, active task)
- Issue Types + Workflow configuration in Task Servers panel
- AI "Generate Script" button switched from `gh copilot suggest` (interactive) → GitHub Models API

**Checkpoint 9 — Agents Manager, AI Generation, gh copilot CLI**
- `issue-manager` — Electron app fully replacing the GTK issue progress app
- `agents-manager` — new Electron app for managing Copilot CLI agent sessions
- AI backend switched from GitHub Models API → `gh copilot` CLI subprocess
- All "Copilot" references renamed to "AI" / "AI agent" in UIs
- Back button removed from all window titlebars

---

## Phase 4 — Context, Git Projects, Emoji
*Checkpoints 10–11 · Git: `c6d362c` → `2400203`*

### Prompt intent
> *"The AI needs to know what repos we're working in. We need a way to give it context — which GitHub repos are relevant, which local folders."*

### What was built

**Checkpoint 10 — Context Manager, Issue Manager Rebuild**
- `context-manager` — new Electron app for managing AI context sources (GitHub repos + local folders)
- Issue Manager completely rebuilt as a clean Electron app with proper Markdown rendering
- Emoji rendering fixed across all apps (Noto Color Emoji font installed)
- Git Projects: SSH URL display, org repo loading

**Checkpoint 11 — Context Manager Polish, AI Generation, Preview**
- Context Manager: AI-generated `AGENTS.md` + Copilot Instructions from repo list
- Mermaid knowledge graph tab in Context Manager
- File previews rendered as Markdown with Raw toggle
- `gh copilot` CLI flags fixed (`--silent` to strip noise from output)
- ANSI code stripping before filtering tool log lines

---

## Phase 5 — Work Journal + Workflow Studio
*Checkpoints 12–13 · Git: `62bdb9e` → `23f293d`*

### Prompt intent
> *"I want a work journal backed by a real GitHub repo. And the issue manager is really more of a workflow studio — it manages workflow types and issue lifecycle states."*

### What was built

**Checkpoint 12 — Work Journal, Workflow Studio, Journal Integration**
- `work-journal` — new Electron app with git-backed daily Markdown journal, auto-push on save
- Issue Manager renamed → **Workflow Studio** with sidebar nav and Workflow Types config
- Per-app context scopes added to Context Manager
- Empty git push guard (skip commit when nothing changed)

**Checkpoint 13 — Branding, Icons, Right-Click Menu, Dogfood**
- All 8 Electron apps branded "RobOS {App Name}"
- Custom SVG-derived window icons for every app
- tint2 taskbar right-click context menu (shows only clicked window, not all)
- Task Planner: "Generate Sample" button replaces auto-generate on startup
- `dogfood/` directory created — tracking dogfood observations while building RobOS on RobOS

---

## Phase 6 — Agent Scheduler + Notifications
*Checkpoints 14–18 · Git: `b095eab` → `90e4fca`*

### Prompt intent
> *"I want to be able to schedule AI agents to run automatically — daily standup summary, nightly things. And I want a proper notification system with toast popups."*

### What was built

**Checkpoints 14–15 — Agent Scheduler, Notifications**
- `agent-scheduler` — new Electron app with cron-based AI job scheduling, execution logs, per-job notifications
- `notifications` — new Electron app for notification history viewer
- `robos-toast` daemon — always-running Electron process polling `notifications.json`, stacking frameless toast windows at top-right
- RobOS CLI toolkit with context injection for all AI agent invocations
- `AGENTS.md` and `~/.config/robos/robos-instructions.txt` seeded on install

**Checkpoints 16–18 — Scheduler Fixes**
- Root cause: `window.scheduler` conflicts with Chromium's native Scheduling API in Electron 30 — contextBridge failed silently
- Fix: renamed all `window.scheduler` refs to `window.agentScheduler`
- Workflow Studio navigation bug fixed
- AI-assisted workflow type generation added
- Scheduler "Run Now" fixed (was using interactive `gh copilot suggest` instead of agent CLI)

---

## Phase 7 — Cross-App Event Logging + File Explorer
*Checkpoints 19–20 · Git: `7ed350f` → `62bdb9e`*

### Prompt intent
> *"Every AI action in every app should log to the work journal. The journal should show an AI activity feed — what did all my AI agents do today."*

### What was built

**Checkpoint 19 — Journal AI Activity Feed, Cross-App Event Logging**
- Shared `~/.config/robos/journal-events.json` — all 6 AI-capable apps write events here
- Work Journal "AI Activity Feed" tab reads this file and renders a timeline
- Static RobOS context injected into every AI agent invocation (agents know they're inside RobOS)

**Checkpoint 20 — File Explorer, Workflow Studio Drafts**
- `file-explorer` — new Electron app with dark-themed file browser
- Single-instance via `app.requestSingleInstanceLock()`; mailbox navigation via `fs.watch` on `~/.config/robos/file-explorer-nav.json`
- Workflow Studio: draft save/load, autosave, config path display, repo destination badges

---

## Phase 8 — TPS Workbench + Toast + UI Library
*Checkpoints 21–23 · Git: multiple*

### Prompt intent
> *"I want a technical problem solving workbench — a place to do AI-assisted technical spikes with proper session management. And the toasts need to actually work."*

### What was built

**Checkpoint 21 — TPS Workbench, Toast Notifications**
- `tech-workbench` — new Electron app with 4-phase TPS workflow (Define → Research → Solution → Document)
- Toast daemon fixed: `knownIds` Set prevents duplicate toasts, severity-coloured borders, action buttons

**Checkpoint 22 — RobOS UI Library, TPS Integration, Clone-Now**
- `packages/robos-ui/` — shared web component library (`<robos-ai-textarea>`) with no build step
- `robos-ai-textarea` integrated into TPS Workbench with autosave and `@file` path autocomplete
- Git Projects "Add Project" dialog: "Clone project now" feature

**Checkpoint 23 — Search Index, Fuzzy @-Search**
- `search-index` — new background Electron service indexing file paths from configured roots
- `robos-ai-textarea` queries Search Index on `@` keypress — fuzzy autocomplete dropdown
- File Explorer: RobOS-specific sidebar sections, open-folder button fix

---

## Phase 9 — Workflow Studio Maturity
*Checkpoints 24–29 · Git: multiple*

### Prompt intent
> *"Workflow Studio should be a proper task breakdown tool — AI analyses a GitHub issue, breaks it into tasks, creates them, manages their lifecycle."*

### What was built

**Checkpoints 24–26 — Breakdown, Labels, Issue Status**
- Fixed systematic `contextIsolation` bug — inline `onclick`/`onchange` handlers were silently blocked
- Workflow Studio: full task breakdown flow with repo detection, label management, GitHub issue creation
- Issue status icons in breakdown list
- `robos-ai-textarea` upgraded: show-commands toggle, fuzzy file search

**Checkpoint 27 — Repo AI Detection, Resizable Panels**
- Repo selection made intentional: AI detects relevant repos in the breakdown content instead of auto-selecting all
- Resizable panels added to Workflow Studio
- Ctrl+Enter submit in AI textarea

**Checkpoints 28–29 — Journal Polish, System Jobs**
- Work Journal: auto-save, archive feature, entry counter, context source picker, blank welcome state
- Agent Scheduler: System Scheduled Jobs tab (Daily Developer Summary built-in)

---

## Phase 10 — Security, People, Groups
*Checkpoints 30–33 · Git: multiple*

### Prompt intent
> *"We need GPG/pass secrets management — proper desktop GUI. Also a people directory and team groups for shared dev settings."*

### What was built

**Checkpoint 30 — GPG Pass Initializer, Task Servers**
- `security-setup` — Electron wizard for GPG key creation + `pass init`
- `task-servers` — Electron app for configuring Jira/GitHub connection profiles
- Copilot quota desktop widget via Conky

**Checkpoint 31 — Pass Manager, Daily Unlock, Sticky Toast**
- `pass-manager` — Electron GUI for the `pass` password store
- `pass-unlock` — daily GPG passphrase unlock dialog (`gpg-preset-passphrase`, `alwaysOnTop`)
- Sticky toast: `urgent` severity toasts persist until manually dismissed

**Checkpoint 32 — People Directory, Group Dev Settings**
- `people-directory` — Electron app with GitHub-enriched team profiles
- `group-dev-settings` — Electron app for shared dev settings with team GitHub repo sync

**Checkpoint 33 — Multi-Tracker, Groups, Auth, Profile Widget**
- `robos-auth` — Electron app for OAuth provider config and identity management
- Task servers made multi-tracker (Jira + GitHub simultaneously)
- Developer group associations (group → git projects)

---

## Phase 11 — Desktop Task System + App Restructuring
*Checkpoints 34–35 · Git: multiple*

### Prompt intent
> *"Task Planner is too standalone. The ticket assignment should be part of the desktop itself — 4 desktop slots corresponding to 4 active tickets."*

### What was built

**Checkpoint 34 — Desktop Tasks, Action Menu, Git Secrets**
- Task Planner removed as standalone app
- Dev Central: 4-desktop ticket assignment system replacing "Current Task"
- Git Projects: Secrets tab, AI dev setup tab scaffolding
- Action menus in Dev Central

**Checkpoint 35 — RobOS Apps, Agents Settings, Control Panel Removal**
- `robos-applications` — new Electron app for managing the application registry
- RobOS Agents: new Settings tab (Copilot settings + Agents config)
- RobOS Control Panel (Python `agent_panel.py`) fully removed
- tint2 pager / ticket desktop system wired up

---

## Phase 12 — Copilot Lib + Dev Setup Scripts
*Checkpoints 36–41 · Git: multiple*

### Prompt intent
> *"All AI calls need to go through a single shared library so we can swap providers later. And git-projects needs a proper dev setup experience — AI generates the scripts, you can run them directly from the app."*

### What was built

**Checkpoints 36–38 — Copilot Lib, Swim Lane**
- `robos-copilot-lib.js` — shared AI invocation library; all apps import this instead of spawning `gh copilot` directly
- Copilot Swim Lane desktop overlay — floating widget showing live streaming agent sessions
- All AI calls migrated from `claude --print` to `gh copilot suggest` via shared lib
- App renames, categorized tint2 app folder launcher

**Checkpoints 39–41 — Git Projects Dev Setup Tab**
- Git Projects Local Dev Setup tab built out end-to-end:
  - AI generates 4 scripts: Setup, Start, Test, E2E
  - Monaco editor (bash syntax highlighting) for each script
  - Collapsible panels → clean tabbed interface
  - `robos-ai-textarea` with `@file` autocomplete for prompt inputs
  - Refine buttons for iterating AI-generated scripts
- `robos-preferences` — new Electron app scaffolded

---

## Phase 13 — IDE Manager + Workspace Manager
*Checkpoints 42–45 · Git: `60cd2a4` → `23e6816`*

### Prompt intent
> *"We need to manage IDEs — install IntelliJ, VS Code, etc. And a workspace manager to quickly open any project in any IDE. The RobOS IntelliJ plugin needs to be installable from within the app."*

### What was built

**Checkpoint 42 — Workspace Manager, IDE Manager**
- `workspace-manager` — Electron app for scanning and opening local workspaces in any IDE
- `ide-manager` — Electron app for installing/managing IDEs and the RobOS IntelliJ plugin
- `copilot-session-viewer` — Electron app for replaying and inspecting Copilot CLI session logs
- Monaco editor fix: multiple instances + loading state

**Checkpoint 43 — Lang Manager, IntelliJ Plugin Install**
- `lang-manager` — Electron app for installing/switching language runtimes (Node, Python, Java, Go)
- IDE Manager: IntelliJ plugin install support
- Group Dev Settings: Cockpit integration

**Checkpoints 44–45 — Blank Windows Fix, Icons, Typeahead**
- **Critical fix**: all Electron apps showing blank windows in QEMU VM
  - Root cause: missing `--disable-dev-shm-usage` flag (shared memory too small in VM)
  - Fix: added to all app launch scripts
- `@` file mention typeahead added to Git Projects
- tint2 taskbar broken by multiple instances — fixed by proper restart sequence
- App icon fixes (robot SVG for Agents, not emoji)

---

## Phase 14 — Run in IntelliJ via Plugin IPC
*Checkpoints 46–49 · Git: `921278b` → `6312ee0`*

### Prompt intent
> *"We called them 'Run in IntelliJ' because we are going to use our RobOS IntelliJ plugin to interact with IntelliJ — able to open the workspace, open the source file, run in terminal as it goes."*
>
> *"Fire up IDE and wait up to 3 minutes pinging with a pulse of a few seconds for the open-project web service to return."*

### What was built

**Checkpoint 46 — App Titles, IDE Uninstaller, Plugin UI**
- IDE Manager: uninstall button for JetBrains IDEs
- Plugin UI simplified (removed source/build-path concept)
- App title standardisation pass

**Checkpoints 47–48 — Plugin Path Fix, Run IDE Dropdown**
- JetBrains plugin path fix: `~/.local/share/JetBrains/IdeaIC<Version>/` (no `plugins/` subdir)
- `pgrep -f '/opt/idea'` fix (using path anchor to avoid matching own process)
- Shell var escaping in JS template literals (`\$()`, `\${VAR}`)
- Generic IDE dropdown scaffolded in Git Projects

**Checkpoint 49 — Run in IntelliJ IPC, Docs Foundation**
- Run in IntelliJ replaces the generic dropdown entirely
- Git Projects now has two run buttons per script: **▶ Run in Terminal** + **🧠 Run in IntelliJ**
- `run-in-intellij` IPC handler: writes `.idea/runConfigurations/*.xml` into the git project dir, calls RobOS IntelliJ plugin HTTP IPC (`localhost:63343`)
- IntelliJ startup wait: polls `GET /robos/health` every 3 s up to 180 s, shows pulsing progress banner
- Critical bug fix: `document.getElementById('nonexistent').onclick = fn` was crashing entire `selectProject()` — removed 4 dead button references left from dropdown removal
- Initial docs folder created: `what-we-built.md`, `boot-splash.md`, `app-development.md`, `intellij-plugin.md`

---

## Phase 15 — Documentation
*Current session · Git: `dad06d9` → `c77ba55`*

### Prompt intent
> *"We need to start building out documentation. Create a general 'this is what we've built so far'. We will need to be able to refer to these documents when rebuilding anything, fixing stuff, etc."*
>
> *"Create a folder in docs robos-app-suite and document each app in the suite. Use a common documentation strategy from a successful open source project. Each app should follow the same format. These docs should be useable on our GitHub Pages."*
>
> *"We have 2 working builds — robosos built on that weird minimal window system, robos-gnome which is basically Ubuntu from the internet with some modifications. We need to document each operating system type prominently with a very important section: 'what is different from the base image' describing each customization we made."*
>
> *"If you could use some of the history of the prompts we've made since we made the roboto-os directory… it would be a useful thing to show all the prompts we did to build all the components we made so far and add it to the documentation."*

### What was built

- `docs/what-we-built.md` — master project overview
- `docs/boot-splash.md` — two-phase splash deep dive
- `docs/app-development.md` — Electron app dev guide
- `docs/intellij-plugin.md` — IntelliJ plugin IPC API reference
- `docs/robos-app-suite/` — 26 app documentation files using [Diátaxis](https://diataxis.fr/) framework (Overview, Features, Usage, IPC Reference, Data & Files)
- `docs/os-builds/` — robosos and robos-gnome build docs with complete "what is different from base image" change logs
- `docs/_config.yml` + `docs/Gemfile` — Jekyll/Just the Docs for GitHub Pages
- `.github/workflows/docs.yml` — auto-deploy to GitHub Pages on push
- `docs/build-history.md` — this file

---

## Key Technical Decisions Log

| Decision | Rationale | Session |
|----------|-----------|---------|
| Ubuntu 22.04 cloud image + cloud-init | No installer, reproducible first boot, cached base image | CP 1 |
| Openbox → xfwm4 WM | Better compositing, more customizable theme, smoother feel | CP 7 |
| GTK3 apps → Electron apps | Richer UI, easier cross-app IPC via Node.js, better dark theming | CP 8 |
| `gh copilot` CLI subprocess (not Anthropic API directly) | Works with user's existing GitHub Copilot subscription; no API key management | CP 9 |
| File-based IPC (`~/.config/robos/*.json` + `fs.watch`) | Cross-app communication without a daemon; zero dependencies | CP 20 |
| `contextIsolation: true`, never `nodeIntegration: true` | Electron security best practice; contextBridge is the only bridge | All |
| `--disable-dev-shm-usage` flag required | QEMU VM `/dev/shm` too small; without this flag renderer windows are blank | CP 44 |
| `window.scheduler` → `window.agentScheduler` | `window.scheduler` conflicts with Chromium's native Scheduling API in Electron 30 | CP 16 |
| `robos-copilot-lib.js` shared AI library | Single choke point to swap AI providers (Copilot → Cursor → Claude) in future | CP 37 |
| IntelliJ plugin IPC on port `63343` | JetBrains built-in HTTP server port; plugin registers handlers at startup | CP 49 |
| Scripts stored in `~/.config/robos/`, never git-committed | Developer scripts are personal/environment-specific, not repo artifacts | CP 39 |
