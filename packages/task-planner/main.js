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

// ── robos-lib: ai-json ────────────────────────────────────────────────────────
let aiJson = null;
try {
  const libPaths = [
    process.env.ROBOS_LIB_PATH && path.join(process.env.ROBOS_LIB_PATH, 'ai-json'),
    path.resolve(__dirname, '..', 'robos-lib', 'ai-json'),
    '/usr/local/share/robos/robos-lib/ai-json',
  ].filter(Boolean);
  for (const p of libPaths) {
    try { aiJson = require(p); break; } catch {}
  }
} catch {}

const JSON_RULES_PROMPT = aiJson ? aiJson.JSON_RULES_PROMPT : `CRITICAL JSON RULES: Return ONLY a JSON array. No markdown, no prose, no code fences.`;

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

// ── App window ────────────────────────────────────────────────────────────────
let mainWindow;
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100, height: 780,
    minWidth: 700, minHeight: 500,
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
    title: 'RobOS Task Planner',
    autoHideMenuBar: true,
  });
  mainWindow.loadFile('renderer/index.html');
  if (_debugServer) {
    _debugServer.registerSnapshotIPC && _debugServer.registerSnapshotIPC(mainWindow);
    _debugServer.startDebugServer(mainWindow, 19134, 'task-planner');
  }
}

app.setName('robos-task-planner');
app.setPath('userData', path.join(os.homedir(), '.config', 'robos', 'electron', 'task-planner'));
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }
app.on('second-instance', () => {
  if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); }
});
app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

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
      issueTypes: server.issue_types || [],
      repo: server.type === 'github' ? `${server.gh_org || ''}/${server.gh_repo || ''}` : null,
      jiraUrl: server.type === 'jira' ? server.url : null,
      jiraProject: server.type === 'jira' ? server.jira_project : null,
    },
  };
});

ipcMain.handle('generate-tasks', async (_, { prompt, serverInfo }) => {
  const typeList = (serverInfo.issueTypes || []).map(t => `- ${t.label} (id: ${t.id})`).join('\n') || '(no types configured)';
  const fullPrompt = `You are a software project task planner.

The user has a ${serverInfo.type} task server named "${serverInfo.name}".
${serverInfo.type === 'github' ? `Repository: ${serverInfo.repo}` : `Jira project: ${serverInfo.jiraProject}`}

Available issue types:
${typeList}

The user wants to create tasks based on this request:
"${prompt}"

${JSON_RULES_PROMPT}

Generate a JSON array of tasks to create. Each task object must have:
- "title": string (required, the issue/task title)
- "body": string (required, detailed description in markdown)
- "labels": array of strings (optional, relevant labels)
- "issueType": string (optional, one of the issue type ids above if applicable)

Return ONLY a valid JSON array. No explanation, no markdown code fences.`;

  try {
    const text = await new Promise((resolve, reject) => {
      const child = cp.spawn('gh', ['copilot', '--', '-p', fullPrompt, '--allow-all-tools', '--silent'],
        { encoding: 'utf8' });
      let stdout = '', stderr = '';
      child.stdout.on('data', d => { stdout += d; });
      child.stderr.on('data', d => { stderr += d; });
      const timer = setTimeout(() => { child.kill(); reject(new Error('Timed out after 3 minutes')); }, 180000);
      child.on('close', code => {
        clearTimeout(timer);
        if (code !== 0 && !stdout) reject(new Error(stderr || 'AI agent failed'));
        else resolve(stdout);
      });
    });

    const parsed = aiJson ? await aiJson.parseAIJson(text) : JSON.parse(text);
    if (!Array.isArray(parsed)) throw new Error('Expected an array of tasks');
    return { ok: true, tasks: parsed };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('create-tasks', async (_, { tasks, serverInfo }) => {
  const results = [];
  for (const task of tasks) {
    try {
      let result;
      if (serverInfo.type === 'github') {
        const args = ['issue', 'create', '--repo', serverInfo.repo, '--title', task.title, '--body', task.body || ''];
        if (task.labels && task.labels.length) {
          for (const lbl of task.labels) {
            cp.spawnSync('gh', ['label', 'create', lbl, '--repo', serverInfo.repo, '--color', '5319e7', '--force'],
              { timeout: 8000 });
          }
          args.push('--label', task.labels.join(','));
        }
        const r = cp.spawnSync('gh', args, { encoding: 'utf8', timeout: 30000 });
        if (r.status === 0) {
          const url = r.stdout.trim();
          result = { ok: true, url, title: task.title };
        } else {
          result = { ok: false, error: r.stderr || 'gh issue create failed', title: task.title };
        }
      } else if (serverInfo.type === 'jira') {
        result = { ok: false, error: 'Jira create not yet implemented', title: task.title };
      } else {
        result = { ok: false, error: `Unknown server type: ${serverInfo.type}`, title: task.title };
      }
      results.push(result);
    } catch (e) {
      results.push({ ok: false, error: e.message, title: task.title });
    }
  }
  return { ok: true, results };
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
