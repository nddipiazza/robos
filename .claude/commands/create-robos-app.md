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

### 4. Deploy to VM

After creating the app locally, deploy it to the running RobOS VM. Use `-o StrictHostKeyChecking=no` for all SSH/SCP commands.

**IMPORTANT:** The RobOS App Launcher discovers apps from `.desktop` files in `/usr/share/applications/` (NOT `/usr/local/share/applications/`). All `.desktop` files MUST go there.

**Step 1 — Copy app files to VM:**
```bash
scp -P 2224 -o StrictHostKeyChecking=no -r packages/<app-id>/* robos@localhost:/tmp/<app-id>-deploy/
```

**Step 2 — Install on VM and fix permissions:**
`sudo cp -r` creates files owned by root with restrictive permissions. You MUST `chmod` afterwards so Electron (running as user `robos`) can read the files.
```bash
ssh -p 2224 -o StrictHostKeyChecking=no robos@localhost \
  'sudo rm -rf /usr/local/share/robos/<app-id> && \
   sudo cp -r /tmp/<app-id>-deploy /usr/local/share/robos/<app-id> && \
   sudo chmod -R a+rX /usr/local/share/robos/<app-id> && \
   sudo bash -c "cd /usr/local/share/robos/<app-id> && npm install --quiet"'
```

**Step 3 — Install .desktop file to `/usr/share/applications/`:**
```bash
ssh -p 2224 -o StrictHostKeyChecking=no robos@localhost \
  'sudo cp /usr/local/share/robos/<app-id>/<app-id>.desktop /usr/share/applications/<app-id>.desktop'
```

**Step 4 — Deploy any shared library dependencies:**
If the app requires shared packages (e.g. `robos-icons`, `robos-lib`), check if they exist on the VM at `/usr/local/share/robos/<lib-name>/` and deploy them too:
```bash
scp -P 2224 -o StrictHostKeyChecking=no -r packages/<lib-name>/* robos@localhost:/tmp/<lib-name>-deploy/
ssh -p 2224 -o StrictHostKeyChecking=no robos@localhost \
  'sudo rm -rf /usr/local/share/robos/<lib-name> && \
   sudo cp -r /tmp/<lib-name>-deploy /usr/local/share/robos/<lib-name> && \
   sudo chmod -R a+rX /usr/local/share/robos/<lib-name>'
```

**Step 5 — Test launch:**
```bash
ssh -p 2224 -o StrictHostKeyChecking=no robos@localhost \
  'DISPLAY=:0 /usr/bin/electron /usr/local/share/robos/<app-id>/main.js --no-sandbox --disable-gpu --disable-dev-shm-usage &
   sleep 3 && ps aux | grep <app-id> | grep -v grep'
```

**Step 6 — Verify deployment:**
```bash
ssh -p 2224 -o StrictHostKeyChecking=no robos@localhost \
  'ls /usr/local/share/robos/<app-id>/ && \
   cat /usr/share/applications/<app-id>.desktop'
```

VM credentials: `robos` / `robos` (SSH port 2224).

## Validation

- Verify all files exist in `packages/<app-id>/`
- Verify the .desktop file has `X-RobOS-App=true`
- Verify `X-RobOS-Category` is one of: Dev, AI, Security, People, Journal, System, Internet, Tools
- Verify icon.svg is valid SVG with 48x48 dimensions
- Verify the app is registered in `packages/robos-icons/index.js`
- Verify the app is deployed to `/usr/local/share/robos/<app-id>/` on the VM with world-readable permissions
- Verify the .desktop file is installed at `/usr/share/applications/<app-id>.desktop` on the VM (NOT `/usr/local/share/applications/`)
- Verify any shared library dependencies are deployed on the VM
- Verify the app launches successfully via `DISPLAY=:0 /usr/bin/electron ...`
