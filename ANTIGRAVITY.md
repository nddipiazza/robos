# ANTIGRAVITY.md

This file provides guidance to Antigravity AI pair programmer when working with code in this repository.

# RobOS — AI-First Software Development Operating System

RobOS is a developer-first operating system and IDE ecosystem that automates the entire Software Delivery Lifecycle (SDLC) using AI. From the moment you log in, every surface is optimized for AI-assisted software development.

## Vision

Every developer interaction — picking up a ticket, understanding a bug, reviewing a fix, shipping code — is augmented by AI. RobOS eliminates context-switching overhead by deeply integrating task management, code intelligence, and AI agents into the OS and IDE layers.

## Major Components

### 1. RobOS Gnome — The Desktop OS

A purpose-built Ubuntu-based Linux desktop environment where every app, panel, and widget serves the SDLC.

**OS Stack:**
- Ubuntu 24.04 LTS base (QEMU/KVM virtual machine, cloud-init provisioned)
- GNOME desktop environment
- LightDM auto-login, Tilix terminal, zsh + oh-my-zsh
- Custom dark navy/cyan theme throughout

**Desktop Components:**
- **App Launcher** — searchable icon grid of all RobOS applications
- **Desktop Panels** — GNOME panel with RobOS app launchers and systray widgets
- **Custom Desktop Widgets** — sprint status, PR health, calendar, blocker radar
- **Background Tasks** — agent scheduler, toast daemon, clipboard sync, notification engine
- **Suite of Apps** — 30+ Electron apps covering the full SDLC (see App Suite below)

**VM Specs:**
- 16 GB RAM, all host CPUs, 100 GB sparse qcow2 disk
- SSH (port 2224), VNC (port 5910), SPICE (port 5932)
- Fully reproducible via cloud-init (stateless first-boot provisioning)

### 2. RobOS IDE — AI-Powered Development Environment

RobOS IDE brings the same AI-first experience into the IDE itself. The core concept:

**Task-Driven Workspaces:**
- Each Task on the task server maps to its own IDE workspace
- When a developer picks up a task, the workspace is automatically provisioned:
  1. The correct branch is checked out
  2. Dev environment is spun up (servers, databases, dependencies)
  3. The workspace is brought to a **breakpoint where the issue reproduces**
  4. The developer sees the reproduction, understands the problem
  5. AI presents its analysis and proposed solution plan
  6. The developer **reviews the AI's plan** before any code changes
- This inverts the traditional workflow: instead of "developer investigates, then codes", it becomes "AI investigates and proposes, developer reviews and approves"

**IDE Plugin (IntelliJ-based):**
- IPC HTTP server (port 63343) for communication with RobOS desktop apps
- Endpoints: health, status, open-project, open-file, navigate, run, stop, notify, workspace
- Workspace tool window showing active ticket context, branch, and collaborators
- Run configuration injection (`.idea/runConfigurations/` XML generation)

### 3. RobOS IDE Plugins

Plugins that extend the IDE with RobOS capabilities:
- Task server integration (Jira, GitHub Issues)
- AI context injection (MCP-powered)
- Workspace provisioning automation
- Code review and plan approval UI
- Agent session management within the IDE

## App Suite

All apps are Electron + vanilla JavaScript. They require `--no-sandbox --disable-gpu --disable-dev-shm-usage` flags in the QEMU VM.

### Core Apps (panel-visible)
| App | Purpose |
|-----|---------|
| **App Launcher** | Searchable grid of all installed RobOS apps |
| **Dev Central** | Daily dashboard: sprint board, PR health, calendar, AI standup, blocker radar |
| **Issue Manager** | GitHub Issues client with Kanban board, AI issue breakdown |
| **Git Projects** | Repo manager with AI dev-setup generation, Monaco editor, terminal/IDE runners |
| **Agents Manager** | Manage Copilot CLI / Antigravity / Gemini / Claude agent sessions |

### Supporting Apps
| App | Purpose |
|-----|---------|
| **Software Center** | Install and manage IDEs, CLI tools, and cloud SDKs |
| **Workspace Manager** | Discover and open local workspaces in any IDE |
| **Lang Manager** | Language runtime management (Node, Python, Java, Go, Rust) |
| **Context Manager** | Curate AI context sources (files, URLs, repos, tickets) |
| **Tech Workbench** | Technical spike research with AI assistance |
| **Work Journal** | Git-backed developer journal with AI activity feed |
| **Group Manager** | Manage GitHub organizations and teams — view members, roles, and repo access |
| **Pass Manager** | GUI for GPG-encrypted password store |
| **Workflow Studio** | Workflow and issue lifecycle management |
| **Agent Scheduler** | Background cron-based AI agent jobs |
| **Task Servers** | Jira / GitHub task server configuration |
| **Claude Console** | Enhanced Claude Code GUI |
| **File Explorer** | Dark-themed file browser |
| **Icon Manager** | Manage and customize RobOS app icons |
| **Notifications** | Notification history viewer |
| **Toast Daemon** | System-wide overlay toast notifications |
| **Security Setup** | First-run GPG + SSH key initialization |
| **Search Index** | File system indexer for @-search in AI textareas |
| **RobOS Preferences** | System-wide settings (credentials, AI model prefs) |

## Shared Libraries

Libraries are **NOT npm dependencies** — they are deployed to `/usr/local/share/robos/` on the VM and consumed via absolute path requires:
```js
const { registerSnapshotIPC, startDebugServer } = require('/usr/local/share/robos/robos-lib/dom-snapshot');
```
Always wrap these requires in try/catch for dev-harness compatibility (libs may not be installed locally).

- **robos-lib** — `.desktop` file parsing (`parseDesktopFile`, `loadRobOSApps`, `groupByCategory`), app categories, DOM snapshot debug server
- **robos-icons** — Icon registry: `BUILTIN_APPS` array, `getIcon()`, `getAllIcons()`. Format: `{ appId, label, category, iconSvg }`

## Development

### Prerequisites
- QEMU/KVM with `/dev/kvm` access
- Node.js 20+ and npm
- For IntelliJ plugin: JDK 17+ and Gradle

### Testing Apps (Dev Harness)
Primary testing method — run apps outside the VM:
```bash
node packages/dev-harness/harness.js --app <app-id> --scenario <scenario>
node packages/dev-harness/harness.js --list-apps
node packages/dev-harness/harness.js --list-scenarios
```
Scenarios: `all-good`, `no-gh-auth`, `no-ssh-key`, `ssh-not-on-github`, `scope-missing`, `git-config-missing`, `all-broken`

### Building the VM
```bash
infra/desktop/build.sh        # Creates disk image + cloud-init ISO
infra/desktop/run.sh --firstboot  # First boot with cloud-init provisioning
infra/desktop/run.sh           # Subsequent runs
```

### Deploying to VM
```bash
# Full install
ssh -p 2224 robos@localhost 'bash -s' < packages/desktop-shell/install.sh

# Single app update
scp -P 2224 -r packages/<app-id>/* robos@localhost:/tmp/<app-id>/
ssh -p 2224 robos@localhost "sudo rm -rf /usr/local/share/robos/<app-id> && sudo cp -r /tmp/<app-id> /usr/local/share/robos/<app-id> && sudo chmod -R a+rX /usr/local/share/robos/<app-id> && cd /usr/local/share/robos/<app-id> && sudo rm -rf node_modules && sudo npm install --quiet"
```

VM credentials: `robos` / `robos`

### DOM Snapshot Debugging
Each app has a unique debug port for DOM snapshots (defined in `packages/robos-lib/snapshot-cli.js`):
```bash
node packages/robos-lib/snapshot-cli.js <app-id> --text    # Text snapshot
node packages/robos-lib/snapshot-cli.js <app-id> --json    # JSON DOM tree
node packages/robos-lib/snapshot-cli.js <app-id> --screenshot  # PNG screenshot
```
Port range: 19100–19121 (e.g., app-launcher=19100, dev-central=19101). See `PORT_REGISTRY` in snapshot-cli.js.

### Antigravity / Gemini Commands
Custom operations available via `.antigravity/commands/` and `.gemini/commands/`:
- `/create-robos-app` — Create a new Electron app with full registration across all required files
- `/remove-robos-app` — Remove an app and deregister everywhere
- `/rename-robos-app` — Rename an app with all registration updates
- `/update-app-icon` — Update an app's SVG icon
- `/create-test` — Create a test file using the robos-test framework
- `/app-snapshot` — Capture DOM snapshot from a running app
- `/start-vm`, `/stop-vm`, `/vm-status`, `/vm-ssh` — VM lifecycle management
- `/build-vm` — Build QEMU disk image + cloud-init ISO
- `/deploy-to-vm` — Deploy packages to running VM
- `/add-install-step` — Add cloud-init provisioning steps
- `/add-ai-text-area-to-app` — Add `<robos-ai-textarea>` widget to a RobOS app
- `/create-feature-spec` — Convert a raw idea note or prompt into a structured feature specification in `docs/ideas/specs/`
- `/record-demo` — Record video demo script
- `/install-dev-deps` — Audit and install all dev machine dependencies for all RobOS components

## Conventions

- **Commits**: Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`)
- **No root package.json**: Each package has independent `node_modules`
- **IPC**: All Electron apps use `contextBridge` + `ipcRenderer.invoke` (never `nodeIntegration: true`)
- **Config storage**: All persistent data in `~/.config/robos/`
- **Icons**: 48×48 SVG, Lucide style, `stroke="#00bcd4"`, `stroke-width="1.5"`, `stroke-linecap="round"`, `stroke-linejoin="round"`
- **Logging**: `pino` JSON logging
- **Secrets**: Environment variables only, validated with `zod`; never hardcode credentials

### CSS Theme Variables
All apps share a consistent dark theme:
- `--bg-primary: #0d1117` — main background
- `--bg-card: #161b22` — card/panel background
- `--accent: #00bcd4` — primary accent (cyan)

## App Registration Checklist

When adding, renaming, or removing an app, update ALL of these locations. Use the `/create-robos-app`, `/remove-robos-app`, or `/rename-robos-app` slash commands which handle this automatically.

1. `packages/<app-id>/` — the app directory
2. `packages/desktop-manager/main.js` — `APP_REGISTRY` and `APP_BINS`
3. `packages/robos-icons/builtin-apps.js` — `BUILTIN_APPS` array (alphabetical)
4. `packages/robos-icons/builtin-apps-browser.js` — `ROBOS_BUILTIN_APPS` array
5. `packages/icon-lib/builtin-apps.js` — must match #3 exactly
6. `packages/task-manager/main.js` — `KNOWN_APPS` map
7. `packages/desktop-shell/install.sh` — install block
8. `<app-id>.desktop` file

**Note:** Some checklist targets (desktop-manager, icon-lib, task-manager, desktop-shell) may not exist yet. Only update files that exist; the slash commands handle this correctly.

## Technical Gotchas

- **Electron in QEMU**: `--disable-dev-shm-usage` is critical or renderer windows go blank
- **Deploy permissions**: After `sudo cp -r` to `/usr/local/share/robos/`, always `sudo chmod -R a+rX` or Electron can't read the files
- **Deploy symlinks**: `scp -r` dereferences symlinks (e.g. `node_modules/.bin/electron`). Always `sudo rm -rf node_modules && sudo npm install` after deploy to regenerate correct symlinks
- **cloud-init**: `write_files` does NOT create parent dirs — always `mkdir -p` in `runcmd`; only runs once per `instance-id`
- **Monaco editors**: Call `ed.layout()` when tab becomes visible (initializing while hidden renders at 0×0)
- **Shell vars in JS**: Escape `$(...)` and `${VAR}` in template literals to avoid JS interpolation
- **Process management in VM**: `pkill`/`killall` unavailable — use `kill <PID>` with explicit PIDs
- **IntelliJ plugin path (Linux)**: `~/.local/share/JetBrains/IdeaIC<Version>/robos/`
- **Shared lib requires**: Wrap `/usr/local/share/robos/robos-lib/...` requires in try/catch — they're unavailable outside the VM
