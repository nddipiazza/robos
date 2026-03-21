'use strict';
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const { execSync } = require('child_process');

const SETTINGS_FILE = path.join(os.homedir(), '.config', 'robos', 'settings.json');

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

// Task client (optional — for local dev without VM install)
var taskClient = null;
try {
  const clientPaths = [
    path.resolve(__dirname, '..', 'robos-task-client'),
    '/usr/local/share/robos/robos-task-client',
  ];
  for (const p of clientPaths) {
    try { taskClient = require(p); break; } catch {}
  }
} catch {}

function readSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')); }
  catch { return {}; }
}

function getActiveServer() {
  const s = readSettings();
  const servers = s.task_servers || [];
  if (!servers.length) return null;
  const activeId = s.active_task_server;
  return (activeId && servers.find(sv => sv.id === activeId)) || servers[0];
}

let win;
app.setName('task-board');
app.whenReady().then(() => {
  win = new BrowserWindow({
    width: 1200, height: 800,
    minWidth: 800, minHeight: 500,
    title: 'RobOS Task Board',
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.setMenuBarVisibility(false);
  if (_debugServer) _debugServer.startDebugServer(win, 19124);
});
app.on('window-all-closed', () => app.quit());

// ── IPC: settings ──────────────────────────────────────────────────────────

ipcMain.handle('get-board-config', () => {
  const server = getActiveServer();
  if (!server) return { ok: false, error: 'No task server configured' };
  return {
    ok: true,
    server: {
      id: server.id,
      type: server.type,
      name: server.name,
      repo: server.type === 'github' ? `${server.gh_org || ''}/${server.gh_repo || ''}` : null,
      projects: server.projects || [],
    },
    workflows: server.workflows || [],
    issueTypes: server.issue_types || [],
  };
});

// ── IPC: fetch issues ──────────────────────────────────────────────────────

ipcMain.handle('fetch-issues', async (_, { filter } = {}) => {
  const server = getActiveServer();
  if (!server) return { ok: false, error: 'No task server configured' };

  if (server.type === 'github') {
    try {
      const repo = `${server.gh_org}/${server.gh_repo}`;
      let args = `issue list --repo ${repo} --limit 100 --state ${filter?.state || 'open'}`;
      if (filter?.assignee) args += ` --assignee ${filter.assignee}`;
      if (filter?.labels) args += ` --label "${filter.labels}"`;
      args += ' --json number,title,state,labels,assignees,createdAt,updatedAt,body,milestone';
      const out = execSync(`gh ${args}`, { encoding: 'utf8', timeout: 15000 });
      const issues = JSON.parse(out);
      return { ok: true, issues: issues.map(mapGitHubIssue) };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  if (server.type === 'jira') {
    // Jira requires the task-client adapter with auth
    return { ok: false, error: 'Jira fetch requires robos-task-client (coming soon)' };
  }

  return { ok: false, error: `Unsupported server type: ${server.type}` };
});

function mapGitHubIssue(raw) {
  const labels = (raw.labels || []).map(l => typeof l === 'string' ? l : l.name);
  const stateLabel = labels.find(l => l.startsWith('state:'));
  return {
    key: `#${raw.number}`,
    number: raw.number,
    summary: raw.title,
    description: raw.body || '',
    status: stateLabel ? stateLabel.replace('state:', '') : (raw.state || 'open'),
    labels,
    assignee: raw.assignees?.[0]?.login || null,
    created: raw.createdAt,
    updated: raw.updatedAt,
    milestone: raw.milestone?.title || null,
    url: raw.url || null,
  };
}

ipcMain.handle('open-url', (_, url) => {
  if (url) shell.openExternal(url);
  return { ok: true };
});
