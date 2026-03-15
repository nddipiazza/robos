'use strict';
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const cp   = require('child_process');
const net  = require('net');

const DESKTOPS_DIR = path.join(os.homedir(), '.config', 'robos', 'desktops');
const WM_SOCKET_PATH = `/run/user/${process.getuid()}/robos-wm.sock`;


let win;
function createWindow() {
  win = new BrowserWindow({
    width: 1300, height: 820,
    minWidth: 800, minHeight: 500,
    title: 'RobOS Workspace Manager',
    autoHideMenuBar: true,
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}
app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

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
        } else {
          walk(full, depth + 1);
        }
      }
    }
  }

  for (const root of rootDirs) {
    walk(root, 0);
  }

  return results.sort((a, b) => b.mtime - a.mtime);
}

function tryStat(p) {
  try { return fs.statSync(p); } catch { return null; }
}

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
  // Write nav target to RobOS File Explorer mailbox, then launch it
  const mailbox = path.join(os.homedir(), '.config', 'robos', 'file-explorer-nav.json');
  try {
    fs.mkdirSync(path.dirname(mailbox), { recursive: true });
    fs.writeFileSync(mailbox, JSON.stringify({ path: p, ts: Date.now() }));
  } catch {}
  const feLaunch = '/usr/local/share/robos/file-explorer/file-explorer.sh';
  try {
    cp.spawn(feLaunch, [], { detached: true, stdio: 'ignore' }).unref();
  } catch {
    cp.spawn('bash', [feLaunch], { detached: true, stdio: 'ignore' }).unref();
  }
  return true;
});

ipcMain.handle('open-terminal', (_, { p }) => {
  try {
    cp.spawn('tilix', ['-w', p], { detached: true, stdio: 'ignore' }).unref();
    return { ok: true };
  } catch (e) { return { ok: false }; }
});

ipcMain.handle('get-home', () => os.homedir());

ipcMain.handle('read-vscode-settings', (_, { configDir }) => {
  try {
    const sf = path.join(configDir, 'settings.json');
    if (fs.existsSync(sf)) return { content: fs.readFileSync(sf, 'utf8') };
    return { content: '(no settings.json)' };
  } catch (e) { return { content: e.message }; }
});

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

ipcMain.handle('list-robos-desktops', () => listRobosDesktops());

// ── Unix socket server (for cross-app queries) ───────────────────────────────
app.whenReady().then(() => {
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
    fs.chmodSync(WM_SOCKET_PATH, 0o600);
    console.log(`[wm] socket ready: ${WM_SOCKET_PATH}`);
  });
  app.on('will-quit', () => {
    try { fs.unlinkSync(WM_SOCKET_PATH); } catch {}
  });
});
