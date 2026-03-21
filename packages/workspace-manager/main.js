const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const cp   = require('child_process');
const net  = require('net');

const SETTINGS_FILE = path.join(process.env.HOME, '.config', 'robos', 'settings.json');
const DESKTOPS_DIR = path.join(process.env.HOME, '.config', 'robos', 'desktops');
const WM_SOCKET_PATH = `/run/user/${process.getuid ? process.getuid() : 1000}/robos-wm.sock`;

// Debug server (optional) — checks env override, local dev path, then VM install path
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

function loadSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')); }
  catch { return {}; }
}

function saveSettings(data) {
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2));
}

function loadWorkspaceConfig() {
  const s = loadSettings();
  return s.workspace_manager || { scan_roots: [], max_depth: 6 };
}

function saveWorkspaceConfig(config) {
  const s = loadSettings();
  s.workspace_manager = config;
  saveSettings(s);
}

// Single-instance lock
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

// ── IDE detection ─────────────────────────────────────────────────────────────
function detectIDEs() {
  const candidates = [
    { id: 'cursor',   cmd: 'cursor',    label: 'Cursor' },
    { id: 'code',     cmd: 'code',      label: 'VS Code' },
    { id: 'idea',     cmd: 'idea.sh',   label: 'IntelliJ IDEA' },
    { id: 'webstorm', cmd: 'webstorm.sh',label: 'WebStorm' },
    { id: 'pycharm',  cmd: 'pycharm.sh', label: 'PyCharm' },
    { id: 'goland',   cmd: 'goland.sh',  label: 'GoLand' },
    { id: 'clion',    cmd: 'clion.sh',   label: 'CLion' },
    { id: 'rider',    cmd: 'rider.sh',   label: 'Rider' },
  ];
  return candidates.map(c => {
    try {
      const out = cp.execSync(`which ${c.cmd} 2>/dev/null`).toString().trim();
      return { ...c, installed: !!out, path: out };
    } catch {
      return { ...c, installed: false, path: '' };
    }
  });
}

// ── Scan for workspaces ───────────────────────────────────────────────────────
function scanWorkspaces(rootDirs, maxDepth = 6) {
  const results = [];
  const visited = new Set();

  function walk(dir, depth) {
    if (depth > maxDepth) return;
    if (visited.has(dir)) return;
    visited.add(dir);
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }

    for (const e of entries) {
      if (e.name.startsWith('.') && e.name !== '.vscode' && e.name !== '.idea') continue;
      const full = path.join(dir, e.name);

      if (e.isDirectory()) {
        if (e.name === '.vscode' || e.name === '.idea') {
          const parent = dir;
          const stat = tryStat(parent);
          const wsType = e.name === '.vscode' ? 'vscode' : 'idea';
          results.push({
            path: parent,
            type: wsType,
            ide: wsType === 'vscode' ? 'VS Code / Cursor' : 'JetBrains',
            name: path.basename(parent),
            mtime: stat ? stat.mtimeMs : 0,
            configDir: full,
          });
        } else if (e.name !== 'node_modules' && e.name !== '.git') {
          walk(full, depth + 1);
        }
      }
    }
  }

  for (const root of rootDirs) {
    walk(root, 0);
  }

  // Deduplicate by path (keep first occurrence)
  const seen = new Set();
  const unique = [];
  for (const ws of results) {
    if (!seen.has(ws.path)) {
      seen.add(ws.path);
      unique.push(ws);
    }
  }

  return unique.sort((a, b) => b.mtime - a.mtime);
}

function tryStat(p) {
  try { return fs.statSync(p); } catch { return null; }
}

// ── RobOS Desktops (ticket workspaces) ───────────────────────────────────────
function listRobosDesktops() {
  try {
    if (!fs.existsSync(DESKTOPS_DIR)) return [];
    return fs.readdirSync(DESKTOPS_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => { try { return JSON.parse(fs.readFileSync(path.join(DESKTOPS_DIR, f), 'utf8')); } catch { return null; } })
      .filter(Boolean)
      .sort((a, b) => (a.ticket || '').localeCompare(b.ticket || ''));
  } catch { return []; }
}

// ── Workspace state management ───────────────────────────────────────────────
function saveWorkspaceState(wsPath, state) {
  const stateDir = path.join(process.env.HOME, '.config', 'robos', 'workspace-states');
  fs.mkdirSync(stateDir, { recursive: true });
  const id = Buffer.from(wsPath).toString('base64url');
  const stateFile = path.join(stateDir, `${id}.json`);
  fs.writeFileSync(stateFile, JSON.stringify({ ...state, path: wsPath, updated: Date.now() }, null, 2));
}

function loadWorkspaceState(wsPath) {
  const stateDir = path.join(process.env.HOME, '.config', 'robos', 'workspace-states');
  const id = Buffer.from(wsPath).toString('base64url');
  const stateFile = path.join(stateDir, `${id}.json`);
  try { return JSON.parse(fs.readFileSync(stateFile, 'utf8')); }
  catch { return null; }
}

function listWorkspaceStates() {
  const stateDir = path.join(process.env.HOME, '.config', 'robos', 'workspace-states');
  try {
    return fs.readdirSync(stateDir)
      .filter(f => f.endsWith('.json'))
      .map(f => { try { return JSON.parse(fs.readFileSync(path.join(stateDir, f), 'utf8')); } catch { return null; } })
      .filter(Boolean);
  } catch { return []; }
}

// ── Git info helper ──────────────────────────────────────────────────────────
function getGitInfo(wsPath) {
  try {
    const branch = cp.execSync('git rev-parse --abbrev-ref HEAD', { cwd: wsPath, timeout: 5000, encoding: 'utf8' }).trim();
    const remote = cp.execSync('git remote get-url origin 2>/dev/null', { cwd: wsPath, timeout: 5000, encoding: 'utf8' }).trim();
    const status = cp.execSync('git status --porcelain', { cwd: wsPath, timeout: 5000, encoding: 'utf8' }).trim();
    const changedFiles = status ? status.split('\n').length : 0;
    return { isGit: true, branch, remote, changedFiles };
  } catch {
    return { isGit: false, branch: null, remote: null, changedFiles: 0 };
  }
}

// ── Window ──────────────────────────────────────────────────────────────────
let win;
app.setName('workspace-manager');
app.whenReady().then(() => {
  win = new BrowserWindow({
    width: 1300, height: 820,
    minWidth: 800, minHeight: 500,
    title: 'RobOS Workspace Manager',
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.setMenuBarVisibility(false);
  if (_debugServer) _debugServer.startDebugServer(win, 19110);
});

app.on('window-all-closed', () => app.quit());

// ── IPC ───────────────────────────────────────────────────────────────────────
ipcMain.handle('scan-workspaces', (_, { roots }) => {
  const defaultRoots = roots && roots.length ? roots : [
    os.homedir(),
    path.join(os.homedir(), 'source'),
    '/usr/local/share/robos',
  ];
  return scanWorkspaces(defaultRoots);
});

ipcMain.handle('detect-ides', () => detectIDEs());

ipcMain.handle('open-in-ide', (_, { ideCmd, workspacePath }) => {
  try {
    cp.spawn(ideCmd, [workspacePath], { detached: true, stdio: 'ignore' }).unref();
    return { ok: true };
  } catch (err) { return { ok: false, error: err.message }; }
});

ipcMain.handle('open-in-files', (_, { p }) => {
  const mailbox = path.join(os.homedir(), '.config', 'robos', 'file-explorer-nav.json');
  try {
    fs.mkdirSync(path.dirname(mailbox), { recursive: true });
    fs.writeFileSync(mailbox, JSON.stringify({ path: p, ts: Date.now() }));
  } catch {}
  const feLaunch = '/usr/local/share/robos/file-explorer/file-explorer.sh';
  try {
    cp.spawn(feLaunch, [], { detached: true, stdio: 'ignore' }).unref();
  } catch {
    try { cp.spawn('bash', [feLaunch], { detached: true, stdio: 'ignore' }).unref(); } catch {}
  }
  return true;
});

ipcMain.handle('open-terminal', (_, { p }) => {
  try {
    cp.spawn('tilix', ['-w', p], { detached: true, stdio: 'ignore' }).unref();
    return { ok: true };
  } catch { return { ok: false }; }
});

ipcMain.handle('get-home', () => os.homedir());

ipcMain.handle('read-vscode-settings', (_, { configDir }) => {
  try {
    const sf = path.join(configDir, 'settings.json');
    if (fs.existsSync(sf)) return { content: fs.readFileSync(sf, 'utf8') };
    return { content: '(no settings.json)' };
  } catch (e) { return { content: e.message }; }
});

ipcMain.handle('list-robos-desktops', () => listRobosDesktops());

ipcMain.handle('get-git-info', (_, { wsPath }) => getGitInfo(wsPath));

ipcMain.handle('load-workspace-config', () => loadWorkspaceConfig());

ipcMain.handle('save-workspace-config', (_, config) => {
  saveWorkspaceConfig(config);
  return { ok: true };
});

ipcMain.handle('save-workspace-state', (_, { wsPath, state }) => {
  saveWorkspaceState(wsPath, state);
  return { ok: true };
});

ipcMain.handle('load-workspace-state', (_, { wsPath }) => loadWorkspaceState(wsPath));

ipcMain.handle('list-workspace-states', () => listWorkspaceStates());

// ── Unix socket server (for cross-app queries) ───────────────────────────────
app.whenReady().then(() => {
  try {
    if (fs.existsSync(WM_SOCKET_PATH)) fs.unlinkSync(WM_SOCKET_PATH);
    const server = net.createServer((sock) => {
      let data = '';
      sock.on('data', c => { data += c; });
      sock.on('end', () => {
        try {
          const msg = JSON.parse(data);
          if (msg.listDesktops) {
            sock.write(JSON.stringify({ desktops: listRobosDesktops() }));
          } else {
            sock.write(JSON.stringify({ error: 'unknown command' }));
          }
        } catch (e) { sock.write(JSON.stringify({ error: e.message })); }
        sock.end();
      });
    });
    server.listen(WM_SOCKET_PATH, () => {
      try { fs.chmodSync(WM_SOCKET_PATH, 0o600); } catch {}
    });
    app.on('will-quit', () => {
      try { fs.unlinkSync(WM_SOCKET_PATH); } catch {}
    });
  } catch {}
});
