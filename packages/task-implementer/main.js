'use strict';
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const cp   = require('child_process');

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

const SETTINGS_FILE = path.join(os.homedir(), '.config', 'robos', 'settings.json');

// ── Debug server ──────────────────────────────────────────────────────────────
let _debugServer = null;
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

// ── Settings ──────────────────────────────────────────────────────────────────
function readSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')); }
  catch { return {}; }
}

function getActiveServer(settings) {
  const s = settings || readSettings();
  const servers = s.task_servers || [];
  if (!servers.length) return null;
  const activeId = s.active_task_server;
  return servers.find(ts => ts.id === activeId) || servers[0];
}

// ── Active agent processes ────────────────────────────────────────────────────
const activeAgents = new Map(); // taskKey → child process

// ── App window ────────────────────────────────────────────────────────────────
let mainWindow;
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200, height: 800,
    minWidth: 800, minHeight: 600,
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
    title: 'RobOS Task Implementer',
    autoHideMenuBar: true,
  });
  mainWindow.loadFile('renderer/index.html');
  if (_debugServer) {
    _debugServer.registerSnapshotIPC && _debugServer.registerSnapshotIPC(mainWindow);
    _debugServer.startDebugServer(mainWindow, 19135, 'task-implementer');
  }
}

app.setName('robos-task-implementer');
app.setPath('userData', path.join(os.homedir(), '.config', 'robos', 'electron', 'task-implementer'));
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }
app.on('second-instance', () => {
  if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); }
});
app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
  for (const child of activeAgents.values()) {
    try { child.kill(); } catch {}
  }
  app.quit();
});

// ── IPC ───────────────────────────────────────────────────────────────────────

ipcMain.handle('read-settings', () => readSettings());

ipcMain.handle('get-server-info', () => {
  const settings = readSettings();
  const server = getActiveServer(settings);
  if (!server) return { ok: false, error: 'No task server configured. Open RobOS Task Servers to add one.' };
  return {
    ok: true,
    server: {
      id: server.id,
      type: server.type,
      name: server.name,
      repo: server.type === 'github' ? `${server.gh_org || ''}/${server.gh_repo || ''}` : null,
      jiraUrl: server.type === 'jira' ? server.url : null,
      jiraProject: server.type === 'jira' ? server.jira_project : null,
    },
  };
});

ipcMain.handle('list-tasks', async (_, { filter } = {}) => {
  const server = getActiveServer();
  if (!server) return { ok: false, error: 'No task server configured' };

  if (server.type === 'github') {
    try {
      const repo = `${server.gh_org}/${server.gh_repo}`;
      let args = ['issue', 'list', '--repo', repo,
        '--limit', '50', '--state', filter?.state || 'open',
        '--json', 'number,title,state,labels,assignees,createdAt,updatedAt,body'];
      if (filter?.assignee) args.push('--assignee', filter.assignee);
      if (filter?.label)    args.push('--label', filter.label);
      const r = cp.spawnSync('gh', args, { encoding: 'utf8', timeout: 15000 });
      if (r.status !== 0) return { ok: false, error: r.stderr || 'gh failed' };
      const issues = JSON.parse(r.stdout);
      return {
        ok: true,
        tasks: issues.map(i => ({
          key: `#${i.number}`,
          number: i.number,
          title: i.title,
          body: i.body || '',
          status: i.state,
          labels: (i.labels || []).map(l => typeof l === 'string' ? l : l.name),
          assignee: i.assignees?.[0]?.login || null,
          updated: i.updatedAt,
          repo,
          url: `https://github.com/${repo}/issues/${i.number}`,
        })),
      };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  if (server.type === 'jira') {
    return { ok: false, error: 'Jira task listing requires robos-task-client (coming soon)' };
  }

  return { ok: false, error: `Unsupported server type: ${server.type}` };
});

ipcMain.handle('start-agent', (event, { taskKey, task, extraContext }) => {
  if (activeAgents.has(taskKey)) {
    return { ok: false, error: 'Agent already running for this task' };
  }

  const prompt = buildAgentPrompt(task, extraContext);
  const child = cp.spawn('gh', ['copilot', '--', '-p', prompt, '--allow-all-tools'],
    { encoding: 'utf8', env: { ...process.env, DISPLAY: ':0' } });

  activeAgents.set(taskKey, child);

  child.stdout.on('data', d => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('agent-stream', { taskKey, text: d.toString(), stream: 'stdout' });
    }
  });
  child.stderr.on('data', d => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('agent-stream', { taskKey, text: d.toString(), stream: 'stderr' });
    }
  });
  child.on('close', code => {
    activeAgents.delete(taskKey);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('agent-done', { taskKey, code });
    }
  });

  return { ok: true };
});

ipcMain.handle('stop-agent', (_, { taskKey }) => {
  const child = activeAgents.get(taskKey);
  if (child) {
    try { child.kill(); } catch {}
    activeAgents.delete(taskKey);
    return { ok: true };
  }
  return { ok: false, error: 'No agent running for this task' };
});

ipcMain.handle('open-url', (_, url) => {
  if (url) shell.openExternal(url);
  return { ok: true };
});

ipcMain.handle('open-task-servers', () => {
  const script = '/usr/local/share/robos/task-servers/task-servers.sh';
  cp.spawn('bash', [script], { detached: true, stdio: 'ignore', env: { ...process.env, DISPLAY: ':0' } }).unref();
  return { ok: true };
});

function buildAgentPrompt(task, extraContext) {
  const lines = [
    `You are a software engineer implementing a task from a task tracker.`,
    ``,
    `TASK: ${task.title}`,
    `KEY: ${task.key}`,
  ];
  if (task.body && task.body.trim()) {
    lines.push(``, `DESCRIPTION:`, task.body.trim());
  }
  if (task.labels && task.labels.length) {
    lines.push(``, `LABELS: ${task.labels.join(', ')}`);
  }
  if (extraContext && extraContext.trim()) {
    lines.push(``, `ADDITIONAL CONTEXT FROM DEVELOPER:`, extraContext.trim());
  }
  lines.push(
    ``,
    `Please implement this task. Explore the codebase, understand what needs to be done, and make the necessary code changes.`,
    `When done, summarize what you changed and why.`
  );
  return lines.join('\n');
}
