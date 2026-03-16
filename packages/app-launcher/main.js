const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

// QEMU/VM flags
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

let mainWindow = null;

const DESKTOP_DIRS = [
  '/usr/share/applications',
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
  const seen = new Set();

  for (const dir of DESKTOP_DIRS) {
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.desktop') || seen.has(file)) continue;
      seen.add(file);

      const entry = parseDesktopFile(path.join(dir, file));
      if (!entry || !entry.name || !entry.exec) continue;
      if (entry.type && entry.type !== 'Application') continue;
      if (entry.noDisplay || entry.hidden) continue;

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
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    center: true,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Close on blur (click outside)
  mainWindow.on('blur', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.close();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  ipcMain.handle('get-desktop-entries', () => getDesktopEntries());

  ipcMain.handle('launch-app', (_event, exec) => {
    const cmd = cleanExec(exec);
    const child = spawn(cmd, {
      shell: true,
      detached: true,
      stdio: 'ignore'
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
});

app.on('window-all-closed', () => app.quit());
