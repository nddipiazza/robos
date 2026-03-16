'use strict';

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs   = require('fs');
const cp   = require('child_process');

const { BUILTIN_APPS } = require('../robos-icons');
const REGISTRY_PATH   = path.join(process.env.HOME, '.config', 'robos', 'icon-registry.json');
const DESKTOP_DIR     = '/usr/local/share/applications';
const ROBOS_BASE      = '/usr/local/share/robos';
const PIXMAPS_BASE    = '/usr/local/share/pixmaps';

// ── Registry helpers ──────────────────────────────────────────────────────────
function readRegistry() {
  try { return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8')); }
  catch { return { version: 1, icons: {} }; }
}

function writeRegistry(reg) {
  fs.mkdirSync(path.dirname(REGISTRY_PATH), { recursive: true });
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(reg, null, 2), 'utf8');
}

// ── Parse a .desktop file → { name, icon, exec } ─────────────────────────────
function parseDesktop(filePath) {
  try {
    const lines = fs.readFileSync(filePath, 'utf8').split('\n');
    const get = (key) => {
      const l = lines.find(l => l.startsWith(key + '='));
      return l ? l.slice(key.length + 1).trim() : null;
    };
    return { name: get('Name'), icon: get('Icon'), exec: get('Exec') };
  } catch { return null; }
}

// ── Derive appId from desktop filename ───────────────────────────────────────
function desktopToAppId(filename) {
  return filename.replace(/\.desktop$/, '');
}

// ── Resolve an icon reference (absolute path or theme name) ─────────────────
function resolveIconPath(iconRef) {
  if (!iconRef) return null;
  if (iconRef.startsWith('/')) {
    try { fs.accessSync(iconRef); return iconRef; } catch { return iconRef; }
  }
  const candidates = [
    path.join(ROBOS_BASE, iconRef, `${iconRef}.svg`),
    path.join(ROBOS_BASE, iconRef, 'icon.svg'),
    path.join(ROBOS_BASE, iconRef, `${iconRef}.png`),
    path.join(ROBOS_BASE, iconRef, 'icon.png'),
    path.join(PIXMAPS_BASE, `${iconRef}.svg`),
    path.join(PIXMAPS_BASE, `${iconRef}.png`),
  ];
  for (const p of candidates) {
    try { fs.accessSync(p); return p; } catch {}
  }
  return iconRef;
}

// ── Bootstrap or refresh registry from .desktop files ───────────────────────
function syncRegistryFromDesktopFiles() {
  const reg = readRegistry();
  let changed = false;

  if (!fs.existsSync(DESKTOP_DIR)) return reg;

  const desktopFiles = fs.readdirSync(DESKTOP_DIR)
    .filter(f => f.endsWith('.desktop'));

  for (const filename of desktopFiles) {
    const filePath = path.join(DESKTOP_DIR, filename);
    const parsed   = parseDesktop(filePath);
    if (!parsed?.name || !parsed?.icon) continue;
    if (!parsed.name.toLowerCase().includes('robos')) continue;

    const appId = desktopToAppId(filename);
    if (!reg.icons[appId]) {
      reg.icons[appId] = {
        appId,
        label:       parsed.name,
        iconPath:    resolveIconPath(parsed.icon),
        iconRef:     parsed.icon,
        desktopFile: filePath,
      };
      changed = true;
    } else {
      reg.icons[appId].desktopFile = filePath;
      if (!reg.icons[appId].label) { reg.icons[appId].label = parsed.name; changed = true; }
    }
  }

  if (changed) writeRegistry(reg);
  return reg;
}

// ── Merge builtin app catalogue with filesystem registry ─────────────────────
function buildMergedIcons() {
  const reg = syncRegistryFromDesktopFiles();
  const merged = {};

  for (const builtin of BUILTIN_APPS) {
    merged[builtin.appId] = {
      appId:    builtin.appId,
      label:    builtin.label,
      category: builtin.category,
      iconSvg:  builtin.iconSvg,
      iconPath: null,
      desktopFile: null,
    };
  }

  for (const [appId, entry] of Object.entries(reg.icons)) {
    if (merged[appId]) {
      merged[appId] = { ...merged[appId], ...entry, iconSvg: merged[appId].iconSvg };
    } else {
      merged[appId] = entry;
    }
  }

  return merged;
}

// ── IPC ───────────────────────────────────────────────────────────────────────
ipcMain.handle('ri-list-icons', () => {
  return { ok: true, icons: buildMergedIcons() };
});

ipcMain.handle('ri-get-icon', (_, appId) => {
  const reg = readRegistry();
  return reg.icons?.[appId] || null;
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
  reg.icons[appId].iconRef  = newPath;
  writeRegistry(reg);
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

// ── Push all builtin icons: write icon.svg + update .desktop ─────────────────
ipcMain.handle('ri-push-icons', async (event) => {
  const results = [];
  const total = BUILTIN_APPS.length;

  for (let i = 0; i < BUILTIN_APPS.length; i++) {
    const { appId, label, iconSvg } = BUILTIN_APPS[i];
    const appDir     = path.join(ROBOS_BASE, appId);
    const iconFile   = path.join(appDir, 'icon.svg');
    const desktopFile = path.join(DESKTOP_DIR, `${appId}.desktop`);
    const result = { appId, label, step: i + 1, total, ok: true };

    try {
      if (!fs.existsSync(appDir)) cp.execSync(`sudo mkdir -p "${appDir}"`, { timeout: 5000 });
    } catch {
      try { fs.mkdirSync(appDir, { recursive: true }); } catch {}
    }

    const svg64 = iconSvg.replace('width="48" height="48"', 'width="64" height="64"');
    const writeRes = writeFileSudo(iconFile, svg64);
    if (!writeRes.ok) {
      result.ok = false;
      result.error = `icon write: ${writeRes.error}`;
    } else {
      result.iconWritten = true;
    }

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
    } else {
      result.desktopUpdated = false;
    }

    results.push(result);
    event.sender.send('ri-push-progress', result);
    await new Promise(resolve => setTimeout(resolve, 25));
  }

  cp.exec('update-desktop-database /usr/local/share/applications 2>/dev/null', () => {});

  const pushed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;
  return { ok: failed === 0, results, pushed, failed };
});

ipcMain.handle('ri-sync-desktop-files', () => {
  const reg = readRegistry();
  const results = [];
  for (const [appId, entry] of Object.entries(reg.icons)) {
    if (!entry.desktopFile || !entry.iconPath) continue;
    try {
      let contents = fs.readFileSync(entry.desktopFile, 'utf8');
      contents = contents.replace(/^Icon=.*$/m, `Icon=${entry.iconPath}`);
      fs.writeFileSync(entry.desktopFile, contents, 'utf8');
      results.push({ appId, ok: true });
    } catch {
      results.push({ appId, ok: false });
    }
  }
  cp.exec('update-desktop-database /usr/local/share/applications 2>/dev/null', () => {});
  return { ok: true, results };
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

  syncRegistryFromDesktopFiles();
});
