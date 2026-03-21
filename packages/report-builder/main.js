'use strict';
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const cp   = require('child_process');

const SETTINGS_FILE = path.join(os.homedir(), '.config', 'robos', 'settings.json');
const REPORTS_DIR   = path.join(os.homedir(), '.config', 'robos', 'reports');

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

app.setPath('userData', path.join(os.homedir(), '.config', 'robos', 'electron', 'report-builder'));

const lock = app.requestSingleInstanceLock();
if (!lock) { app.quit(); }

app.setName('report-builder');

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
    width: 1100, height: 780,
    minWidth: 800, minHeight: 550,
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'Report Builder',
    autoHideMenuBar: true,
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.on('closed', () => { win = null; });
  if (_debugServer) _debugServer.startDebugServer(win, 19131);
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

// ── IPC handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('rb-read-settings', () => readSettings());

ipcMain.handle('rb-run-query', async (event, { query }) => {
  const settings = readSettings();
  const ts = activeTS(settings);
  if (!ts.repos || !ts.repos.length) return { ok: false, error: 'No task server configured' };
  const repo = `${ts.repos[0].org}/${ts.repos[0].repo}`;

  // Gather context data
  let issuesData = '[]', prsData = '[]';
  try {
    const ir = cp.spawnSync('gh', [
      'issue', 'list', '--repo', repo, '--state', 'all',
      '--json', 'number,title,labels,state,assignees,createdAt,updatedAt,closedAt',
      '--limit', '200',
    ], { encoding: 'utf8', timeout: 20000 });
    if (ir.status === 0) issuesData = ir.stdout;
  } catch {}

  try {
    const pr = cp.spawnSync('gh', [
      'pr', 'list', '--repo', repo, '--state', 'all',
      '--json', 'number,title,state,author,mergedAt,createdAt,updatedAt,additions,deletions,reviewDecision',
      '--limit', '200',
    ], { encoding: 'utf8', timeout: 20000 });
    if (pr.status === 0) prsData = pr.stdout;
  } catch {}

  const prompt = `You are a data analyst for a software team. The user asked: "${query}"

Here is the project data for repo ${repo}:

ISSUES:
${issuesData.substring(0, 8000)}

PULL REQUESTS:
${prsData.substring(0, 8000)}

Analyze this data and answer the user's question. Format your response as a clear report with:
- A title line
- Key findings as bullet points
- Any relevant numbers/statistics
- A brief summary

Keep the report concise and data-driven.`;

  // Stream the response
  return new Promise((resolve) => {
    const child = cp.spawn('gh', ['copilot', '--', '-p', prompt, '--allow-all-tools', '--silent'], {
      encoding: 'utf8',
    });
    let stdout = '', stderr = '';
    child.stdout.on('data', d => {
      stdout += d;
      event.sender.send('rb-stream', d.toString());
    });
    child.stderr.on('data', d => { stderr += d; });
    const timer = setTimeout(() => { child.kill(); resolve({ ok: false, error: 'Timed out' }); }, 180000);
    child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0 && !stdout) resolve({ ok: false, error: stderr || 'AI failed' });
      else resolve({ ok: true, data: stdout });
    });
  });
});

ipcMain.handle('rb-save-report', async (_, { name, content, query }) => {
  try {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
    const filename = `${Date.now()}-${name.replace(/[^a-zA-Z0-9-_]/g, '_')}.json`;
    const report = { name, query, content, savedAt: new Date().toISOString() };
    fs.writeFileSync(path.join(REPORTS_DIR, filename), JSON.stringify(report, null, 2));
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('rb-list-reports', async () => {
  try {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
    const files = fs.readdirSync(REPORTS_DIR).filter(f => f.endsWith('.json')).sort().reverse();
    const reports = files.slice(0, 50).map(f => {
      try {
        return JSON.parse(fs.readFileSync(path.join(REPORTS_DIR, f), 'utf8'));
      } catch { return null; }
    }).filter(Boolean);
    return { ok: true, data: reports };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('rb-open-url', (_, url) => shell.openExternal(url));
