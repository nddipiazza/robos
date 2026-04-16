'use strict';
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const cp   = require('child_process');

const SETTINGS_FILE = path.join(os.homedir(), '.config', 'robos', 'settings.json');

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

app.setPath('userData', path.join(os.homedir(), '.config', 'robos', 'electron', 'manager-dashboard'));

const lock = app.requestSingleInstanceLock();
if (!lock) { app.quit(); }

app.setName('manager-dashboard');

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

function readSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')); }
  catch { return {}; }
}

function activeTS(settings) {
  const id = settings.active_task_server;
  return (settings.task_servers || []).find(ts => ts.id === id)
      || (settings.task_servers || [])[0]
      || {};
}

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1300, height: 860,
    minWidth: 1000, minHeight: 650,
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'Manager Dashboard',
    autoHideMenuBar: true,
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.on('closed', () => { win = null; });
  if (_debugServer) _debugServer.startDebugServer(win, 19134);
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

// ── IPC handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('md-read-settings', () => readSettings());

ipcMain.handle('md-get-all-issues', async (_, { repo, state }) => {
  try {
    const args = ['issue', 'list', '--repo', repo,
      '--json', 'number,title,labels,state,assignees,createdAt,updatedAt,closedAt',
      '--limit', '200'];
    if (state) args.push('--state', state);
    const r = cp.spawnSync('gh', args, { encoding: 'utf8', timeout: 20000 });
    if (r.status === 0) return { ok: true, data: JSON.parse(r.stdout) };
    return { ok: false, error: r.stderr || 'gh failed' };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('md-get-all-prs', async (_, { repo, state }) => {
  try {
    const args = ['pr', 'list', '--repo', repo,
      '--json', 'number,title,state,author,url,mergedAt,createdAt,updatedAt,additions,deletions,reviewDecision,statusCheckRollup',
      '--limit', '200', '--state', state || 'all'];
    const r = cp.spawnSync('gh', args, { encoding: 'utf8', timeout: 20000 });
    if (r.status === 0) return { ok: true, data: JSON.parse(r.stdout) };
    return { ok: false, error: r.stderr || 'gh failed' };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('md-get-contributors', async (_, { repo }) => {
  try {
    const r = cp.spawnSync('gh', [
      'api', `repos/${repo}/contributors`, '--jq', '.[].login',
    ], { encoding: 'utf8', timeout: 15000 });
    if (r.status === 0) return { ok: true, data: r.stdout.trim().split('\n').filter(Boolean) };
    return { ok: false, error: r.stderr || 'gh failed' };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('md-get-deployments', async (_, { repo }) => {
  try {
    const r = cp.spawnSync('gh', [
      'api', `repos/${repo}/deployments?per_page=50`,
    ], { encoding: 'utf8', timeout: 15000 });
    if (r.status === 0) return { ok: true, data: JSON.parse(r.stdout) };
    return { ok: false, error: r.stderr || 'gh failed' };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('md-open-url', (_, url) => shell.openExternal(url));
