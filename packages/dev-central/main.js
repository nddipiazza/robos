'use strict';
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const cp   = require('child_process');

const SETTINGS_FILE = path.join(os.homedir(), '.config', 'robos', 'settings.json');

app.setPath('userData', path.join(os.homedir(), '.config', 'robos', 'electron', 'dev-central'));

const isTestMode = !!(process.env.ROBOS_TEST || process.env.ROBOS_DEMO_SHOW);
if (!isTestMode) {
  const lock = app.requestSingleInstanceLock();
  if (!lock) { app.quit(); }
}

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
  if (_debugServer) _debugServer.startDebugServer(win, 19133);
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

ipcMain.handle('dc-review-get-task-proof', async (_, taskId = 'TASK-201') => {
  return {
    taskId,
    title: 'TASK-201: Multi-Step Dynamic Form Submission',
    featureTitle: 'Multi-Step Form Wizard Requirement',
    scenarioTitle: 'Scenario: Successfully submitting all form steps',
    targetService: 'forms-api',
    branch: 'feature/TASK-201-multi-step',
    videoUrl: 'walkthroughs/video-generator/video-generator-final.webm',
    resolution: '1080p (1920x1080 @ 30fps)',
    durationFormatted: '00:00:24.600',
    verificationBadges: [
      { name: 'Pact Consumer Contracts', status: 'PASS', details: '14/14 Endpoints Conforming', cls: 'badge-pass' },
      { name: 'W3C SHACL Conformance', status: '100% PASS', details: '0 Shape Violations', cls: 'badge-pass' },
      { name: 'Spectral OpenAPI 3.1', status: 'CLEAN', details: '0 Linter Warnings', cls: 'badge-pass' },
      { name: 'E2E Regression Suites', status: '8/8 PASS', details: '0 Regressions Detected', cls: 'badge-pass' },
    ],
    chapters: [
      { id: '1', timecode: '00:00:00.000', title: 'Ingest BDD Feature AST & Requirements', status: '✅ SYNCED' },
      { id: '2', timecode: '00:00:03.500', title: 'Verify Strict RED Failure Guard (404 Error)', status: '✅ SYNCED' },
      { id: '3', timecode: '00:00:07.000', title: 'Apply Minimal Implementation & Contract Mocks', status: '✅ ACTIVE' },
      { id: '4', timecode: '00:00:11.000', title: 'Confirm 100% GREEN Step Pass Rate', status: '✅ SYNCED' },
      { id: '5', timecode: '00:00:15.500', title: 'Full Regression & SHACL Shape Verification', status: '✅ SYNCED' },
      { id: '6', timecode: '00:00:20.000', title: 'Proof-of-Work Artifact Ready for Merge', status: '✅ READY' },
    ],
    diffs: [
      { type: 'added', file: 'specs/contracts/forms-api-v1.yaml', summary: 'Added OpenAPI 3.1 contract for POST /api/v1/forms/submit' },
      { type: 'added', file: 'packages/forms-api/lib/models/form-step.js', summary: 'Multi-step validation schema with TypeSpec' },
      { type: 'modified', file: 'packages/forms-api/lib/router.js', summary: 'Mounted POST /submit endpoint with local test fabric mocks' },
    ],
  };
});

ipcMain.handle('dc-review-signoff-merge', async (_, taskId = 'TASK-201') => {
  return {
    ok: true,
    taskId,
    mergedBranch: 'feature/TASK-201-multi-step',
    targetBranch: 'main',
    commitSha: 'a78df91c2b04f8e',
    promotedState: 'PRODUCTION_REALITY',
    worktreesCleaned: 1,
    devcontainersTornDown: 1,
    message: 'Successfully merged into main! Branch state promoted to Production Reality.',
  };
});
