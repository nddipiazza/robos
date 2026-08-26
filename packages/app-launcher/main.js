const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const cp = require('child_process');
const { spawn } = cp;

const WINDOW_TITLE = 'RobOS App Launcher';

// Mutter / dash-to-panel ignore Electron's skipTaskbar:true on Linux unless the
// X11 state explicitly carries _NET_WM_STATE_SKIP_TASKBAR. We set type:'utility'
// in BrowserWindow (covers most WMs) and also wmctrl-pin the state below as
// belt-and-suspenders.
function pinSkipTaskbar() {
  cp.exec(
    `WID=$(xdotool search --name "${WINDOW_TITLE}" 2>/dev/null | head -1); ` +
    `[ -n "$WID" ] && wmctrl -ir $WID -b add,skip_taskbar,skip_pager 2>/dev/null`,
    { timeout: 3000, env: { ...process.env, DISPLAY: process.env.DISPLAY || ':0' }, shell: '/bin/bash' },
    () => {}
  );
}

// Distinct app name + userData so this app's single-instance lock doesn't
// collide with the default ~/.config/Electron/ shared by every other Electron
// process. Without this, a stale Singleton lock from any unrelated Electron
// crash would silently block the launcher from spawning.
app.setName('robos-app-launcher');
app.setPath('userData', path.join(process.env.HOME || '/home/robos', '.config', 'robos', 'electron', 'app-launcher'));

// Toggle behavior: pressing Super_L while the launcher is already open should
// close it, not spawn a second process. requestSingleInstanceLock() returns
// false in the second invocation; the running first instance receives the
// 'second-instance' event and closes its window (which exits the app per the
// window-all-closed handler at the bottom of this file).
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}
app.on('second-instance', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.close();
  }
});

// Debug server for DOM snapshots (robos-lib)
let debugServer = null;
try {
  const { registerSnapshotIPC, startDebugServer } = require('/usr/local/share/robos/robos-lib/dom-snapshot');
  debugServer = { registerSnapshotIPC, startDebugServer };
} catch { /* robos-lib not installed, debug disabled */ }

// QEMU/VM flags
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

let mainWindow = null;

const DESKTOP_DIRS = [
  '/usr/share/applications',
  '/var/lib/snapd/desktop/applications',
  path.join(process.env.HOME || '/home/robos', '.local/share/applications')
];

const ICON_SEARCH_PATHS = [
  '/usr/share/icons/Yaru/48x48/apps',
  '/usr/share/icons/Yaru/scalable/apps',
  '/usr/share/icons/hicolor/48x48/apps',
  '/usr/share/icons/hicolor/scalable/apps',
  '/usr/share/icons/hicolor/256x256/apps',
  '/usr/share/pixmaps'
];

const ICON_EXTENSIONS = ['.svg', '.png', '.xpm'];

function resolveIcon(iconValue) {
  if (!iconValue) return null;
  // Absolute path
  if (iconValue.startsWith('/')) {
    return fs.existsSync(iconValue) ? iconValue : null;
  }
  // Search icon theme directories
  for (const dir of ICON_SEARCH_PATHS) {
    // Try exact name first
    const exact = path.join(dir, iconValue);
    if (fs.existsSync(exact)) return exact;
    // Try with extensions
    for (const ext of ICON_EXTENSIONS) {
      const withExt = path.join(dir, iconValue + ext);
      if (fs.existsSync(withExt)) return withExt;
    }
  }
  return null;
}

function parseDesktopFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    let inEntry = false;
    const entry = { path: filePath };

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === '[Desktop Entry]') { inEntry = true; continue; }
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) { inEntry = false; continue; }
      if (!inEntry || !trimmed.includes('=')) continue;

      const eqIdx = trimmed.indexOf('=');
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();

      switch (key) {
        case 'Name': entry.name = entry.name || val; break;
        case 'Exec': entry.exec = val; break;
        case 'Icon': entry.icon = val; break;
        case 'Comment': entry.comment = entry.comment || val; break;
        case 'Categories': entry.categories = val; break;
        case 'Type': entry.type = val; break;
        case 'NoDisplay': entry.noDisplay = val === 'true'; break;
        case 'Hidden': entry.hidden = val === 'true'; break;
      }
    }
    return entry;
  } catch {
    return null;
  }
}

function getDesktopEntries() {
  const entries = [];
  const seenFile = new Set();
  const seenExec = new Set(); // deduplicate by resolved binary

  for (const dir of DESKTOP_DIRS) {
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.desktop') || seenFile.has(file)) continue;
      seenFile.add(file);

      const entry = parseDesktopFile(path.join(dir, file));
      if (!entry || !entry.name || !entry.exec) continue;
      if (entry.type && entry.type !== 'Application') continue;
      if (entry.noDisplay || entry.hidden) continue;

      // Deduplicate: avoid two .desktop files launching the same app.
      // For generic launchers (electron, python, java, snap), use the full cleaned exec as the key
      // so we don't accidentally collapse all Electron apps into one.
      const cleaned = cleanExec(entry.exec);
      const bin = cleaned.split(/\s+/)[0].replace(/^.*\//, '').toLowerCase();
      const GENERIC_LAUNCHERS = new Set(['electron', 'python', 'python3', 'java', 'node', 'ruby', 'perl', 'snap']);
      const dedupeKey = GENERIC_LAUNCHERS.has(bin) ? cleaned.toLowerCase() : bin;
      if (dedupeKey && seenExec.has(dedupeKey)) continue;
      if (dedupeKey) seenExec.add(dedupeKey);

      entry.iconPath = resolveIcon(entry.icon);
      entries.push(entry);
    }
  }

  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

function cleanExec(exec) {
  // Strip field codes (%f, %u, %F, %U, etc.)
  return exec.replace(/%[fFuUdDnNickvm]/g, '').trim();
}

function createWindow() {
  const winW = 800;
  const winH = 600;
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenW, height: screenH, x: screenX, y: screenY } = primaryDisplay.bounds;
  const posX = Math.round(screenX + (screenW - winW) / 2);
  const posY = Math.round(screenY + (screenH - winH) / 2);

  mainWindow = new BrowserWindow({
    x: posX,
    y: posY,
    width: winW,
    height: winH,
    center: true,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    type: 'utility',
    title: WINDOW_TITLE,
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Re-assert skip-taskbar at the X11 state level after the window appears
  mainWindow.once('ready-to-show', () => {
    setTimeout(pinSkipTaskbar, 200);
    setTimeout(pinSkipTaskbar, 1500);
  });

  // Reposition on screen resize
  const onDisplayChange = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const { width: sw, height: sh, x: sx, y: sy } = screen.getPrimaryDisplay().bounds;
    mainWindow.setBounds({
      x: Math.round(sx + (sw - winW) / 2),
      y: Math.round(sy + (sh - winH) / 2),
      width: winW,
      height: winH,
    });
  };
  screen.on('display-metrics-changed', onDisplayChange);

  // Close on blur (click outside)
  mainWindow.on('blur', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.close();
    }
  });

  mainWindow.on('closed', () => {
    screen.removeListener('display-metrics-changed', onDisplayChange);
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  ipcMain.handle('get-desktop-entries', () => getDesktopEntries());

  ipcMain.handle('launch-app', (_event, exec) => {
    const cmd = cleanExec(exec);
    const uid = process.getuid ? process.getuid() : null;
    const env = { ...process.env, DISPLAY: process.env.DISPLAY || ':0' };
    if (!env.DBUS_SESSION_BUS_ADDRESS && uid !== null) {
      env.DBUS_SESSION_BUS_ADDRESS = `unix:path=/run/user/${uid}/bus`;
    }
    if (!env.XDG_RUNTIME_DIR && uid !== null) {
      env.XDG_RUNTIME_DIR = `/run/user/${uid}`;
    }
    const child = spawn(cmd, {
      shell: true,
      detached: true,
      stdio: 'ignore',
      env,
    });
    child.unref();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.close();
    }
  });

  ipcMain.handle('close-window', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.close();
    }
  });

  createWindow();

  // Enable debug server for DOM snapshots
  if (debugServer && mainWindow) {
    debugServer.registerSnapshotIPC(mainWindow);
    debugServer.startDebugServer(mainWindow, 19100, 'app-launcher');
  }
});

app.on('window-all-closed', () => app.quit());
