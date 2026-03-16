# Create a new RobOS Electron App

Create a new RobOS desktop application (Electron app) with all required files and registrations.

## Input

$ARGUMENTS — The app name in human-readable form (e.g. "Dev Central", "Git Projects", "Work Journal")

## What to create

Derive `app-id` from the name: lowercase, spaces to hyphens (e.g. "Dev Central" → "dev-central").

### 1. App directory: `packages/<app-id>/`

Create these files following RobOS conventions:

**`package.json`**:
```json
{
  "name": "robos-<app-id>",
  "version": "0.1.0",
  "description": "<description>",
  "main": "main.js",
  "dependencies": { "electron": "^28.0.0" }
}
```

**`main.js`** — Electron main process:
- Import electron, path, fs, child_process
- Append QEMU flags: `--no-sandbox`, `--disable-gpu`, `--disable-dev-shm-usage`
- Create BrowserWindow: `backgroundColor: '#0d1117'`, `contextIsolation: true`, preload
- `app.setName('robos-<app-id>')`
- Register IPC handlers via `ipcMain.handle()`
- Load `renderer/index.html`

**`preload.js`** — contextBridge IPC (never use nodeIntegration):
```javascript
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('robos', {
  // app-specific methods
});
```

**`renderer/index.html`** — App shell with dark theme
**`renderer/app.js`** — Renderer logic
**`renderer/style.css`** — Dark theme using RobOS palette:
- `--bg-primary: #0d1117`, `--bg-card: #161b22`, `--accent: #00bcd4`

**`icon.svg`** — 48x48 SVG icon, Lucide style:
- `stroke-width="1.5"`, `stroke-linecap="round"`, `stroke-linejoin="round"`
- Use a color from the RobOS palette: `#00bcd4` (cyan), `#3b82f6` (blue), `#22c55e` (green), `#7c3aed` (purple), `#ec4899` (pink), `#f97316` (orange), `#eab308` (yellow), `#ef4444` (red), `#14b8a6` (teal)
- Pick a Lucide icon concept that matches the app's purpose

**`<app-id>.desktop`**:
```ini
[Desktop Entry]
X-RobOS-App=true
Version=1.0
Type=Application
Name=RobOS <App Name>
Comment=<description>
Exec=/usr/bin/electron /usr/local/share/robos/<app-id>/main.js --no-sandbox --disable-gpu --disable-dev-shm-usage
Icon=/usr/local/share/robos/<app-id>/icon.svg
Terminal=false
Categories=<freedesktop-category>;
X-RobOS-Category=<Dev|AI|Security|People|Journal|System|Internet|Tools>
StartupWMClass=robos-<app-id>
```

### 2. Register in `packages/robos-icons/index.js`

Add an entry to the `BUILTIN_APPS` array (in alphabetical order by appId):
```javascript
{
  appId: '<app-id>',
  label: '<App Name>',
  category: '<RobOS category>',
  iconSvg: `<the icon.svg content>`
}
```

### 3. Update CLAUDE.md App Suite table

Add the new app to the appropriate section in the App Suite tables in CLAUDE.md.

## Validation

- Verify all files exist in `packages/<app-id>/`
- Verify the .desktop file has `X-RobOS-App=true`
- Verify `X-RobOS-Category` is one of: Dev, AI, Security, People, Journal, System, Internet, Tools
- Verify icon.svg is valid SVG with 48x48 dimensions
- Verify the app is registered in `packages/robos-icons/index.js`
