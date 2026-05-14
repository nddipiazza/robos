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
    try {
      // Resolve JiraAdapter from robos-task-client (dev path or VM install path)
      let JiraAdapter;
      const taskClientPaths = [
        path.resolve(__dirname, '..', 'robos-task-client', 'jira-adapter'),
        '/usr/local/share/robos/robos-task-client/jira-adapter',
      ];
      for (const p of taskClientPaths) {
        try { JiraAdapter = require(p).JiraAdapter; break; } catch {}
      }
      if (!JiraAdapter) return { ok: false, error: 'robos-task-client not found — is it installed?' };

      // Read API token from pass store
      let token = '';
      if (server.token_pass_path) {
        try {
          token = cp.execSync(
            `bash -lc "pass show ${server.token_pass_path} 2>/dev/null | head -1"`,
            { timeout: 5000, encoding: 'utf8' }
          ).trim();
        } catch (e) {
          return { ok: false, error: `Could not read Jira token from pass store (${server.token_pass_path}): ${e.message}` };
        }
      }

      const adapter = new JiraAdapter({
        url: server.url,
        username: server.username,
        token,
        projects: server.projects || [],
      });

      const state = filter?.state || 'open';
      const projectClause = server.projects && server.projects.length
        ? `project IN (${server.projects.join(',')}) AND `
        : '';

      let jql;
      if (state === 'open') {
        jql = `${projectClause}statusCategory != Done ORDER BY updated DESC`;
      } else if (state === 'closed') {
        jql = `${projectClause}statusCategory = Done ORDER BY updated DESC`;
      } else {
        jql = `${projectClause}ORDER BY updated DESC`;
      }

      const result = await adapter.searchIssues({
        jql,
        maxResults: 50,
        fields: ['summary', 'description', 'status', 'assignee', 'priority', 'issuetype', 'created', 'updated', 'labels', 'parent'],
      });
      return {
        ok: true,
        tasks: result.issues.map(i => ({
          key: i.key,
          title: i.summary,
          body: i.description || '',
          status: i.status,
          labels: i.labels || [],
          assignee: i.assignee,
          updated: i.updated,
          url: i.url,
          issueType: i.issueType,
          priority: i.priority,
        })),
      };
    } catch (e) {
      return { ok: false, error: `Jira error: ${e.message}` };
    }
  }

  return { ok: false, error: `Unsupported server type: ${server.type}` };
});

ipcMain.handle('start-agent', (event, { taskKey, task, extraContext }) => {
  if (activeAgents.has(taskKey)) {
    return { ok: false, error: 'Agent already running for this task' };
  }

  const prompt = buildAgentPrompt(task, extraContext);

  // Claude Code CLI: stream-json outputs one JSON object per line.
  // Each line may be { type:'text', text:'...' } or { type:'result', ... }
  const child = cp.spawn('claude', [
    '-p', prompt,
    '--output-format', 'stream-json',
    '--dangerously-skip-permissions',
  ], { encoding: 'utf8', env: { ...process.env, DISPLAY: ':0' } });

  activeAgents.set(taskKey, child);

  let stdoutBuf = '';
  child.stdout.on('data', d => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    stdoutBuf += d.toString();
    const lines = stdoutBuf.split('\n');
    stdoutBuf = lines.pop(); // keep partial last line
    for (const line of lines) {
      if (!line.trim()) continue;
      let text = line;
      try {
        const obj = JSON.parse(line);
        // stream-json: content delta events have type 'assistant' with content array
        if (obj.type === 'assistant' && Array.isArray(obj.message?.content)) {
          text = obj.message.content
            .filter(b => b.type === 'text')
            .map(b => b.text)
            .join('');
        } else if (obj.type === 'text') {
          text = obj.text;
        } else if (obj.type === 'result') {
          text = obj.result || '';
        } else {
          continue; // skip tool_use, tool_result, etc.
        }
      } catch {}
      if (text) {
        mainWindow.webContents.send('agent-stream', { taskKey, text, stream: 'stdout' });
      }
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
  cp.spawn('/usr/bin/electron', [
    '/usr/local/share/robos/task-servers/main.js',
    '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  ], { detached: true, stdio: 'ignore', env: { ...process.env, DISPLAY: ':0' } }).unref();
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

// ── ti-list-path: @-mention file typeahead for robos-ai-textarea ──────────────
function tiSanitizeName(n) {
  return (n || '').trim().replace(/\s+/g, '_').replace(/[^\w-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

function tiGetTaskServerSuggestions(prefix) {
  try {
    const settingsFile = path.join(os.homedir(), '.config', 'robos', 'settings.json');
    if (!fs.existsSync(settingsFile)) return [];
    const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    const servers = settings.task_servers || [];
    if (!servers.length) return [];
    const raw = String(prefix || '').replace(/^~\//, '').replace(/^~/, '');
    const slashIdx = raw.indexOf('/');
    const typePart = (slashIdx >= 0 ? raw.slice(0, slashIdx) : raw).toLowerCase();
    const namePart = slashIdx >= 0 ? raw.slice(slashIdx + 1).toLowerCase() : '';
    return servers.filter(s => {
      const sType = (s.type || '').toLowerCase();
      const sName = (s.name || '').toLowerCase();
      const sSan  = tiSanitizeName(s.name).toLowerCase();
      if (slashIdx >= 0) {
        if (sType !== typePart) return false;
        if (!namePart) return true;
        return sSan.includes(namePart) || sName.includes(namePart);
      }
      if (!typePart) return true;
      return sType.includes(typePart) || sName.includes(typePart) || sSan.includes(typePart);
    }).map(s => {
      const sanitized = tiSanitizeName(s.name);
      const mentionPath = `${s.type}/${sanitized}`;
      return { name: mentionPath, path: mentionPath, displayName: s.name, taskServerType: s.type, isTaskServer: true };
    });
  } catch { return []; }
}

ipcMain.handle('ti-list-path', (_, prefix) => {
  try {
    const taskServers = tiGetTaskServerSuggestions(prefix);
    const home     = os.homedir();
    const expanded = prefix.replace(/^~/, home);
    const isDir    = expanded.endsWith('/');
    const dir      = isDir ? expanded : path.dirname(expanded);
    const partial  = isDir ? '' : path.basename(expanded);

    const isRecursive = partial && !expanded.slice(home.length + 1).includes('/');
    if (isRecursive) {
      const INDEX_DIR = path.join(home, '.config', 'robos', 'search-index');
      let items = [];
      if (fs.existsSync(INDEX_DIR)) {
        const indexFiles = fs.readdirSync(INDEX_DIR).filter(f => f.endsWith('.txt'));
        const seen = new Set();
        for (const indexFile of indexFiles) {
          const fp = path.join(INDEX_DIR, indexFile);
          const r = cp.spawnSync('grep', ['-i', '-m', '30', partial, fp], { encoding: 'utf8', timeout: 2000 });
          for (const p of (r.stdout || '').split('\n').filter(Boolean)) {
            if (seen.has(p)) continue;
            seen.add(p);
            if (p.startsWith('github.com/')) {
              const parts = p.replace('github.com/', '').split('/');
              if (parts.length === 2) {
                const [org, repo] = parts;
                if (!repo.toLowerCase().includes(partial.toLowerCase()) && !org.toLowerCase().includes(partial.toLowerCase())) continue;
                items.push({ name: `${org}/${repo}`, path: p, isRepo: true });
              }
              continue;
            }
            if (!path.basename(p).toLowerCase().includes(partial.toLowerCase())) continue;
            let isDirectory = false;
            try { isDirectory = fs.statSync(p).isDirectory(); } catch {}
            items.push({ name: path.basename(p) + (isDirectory ? '/' : ''), path: p + (isDirectory ? '/' : ''), isDir: isDirectory, isPath: true });
            if (items.length >= 30) break;
          }
          if (items.length >= 30) break;
        }
      }
      if (!items.length) {
        const result = cp.spawnSync('find', [
          home, '-maxdepth', '6',
          '-not', '-path', '*/node_modules/*', '-not', '-path', '*/.git/*',
          '-not', '-path', '*/dist/*', '-not', '-path', '*/.cache/*',
          '-not', '-name', '.*', '-iname', `*${partial}*`,
        ], { encoding: 'utf8', timeout: 4000 });
        items = (result.stdout || '').split('\n').filter(Boolean).slice(0, 30).map(p => {
          let isDirectory = false;
          try { isDirectory = fs.statSync(p).isDirectory(); } catch {}
          return { name: path.basename(p) + (isDirectory ? '/' : ''), path: p + (isDirectory ? '/' : ''), isDir: isDirectory, isPath: true };
        });
      }
      return { ok: true, items: [...taskServers, ...items] };
    }

    if (!fs.existsSync(dir)) return { ok: true, items: taskServers };
    if (!fs.statSync(dir).isDirectory()) return { ok: true, items: taskServers };
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const items = entries
      .filter(e => !partial || e.name.toLowerCase().includes(partial.toLowerCase()))
      .filter(e => partial.startsWith('.') || !e.name.startsWith('.'))
      .slice(0, 30)
      .map(e => ({
        name:  e.name + (e.isDirectory() ? '/' : ''),
        path:  path.join(dir, e.name) + (e.isDirectory() ? '/' : ''),
        isDir: e.isDirectory(),
        isPath: true,
      }));
    return { ok: true, items: [...taskServers, ...items] };
  } catch { return { ok: true, items: [] }; }
});
