const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const fs   = require('fs');
const cp   = require('child_process');

const APP_DIRS = [
  '/usr/local/share/applications',
  '/usr/share/applications',
];

// ── .desktop parser ──────────────────────────────────────────────────────────

function parseDesktopFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const entry = {};
    for (const line of content.split('\n')) {
      const m = line.match(/^([^=\[#][^=]*)=(.*)$/);
      if (m) entry[m[1].trim()] = m[2].trim();
    }
    if (entry.Type !== 'Application') return null;
    if (entry.NoDisplay === 'true' || entry.Hidden === 'true') return null;
    if (!entry.Name || !entry.Exec) return null;

    return {
      name:          entry.Name,
      comment:       entry.Comment || '',
      exec:          entry.Exec.replace(/ %[uUfFdDnNickvm]/g, '').trim(),
      icon:          entry.Icon || '',
      categories:    (entry.Categories || '').split(';').filter(Boolean),
      robosCategory: entry['X-RobOS-Category'] || '',
      keywords:      (entry.Keywords || '').toLowerCase(),
      file:          path.basename(filePath),
    };
  } catch { return null; }
}

function listApps() {
  const seen = new Set();
  const apps = [];
  for (const dir of APP_DIRS) {
    try {
      for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.desktop'))) {
        if (seen.has(file)) continue;
        seen.add(file);
        const a = parseDesktopFile(path.join(dir, file));
        if (a) apps.push({ ...a, iconPath: resolveIcon(a.icon) });
      }
    } catch {}
  }
  return apps.sort((a, b) => a.name.localeCompare(b.name));
}

const ICON_PATHS = [
  (n) => n.startsWith('/') ? n : null,
  (n) => `/usr/local/share/pixmaps/${n}.svg`,
  (n) => `/usr/local/share/pixmaps/${n}.png`,
  (n) => `/usr/share/pixmaps/${n}.svg`,
  (n) => `/usr/share/pixmaps/${n}.png`,
  (n) => `/usr/share/icons/hicolor/48x48/apps/${n}.png`,
  (n) => `/usr/share/icons/hicolor/scalable/apps/${n}.svg`,
  (n) => `/usr/share/icons/hicolor/256x256/apps/${n}.png`,
  (n) => `/usr/local/share/robos/${n}/${n}.svg`,
];

function resolveIcon(iconName) {
  if (!iconName) return null;
  for (const fn of ICON_PATHS) {
    const p = fn(iconName);
    if (!p) continue;
    try { fs.accessSync(p); return p; } catch {}
  }
  return null;
}

// ── Window ───────────────────────────────────────────────────────────────────

let win;
function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  win = new BrowserWindow({
    width, height, x: 0, y: 0,
    frame: false,
    show: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#0d1117',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
    title: 'RobOS App Launcher',
  });
  win.loadFile('renderer/index.html');
  // Delay blur-to-close so the window has time to fully show before
  // any transient focus loss during startup triggers a premature close
  win.once('ready-to-show', () => {
    win.show();
    setTimeout(() => {
      if (win && !win.isDestroyed()) {
        win.on('blur', () => { if (win && !win.isDestroyed()) win.close(); });
      }
    }, 500);
  });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

// ── IPC ──────────────────────────────────────────────────────────────────────

ipcMain.handle('list-apps', () => listApps());

ipcMain.handle('launch-app', (_, exec) => {
  try {
    cp.spawn('bash', ['-c', `DISPLAY=:0 ${exec}`], {
      detached: true, stdio: 'ignore',
      env: { ...process.env, DISPLAY: ':0' },
    }).unref();
    return { ok: true };
  } catch(e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('close', () => { if (win && !win.isDestroyed()) win.close(); });
