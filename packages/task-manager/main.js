'use strict';
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const cp   = require('child_process');
const fs   = require('fs');

// Single-instance: show existing window if launched again
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }

// ── Known RobOS app IDs → friendly names ────────────────────────────────────
const KNOWN_APPS = {
  'agent-monitor':          'Agent Monitor',
  'agent-scheduler':        'Agent Scheduler',
  'agents-manager':         'Agents Manager',
  'app-launcher':           'App Launcher',
  'context-manager':        'Context Manager',
  'copilot-session-viewer': 'Copilot Session Viewer',
  'desktop-manager':        'Desktop Manager',
  'file-explorer':          'File Explorer',
  'git-login-manager':      'Git Login Manager',
  'git-projects':           'Git Projects',
  'github-login-manager':   'GitHub Login Manager',
  'group-dev-settings':     'Group Dev Settings',
  'ide-manager':            'Development Apps and IDEs',
  'workflow-studio':         'Workflow Studio',
  'lang-manager':           'Language Manager',
  'notifications':          'Notifications',
  'pass-manager':           'Pass Manager',
  'pass-unlock':            'Pass Unlock',
  'people-directory':       'People Directory',
  'robos-icons':            'RobOS Icons',
  'robos-ui':               'RobOS UI',
  'search-index':           'Search Index',
  'security-setup':         'Security Setup',
  'task-manager':           'Task Manager',
  'task-servers':           'Task Servers',
  'tech-workbench':         'Tech Workbench',
  'work-journal':           'Work Journal',
  'workspace-manager':      'Workspace Manager',
  'claude-console':         'Claude Console',
};

// System-critical apps — warn before killing
const SYSTEM_APPS = new Set(['desktop-manager']);

// ── Process scanning ─────────────────────────────────────────────────────────

// Resolve the app ID from a process's argv by reading /proc/{pid}/cmdline.
// args[0] is the executable; the app directory is the first positional arg
// (no leading dash) that resolves to a known robos package path and is NOT
// inside a node_modules tree.
function resolveAppId(pid) {
  try {
    const raw  = fs.readFileSync(`/proc/${pid}/cmdline`);
    const args = raw.toString().split('\0').filter(Boolean);
    // args[0] = electron/node binary; scan the rest for the app dir argument
    for (const arg of args.slice(1)) {
      if (arg.startsWith('-')) continue;
      if (arg.includes('node_modules')) continue;
      const m = arg.match(/\/(?:usr\/local\/share\/robos|packages)\/([^/]+)\/?$/);
      if (m) return m[1];
    }
    // Fallback: check if the binary itself comes from a non-harness robos package
    const exe = args[0] || '';
    const em  = exe.match(/\/(?:usr\/local\/share\/robos|packages)\/([^/]+)\//);
    if (em && em[1] !== 'dev-harness') return em[1];
  } catch {}
  return null;
}

function listProcesses() {
  try {
    const raw = cp.execSync('ps aux --no-header', { encoding: 'utf8', timeout: 5000 });
    const procs  = [];
    const selfPid = process.pid;

    for (const line of raw.trim().split('\n')) {
      if (!line.trim()) continue;
      const parts = line.trim().split(/\s+/);
      if (parts.length < 11) continue;

      const pid    = parseInt(parts[1]);
      const cpu    = parseFloat(parts[2]);
      const memPct = parseFloat(parts[3]);
      const rssKb  = parseInt(parts[5]) || 0;
      const stat   = parts[7] || '?';
      const cmd    = parts.slice(10).join(' ');
      const exe    = parts[10] || '';

      // Only electron or node processes
      const isElectron = exe.endsWith('/electron') || exe === 'electron';
      const isNode     = exe.endsWith('/node')     || exe === 'node';
      if (!isElectron && !isNode) continue;

      // Resolve app ID from /proc/{pid}/cmdline (null-separated, exact args)
      const appId = resolveAppId(pid);
      if (!appId) continue;

      const appName = KNOWN_APPS[appId] || appId.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');

      procs.push({
        pid,
        appId,
        appName,
        cpu,
        memPct,
        memMb:    Math.round(rssKb / 1024),
        stat,
        isSelf:   pid === selfPid || isParentProcess(pid),
        isSystem: SYSTEM_APPS.has(appId),
        cmd:      cmd.length > 180 ? cmd.slice(0, 180) + '…' : cmd,
      });
    }

    return procs.sort((a, b) => a.appName.localeCompare(b.appName) || a.pid - b.pid);
  } catch (e) {
    return [];
  }
}

function isParentProcess(pid) {
  // Check if pid is an ancestor of the current process
  try {
    let cur = process.ppid;
    for (let i = 0; i < 10 && cur > 1; i++) {
      if (cur === pid) return true;
      const stat = fs.readFileSync(`/proc/${cur}/stat`, 'utf8');
      cur = parseInt(stat.split(' ')[3]);
    }
  } catch {}
  return false;
}

function killProcesses(pids, signal) {
  const sig = signal === 'SIGKILL' ? 'SIGKILL' : 'SIGTERM';
  const results = [];
  for (const pid of pids) {
    try {
      process.kill(pid, sig);
      results.push({ pid, ok: true });
    } catch (e) {
      results.push({ pid, ok: false, error: e.message });
    }
  }
  return results;
}

// ── Window ───────────────────────────────────────────────────────────────────
let win;
function createWindow() {
  win = new BrowserWindow({
    width:     1050,
    height:    640,
    minWidth:  700,
    minHeight: 420,
    frame:     false,
    show:      false,
    backgroundColor: '#0d1117',
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
    title: 'RobOS Task Manager',
  });
  win.loadFile('renderer/index.html');
  win.once('ready-to-show', () => win.show());
}

app.setName('task-manager');
app.whenReady().then(() => {
  app.commandLine.appendSwitch('no-sandbox');
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('disable-dev-shm-usage');
  createWindow();
});

app.on('second-instance', () => {
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
});

app.on('window-all-closed', () => app.quit());

// ── IPC handlers ─────────────────────────────────────────────────────────────
ipcMain.handle('list-processes', ()            => listProcesses());
ipcMain.handle('kill-processes', (_, opts)     => killProcesses(opts.pids, opts.signal));
ipcMain.handle('minimize',       ()            => win && win.minimize());
ipcMain.handle('close',          ()            => win && win.close());
