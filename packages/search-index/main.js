const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const cp   = require('child_process');

// Debug server (optional)
var _debugServer = null;
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

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

const CONFIG_DIR  = path.join(os.homedir(), '.config', 'robos');
const INDEXES_CFG = path.join(CONFIG_DIR, 'search-indexes.json');
const INDEX_DIR   = path.join(CONFIG_DIR, 'search-index');

// ── Defaults ────────────────────────────────────────────────────────────────

const DEFAULT_INDEXES = [
  {
    id: 'source',
    name: 'Source Projects',
    system: true,
    paths: [path.join(os.homedir(), 'source')],
    exclude: ['node_modules', '.git', 'dist', '.cache', 'target', '__pycache__', '.tox'],
    lastIndexed: null,
    fileCount: 0,
  },
  {
    id: 'robos-config',
    name: 'RobOS Config',
    system: true,
    paths: [path.join(os.homedir(), '.config', 'robos')],
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
  return JSON.parse(fs.readFileSync(INDEXES_CFG, 'utf8'));
}

function saveConfig(indexes) {
  fs.writeFileSync(INDEXES_CFG, JSON.stringify(indexes, null, 2));
}

function indexFile(id) {
  return path.join(INDEX_DIR, id + '.txt');
}

// ── Window ──────────────────────────────────────────────────────────────────

let win;
app.setName('search-index');

app.whenReady().then(() => {
  win = new BrowserWindow({
    width: 800, height: 620,
    minWidth: 600, minHeight: 400,
    title: 'RobOS Search Index',
    autoHideMenuBar: true,
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.setMenuBarVisibility(false);
  if (_debugServer) _debugServer.startDebugServer(win, 19119);
});

app.on('window-all-closed', () => app.quit());

// ── IPC ─────────────────────────────────────────────────────────────────────

ipcMain.handle('list-indexes', () => {
  const indexes = ensureConfig();
  return indexes.map(idx => {
    const fp = indexFile(idx.id);
    let fileCount = 0;
    let lastIndexed = idx.lastIndexed || null;
    if (fs.existsSync(fp)) {
      const content = fs.readFileSync(fp, 'utf8');
      fileCount = content.split('\n').filter(Boolean).length;
      try { lastIndexed = new Date(fs.statSync(fp).mtimeMs).toISOString(); } catch {}
    }
    return { ...idx, fileCount, lastIndexed };
  });
});

ipcMain.handle('rebuild-index', async (event, id) => {
  const indexes = ensureConfig();
  const idx = indexes.find(i => i.id === id);
  if (!idx) return { ok: false, error: 'Index not found' };

  const excludeArgs = [];
  for (const ex of (idx.exclude || [])) {
    excludeArgs.push('-not', '-path', `*/${ex}/*`);
    excludeArgs.push('-not', '-name', ex);
  }

  const allPaths = idx.paths.map(p => p.replace(/^~/, os.homedir()));
  const fp = indexFile(id);
  const tmpFp = fp + '.tmp';
  const ws = fs.createWriteStream(tmpFp);

  let fileCount = 0;
  let errors = [];

  for (const searchPath of allPaths) {
    if (!fs.existsSync(searchPath)) { errors.push(`Path not found: ${searchPath}`); continue; }
    await new Promise((resolve) => {
      const proc = cp.spawn('find', [
        searchPath,
        '-not', '-name', '.*',
        ...excludeArgs,
      ], { encoding: 'utf8' });

      proc.stdout.on('data', chunk => {
        ws.write(chunk);
        fileCount += chunk.split('\n').filter(Boolean).length;
        if (win && !win.isDestroyed()) {
          win.webContents.send('index-progress', { id, fileCount });
        }
      });
      proc.stderr.on('data', () => {}); // ignore permission errors
      proc.on('close', resolve);
    });
  }

  ws.end();
  await new Promise(r => ws.on('finish', r));
  fs.renameSync(tmpFp, fp);

  const updated = indexes.map(i => i.id === id
    ? { ...i, lastIndexed: new Date().toISOString(), fileCount }
    : i
  );
  saveConfig(updated);

  if (win && !win.isDestroyed()) {
    win.webContents.send('index-done', { id, fileCount });
  }
  return { ok: true, fileCount, errors };
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
  for (const idx of indexes) {
    const fp = indexFile(idx.id);
    if (!fs.existsSync(fp)) continue;
    const r = cp.spawnSync('grep', ['-i', '-m', String(limit), query, fp], { encoding: 'utf8', timeout: 3000 });
    const lines = (r.stdout || '').split('\n').filter(Boolean);
    for (const p of lines) {
      let isDir = false;
      try { isDir = fs.statSync(p).isDirectory(); } catch {}
      results.push({ path: p, name: path.basename(p), isDir, indexId: idx.id });
      if (results.length >= limit) break;
    }
    if (results.length >= limit) break;
  }
  return { ok: true, results };
});

// Export for testing
module.exports = { ensureConfig, saveConfig, DEFAULT_INDEXES, indexFile };
