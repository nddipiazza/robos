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

app.setPath('userData', path.join(os.homedir(), '.config', 'robos', 'electron', 'dev-central'));

const lock = app.requestSingleInstanceLock();
if (!lock) { app.quit(); }

app.setName('dev-central');

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

function ghSync(args, timeoutMs = 15000) {
  const r = cp.spawnSync('gh', args, { encoding: 'utf8', timeout: timeoutMs });
  if (r.status === 0) return { ok: true, data: r.stdout.trim() };
  return { ok: false, error: (r.stderr || 'gh failed').trim() };
}

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1200, height: 820,
    minWidth: 900, minHeight: 600,
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'Dev Central',
    autoHideMenuBar: true,
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.on('closed', () => { win = null; });
  if (_debugServer) _debugServer.startDebugServer(win, 19129);
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

// ── IPC handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('dc-read-settings', () => readSettings());

ipcMain.handle('dc-get-my-issues', async () => {
  const settings = readSettings();
  const ts = activeTS(settings);
  if (!ts.repos || !ts.repos.length) return { ok: false, error: 'No task server configured' };
  const repo = `${ts.repos[0].org}/${ts.repos[0].repo}`;
  try {
    const r = cp.spawnSync('gh', [
      'issue', 'list', '--repo', repo, '--assignee', '@me',
      '--json', 'number,title,labels,state,updatedAt,url',
      '--limit', '50',
    ], { encoding: 'utf8', timeout: 15000 });
    if (r.status === 0) return { ok: true, data: JSON.parse(r.stdout) };
    return { ok: false, error: r.stderr || 'gh failed' };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('dc-get-my-prs', async () => {
  const settings = readSettings();
  const ts = activeTS(settings);
  if (!ts.repos || !ts.repos.length) return { ok: false, error: 'No task server configured' };
  const repo = `${ts.repos[0].org}/${ts.repos[0].repo}`;
  try {
    const r = cp.spawnSync('gh', [
      'pr', 'list', '--repo', repo, '--author', '@me',
      '--json', 'number,title,state,url,headRefName,statusCheckRollup,reviewDecision,updatedAt,additions,deletions',
      '--limit', '30',
    ], { encoding: 'utf8', timeout: 15000 });
    if (r.status === 0) return { ok: true, data: JSON.parse(r.stdout) };
    return { ok: false, error: r.stderr || 'gh failed' };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('dc-get-review-requests', async () => {
  const settings = readSettings();
  const ts = activeTS(settings);
  if (!ts.repos || !ts.repos.length) return { ok: false, error: 'No task server configured' };
  const repo = `${ts.repos[0].org}/${ts.repos[0].repo}`;
  try {
    const r = cp.spawnSync('gh', [
      'pr', 'list', '--repo', repo, '--search', 'review-requested:@me',
      '--json', 'number,title,state,url,author,updatedAt',
      '--limit', '30',
    ], { encoding: 'utf8', timeout: 15000 });
    if (r.status === 0) return { ok: true, data: JSON.parse(r.stdout) };
    return { ok: false, error: r.stderr || 'gh failed' };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('dc-get-recent-activity', async () => {
  // Read from journal events file
  const eventsFile = path.join(os.homedir(), '.config', 'robos', 'journal-events.json');
  try {
    const events = JSON.parse(fs.readFileSync(eventsFile, 'utf8'));
    return { ok: true, data: events.slice(0, 20) };
  } catch { return { ok: true, data: [] }; }
});

ipcMain.handle('dc-open-url', (_, url) => shell.openExternal(url));
