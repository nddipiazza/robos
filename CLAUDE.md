# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

RobOS is a Linux-based desktop OS (Ubuntu foundation) purpose-built for software engineers. The entire UX revolves around the SDLC: virtual desktops map to Jira tickets, MCP servers connect AI to external systems, and Electron apps provide the desktop GUI.

## Development Commands

### Dev Harness (primary testing method)
```bash
# Run an Electron app in the dev harness sandbox
node packages/dev-harness/harness.js --app <app-id> --scenario <scenario>

# List available apps and scenarios
node packages/dev-harness/harness.js --list-apps
node packages/dev-harness/harness.js --list-scenarios
```
Scenarios: `all-good`, `no-gh-auth`, `no-ssh-key`, `ssh-not-on-github`, `scope-missing`, `git-config-missing`, `all-broken`

**Always develop and test using the dev harness before deploying to the VM.** SSH deploy is only for final verification.

### Installing on the VM
```bash
# Full install (run inside the VM)
packages/desktop-shell/install.sh

# SSH into VM
ssh -o StrictHostKeyChecking=no -p 2224 robos@localhost
```

### VM launch
```bash
./infra/desktop/run.sh              # normal boot
./infra/desktop/run.sh --firstboot  # first boot with cloud-init
./infra/desktop/run.sh --vnc        # VNC display (connect: vncviewer localhost:5910)
./infra/desktop/run.sh --spice      # SPICE display (connect: remote-viewer spice://127.0.0.1:5930)
```

## Architecture

### Monorepo Structure
All packages live under `packages/`. There is no root `package.json` or workspace manager — each package has its own `node_modules` and is installed independently with `npm install`.

### Electron Apps
Every GUI app in `packages/<app-id>/` follows the same structure:
- `main.js` — Electron main process. Must call `app.requestSingleInstanceLock()`, `app.setName('<app-id>')` (sets X11 WM_CLASS), and append three commandLine switches: `no-sandbox`, `disable-gpu`, `disable-dev-shm-usage`.
- `preload.js` — contextBridge exposing IPC to renderer
- `renderer/` — `index.html`, `app.js`, `style.css`
- `icon.svg` — 48x48 Lucide-style SVG, `stroke="#00bcd4"`, `stroke-width="1.5"`
- `<app-id>.desktop` — freedesktop entry with `StartupWMClass=<app-id>` (must match `app.setName()`)

### Key Shared Packages
- `packages/robos-icons/builtin-apps.js` — canonical SVG icon registry (Node.js require)
- `packages/robos-icons/builtin-apps-browser.js` — browser-side icon registry (`window.ROBOS_BUILTIN_APPS`)
- `packages/icon-lib/builtin-apps.js` — duplicate icon registry (both must stay in sync)
- `packages/robos-lib/` — shared library: category registry, app manifest validation
- `packages/desktop-manager/main.js` — system tray, app launcher IPC, `APP_REGISTRY` and `APP_BINS` definitions
- `packages/task-manager/main.js` — process viewer with `KNOWN_APPS` map

### App Registration (all locations that must be updated for a new/renamed/deleted app)
1. `packages/<app-id>/` — the app package itself
2. `packages/desktop-manager/main.js` — `APPS` array and `APP_BINS` object
3. `packages/robos-icons/builtin-apps.js` — `BUILTIN_APPS` array
4. `packages/robos-icons/builtin-apps-browser.js` — `ROBOS_BUILTIN_APPS` array
5. `packages/icon-lib/builtin-apps.js` — `BUILTIN_APPS` array
6. `packages/task-manager/main.js` — `KNOWN_APPS` map
7. `packages/desktop-shell/install.sh` — install block
8. `<app-id>.desktop` file copied to `/usr/local/share/applications/`

### App Launch Mechanism
All Electron apps are launched via `robos-launch <app-id>` — no per-app wrapper scripts. The `desktop-manager` listens on a Unix socket (`/run/user/<uid>/robos-dm.sock`) for IPC launch requests.

### Icon Rules
- App logo icons must come from `packages/robos-icons/builtin-apps.js` — never inline SVG or emoji in renderer HTML
- Icons in the registry: 48x48 for registry, resized to 28x28 in title bars, 64x64 in empty states
- Emoji are only acceptable as text decorators (e.g., tray menu labels), never as visual icons

### Process Detection
`resolveAppId(pid)` reads `/proc/{pid}/cmdline` (null-separated) rather than regex-matching `ps aux` output. This correctly identifies apps even when launched from the dev-harness.

## Conventions

- **Commits**: Conventional Commits format (`feat:`, `fix:`, `chore:`, etc.)
- **Display name convention**: `RobOS <Human Name>` in source files; the launcher strips the `RobOS ` prefix at render time
- **Config**: environment variables validated with `zod` at startup; no magic globals
- **MCP servers**: each is a standalone Node.js process in `packages/mcp-servers/` exposing tools over stdio or SSE; must include a `healthcheck` tool
- **Resizable panel dividers**: Any app with a sidebar/split-pane layout must use a draggable resizer between panels (5px transparent bar, `cursor: col-resize`, highlights `#1f6feb` on hover/drag). Use the `initResizer()` pattern from `agent-scheduler` or `pass-manager` as reference. The sidebar should have `min-width` / `max-width` constraints and `border-right: none` (the resizer replaces the border).
- **Companion repo**: `nddipiazza/robos-intellij` — forked IntelliJ IDEA with RobOS IPC layer (HTTP API on port 63343)
