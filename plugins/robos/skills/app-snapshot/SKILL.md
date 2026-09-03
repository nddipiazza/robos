---
name: app-snapshot
description: Capture DOM snapshots (text, JSON, or screenshot) from running RobOS Electron apps for debugging without VNC.
---

# Capture RobOS App DOM Snapshot

Capture a DOM snapshot from a running RobOS Electron app for debugging without VNC.

## Input

$ARGUMENTS — `<app-id>` optionally followed by `--json` or `--screenshot` (default: text snapshot)

## How it works

Each RobOS Electron app runs a debug HTTP server on a unique port (19100+). The snapshot captures the current DOM state — like Playwright's `page.accessibility.snapshot()` but for Electron.

### Port Registry
- app-launcher: 19100
- dev-central: 19101
- git-projects: 19102
- (see `packages/robos-lib/snapshot-cli.js` for full list)

### Capture Methods

**Text snapshot** (default) — human-readable DOM tree:
```bash
ssh -p 2224 -o StrictHostKeyChecking=no robos@localhost \
  "curl -s http://localhost:<port>/text-snapshot"
```

**JSON snapshot** — full DOM tree with bounds, attributes:
```bash
ssh -p 2224 -o StrictHostKeyChecking=no robos@localhost \
  "curl -s http://localhost:<port>/snapshot"
```

**Screenshot** — PNG image:
```bash
ssh -p 2224 -o StrictHostKeyChecking=no robos@localhost \
  "curl -s http://localhost:<port>/screenshot" > /tmp/screenshot.png
```

**Eval JS** — execute arbitrary JS in the renderer:
```bash
ssh -p 2224 -o StrictHostKeyChecking=no robos@localhost \
  "curl -s -X POST -d 'document.title' http://localhost:<port>/eval"
```

### When to use

- Debugging UI issues without VNC access
- Verifying app state after actions (click, search, navigate)
- Automated testing of RobOS apps
- Checking if elements are visible, what text they contain, their layout

### Adding debug support to a new app

In the app's `main.js`, after creating the BrowserWindow:
```javascript
const { registerSnapshotIPC, startDebugServer } = require('/usr/local/share/robos/robos-lib/dom-snapshot');
registerSnapshotIPC(mainWindow);
startDebugServer(mainWindow, PORT, 'app-id');
```
