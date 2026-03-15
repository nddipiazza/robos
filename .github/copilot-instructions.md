# RobOS — Copilot Instructions

## Project Overview

**RobOS** is a Software Development Lifecycle Operating System — a Linux-based desktop OS (Ubuntu foundation) whose entire user experience is purpose-built around the daily workflow of software engineers and engineering managers. Every desktop, panel, shortcut, and AI interaction exists to move tickets through the SDLC faster and with higher quality.

The OS is **MCP-powered**: Model Context Protocol servers are the nervous system connecting Claude (and other LLMs) to every external system — Jira, GitHub, Slack, VPNs, IDEs, terminals, calendars, and browsers.

The OS is also **ambient**: a camera-based focus tracker, a voice AI personality, a calendar-aware meeting takeover mode, and a rich toast notification system mean the OS actively participates in the developer's day rather than passively waiting for input.

---

## Core Concepts

### Virtual Desktops = Tickets
Each virtual desktop corresponds to one active Jira ticket. The desktop workspace is materialized by an AI agent when a ticket is assigned to the user. Desktops are not generic; they are bootstrapped with everything required to work that specific ticket:
- Correct git branch checked out in Cursor
- Dev server running (React, Next.js, etc.)
- VPN connected to the relevant environment
- Relevant documentation, Jira description, and acceptance criteria pinned
- Reproduction steps auto-executed where possible

### Roles
The system supports two primary roles, switchable at login or per-session:

- **Developer** — Drives the ticket lifecycle: picks up assigned Jira issues, builds the workspace, attempts the fix/feature, opens PRs, responds to review feedback.
- **Dev Manager** — Views team-level sprint board, assigns tickets, monitors PR health, tracks velocity, and receives AI-generated summaries of team status.

There is also a special mode:

- **Feature Reviewer** — An opt-in training mode where the AI generates synthetic PRs and code review exercises. Used for onboarding reviewers or leveling up review skills.

### Collaborative Tickets
Tickets are designed to be worked by multiple people simultaneously. The Workspace Agent tracks co-workers present on the same ticket, surfaces their activity (last commit, last comment, what file they are editing), and coordinates to avoid conflicts. A ticket's desktop shows a "who's here" presence strip. The AI mediates when two developers touch the same file.

### Ambient Presence: Camera Focus Tracking
A background process uses the webcam to detect whether the developer is physically present and focused at their desk. Focus time is logged per ticket and surfaced as **actual focused hours** in Jira comments and the daily stats widget. The system:
- Detects presence/absence using on-device vision model (no cloud upload of video; privacy-first)
- Pauses focus timer when the developer leaves the desk or switches to a non-ticket desktop
- Marks extended absence (>15 min) with an optional auto-away Slack status
- Focus data feeds the "value added" metric and is visible only to the developer by default; managers see aggregated team-level data only
- Developer can review, edit, or delete their own focus log at any time

### Voice AI Personality (Audio Agent)
A persistent voice assistant runs as a system service — always-on but non-intrusive. It:
- Has a configurable personality and voice (neutral, friendly, terse)
- Proactively speaks reminders: standup time, stale PRs, meeting in 5 minutes, blocked ticket detected
- Responds to a wake word or keyboard shortcut for ad-hoc questions ("what's next on my sprint?", "summarize the PR comments on my open PR")
- Narrates what the AI agent is doing while materializing a workspace ("Checking out branch, starting dev server…")
- Integrates with the notification system — any toast can optionally be read aloud
- Uses a local TTS engine (Coqui TTS or system speech synthesis) with optional cloud voice upgrade
- Volume and verbosity are user-configurable; can be silenced per-meeting or per-desktop

### Calendar Integration & Meeting Takeover Mode
The OS integrates with Google Calendar and Microsoft Outlook/Exchange. When a calendar event is approaching:
- A gentle toast appears at T-10 min and T-2 min
- At T-0, **Meeting Takeover Mode** activates:
  - All ticket desktops are suspended (dev servers stay alive in background)
  - A full-screen meeting workspace opens with: one-click video call launch, agenda pulled from the calendar event, a live AI note-taker, and action item capture
  - The voice agent announces the meeting
- On meeting end (detected via calendar end time or manual dismiss), ticket desktops resume and the AI posts a meeting summary + action items to the relevant Jira ticket or Slack channel
- Supported calendar sources: Google Calendar (OAuth2), Microsoft Graph API (Outlook/Exchange)

---

## Architecture

### Technology Stack
- **OS Base**: Ubuntu LTS (latest stable) with GNOME desktop
- **AI Layer**: Claude via Anthropic API; other models may be swapped via MCP adapter
- **robos-intellij** *(separate repo: `nddipiazza/robos-intellij`)* — A fork of IntelliJ IDEA Community Edition with a built-in RobOS IPC layer. Exposes an HTTP server (default port `63343`) that `mcp-idea` calls to open projects, navigate to files, run/stop configurations, and relay RobOS notifications as IDE balloon popups. The fork stays current with upstream `intellij-community` via periodic rebase. See the repo for build and contribution instructions.
- **MCP Servers** (one per integration domain):
  - `mcp-jira` — Jira Cloud / Data Center REST API
  - `mcp-github` — GitHub REST + GraphQL API (PRs, branches, reviews, checks)
  - `mcp-cursor` — Cursor IDE automation (workspace open, extension install, file focus)
  - `mcp-idea` — JetBrains IDEA automation (open project, focus files, run configurations); communicates with the **robos-intellij** fork via its built-in IPC HTTP server. Lives in this repo; the IDE itself lives in a separate repo (see below).
  - `mcp-vpn` — VPN connect/disconnect (OpenVPN / WireGuard)
  - `mcp-devserver` — Dev server lifecycle (npm/yarn/pnpm start, health check)
  - `mcp-desktop` — GNOME workspace management (create, switch, label virtual desktops)
  - `mcp-slack` — Notifications and standup summaries
  - `mcp-calendar` — Google Calendar + Microsoft Graph (read events, trigger meeting mode)
  - `mcp-camera` — On-device presence detection; returns focus/away state, never raw video
  - `mcp-audio` — TTS synthesis, wake-word detection, audio playback control
  - `mcp-notifications` — Unified toast dispatch (GNOME notifications + optional voice read-aloud)
- **Workspace Agent**: Orchestration agent that calls MCP servers in sequence to fully materialize a ticket workspace
- **Sprint Daemon**: Background service that polls Jira for sprint changes and syncs virtual desktop state
- **Reviewer Trainer**: Subsystem that generates synthetic diffs and rubric-based feedback exercises
- **Focus Tracker**: Reads `mcp-camera` presence state; writes per-ticket focus logs to local SQLite
- **Audio Agent**: Always-on voice personality service; subscribes to notification bus and calendar events
- **Notification Bus**: Internal pub/sub (EventEmitter or Redis Streams) that all subsystems publish to; `mcp-notifications` and Audio Agent consume it
- **Meeting Coordinator**: Watches `mcp-calendar`; triggers takeover mode, manages desktop suspend/resume, posts AI meeting summaries

### Directory Layout
```
roboto-os/
├── .github/
│   └── copilot-instructions.md   ← this file
├── packages/
│   ├── sprint-daemon/            ← polls Jira, manages desktop ↔ ticket mapping
│   ├── workspace-agent/          ← orchestrates workspace materialization
│   ├── reviewer-trainer/         ← synthetic PR generation + review exercises
│   ├── focus-tracker/            ← camera presence → per-ticket focus log (SQLite)
│   ├── audio-agent/              ← voice personality, TTS, wake-word, reminder engine
│   ├── notification-bus/         ← internal pub/sub; all subsystems publish here
│   ├── meeting-coordinator/      ← calendar watch, takeover mode, meeting summary post
│   ├── desktop-shell/            ← GNOME shell extensions, panels, overlays, toasts
│   └── mcp-servers/
│       ├── mcp-jira/
│       ├── mcp-github/
│       ├── mcp-cursor/
│       ├── mcp-idea/             ← talks to robos-intellij fork (see companion repo)
│       ├── mcp-vpn/
│       ├── mcp-devserver/
│       ├── mcp-desktop/
│       ├── mcp-slack/
│       ├── mcp-calendar/
│       ├── mcp-camera/
│       ├── mcp-audio/
│       └── mcp-notifications/
├── apps/
│   ├── robos-ui/                ← Electron or Tauri control panel app
│   ├── stats-widget/             ← desktop widget: daily value-added, PR health, blockers
│   └── onboarding/               ← First-run setup wizard
├── infra/
│   ├── iso-build/                ← Ubuntu ISO customization (live-build / cubic)
│   └── ansible/                  ← Post-install provisioning playbooks
└── docs/
    ├── architecture.md
    ├── mcp-protocol.md
    ├── notification-events.md    ← catalogue of all notification bus event types
    └── roles/
        ├── developer.md
        ├── dev-manager.md
        └── feature-reviewer.md

### Companion Repositories

| Repo | Purpose |
|---|---|
| `nddipiazza/robos-intellij` | Fork of `JetBrains/intellij-community` with RobOS IPC layer built in. Exposes HTTP API on port `63343` for `mcp-idea` to call. Rebased against upstream on each IntelliJ release. |
```

---

## Ticket Lifecycle → Desktop Lifecycle

```
Jira ticket assigned to user
        │
        ▼
Sprint Daemon detects assignment
        │
        ▼
Workspace Agent materializes desktop:
  1. mcp-desktop  → create/label new virtual desktop
  2. mcp-github   → checkout branch (create if needed)
  3. mcp-vpn      → connect to correct environment
  4. mcp-cursor / mcp-idea → open repo, focus relevant files (IDE selected per user preference)
  5. mcp-devserver→ npm run dev (health-check before marking ready)
  6. mcp-jira     → pin ticket details, acceptance criteria, repro steps
  7. Claude       → summarize ticket, suggest approach, flag unknowns
  8. Audio Agent  → announce workspace ready (if voice enabled)
        │
        ▼
Developer works ticket on dedicated desktop
  - Focus Tracker logs camera-verified focus time against ticket
  - Collaborators shown in presence strip; AI coordinates file conflicts
        │
        ▼
Developer opens PR
  - mcp-github creates PR with ticket reference
  - mcp-jira transitions ticket to "In Review"
  - Notification Bus emits PR_REVIEW_NEEDED → toast + optional voice
        │
        ▼
Reviewer opens PR desktop (or uses Feature Reviewer mode)
  - AI surfaces diff, checklist, prior similar bugs
        │
        ▼
PR merged → mcp-jira closes ticket → desktop archived/removed
  - Focus time summary posted to Jira ticket
  - "Value added" metric updated in Stats Widget
```

## Notification System

All system events flow through the **Notification Bus** (internal pub/sub). Consumers include the GNOME toast dispatcher (`mcp-notifications`) and the Audio Agent. Every notification has a `severity` (`info | warning | urgent`) and an optional `speak: true` flag.

### Notification Event Catalogue

| Event | Trigger | Default Severity | Speaks |
|---|---|---|---|
| `PR_REVIEW_NEEDED` | PR opened/updated targeting you as reviewer | `warning` | yes |
| `PR_COMMENT_ON_YOUR_WORK` | Comment added to a PR you authored | `info` | optional |
| `ISSUE_REPORTED_YOUR_CHANGE` | Jira bug linked to a PR/commit you authored | `urgent` | yes |
| `PR_AGING_WARNING` | PR open > 2 days with no activity | `warning` | no |
| `PR_STALE_CLOSE_SUGGESTION` | PR open > 5 days; AI suggests merge or close | `warning` | yes |
| `BLOCKER_DETECTED` | Jira ticket flagged as blocked (auto or manual) | `urgent` | yes |
| `MEETING_APPROACHING_10M` | Calendar event starts in 10 minutes | `info` | yes |
| `MEETING_APPROACHING_2M` | Calendar event starts in 2 minutes | `urgent` | yes |
| `MEETING_TAKEOVER` | Meeting start time reached | `urgent` | yes |
| `STANDUP_TIME` | Scheduled standup reminder (configurable time) | `info` | yes |
| `FOCUS_AWAY_AUTO` | Camera detected absence > 15 min | `info` | optional |
| `DAILY_STATS_READY` | Daily stats widget refreshed (configurable time) | `info` | no |
| `SPRINT_TICKET_ASSIGNED` | New Jira ticket assigned to you | `info` | yes |
| `COLLABORATOR_JOINED` | Another developer joined your ticket workspace | `info` | optional |

### Bi-Daily PR Digest
At configurable times (default 10:00 and 16:00), the Sprint Daemon emits a `PR_DIGEST` event summarizing:
- PRs awaiting your review (oldest first)
- Your open PRs with review lag
- PRs approaching stale threshold
The digest appears as a grouped toast and is read aloud if voice is enabled.

### Toast Design
Toasts are GNOME notifications styled to match the RobOS shell theme. Each toast:
- Has an action button (e.g., "Open PR", "View Ticket", "Join Meeting")
- Auto-dismisses after a configurable timeout (default 8s for `info`, persistent for `urgent`)
- Is logged to a notification history panel accessible from the system tray

---

## Development Workflow — Dev Harness First

**Always develop and test RobOS Electron apps using the Dev Harness (`packages/dev-harness/`) before deploying to the VM.**

The Dev Harness provides a self-contained sandbox with:
- Its own `/home/robos` context (no interference with VM state)
- Stub CLI binaries (`gh`, `ssh`, `git`, `ssh-keygen`) that return scenario-specific responses
- Named scenarios (`all-good`, `no-gh-auth`, `no-ssh-key`, `ssh-not-on-github`, `scope-missing`, `git-config-missing`) covering every failure state an app needs to handle
- Electron launched directly from source — no rsync, no SSH, no kill/restart cycle

**The rule:**
1. Build and iterate on the app using `node packages/dev-harness/harness.js --app <name> --scenario <scenario>`
2. Exercise every scenario until the GUI handles it correctly
3. Only deploy to the VM via SSH once the harness confirms the app works end-to-end

**Never use SSH deploy as the primary testing strategy.** The harness tests persist and catch regressions; SSH deploy-and-eyeball does not.

---

 (Node.js for MCP servers and daemons, React/Electron for UI)
- **Package manager**: pnpm workspaces (monorepo)
- **MCP servers**: follow the MCP specification strictly; each server is a standalone Node.js process exposing tools over stdio or SSE
- **No magic globals**: all configuration via environment variables, validated with `zod` at startup
- **Error handling**: MCP tool errors must return structured MCP error objects, never throw unhandled exceptions
- **Logging**: structured JSON logs via `pino`; each package uses its own child logger with `package` and `version` fields
- **Testing**: Vitest for unit tests; Playwright for desktop/UI integration tests
- **Linting**: ESLint + Prettier; configs live in repo root and extend to all packages
- **Commits**: Conventional Commits format (`feat:`, `fix:`, `chore:`, etc.)

---

## MCP Server Conventions

Every MCP server in `packages/mcp-servers/` must:

1. Export a `manifest.json` describing its name, version, and tools
2. Implement a `healthcheck` tool that returns `{ ok: true }` with no side effects
3. Accept credentials only via environment variables (never hardcoded, never in tool parameters)
4. Include a `README.md` with: setup steps, required env vars, and a table of tools with input/output schemas
5. Be independently startable with `pnpm start` and testable with `pnpm test`

---

## AI Agent Behavior Guidelines

- Agents must **ask for confirmation** before destructive operations (branch deletion, VPN reconnect that drops active sessions, closing a dev server)
- Agents surface **confidence levels** when diagnosing bugs or suggesting fixes: `high / medium / low`
- When a ticket has ambiguous acceptance criteria, the agent flags it and drafts a clarifying Jira comment for the developer to approve before posting
- All AI-generated code suggestions must be accompanied by a brief rationale tied to the ticket context
- The Reviewer Trainer must never surface real production code in training exercises; all synthetic diffs are generated or sanitized

---

## Feature Reviewer Mode

When a user activates Feature Reviewer mode:

1. The Reviewer Trainer generates a synthetic PR diff relevant to the user's tech stack (inferred from recent tickets)
2. The user reviews it using the normal PR review interface
3. The AI grades the review against a rubric: coverage of logic errors, security issues, test coverage gaps, style/convention adherence
4. The session produces a **review scorecard** with specific feedback
5. After 3+ sessions, the system synthesizes a **reviewer profile** highlighting strengths and growth areas

Training exercises scale in difficulty: simple style issues → logic bugs → security vulnerabilities → architecture concerns.

---

## Dev Manager View

The Dev Manager desktop is a single-desktop experience (no per-ticket workspaces) providing:

- Sprint board with real-time Jira sync
- PR health dashboard (open PRs, review lag, stale branches)
- Team velocity chart (story points: planned vs. delivered per sprint)
- AI-generated daily standup summary (pulls Jira transitions + GitHub activity from past 24 hours)
- One-click ticket assignment that triggers Workspace Agent for the assignee's machine
- Team focus heatmap: aggregated camera-verified focus hours per developer per day (individual detail hidden; only totals visible to manager)
- Blocker radar: all tickets with active blockers, surfaced prominently with AI-suggested unblocking actions

---

## Stats Widget

A persistent desktop widget (always visible, non-intrusive) shows:
- **Value added this month**: story points completed × configurable point-value, shown as a simple number or chart
- **PRs merged this week** / **PRs open**
- **Tickets in progress** / **Tickets completed this sprint**
- **Blockers**: count with one-click drill-down
- **Your focus time today**: camera-verified hours on ticket work

The widget refreshes every 15 minutes and emits `DAILY_STATS_READY` at the configured daily summary time.

---

## Out of Scope (MVP)

- Multi-monitor spanning of ticket workspaces
- Support for GitLab or Azure DevOps (GitHub + Jira only for MVP)
- Mobile / web access to RobOS
- Custom AI model fine-tuning
- Self-hosted Jira (cloud only for MVP)
- Cloud upload of camera video (all vision processing is on-device)
- Calendar providers beyond Google Calendar and Microsoft Outlook/Exchange

---

## Connecting to the RobOS QEMU VM

The RobOS VM is launched via `infra/desktop/run.sh` and forwards ports to the host:

| Service | Command |
|---|---|
| **SSH** | `ssh -p 2222 robos@localhost` |
| **VNC** | `vncviewer localhost:5910` (or use `--vnc` flag when launching) |

The logged-in user inside the VM is `robos`. The active X display is `:0`.

**Common tasks:**

```bash
# SSH into VM
ssh -o StrictHostKeyChecking=no -p 2222 robos@localhost

# Copy a file to the VM (writable paths need sudo inside)
scp -P 2222 <file> robos@localhost:/tmp/<file>
ssh -p 2222 robos@localhost 'sudo cp /tmp/<file> /usr/local/share/robos/<file>'

# Kill and restart the desktop widgets
ssh -p 2222 robos@localhost 'kill $(pgrep -f robos-widgets.py); sleep 1; DISPLAY=:0 nohup python3 /usr/local/share/robos/robos-widgets.py > /tmp/robos-widgets.log 2>&1 &'
```

> Note: `kill` must use a literal PID, not a shell variable. Retrieve the PID first with `pgrep`, then pass it explicitly.

---

## Getting Started (Contributors)

```bash
# Prerequisites: Node.js 20+, pnpm 9+, Ubuntu 22.04+ (or WSL2)
pnpm install
pnpm --filter "./packages/mcp-servers/**" build
pnpm --filter sprint-daemon dev
pnpm --filter workspace-agent dev
```

Copy `.env.example` to `.env` and fill in:
- `ANTHROPIC_API_KEY`
- `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`
- `GITHUB_TOKEN`
- `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET` (optional)
- `MICROSOFT_GRAPH_CLIENT_ID`, `MICROSOFT_GRAPH_CLIENT_SECRET` (optional)
- `SLACK_BOT_TOKEN` (optional)
- `TTS_ENGINE` — `local` (default, uses Coqui) or `cloud` (ElevenLabs / Azure TTS)

---

## Skill: Adding a New Electron App to RobOS

Use this checklist every time you create a new Electron app package. All six steps are required for the app to be fully integrated — desktop shortcut, icon, app launcher, tray menu, and install script.

### 1. Scaffold the package

```
packages/<app-id>/
  main.js          ← Electron main; use app.requestSingleInstanceLock(); include all 3 commandLine flags
  preload.js       ← contextBridge.exposeInMainWorld('<namespace>', { ... })
  package.json     ← { "main": "main.js", "scripts": { "start": "electron ." }, "dependencies": { "electron": "^30.0.0" } }
  renderer/
    index.html
    app.js
    style.css
  icon.svg         ← 48×48 Lucide-style SVG, stroke="#00bcd4", stroke-width="1.5"
  <app-id>.desktop ← see template below
```

**Electron flags** — every `main.js` must append all three before `createWindow()`:
```javascript
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');
```

**App name / WM_CLASS** — every `main.js` must call `app.setName('<app-id>')` **before** `app.whenReady()`. This sets the X11 `WM_CLASS` so dash-to-panel can uniquely identify each app. Without this, every Electron window shares `WM_CLASS=electron` and the entire taskbar launcher lights up as focused whenever any RobOS app is active:
```javascript
app.setName('<app-id>');
app.whenReady().then(createWindow);
```

### 2. Write the .desktop file

```ini
[Desktop Entry]
X-RobOS-App=true
Version=1.0
Type=Application
Name=RobOS <Human Name>
Comment=<One-line description>
Exec=/usr/local/bin/robos-launch <app-id>
Icon=/usr/local/share/robos/<app-id>/icon.svg
Terminal=false
Categories=System;            ← or Developer;, Utility;, etc.
Keywords=<comma-separated keywords>;
X-RobOS-Category=<TopLevel>   ← System | Developer | Security | Team | Tools
StartupNotify=false
StartupWMClass=<app-id>    ← MUST match app.setName() in main.js; never use "electron" here
```

### 3. Register in desktop-manager

In `packages/desktop-manager/main.js`:

**a) Add to APP_BINS** (alphabetical order):
```javascript
'<app-id>': {
  bin:  path.join(APP_BASE, '<app-id>/node_modules/electron/dist/electron'),
  args: [path.join(APP_BASE, '<app-id>'), '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
},
```

**b) Add to tray menu** under the appropriate section:
```javascript
{ label: '    <emoji>  <Human Name>', click: () => launchApp('<app-id>') },
```

### 4. Add icon to RobOS Icons

In `packages/robos-icons/builtin-apps.js`, insert alphabetically into `BUILTIN_APPS`:
```javascript
{
  "appId": "<app-id>",
  "label": "RobOS <Human Name>",
  "desc": "<One-line description>",
  "iconSvg": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"48\" height=\"48\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#00bcd4\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><!-- Lucide path(s) --></svg>",
  "iconName": "<LucideIconName>"
}
```

Icon source: pick from https://lucide.dev — copy the SVG path(s) only; keep the outer `<svg>` attributes as shown above.

### 5. Add to install.sh

In `packages/desktop-shell/install.sh`, add a block after the last Electron app block:

```bash
# ── <Human Name> (Electron app) ───────────────────────────────────────────────
echo "--> Installing <Human Name>..."
sudo rm -rf /usr/local/share/robos/<app-id>
sudo cp -r "$SCRIPT_DIR/../<app-id>" /usr/local/share/robos/<app-id>
sudo cp "$SCRIPT_DIR/../<app-id>/<app-id>.desktop" /usr/local/share/applications/
cd /usr/local/share/robos/<app-id> && sudo npm install --quiet
```

> Note: No custom `/usr/local/bin/<app-id>` wrapper is needed — all Electron apps are launched via the universal `robos-launch <app-id>` IPC mechanism.

### 6. Add the app-logo icon to the renderer UI

Every Electron app that shows a logo icon in the top-left of its window (the `app-logo` element) **must** source that icon from `packages/robos-icons/builtin-apps.js` — the canonical SVG registry. **Never use emoji, image files, or hard-coded SVG inline** in the renderer HTML for title/logo icons.

**Pattern — look up and render the icon from the registry:**

In `renderer/index.html`, require the registry and inject the SVG:
```html
<div class="app-header">
  <span class="app-logo" id="app-logo-icon"></span>
  <span class="app-title">RobOS &lt;Human Name&gt;</span>
</div>
```

In `renderer/app.js` (or an inline `<script>` at the bottom of index.html):
```javascript
// Inject app logo from RobOS icon registry
const { BUILTIN_APPS } = require('../../robos-icons/builtin-apps');
const entry = BUILTIN_APPS.find(a => a.appId === '<app-id>');
if (entry) {
  const el = document.getElementById('app-logo-icon');
  // Resize the registry SVG to 28×28 for the title bar
  el.innerHTML = entry.iconSvg.replace(/width="48"/, 'width="28"').replace(/height="48"/, 'height="28"');
}
```

In `renderer/style.css`:
```css
.app-logo {
  display: flex;
  align-items: center;
  margin-right: 8px;
}
```

**The same rule applies to empty-state icons** (large centered icons shown when a list is empty). Use the registry SVG resized to `width="64" height="64"` with `opacity: 0.4` on the container.

**Never use emoji** (`🤖`, `⚙️`, `🔑`, etc.) anywhere that a visual icon is intended — not in app headers, empty states, or detail panels. Emoji are only acceptable as decorators inside text labels (e.g., tray menu item labels) where SVG cannot be used.

### 7. Install the electron dependency and test in the dev harness

```bash
# Install electron locally (required for dev-harness and for the deployed copy)
cd packages/<app-id> && npm install

# Verify it appears in the harness
node packages/dev-harness/harness.js --list-apps | grep <app-id>

# Run every scenario that matters for this app
node packages/dev-harness/harness.js --app <app-id> --scenario all-good
```

Only deploy to the VM via `install.sh` once the harness confirms the app works end-to-end.

### Process name detection

The task-manager (and any future process-scanner) uses `resolveAppId(pid)` which reads `/proc/{pid}/cmdline` (null-separated args) instead of regex-matching the blended `ps aux` command string. This correctly identifies app IDs even when launched from the dev-harness (where the electron binary path passes through `packages/dev-harness/node_modules/...`). Always use this approach when scanning RobOS processes by PID.

---

## Skill: Renaming a RobOS App

Use this checklist when renaming an app's **display name** (what the user sees). The app-id (directory name, `Exec=` line, `robos-launch` argument) does **not** change — only the human-readable label changes everywhere it appears.

> **New display name convention:** store as `RobOS <Human Name>` in all source files. The launcher strips the `RobOS ` prefix at render time, so tiles show just `<Human Name>`.

### Files to update (8 locations)

| # | File | What to change |
|---|------|----------------|
| 1 | `packages/<app-id>/<app-id>.desktop` | `Name=RobOS <New Name>` and `Comment=<new description>` |
| 2 | `packages/<app-id>/main.js` | `title: 'RobOS <New Name>'` in BrowserWindow options |
| 3 | `packages/<app-id>/package.json` | `"description": "RobOS <New Name>"` |
| 4 | `packages/<app-id>/renderer/index.html` | `<title>RobOS <New Name></title>` and `.app-title` span text |
| 5 | `packages/desktop-manager/main.js` | `label: '<New Name>'` in the APP_REGISTRY entry |
| 6 | `packages/task-manager/main.js` | `'<app-id>': '<New Name>'` in KNOWN_APPS map |
| 7 | `packages/robos-icons/builtin-apps.js` | `"label":"<New Name>"` in the BUILTIN_APPS entry |
| 8 | `packages/icon-lib/builtin-apps.js` | `"label":"<New Name>"` in the BUILTIN_APPS entry |

### Deploy to VM

After editing all source files, push the changed files to the VM:

```bash
# 1. Push the updated .desktop file
scp -P 2222 packages/<app-id>/<app-id>.desktop robos@localhost:/tmp/<app-id>.desktop
ssh -p 2222 robos@localhost 'sudo cp /tmp/<app-id>.desktop /usr/local/share/applications/<app-id>.desktop'

# 2. Push app source (renderer, main.js, package.json)
rsync -az --exclude 'node_modules' packages/<app-id>/ robos@localhost:/tmp/<app-id>-src/ -e "ssh -p 2222"
ssh -p 2222 robos@localhost "sudo cp -r /tmp/<app-id>-src/. /usr/local/share/robos/<app-id>/"

# 3. Restart if running
PID=$(ssh -p 2222 robos@localhost "pgrep -f '/usr/local/share/robos/<app-id>'" | head -1)
[ -n "$PID" ] && ssh -p 2222 robos@localhost "kill $PID"
```

The GTK app-launcher (`robos-app-menu.py`) reads `Name=` from `.desktop` files at launch time — no restart of the launcher script needed beyond killing any open instance.

---

## Skill: Deleting a RobOS App

Use this checklist when permanently removing an Electron app from RobOS. All steps are required — skipping any one will leave orphaned references that cause crashes or phantom entries in the launcher, tray menu, or task manager.

### Source files to update (7 locations)

| # | File | What to remove |
|---|------|----------------|
| 1 | `packages/desktop-manager/main.js` | Entry in `APP_REGISTRY` array: `{ id: '<app-id>', ... }` |
| 2 | `packages/desktop-manager/main.js` | Entry in `APP_BINS` object: `'<app-id>': mkBin('<app-id>'),` |
| 3 | `packages/robos-icons/builtin-apps.js` | Object with `"appId":"<app-id>"` from `BUILTIN_APPS` array |
| 4 | `packages/robos-icons/builtin-apps-browser.js` | Object with `"appId":"<app-id>"` from `ROBOS_BUILTIN_APPS` array |
| 5 | `packages/icon-lib/builtin-apps.js` | Object with `"appId":"<app-id>"` from `BUILTIN_APPS` array |
| 6 | `packages/task-manager/main.js` | Entry in `KNOWN_APPS` map (if present): `'<app-id>': '...',` |
| 7 | `packages/desktop-shell/install.sh` | The install block for `<app-id>` (if present) |

### Delete the package folder

```bash
rm -rf packages/<app-id>
```

### Edit the icon registry files

Files 3–5 above are minified single-line JS arrays. Use Node.js to parse, filter, and rewrite:

```bash
node - <<'EOF'
const fs = require('fs');

function removeApp(file, varName) {
  let content = fs.readFileSync(file, 'utf8');
  const assignIdx = content.indexOf(varName + ' = [');
  const arrayStart = content.indexOf('[', assignIdx);
  const arrayEnd = content.lastIndexOf(']') + 1;
  const arr = JSON.parse(content.slice(arrayStart, arrayEnd));
  const filtered = arr.filter(a => a.appId !== '<app-id>');
  fs.writeFileSync(file, content.slice(0, arrayStart) + JSON.stringify(filtered) + content.slice(arrayEnd));
  console.log('Updated', file, `(removed 1 of ${arr.length} entries)`);
}

removeApp('packages/robos-icons/builtin-apps.js',         'BUILTIN_APPS');
removeApp('packages/robos-icons/builtin-apps-browser.js', 'window.ROBOS_BUILTIN_APPS');
removeApp('packages/icon-lib/builtin-apps.js',            'BUILTIN_APPS');
EOF
```

### Deploy removal to VM

```bash
APP_ID=<app-id>

# 1. Kill the process if running
PID=$(ssh -o StrictHostKeyChecking=no -p 2222 robos@localhost "pgrep -f '/usr/local/share/robos/${APP_ID}'" 2>/dev/null | head -1)
[ -n "$PID" ] && ssh -o StrictHostKeyChecking=no -p 2222 robos@localhost "kill $PID"

# 2. Remove the installed app files
ssh -o StrictHostKeyChecking=no -p 2222 robos@localhost "sudo rm -rf /usr/local/share/robos/${APP_ID}"

# 3. Remove the .desktop file and refresh the app menu database
ssh -o StrictHostKeyChecking=no -p 2222 robos@localhost "sudo rm -f /usr/local/share/applications/${APP_ID}.desktop && sudo update-desktop-database /usr/local/share/applications"

# 4. Push updated desktop-manager so the tray menu and launcher no longer show the app
rsync -az --exclude 'node_modules' packages/desktop-manager/ robos@localhost:/tmp/desktop-manager-src/ -e "ssh -o StrictHostKeyChecking=no -p 2222"
ssh -o StrictHostKeyChecking=no -p 2222 robos@localhost "sudo cp -r /tmp/desktop-manager-src/. /usr/local/share/robos/desktop-manager/"

# 5. Restart desktop-manager so it reloads its APP_REGISTRY and APP_BINS
DM_PID=$(ssh -o StrictHostKeyChecking=no -p 2222 robos@localhost "pgrep -f '/usr/local/share/robos/desktop-manager'" 2>/dev/null | head -1)
[ -n "$DM_PID" ] && ssh -o StrictHostKeyChecking=no -p 2222 robos@localhost "kill $DM_PID"
```

> Note: The desktop-manager auto-restarts via its autostart entry — killing it is enough to trigger a clean reload with the updated registry.
>
> **Critical:** Step 3 (removing the `.desktop` file) is essential — the GNOME app launcher reads `.desktop` files independently of desktop-manager. If you skip this step, the deleted app will still appear in the launcher even after removing it from all code registries.

---

## Skill: Deploying the RobOS GNOME VM

The RobOS development VM is a QEMU virtual machine (Ubuntu 22.04 base) running **xfwm4 + tint2** (the "RobOS" session). It is provisioned by cloud-init on first boot. SSH always listens on **host port 2222** (`hostfwd=tcp::2222-:22`).

> ⚠️ **Do NOT use `infra/desktop/run.sh` or `infra/desktop/build.sh`** — those scripts are deprecated (they referenced the old Openbox config) and will exit with an error. Use the commands below instead.

All commands below are run **from the repo root** on the host machine unless otherwise noted.

---

### Prerequisites (host machine)

```bash
sudo apt install qemu-system-x86 qemu-utils xorriso wget python3
# Enable KVM for a big speed boost:
sudo usermod -aG kvm $USER && newgrp kvm
```

---

### Step 1 — Build the VM disk (once, or after cloud-init source changes)

```bash
# Regenerate cloud-init user-data from source files
python3 infra/desktop/gen-userdata.py

mkdir -p infra/desktop/output

# Download Ubuntu 22.04 cloud image (cached after first run, ~600 MB)
[ -f infra/desktop/output/ubuntu-base.img ] || \
  wget -O infra/desktop/output/ubuntu-base.img \
    https://cloud-images.ubuntu.com/jammy/current/jammy-server-cloudimg-amd64.img

# Create 20 GB VM disk
cp infra/desktop/output/ubuntu-base.img infra/desktop/output/robos.img
qemu-img resize infra/desktop/output/robos.img 20G

# Build cloud-init seed ISO
xorriso -as mkisofs \
  -output infra/desktop/output/cidata.iso \
  -volid cidata -joliet -rock \
  infra/desktop/cloud-init/user-data \
  infra/desktop/cloud-init/meta-data
```

Outputs: `infra/desktop/output/robos.img` and `infra/desktop/output/cidata.iso`.

---

### Step 2 — First boot (initial provisioning, ~5–10 min)

```bash
DISK=infra/desktop/output/robos.img
ISO=infra/desktop/output/cidata.iso
KVM_FLAGS="-enable-kvm -cpu host"   # remove if /dev/kvm is unavailable

qemu-system-x86_64 \
  $KVM_FLAGS \
  -m 4G -smp 2 \
  -hda "$DISK" \
  -cdrom "$ISO" \
  -net nic,model=virtio \
  -net user,hostfwd=tcp::2222-:22 \
  -vga virtio \
  -display gtk,gl=off \
  -device virtio-balloon \
  -rtc base=localtime \
  -serial file:/tmp/robos-serial.log \
  -daemonize \
  -pidfile /tmp/robos-qemu.pid \
  -name "RobOS"
```

Wait for cloud-init to finish (~5–10 min). Monitor with: `tail -f /tmp/robos-serial.log`

---

### Normal boot (all subsequent starts)

```bash
DISK=infra/desktop/output/robos.img
KVM_FLAGS="-enable-kvm -cpu host"   # remove if /dev/kvm is unavailable

qemu-system-x86_64 \
  $KVM_FLAGS \
  -m 4G -smp 2 \
  -hda "$DISK" \
  -net nic,model=virtio \
  -net user,hostfwd=tcp::2222-:22 \
  -vga virtio \
  -display gtk,gl=off \
  -device virtio-balloon \
  -rtc base=localtime \
  -serial file:/tmp/robos-serial.log \
  -daemonize \
  -pidfile /tmp/robos-qemu.pid \
  -name "RobOS"
```

**SPICE mode** (best clipboard — copy/paste host ↔ guest):

```bash
DISK=infra/desktop/output/robos.img
KVM_FLAGS="-enable-kvm -cpu host"

qemu-system-x86_64 \
  $KVM_FLAGS \
  -m 4G -smp 2 \
  -hda "$DISK" \
  -net nic,model=virtio \
  -net user,hostfwd=tcp::2222-:22 \
  -vga virtio \
  -display gtk,gl=off \
  -spice port=5930,addr=127.0.0.1,disable-ticketing=on \
  -chardev spicevmc,id=vdagent,name=vdagent \
  -device virtio-serial-pci \
  -device virtserialport,chardev=vdagent,name=com.redhat.spice.0 \
  -device virtio-balloon \
  -rtc base=localtime \
  -serial file:/tmp/robos-serial.log \
  -daemonize \
  -pidfile /tmp/robos-qemu.pid \
  -name "RobOS"
# Then connect: remote-viewer spice://127.0.0.1:5930
```

### Check if the VM is running / SSH is ready

```bash
# Is QEMU alive?
[ -f /tmp/robos-qemu.pid ] && kill -0 "$(cat /tmp/robos-qemu.pid)" 2>/dev/null \
  && echo "VM running" || echo "VM stopped"

# Can SSH reach it?
ssh -o StrictHostKeyChecking=no -o ConnectTimeout=3 -p 2222 robos@localhost true 2>/dev/null \
  && echo "SSH ready" || echo "SSH not yet ready"
```

---

### Stop the VM

```bash
kill "$(cat /tmp/robos-qemu.pid)"
```

---

### Full reinstall (redeploy all apps and desktop-shell to a running VM)

Use this after pulling significant changes that affect many packages, or to reset the VM to match the current repo state.

```bash
# 1. Sync the entire packages/ tree into the VM
rsync -az --exclude 'node_modules' --exclude '.git' \
  packages/ \
  -e "ssh -o StrictHostKeyChecking=no -p 2222" \
  robos@localhost:/tmp/robos-packages/

# 2. Run install.sh inside the VM (re-deploys everything; idempotent)
ssh -o StrictHostKeyChecking=no -p 2222 robos@localhost \
  "bash /tmp/robos-packages/desktop-shell/install.sh"
```

---

### Deploy a single Electron app (fast iteration)

Use this when you've changed one package and want to push just that app without a full reinstall.

```bash
APP_ID=<app-id>   # e.g. issue-manager, agent-scheduler, people-directory

# 1. Sync source (skip node_modules — they stay in place on the VM)
rsync -az --exclude 'node_modules' \
  "packages/${APP_ID}/" \
  -e "ssh -o StrictHostKeyChecking=no -p 2222" \
  "robos@localhost:/tmp/${APP_ID}-src/"

# 2. Copy into the install location
ssh -o StrictHostKeyChecking=no -p 2222 robos@localhost \
  "sudo cp -r /tmp/${APP_ID}-src/. /usr/local/share/robos/${APP_ID}/"

# 3. Sync .desktop file and refresh app menu
scp -o StrictHostKeyChecking=no -P 2222 \
  "packages/${APP_ID}/${APP_ID}.desktop" \
  "robos@localhost:/tmp/${APP_ID}.desktop"
ssh -o StrictHostKeyChecking=no -p 2222 robos@localhost \
  "sudo cp /tmp/${APP_ID}.desktop /usr/local/share/applications/ && sudo update-desktop-database /usr/local/share/applications"

# 4. Kill the running instance (desktop-manager auto-restarts it on next launch)
APP_PID=$(ssh -o StrictHostKeyChecking=no -p 2222 robos@localhost \
  "pgrep -f '/usr/local/share/robos/${APP_ID}' | head -1" 2>/dev/null)
[ -n "$APP_PID" ] && ssh -o StrictHostKeyChecking=no -p 2222 robos@localhost "kill ${APP_PID}"

echo "Deployed ${APP_ID}"
```

> If the app has new `npm` dependencies in `package.json`, add this after step 2:
> ```bash
> ssh -o StrictHostKeyChecking=no -p 2222 robos@localhost \
>   "cd /usr/local/share/robos/${APP_ID} && sudo npm install --quiet"
> ```

---

### Deploy shared libraries (robos-ui, robos-copilot-lib)

Redeploy whenever `packages/robos-ui/robos-ui.js` or `packages/robos-cli/robos-copilot-lib.js` changes — every Electron app loads these at runtime.

```bash
# robos-ui (Web Component library)
rsync -az --exclude 'node_modules' \
  packages/robos-ui/ \
  -e "ssh -o StrictHostKeyChecking=no -p 2222" \
  robos@localhost:/tmp/robos-ui-src/
ssh -o StrictHostKeyChecking=no -p 2222 robos@localhost \
  "sudo cp -r /tmp/robos-ui-src/. /usr/local/share/robos/robos-ui/"

# robos-copilot-lib (shared AI runner; index.js = robos-copilot-lib.js)
rsync -az --exclude 'node_modules' \
  packages/robos-cli/ \
  -e "ssh -o StrictHostKeyChecking=no -p 2222" \
  robos@localhost:/tmp/robos-cli-src/
ssh -o StrictHostKeyChecking=no -p 2222 robos@localhost \
  'sudo cp /tmp/robos-cli-src/robos-copilot-lib.js /usr/local/share/robos/robos-copilot-lib/index.js;
   sudo cp /tmp/robos-cli-src/package.json /usr/local/share/robos/robos-copilot-lib/;
   for tool in robos-active-task robos-notify robos-journal-append; do
     sudo cp /tmp/robos-cli-src/$tool /usr/local/share/robos/robos-copilot-lib/;
     sudo chmod +x /usr/local/share/robos/robos-copilot-lib/$tool;
     sudo ln -sf /usr/local/share/robos/robos-copilot-lib/$tool /usr/local/bin/$tool;
   done'
```

---

### Deploy desktop-manager (tray menu + app launcher registry)

After adding or removing apps from `desktop-manager/main.js`:

```bash
rsync -az --exclude 'node_modules' \
  packages/desktop-manager/ \
  -e "ssh -o StrictHostKeyChecking=no -p 2222" \
  robos@localhost:/tmp/desktop-manager-src/
ssh -o StrictHostKeyChecking=no -p 2222 robos@localhost \
  "sudo cp -r /tmp/desktop-manager-src/. /usr/local/share/robos/desktop-manager/"

# Kill desktop-manager — it auto-restarts via its autostart entry
DM_PID=$(ssh -o StrictHostKeyChecking=no -p 2222 robos@localhost \
  "pgrep -f '/usr/local/share/robos/desktop-manager' | head -1" 2>/dev/null)
[ -n "$DM_PID" ] && ssh -o StrictHostKeyChecking=no -p 2222 robos@localhost "kill ${DM_PID}"
```

---

### Login credentials

| Field | Value |
|---|---|
| Username | `robos` |
| Password | `robos` |
| SSH | `ssh -p 2222 robos@localhost` |
| Session | **RobOS** (xfwm4 + tint2 — auto-selected by LightDM; no manual selection needed) |

---

### VM directory layout (inside the VM)

| Path | Contents |
|---|---|
| `/usr/local/share/robos/<app-id>/` | Deployed Electron app source + `node_modules` |
| `/usr/local/share/robos/robos-ui/` | Shared Web Component library |
| `/usr/local/share/robos/robos-copilot-lib/` | Shared AI runner (`index.js` = `robos-copilot-lib.js`) |
| `/usr/local/share/applications/<app>.desktop` | `.desktop` entries (app menu + launcher) |
| `/usr/local/bin/robos-launch` | Universal app launcher IPC binary |
| `~/.config/robos/` | Per-user config, settings, search index, people, groups |
