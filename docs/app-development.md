# RobOS — App Development & Deployment Guide

How to develop, build, and deploy RobOS Electron applications.

---

## App Stack

All RobOS desktop apps are **Electron apps** written in vanilla JavaScript (no bundler/transpiler — direct `require()` in renderer and main). They share a consistent structure:

```
packages/<app-name>/
├── main.js          ← Electron main process (Node.js, IPC handlers)
├── preload.js       ← contextBridge: exposes IPC to renderer
├── renderer/
│   ├── index.html
│   ├── app.js       ← renderer logic
│   └── style.css
└── package.json     ← { "main": "main.js", "scripts": { "start": "electron ." } }
```

---

## Required Electron Flags (QEMU VM)

Every RobOS Electron app **must** be launched with all three flags:

```bash
electron /usr/local/share/robos/<app>/main.js \
  --no-sandbox \
  --disable-gpu \
  --disable-dev-shm-usage
```

| Flag | Why |
|---|---|
| `--no-sandbox` | Required when running as root or in restricted environments |
| `--disable-gpu` | Prevents GPU process crashes in the QEMU virtual GPU |
| `--disable-dev-shm-usage` | **Critical** — without this, renderer windows appear completely blank. The `/dev/shm` shared memory device is too small in the QEMU VM for Electron's default shared memory usage |

Missing `--disable-dev-shm-usage` results in a blank white/black renderer window that appears to open but shows nothing.

---

## IPC Pattern

All communication between renderer and main process uses Electron's `contextBridge` + `ipcRenderer.invoke` pattern:

**preload.js**:
```js
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('gp', {   // 'gp', 'ide', 'wm', etc. per app
  readProjects: () => ipcRenderer.invoke('read-projects'),
  writeProjects: (data) => ipcRenderer.invoke('write-projects', data),
});
```

**main.js**:
```js
ipcMain.handle('read-projects', () => { /* ... */ });
```

**renderer/app.js**:
```js
const projects = await gp.readProjects();
```

> **Gotcha**: If any `document.getElementById('some-id').onclick = ...` in `selectProject()` or similar wiring function targets an element that no longer exists in the HTML, it throws `Cannot set properties of null` and crashes the entire function silently — leaving all subsequent buttons unwired. Always guard with `?.onclick` or verify element IDs match between HTML and JS.

---

## Deployment

Apps are deployed to the VM via `scp`. Files in `/usr/local/share/robos/` are owned by `root` and require `sudo chmod o+w` before overwriting:

```bash
# Fix permissions
ssh -p 2222 robos@localhost "sudo chmod o+w /usr/local/share/robos/<app>/main.js"

# Deploy
scp -P 2222 packages/<app>/main.js robos@localhost:/usr/local/share/robos/<app>/main.js
```

### Kill & Restart

`pkill`/`killall` are not available. Use explicit PIDs:

```bash
# Find PID
ssh -p 2222 robos@localhost "pgrep -fa '<app>/node_modules/.bin/electron' | awk '{print \$1}'"

# Kill main process (children terminate automatically)
ssh -p 2222 robos@localhost "kill <PID>"

# Restart
ssh -p 2222 robos@localhost "DISPLAY=:0 nohup /usr/local/bin/<app> > /tmp/<app>.log 2>&1 &"
```

### Wrapper Scripts

Each app has a wrapper at `/usr/local/bin/<app>`:

```bash
#!/bin/bash
exec electron /usr/local/share/robos/<app>/main.js \
  --no-sandbox --disable-gpu --disable-dev-shm-usage "$@"
```

---

## Debugging

### View app logs
```bash
ssh -p 2222 robos@localhost "cat /tmp/<app>.log | grep -v 'GPU\|viz_main\|shared_image\|raster\|mailbox'"
```

### Remote DevTools
Launch with debug port:
```bash
DISPLAY=:0 /usr/local/bin/<app> --remote-debugging-port=9229 &
# DevTools inspector available at http://localhost:9229
```

---

## Design System

All apps use a consistent dark theme:

| Token | Value | Usage |
|---|---|---|
| Background | `#0d1117` | App background |
| Surface | `#161b22` | Cards, panels |
| Border | `#30363d` | Dividers |
| Text primary | `#e6edf3` | Headings |
| Text secondary | `#c9d1d9` | Body |
| Text muted | `#8b949e` | Labels, hints |
| Accent blue | `#388bfd` | Links, active states |
| Accent cyan | `#79c0ff` | Highlights |
| Success | `#3fb950` | Done, cloned |
| Warning | `#d29922` | Pending, warnings |
| Danger | `#f85149` | Errors, destructive |

Primary button: `#238636` (GitHub green). Secondary: `#21262d`.

---

## Monaco Editor Integration

Scripts and multi-line content use Monaco editor (VS Code's editor):

```js
// Initialise
const ed = monaco.editor.create(container, {
  value: initialContent,
  language: 'shell',
  theme: 'vs-dark',
  minimap: { enabled: false },
  lineNumbers: 'off',
  scrollBeyondLastLine: false,
  wordWrap: 'on',
  fontSize: 12,
  automaticLayout: true,
});

// Read value
const script = ed.getValue();

// Set value
ed.setValue(newContent);
```

Monaco editors initialised while hidden (e.g. in a tab that's not active) render at 0×0. Force layout when the tab becomes visible:

```js
if (tab === 'devsetup') {
  setTimeout(() => Object.values(monacoEditors).forEach(ed => ed?.layout()), 30);
}
```
