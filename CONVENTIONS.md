# RobOS — Project Conventions (Aider / General AI)

This file provides coding conventions and project context for AI coding assistants.

## What Is RobOS

RobOS is a Linux-based desktop OS (Ubuntu + GNOME) purpose-built for software engineers. Virtual desktops map 1:1 to Jira tickets. MCP servers connect an AI layer to GitHub, Jira, Slack, VPNs, IDEs, calendars, and the desktop. Electron apps in `packages/<app-id>/` provide the GUI.

---

## Testing Workflow

**Always test in the dev harness. Never rely on SSH deploy as the primary test strategy.**

```bash
# Run app in sandbox (no VM needed)
node packages/dev-harness/harness.js --app <app-id> --scenario <scenario>
node packages/dev-harness/harness.js --list-apps
node packages/dev-harness/harness.js --list-scenarios
```

Scenarios: `all-good`, `no-gh-auth`, `no-ssh-key`, `ssh-not-on-github`, `scope-missing`, `git-config-missing`, `all-broken`

Deploy to VM only after harness verification:

```bash
ssh -o StrictHostKeyChecking=no -p 2224 robos@localhost
packages/desktop-shell/install.sh   # run inside the VM
```

VM: `./infra/desktop/run.sh` — VNC at `vncviewer localhost:5910`

---

## Project Structure

No root `package.json`. Each package manages its own dependencies:

```
packages/
  <app-id>/             ← Electron app (main.js, preload.js, renderer/, icon.svg, <app-id>.desktop)
  desktop-manager/      ← system tray + launcher IPC; owns APP_REGISTRY and APP_BINS
  desktop-shell/        ← GNOME extensions + install.sh deploy script
  robos-icons/          ← canonical SVG icon registry (Node.js + browser exports)
  icon-lib/             ← mirror of robos-icons — must stay in sync
  robos-lib/            ← shared utilities and .desktop validator
  task-manager/         ← process viewer with KNOWN_APPS map
  dev-harness/          ← test sandbox with stub CLI binaries
  mcp-servers/          ← Node.js MCP servers (jira, github, vpn, devserver, etc.)
infra/desktop/run.sh    ← QEMU VM launcher
```

---

## Electron App Requirements

`main.js` — required in every app:

```javascript
app.setName('<app-id>');              // MUST be before whenReady — sets X11 WM_CLASS
app.requestSingleInstanceLock();
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');
app.whenReady().then(createWindow);
```

`<app-id>.desktop` — required fields:

```ini
X-RobOS-App=true
Exec=/usr/local/bin/robos-launch <app-id>
StartupWMClass=<app-id>    ← must match app.setName() exactly; never "electron"
X-RobOS-Category=System    ← one of: System Developer Security Team Tools
```

---

## App Registration Checklist

**All 8 locations must be updated when adding, renaming, or removing an app:**

1. `packages/<app-id>/` — the app directory
2. `packages/desktop-manager/main.js` — add to `APP_REGISTRY` array and `APP_BINS` object
3. `packages/robos-icons/builtin-apps.js` — add to `BUILTIN_APPS` (alphabetical order)
4. `packages/robos-icons/builtin-apps-browser.js` — add to `ROBOS_BUILTIN_APPS`
5. `packages/icon-lib/builtin-apps.js` — add to `BUILTIN_APPS` (keep identical to #3)
6. `packages/task-manager/main.js` — add to `KNOWN_APPS` map
7. `packages/desktop-shell/install.sh` — add install block
8. `<app-id>.desktop` — deployed to `/usr/local/share/applications/`

---

## Icon Rules

- App logo icons must be sourced from `packages/robos-icons/builtin-apps.js`.
- Never inline raw SVG or use emoji as visual icons in renderer HTML.
- SVG spec: 48×48, `stroke="#00bcd4"`, `stroke-width="1.5"` (Lucide icon style).
- In title bars: resize to 28×28. In empty states: resize to 64×64.
- Emoji are only acceptable as text decorators in tray menu labels where SVG cannot be used.

---

## Coding Conventions

- **Commits**: Conventional Commits — `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`
- **Display names**: store as `RobOS <Human Name>` in source; the launcher strips the prefix at render time. Example: `RobOS IDE Manager`.
- **Configuration**: environment variables only, validated with `zod` at startup. No hardcoded secrets.
- **MCP servers**: each is a standalone Node.js process exposing tools over stdio or SSE. Must include a `healthcheck` tool that returns `{ ok: true }`.
- **Logging**: `pino` JSON logging. Every package uses `pino.child({ package: '<name>', version: '<ver>' })`.
- **Error handling**: MCP tool errors return structured MCP error objects — never throw unhandled exceptions.
- **Process detection**: use `/proc/{pid}/cmdline` (null-byte separated args) to identify app IDs — not `ps aux` string matching.
- **Companion repo**: `nddipiazza/robos-intellij` — forked IntelliJ IDEA with RobOS IPC layer on port 63343.
