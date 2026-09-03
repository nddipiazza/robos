const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const cp   = require('child_process');

// Debug server (optional)
let _debugServer = null;
try {
  const libPaths = [
    process.env.ROBOS_LIB_PATH && path.join(process.env.ROBOS_LIB_PATH, 'dom-snapshot'),
    path.resolve(__dirname, '..', 'robos-lib', 'dom-snapshot'),
    '/usr/local/share/robos/robos-lib/dom-snapshot',
  ].filter(Boolean);
  for (const p of libPaths) {
    try { _debugServer = require(p); break; } catch {}
  }
} catch {}

const HOME_DIR    = process.env.HOME || os.homedir();
const CONFIG_DIR  = path.join(HOME_DIR, '.config', 'robos');
const INDEXES_CFG = path.join(CONFIG_DIR, 'search-indexes.json');
const INDEX_DIR   = path.join(CONFIG_DIR, 'search-index');

// Single-instance lock (bypassed in test mode)
if (process.env.ROBOS_TEST !== '1' && process.env.ROBOS_TEST_MODE !== '1') {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) { app.quit(); process.exit(0); }
}

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

// ── Defaults ────────────────────────────────────────────────────────────────

const DEFAULT_INDEXES = [
  {
    id: 'source',
    name: 'Source Projects',
    system: true,
    paths: [path.join(HOME_DIR, 'source')],
    exclude: ['node_modules', '.git', 'dist', '.cache', 'target', '__pycache__', '.tox'],
    lastIndexed: null,
    fileCount: 0,
  },
  {
    id: 'robos-config',
    name: 'RobOS Config',
    system: true,
    paths: [path.join(HOME_DIR, '.config', 'robos')],
    exclude: ['search-index'],
    lastIndexed: null,
    fileCount: 0,
  },
];

function ensureConfig() {
  fs.mkdirSync(INDEX_DIR, { recursive: true });
  if (!fs.existsSync(INDEXES_CFG)) {
    fs.writeFileSync(INDEXES_CFG, JSON.stringify(DEFAULT_INDEXES, null, 2));
  }
  try {
    return JSON.parse(fs.readFileSync(INDEXES_CFG, 'utf8'));
  } catch {
    return DEFAULT_INDEXES;
  }
}

function saveConfig(indexes) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(INDEXES_CFG, JSON.stringify(indexes, null, 2));
}

function indexFile(id) {
  return path.join(INDEX_DIR, id + '.txt');
}

// ── Window ──────────────────────────────────────────────────────────────────

let win = null;
app.setName('search-index');

app.whenReady().then(() => {
  win = new BrowserWindow({
    title: 'RobOS Search Index',
    width: 900,
    height: 620,
    minWidth: 600,
    minHeight: 400,
    backgroundColor: '#0d1117',
    show: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.setMenuBarVisibility(false);

  win.once('ready-to-show', () => {
    win.show();
    win.focus();
  });

  if (_debugServer) _debugServer.startDebugServer(win, 19119);
});

app.on('window-all-closed', () => app.quit());

// ── Indexing Helper ─────────────────────────────────────────────────────────

function scanDirectory(dir, excludeList = [], collected = []) {
  if (!fs.existsSync(dir)) return collected;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.name.startsWith('.')) continue;
      if (excludeList.includes(ent.name)) continue;

      const fullPath = path.join(dir, ent.name);
      collected.push(fullPath);

      if (ent.isDirectory()) {
        scanDirectory(fullPath, excludeList, collected);
      }
    }
  } catch {}
  return collected;
}

// ── IPC Handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('list-indexes', () => {
  const indexes = ensureConfig();
  return indexes.map(idx => {
    const fp = indexFile(idx.id);
    let fileCount = idx.fileCount || 0;
    let lastIndexed = idx.lastIndexed || null;
    if (fs.existsSync(fp)) {
      const content = fs.readFileSync(fp, 'utf8');
      fileCount = content.split('\n').filter(Boolean).length;
      try { lastIndexed = new Date(fs.statSync(fp).mtimeMs).toISOString(); } catch {}
    }
    return { ...idx, fileCount, lastIndexed };
  });
});

ipcMain.handle('rebuild-index', async (_, id) => {
  const indexes = ensureConfig();
  const idx = indexes.find(i => i.id === id);
  if (!idx) return { ok: false, error: 'Index not found' };

  const fp = indexFile(id);
  const collected = [];

  for (const searchPath of idx.paths) {
    const p = searchPath.replace(/^~/, HOME_DIR);
    scanDirectory(p, idx.exclude || [], collected);
    if (win && !win.isDestroyed()) {
      win.webContents.send('index-progress', { id, fileCount: collected.length });
    }
  }

  fs.mkdirSync(INDEX_DIR, { recursive: true });
  fs.writeFileSync(fp, collected.join('\n') + '\n', 'utf8');

  const fileCount = collected.length;
  const updated = indexes.map(i => i.id === id
    ? { ...i, lastIndexed: new Date().toISOString(), fileCount }
    : i
  );
  saveConfig(updated);

  if (win && !win.isDestroyed()) {
    win.webContents.send('index-done', { id, fileCount });
  }

  return { ok: true, fileCount };
});

ipcMain.handle('add-index', (_, { name, paths }) => {
  const indexes = ensureConfig();
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (indexes.find(i => i.id === id)) return { ok: false, error: 'Index with that name already exists' };
  const newIdx = { id, name, system: false, paths, exclude: ['node_modules', '.git', 'dist'], lastIndexed: null, fileCount: 0 };
  indexes.push(newIdx);
  saveConfig(indexes);
  return { ok: true, index: newIdx };
});

ipcMain.handle('delete-index', (_, id) => {
  let indexes = ensureConfig();
  const idx = indexes.find(i => i.id === id);
  if (!idx) return { ok: false, error: 'Not found' };
  if (idx.system) return { ok: false, error: 'Cannot delete system index' };
  indexes = indexes.filter(i => i.id !== id);
  saveConfig(indexes);
  const fp = indexFile(id);
  if (fs.existsSync(fp)) fs.unlinkSync(fp);
  return { ok: true };
});

ipcMain.handle('search-index', (_, { query, limit = 30 }) => {
  const indexes = ensureConfig();
  const results = [];
  const q = (query || '').toLowerCase();
  if (!q) return { ok: true, results: [] };

  for (const idx of indexes) {
    const fp = indexFile(idx.id);
    if (!fs.existsSync(fp)) continue;
    const lines = fs.readFileSync(fp, 'utf8').split('\n').filter(Boolean);
    for (const p of lines) {
      if (p.toLowerCase().includes(q)) {
        let isDir = false;
        try { isDir = fs.statSync(p).isDirectory(); } catch {}
        results.push({ path: p, name: path.basename(p), isDir, indexId: idx.id });
        if (results.length >= limit) break;
      }
    }
    if (results.length >= limit) break;
  }
  return { ok: true, results };
});

module.exports = { ensureConfig, saveConfig, DEFAULT_INDEXES, indexFile, scanDirectory };
