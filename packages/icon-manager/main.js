'use strict';

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs   = require('fs');
const cp   = require('child_process');

const REGISTRY_PATH   = path.join(process.env.HOME, '.config', 'robos', 'icon-registry.json');
const DESKTOP_DIRS    = ['/usr/share/applications', '/usr/local/share/applications'];
const ROBOS_BASE      = '/usr/local/share/robos';

// ── Registry helpers ──────────────────────────────────────────────────────────
function readRegistry() {
  try { return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8')); }
  catch { return { version: 1, icons: {} }; }
}

function writeRegistry(reg) {
  fs.mkdirSync(path.dirname(REGISTRY_PATH), { recursive: true });
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(reg, null, 2), 'utf8');
}

// ── Parse a .desktop file ────────────────────────────────────────────────────
function parseDesktop(filePath) {
  try {
    const lines = fs.readFileSync(filePath, 'utf8').split('\n');
    const get = (key) => {
      const l = lines.find(l => l.startsWith(key + '='));
      return l ? l.slice(key.length + 1).trim() : null;
    };
    return {
      name:     get('Name'),
      icon:     get('Icon'),
      exec:     get('Exec'),
      comment:  get('Comment'),
      category: get('X-RobOS-Category'),
      isRobOS:  get('X-RobOS-App') === 'true',
    };
  } catch { return null; }
}

// ── Discover all installed RobOS apps from .desktop files ────────────────────
function discoverApps() {
  const apps = {};

  for (const dir of DESKTOP_DIRS) {
    if (!fs.existsSync(dir)) continue;
    for (const filename of fs.readdirSync(dir)) {
      if (!filename.endsWith('.desktop')) continue;
      const filePath = path.join(dir, filename);
      const parsed = parseDesktop(filePath);
      if (!parsed?.isRobOS || !parsed?.name) continue;

      const appId = filename.replace(/\.desktop$/, '');
      if (apps[appId]) continue; // first directory wins

      // Try to read the icon SVG inline if it's an SVG file
      let iconSvg = null;
      if (parsed.icon && parsed.icon.endsWith('.svg')) {
        try { iconSvg = fs.readFileSync(parsed.icon, 'utf8'); } catch {}
      }

      // Also check the standard location
      if (!iconSvg) {
        const stdIcon = path.join(ROBOS_BASE, appId, 'icon.svg');
        try { iconSvg = fs.readFileSync(stdIcon, 'utf8'); } catch {}
      }

      apps[appId] = {
        appId,
        label:       parsed.name.replace(/^RobOS\s+/, ''),
        category:    parsed.category || 'System',
        comment:     parsed.comment || '',
        iconPath:    parsed.icon || null,
        iconSvg,
        desktopFile: filePath,
      };
    }
  }

  return apps;
}

// ── Build icon list: discovered apps + user customizations from registry ─────
function buildIconList() {
  const apps = discoverApps();
  const reg = readRegistry();

  // Overlay user customizations (custom icon paths)
  for (const [appId, entry] of Object.entries(reg.icons)) {
    if (apps[appId] && entry.iconPath) {
      apps[appId].customIconPath = entry.iconPath;
    }
  }

  return apps;
}

// ── IPC ───────────────────────────────────────────────────────────────────────
ipcMain.handle('ri-list-icons', () => {
  return { ok: true, icons: buildIconList() };
});

ipcMain.handle('ri-get-icon', (_, appId) => {
  const icons = buildIconList();
  return icons[appId] || null;
});

ipcMain.handle('ri-update-icon', async (_, appId) => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Choose Icon',
    filters: [{ name: 'Images', extensions: ['svg', 'png', 'jpg', 'jpeg', 'ico'] }],
    properties: ['openFile'],
  });
  if (canceled || !filePaths.length) return { ok: false };

  const newPath = filePaths[0];
  const reg = readRegistry();
  if (!reg.icons[appId]) reg.icons[appId] = { appId };
  reg.icons[appId].iconPath = newPath;
  writeRegistry(reg);

  // Also write the icon to the app's install directory and update .desktop
  const appDir = path.join(ROBOS_BASE, appId);
  const iconDest = path.join(appDir, 'icon.svg');
  if (newPath.endsWith('.svg') && fs.existsSync(appDir)) {
    try {
      const content = fs.readFileSync(newPath, 'utf8');
      writeFileSudo(iconDest, content);
      // Update .desktop Icon= to point to standard location
      for (const dir of DESKTOP_DIRS) {
        const desktop = path.join(dir, `${appId}.desktop`);
        if (fs.existsSync(desktop)) {
          try {
            let contents = fs.readFileSync(desktop, 'utf8');
            contents = contents.replace(/^Icon=.*$/m, `Icon=${iconDest}`);
            writeFileSudo(desktop, contents);
          } catch {}
          break;
        }
      }
    } catch {}
  }

  return { ok: true, iconPath: newPath };
});

// ── Write a file, falling back to sudo cp if lacking permissions ─────────────
function writeFileSudo(filePath, content) {
  try {
    fs.writeFileSync(filePath, content, 'utf8');
    return { ok: true };
  } catch (e) {
    if (e.code !== 'EACCES' && e.code !== 'EPERM') return { ok: false, error: e.message };
    const tmp = `/tmp/robos-push-icon-${Date.now()}`;
    try {
      fs.writeFileSync(tmp, content, 'utf8');
      cp.execSync(`sudo cp "${tmp}" "${filePath}"`, { timeout: 8000 });
      try { fs.unlinkSync(tmp); } catch {}
      return { ok: true };
    } catch (err) {
      try { fs.unlinkSync(tmp); } catch {}
      return { ok: false, error: err.message };
    }
  }
}

// ── Push icons: ensure every app's icon.svg is written and .desktop updated ──
ipcMain.handle('ri-push-icons', async (event) => {
  const apps = Object.values(buildIconList());
  const results = [];
  const total = apps.length;

  for (let i = 0; i < apps.length; i++) {
    const { appId, label, iconSvg, iconPath } = apps[i];
    const appDir     = path.join(ROBOS_BASE, appId);
    const iconFile   = path.join(appDir, 'icon.svg');
    const result = { appId, label, step: i + 1, total, ok: true };

    if (!iconSvg) {
      result.ok = false;
      result.error = 'no SVG source available';
      results.push(result);
      event.sender.send('ri-push-progress', result);
      await new Promise(resolve => setTimeout(resolve, 25));
      continue;
    }

    // Ensure app directory exists
    try {
      if (!fs.existsSync(appDir)) cp.execSync(`sudo mkdir -p "${appDir}"`, { timeout: 5000 });
    } catch {
      try { fs.mkdirSync(appDir, { recursive: true }); } catch {}
    }

    // Write SVG (upscale 48→64 if applicable)
    const svg64 = iconSvg.replace('width="48" height="48"', 'width="64" height="64"');
    const writeRes = writeFileSudo(iconFile, svg64);
    if (!writeRes.ok) {
      result.ok = false;
      result.error = `icon write: ${writeRes.error}`;
    } else {
      result.iconWritten = true;
    }

    // Update .desktop Icon= to point to the written file
    for (const dir of DESKTOP_DIRS) {
      const desktopFile = path.join(dir, `${appId}.desktop`);
      if (fs.existsSync(desktopFile)) {
        let contents;
        try { contents = fs.readFileSync(desktopFile, 'utf8'); } catch {}
        if (contents) {
          const updated = contents.replace(/^Icon=.*$/m, `Icon=${iconFile}`);
          const deskRes = writeFileSudo(desktopFile, updated);
          if (!deskRes.ok) {
            result.error = (result.error ? result.error + '; ' : '') + `desktop: ${deskRes.error}`;
          } else {
            result.desktopUpdated = true;
          }
        }
        break;
      }
    }

    results.push(result);
    event.sender.send('ri-push-progress', result);
    await new Promise(resolve => setTimeout(resolve, 25));
  }

  cp.exec('update-desktop-database /usr/share/applications 2>/dev/null', () => {});

  const pushed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;
  return { ok: failed === 0, results, pushed, failed };
});

ipcMain.handle('ri-read-image', (_, filePath) => {
  try {
    if (!filePath || !filePath.startsWith('/')) return null;
    const buf = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase().slice(1);
    const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch { return null; }
});

ipcMain.handle('ri-open-dev-console', () => {
  BrowserWindow.getAllWindows()[0]?.webContents.openDevTools();
});

// ── Window ────────────────────────────────────────────────────────────────────
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

app.setPath('userData', path.join(require('os').homedir(), '.config', 'robos', 'electron', 'icon-manager'));

const lock = app.requestSingleInstanceLock();
if (!lock) { app.quit(); }

app.setName('robos-icon-manager');

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 1100, height: 700,
    title: 'RobOS Icon Manager',
    backgroundColor: '#0d1117',
    icon: path.join(__dirname, 'icon.svg'),
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.on('closed', () => app.quit());
});
