# RobOS — Gemini CLI Instructions

This file provides guidance to Gemini CLI when working with this repository.

## What Is RobOS

RobOS is a Linux-based desktop OS (Ubuntu + GNOME) purpose-built for software engineers. Every virtual desktop maps to a Jira ticket. MCP servers connect an AI layer to GitHub, Jira, Slack, VPNs, IDEs, calendars, and the desktop itself. Electron apps in `packages/<app-id>/` provide the GUI.

---

## Development Workflow

**Rule: always use the dev harness for testing. SSH deploy is for final verification only.**

```bash
# Run an app in the sandbox
node packages/dev-harness/harness.js --app <app-id> --scenario <scenario>

# Discover apps and scenarios
node packages/dev-harness/harness.js --list-apps
node packages/dev-harness/harness.js --list-scenarios
```

Available scenarios: `all-good`, `no-gh-auth`, `no-ssh-key`, `ssh-not-on-github`, `scope-missing`, `git-config-missing`, `all-broken`

Once the harness confirms everything works, deploy to the VM:

```bash
ssh -o StrictHostKeyChecking=no -p 2224 robos@localhost
# Inside VM:
packages/desktop-shell/install.sh
```

VM launch: `./infra/desktop/run.sh` (use `--vnc` for `vncviewer localhost:5910`)

---

## Architecture

No root `package.json` — each package in `packages/` has its own `node_modules`.

Key packages:

| Package | Role |
|---------|------|
| `desktop-manager/` | System tray, app launcher IPC socket, `APP_REGISTRY`, `APP_BINS` |
| `desktop-shell/` | GNOME shell extensions, `install.sh` |
| `robos-icons/` | Canonical SVG icon registry (Node + browser) |
| `icon-lib/` | Duplicate icon registry — keep in sync with `robos-icons/` |
| `robos-lib/` | Category registry, `.desktop` file validator |
| `task-manager/` | Process viewer, `KNOWN_APPS` map |
| `dev-harness/` | Electron sandbox with stub CLIs and named scenarios |
| `mcp-servers/` | One MCP server per integration domain |

---

## Electron App Requirements

`packages/<app-id>/main.js` must always include:

```javascript
app.setName('<app-id>');              // X11 WM_CLASS — must be first
app.requestSingleInstanceLock();
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');
app.whenReady().then(createWindow);
```

`<app-id>.desktop` must include:

```ini
X-RobOS-App=true
Exec=/usr/local/bin/robos-launch <app-id>
StartupWMClass=<app-id>    ← must match app.setName(); never "electron"
X-RobOS-Category=<System|Developer|Security|Team|Tools>
```

---

## App Registration — 8 Required Locations

Every new, renamed, or deleted app must update all 8:

1. `packages/<app-id>/` — the app package
2. `packages/desktop-manager/main.js` — `APP_REGISTRY` + `APP_BINS`
3. `packages/robos-icons/builtin-apps.js` — `BUILTIN_APPS`
4. `packages/robos-icons/builtin-apps-browser.js` — `ROBOS_BUILTIN_APPS`
5. `packages/icon-lib/builtin-apps.js` — `BUILTIN_APPS`
6. `packages/task-manager/main.js` — `KNOWN_APPS`
7. `packages/desktop-shell/install.sh` — install block
8. `<app-id>.desktop` → `/usr/local/share/applications/`

---

## Icon Rules

- Icons must come from `packages/robos-icons/builtin-apps.js`. Never inline SVG or use emoji as visual icons in renderer HTML.
- SVG format: 48×48, `stroke="#00bcd4"`, `stroke-width="1.5"` (Lucide icon style).
- Resize to 28×28 in title bars, 64×64 in empty states.

---

## Conventions

- **Commits**: Conventional Commits (`feat:`, `fix:`, `chore:`, etc.)
- **Display names**: `RobOS <Human Name>` in source; launcher strips `RobOS ` prefix at render time
- **Config**: env vars only, validated with `zod`; no hardcoded secrets or magic globals
- **MCP servers**: standalone Node.js, stdio or SSE transport; must include `healthcheck` tool returning `{ ok: true }`
- **Logging**: `pino` JSON logging; each package uses a child logger with `package` and `version` fields
- **Process detection**: read `/proc/{pid}/cmdline` (null-separated), not `ps aux` regex
- **Companion repo**: `nddipiazza/robos-intellij` — IntelliJ fork with RobOS IPC on port 63343
