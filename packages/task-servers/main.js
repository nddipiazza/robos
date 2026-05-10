const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const { execSync, exec } = require('child_process');

app.setPath('userData', path.join(os.homedir(), '.config', 'robos', 'electron', 'task-servers'));

const SETTINGS_FILE = path.join(os.homedir(), '.config', 'robos', 'settings.json');

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

// ── Logger ────────────────────────────────────────────────────────────────────
let log = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
try {
  const libPaths = [
    process.env.ROBOS_LIB_PATH && path.join(process.env.ROBOS_LIB_PATH, 'logger'),
    path.resolve(__dirname, '..', 'robos-lib', 'logger'),
    '/usr/local/share/robos/robos-lib/logger',
  ].filter(Boolean);
  for (const p of libPaths) {
    try { log = require(p).createLogger('task-servers'); break; } catch {}
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

function loadTaskServers() {
  const s = loadSettings();
  return s.task_servers || [];
}

function saveTaskServers(servers) {
  const s = loadSettings();
  s.task_servers = servers;
  saveSettings(s);
}

// Single-instance lock
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

// ── Window ──────────────────────────────────────────────────────────────────
let win;
app.setName('task-servers');
app.whenReady().then(() => {
  win = new BrowserWindow({
    width: 960, height: 680,
    title: 'RobOS Task Servers',
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.setMenuBarVisibility(false);
  if (_debugServer) _debugServer.startDebugServer(win, 19112);
});

app.on('window-all-closed', () => app.quit());

// ── IPC ──────────────────────────────────────────────────────────────────────

ipcMain.handle('load-task-servers', () => loadTaskServers());

ipcMain.handle('save-task-servers', (_, servers) => {
  saveTaskServers(servers);
  const names = (servers || []).map(s => s.name || s.type).join(', ');
  log.info('servers-saved', `Saved ${servers.length} task server(s): ${names}`, { count: servers.length, servers: (servers || []).map(s => ({ name: s.name, type: s.type })) });
  return { ok: true };
});

ipcMain.handle('list-pass-entries', () => {
  const storeDir = path.join(process.env.HOME, '.password-store');
  try {
    const entries = [];
    function walk(dir, prefix) {
      for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        if (fs.statSync(full).isDirectory()) {
          walk(full, prefix ? `${prefix}/${name}` : name);
        } else if (name.endsWith('.gpg')) {
          entries.push(prefix ? `${prefix}/${name.slice(0, -4)}` : name.slice(0, -4));
        }
      }
    }
    walk(storeDir, '');
    return entries.sort();
  } catch { return []; }
});

ipcMain.handle('load-pass-secret', async (_, passPath) => {
  try {
    // source profile so `pass` is on PATH
    const val = execSync(
      `bash -lc "pass ${passPath} 2>/dev/null | head -1"`,
      { timeout: 5000 }
    ).toString().trim();
    return { ok: true, value: val };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('test-jira-connection', async (_, { url, username, token }) => {
  const apiUrl = `${url.replace(/\/$/, '')}/rest/api/2/myself`;

  // Try Bearer token first (Apache/Server JIRA), then basic auth (Atlassian Cloud)
  const attempts = [
    `curl -sf -H "Authorization: Bearer ${token}" -H "Content-Type: application/json" "${apiUrl}"`,
    `curl -sf -u "${username}:${token}" -H "Content-Type: application/json" "${apiUrl}"`,
  ];

  for (const cmd of attempts) {
    const result = await new Promise(resolve => {
      exec(cmd, { timeout: 8000 }, (err, stdout) => {
        if (err || !stdout) return resolve(null);
        try {
          const data = JSON.parse(stdout);
          if (data.displayName || data.name) resolve(data);
          else resolve(null);
        } catch { resolve(null); }
      });
    });
    if (result) {
      log.info('jira-connection-ok', `Jira connection verified for ${username}`, { url, user: result.displayName || result.name });
      return { ok: true, displayName: result.displayName || result.name };
    }
  }
  log.warn('jira-connection-failed', 'Jira authentication failed', { url });
  return { ok: false, error: 'Authentication failed (tried Bearer and Basic auth)' };
});

ipcMain.handle('test-github-connection', async (_, { apiUrl, token, useGhCli }) => {
  return new Promise(resolve => {
    const base = apiUrl && apiUrl.trim() ? apiUrl.replace(/\/$/, '') : 'https://api.github.com';

    if (useGhCli) {
      // Derive hostname for enterprise GitHub (e.g. https://github.myco.com/api/v3 → github.myco.com)
      let hostnameFlag = '';
      if (apiUrl && apiUrl.trim() && !apiUrl.includes('api.github.com')) {
        try {
          const hostname = new URL(apiUrl.trim()).hostname;
          if (hostname && hostname !== 'api.github.com') hostnameFlag = ` --hostname ${hostname}`;
        } catch {}
      }
      exec(`gh api user${hostnameFlag}`, { timeout: 8000 }, (err, stdout) => {
        if (err) return resolve({ ok: false, error: 'gh CLI not authenticated — run `gh auth login` first' });
        try {
          const data = JSON.parse(stdout);
          log.info('github-connection-ok', `GitHub connection verified for @${data.login}`, { login: data.login, apiUrl });
          resolve({ ok: true, login: data.login });
        } catch {
          resolve({ ok: false, error: 'Invalid response from gh CLI' });
        }
      });
      return;
    }

    const authFlag = token ? `-H "Authorization: token ${token}"` : '';
    exec(
      `curl -sf ${authFlag} -H "Accept: application/vnd.github+json" "${base}/user"`,
      { timeout: 8000 },
      (err, stdout) => {
        if (err) return resolve({ ok: false, error: 'Connection failed — check token or API URL' });
        try {
          const data = JSON.parse(stdout);
          if (data.message) return resolve({ ok: false, error: data.message });
          resolve({ ok: true, login: data.login });
        } catch {
          resolve({ ok: false, error: 'Invalid response' });
        }
      }
    );
  });
});
