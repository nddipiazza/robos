'use strict';
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path  = require('path');
const fs    = require('fs');
const os    = require('os');
const cp    = require('child_process');
const https = require('https');
const { execSync } = require('child_process');

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

// ── Logger ────────────────────────────────────────────────────────────────────
let log = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
try {
  const libPaths = [
    process.env.ROBOS_LIB_PATH && path.join(process.env.ROBOS_LIB_PATH, 'logger'),
    path.resolve(__dirname, '..', 'robos-lib', 'logger'),
    '/usr/local/share/robos/robos-lib/logger',
  ].filter(Boolean);
  for (const p of libPaths) {
    try { const m = require(p); log = m.createLogger('task-planner'); m.registerLogsIPC && m.registerLogsIPC(ipcMain); break; } catch {}
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function readPassSecret(passPath) {
  if (!passPath) return null;
  // Try standard pass command first
  try {
    const val = execSync(
      `bash -lc "pass ${passPath} 2>/dev/null | head -1"`,
      { timeout: 5000 }
    ).toString().trim();
    if (val) return val;
  } catch { /* fall through */ }
  // Fallback: decrypt .gpg file directly (handles no-TTY environments and plain-text seeded stores)
  try {
    const passDir = execSync(
      'bash -lc "echo ${PASSWORD_STORE_DIR:-$HOME/.password-store}"',
      { timeout: 2000 }
    ).toString().trim();
    const filePath = path.join(passDir, passPath + '.gpg');
    if (!fs.existsSync(filePath)) return null;
    // Try GPG decrypt (works for keyring-cached keys with loopback pinentry)
    try {
      const val = execSync(
        `gpg --batch --no-tty --quiet --pinentry-mode loopback --passphrase "" --decrypt "${filePath}" 2>/dev/null | head -1`,
        { timeout: 8000 }
      ).toString().trim();
      if (val) return val;
    } catch { /* ignore */ }
    // Last resort: if file is plain-text (dev/cloud-init seeded stores)
    const raw = fs.readFileSync(filePath, 'utf8').trim();
    if (raw && !raw.startsWith('\x85') && !raw.startsWith('\x99') && !/[\x00-\x08]/.test(raw)) {
      return raw.split('\n')[0].trim() || null;
    }
  } catch { /* ignore */ }
  return null;
}

async function jiraRequest(method, baseUrl, username, token, apiPath, body) {
  const urlStr = `${baseUrl.replace(/\/$/, '')}${apiPath}`;
  const parsed = new URL(urlStr);
  const auth   = Buffer.from(`${username}:${token}`).toString('base64');
  const bodyStr = body ? JSON.stringify(body) : null;

  return new Promise((resolve, reject) => {
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname + (parsed.search || ''),
      method,
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
      },
      timeout: 20000,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 400) {
          // Safe error — no credentials in message
          return reject(new Error(`Jira returned HTTP ${res.statusCode} for ${method} ${apiPath}`));
        }
        try {
          resolve(data ? JSON.parse(data) : null);
        } catch {
          reject(new Error(`Jira response parse error for ${method} ${apiPath}`));
        }
      });
    });

    req.on('error', (e) => reject(new Error(`Jira request failed: ${e.message}`)));
    req.on('timeout', () => { req.destroy(); reject(new Error('Jira request timed out')); });

    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ── IPC ───────────────────────────────────────────────────────────────────────

ipcMain.handle('read-settings', () => readSettings());

ipcMain.handle('get-server-info', () => {
  const settings = readSettings();
  const server = getActiveServer(settings);
  if (!server) return { ok: false, error: 'No task server configured. Open RobOS Task Servers to add one.' };
  const jiraProject = server.jira_project || (server.projects && server.projects[0]) || '';
  return {
    ok: true,
    server: {
      id: server.id,
      type: server.type,
      name: server.name,
      issueTypes: server.issue_types || [],
      repo: server.type === 'github' ? `${server.gh_org || ''}/${server.gh_repo || ''}` : null,
      jiraUrl: server.type === 'jira' ? server.url : null,
      jiraProject: server.type === 'jira' ? jiraProject : null,
      jiraUsername: server.type === 'jira' ? (server.username || '') : null,
      jiraTokenPassPath: server.type === 'jira' ? (server.token_pass_path || '') : null,
    },
  };
});

ipcMain.handle('fetch-jira-epics', async (_, { jiraUrl, jiraProject, username, tokenPassPath }) => {
  try {
    const token = readPassSecret(tokenPassPath);
    if (!token) return { ok: false, error: 'Could not load Jira API token.' };
    const jql = encodeURIComponent(`project=${jiraProject} AND issuetype=Epic ORDER BY created DESC`);
    // Try v3 first; fall back to v2 if needed
    let data;
    try {
      data = await jiraRequest('GET', jiraUrl, username, token,
        `/rest/api/3/issue/search?jql=${jql}&fields=summary,key,status&maxResults=50`);
    } catch {
      data = await jiraRequest('GET', jiraUrl, username, token,
        `/rest/api/2/search?jql=${jql}&fields=summary,key,status&maxResults=50`);
    }
    const epics = (data && data.issues || []).map(issue => ({
      key: issue.key,
      summary: (issue.fields.summary || ''),
      status: issue.fields.status && issue.fields.status.name,
    }));
    return { ok: true, epics };
  } catch (e) {
    // Non-fatal — return empty epic list so UI stays usable
    return { ok: true, epics: [], warning: e.message };
  }
});

ipcMain.handle('generate-tasks', async (_, { prompt, serverInfo }) => {
  const typeList = (serverInfo.issueTypes || []).map(t => `- ${t.label} (id: ${t.id})`).join('\n') || '(no types configured)';
  const isJira = serverInfo.type === 'jira';

  const hierarchyInstructions = isJira ? `
For Jira, organize tasks into a hierarchy of Epics with child issues:
- Epics have "isEpic": true and "epicName": a short, memorable epic label (e.g. "User Auth")
- Child issues have "parentEpicIndex": the 0-based array index of their parent Epic
- Place Epics BEFORE their children in the array
- If a task doesn't belong under any epic, omit "parentEpicIndex"
- Each task/story/bug should have "issueType": one of the issue type ids above (e.g. "Story", "Bug", "Task"); Epics use "Epic"
` : `
- Each task should have "issueType": one of the issue type ids above if applicable
`;

  const fullPrompt = `You are a software project task planner.

The user has a ${serverInfo.type} task server named "${serverInfo.name}".
${isJira ? `Jira project: ${serverInfo.jiraProject}` : `Repository: ${serverInfo.repo}`}

Available issue types:
${typeList}

The user wants to create tasks based on this request:
"${prompt}"

${JSON_RULES_PROMPT}

Generate a JSON array of tasks to create. Each task object must have:
- "title": string (required, the issue/task title)
- "body": string (required, detailed description in markdown)
- "labels": array of strings (optional, relevant labels)
${hierarchyInstructions}

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

    let parsed;
    if (aiJson) {
      const r = aiJson.parseAIJson(text);
      if (!r.ok) throw new Error(r.error || 'Failed to parse AI response');
      parsed = r.data;
    } else {
      parsed = JSON.parse(text);
    }
    if (!Array.isArray(parsed)) throw new Error('Expected an array of tasks');
    log.info('tasks-generated', `Generated ${parsed.length} tasks from AI`, { count: parsed.length, server: serverInfo.name });
    return { ok: true, tasks: parsed };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('create-tasks', async (_, { tasks, serverInfo, parentEpicKey }) => {
  const results = [];

  if (serverInfo.type === 'github') {
    for (const task of tasks) {
      try {
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
          log.info('issue-created', `Created GitHub issue: ${task.title}`, { url: r.stdout.trim(), title: task.title, repo: serverInfo.repo });
          results.push({ ok: true, url: r.stdout.trim(), title: task.title });
        } else {
          log.warn('issue-create-failed', `GitHub issue create failed: ${task.title}`, { title: task.title, error: r.stderr });
          results.push({ ok: false, error: r.stderr || 'gh issue create failed', title: task.title });
        }
      } catch (e) {
        results.push({ ok: false, error: e.message, title: task.title });
      }
    }
    return { ok: true, results };
  }

  if (serverInfo.type === 'jira') {
    const token = readPassSecret(serverInfo.jiraTokenPassPath);
    if (!token) return { ok: false, error: 'Could not load Jira API token from pass store.' };
    const { jiraUrl, jiraProject, jiraUsername } = serverInfo;
    const baseUrl = jiraUrl.replace(/\/$/, '');

    // Map AI-generated task indices to created Jira issue keys for epic linking
    const epicKeyByIndex = {};

    // Create all epics first (in order), then children
    const epics = tasks.map((t, i) => t.isEpic ? i : null).filter(i => i !== null);
    const children = tasks.map((t, i) => t.isEpic ? null : i).filter(i => i !== null);

    for (const idx of epics) {
      const task = tasks[idx];
      try {
        const fields = {
          project: { key: jiraProject },
          summary: task.title,
          description: task.body || '',
          issuetype: { name: 'Epic' },
        };
        const data = await jiraRequest('POST', baseUrl, jiraUsername, token, '/rest/api/2/issue', { fields });
        if (data && data.key) {
          epicKeyByIndex[idx] = data.key;
          const issueUrl = `${baseUrl}/browse/${data.key}`;
          log.info('epic-created', `Created Jira epic ${data.key}: ${task.title}`, { key: data.key, title: task.title, project: jiraProject });
          results[idx] = { ok: true, url: issueUrl, title: task.title, key: data.key, isEpic: true };
        } else {
          log.warn('epic-create-failed', `Jira did not return key for epic: ${task.title}`, { title: task.title });
          results[idx] = { ok: false, error: 'Jira did not return an issue key', title: task.title };
        }
      } catch (e) {
        log.error('epic-create-error', `Failed to create epic: ${task.title}`, { title: task.title, error: e.message });
        results[idx] = { ok: false, error: e.message, title: task.title };
      }
    }

    for (const idx of children) {
      const task = tasks[idx];
      try {
        const issueTypeName = task.issueType || 'Story';
        const fields = {
          project: { key: jiraProject },
          summary: task.title,
          description: task.body || '',
          issuetype: { name: issueTypeName },
        };

        // Determine parent epic key: from inline task.parentEpicIndex, or top-level parentEpicKey
        let resolvedEpicKey = null;
        if (typeof task.parentEpicIndex === 'number' && epicKeyByIndex[task.parentEpicIndex]) {
          resolvedEpicKey = epicKeyByIndex[task.parentEpicIndex];
        } else if (task.epicKey) {
          resolvedEpicKey = task.epicKey;
        } else if (parentEpicKey) {
          resolvedEpicKey = parentEpicKey;
        }

        if (resolvedEpicKey) {
          // Try next-gen parent link first; fall back to classic Epic Link field
          fields.parent = { key: resolvedEpicKey };
        }

        let data;
        try {
          data = await jiraRequest('POST', baseUrl, jiraUsername, token, '/rest/api/2/issue', { fields });
        } catch (e) {
          // If parent link fails, retry with classic customfield_10014 Epic Link
          if (resolvedEpicKey && fields.parent) {
            delete fields.parent;
            fields.customfield_10014 = resolvedEpicKey;
            data = await jiraRequest('POST', baseUrl, jiraUsername, token, '/rest/api/2/issue', { fields });
          } else {
            throw e;
          }
        }

        if (data && data.key) {
          const issueUrl = `${baseUrl}/browse/${data.key}`;
          log.info('issue-created', `Created Jira issue ${data.key}: ${task.title}`, { key: data.key, title: task.title, epicKey: resolvedEpicKey || null, project: jiraProject });
          results[idx] = { ok: true, url: issueUrl, title: task.title, key: data.key, epicKey: resolvedEpicKey || null };
        } else {
          log.warn('issue-create-failed', `Jira did not return key for issue: ${task.title}`, { title: task.title });
          results[idx] = { ok: false, error: 'Jira did not return an issue key', title: task.title };
        }
      } catch (e) {
        log.error('issue-create-error', `Failed to create issue: ${task.title}`, { title: task.title, error: e.message });
        results[idx] = { ok: false, error: e.message, title: task.title };
      }
    }

    // Fill any gaps (tasks that weren't epic or child — shouldn't happen but be safe)
    tasks.forEach((task, idx) => {
      if (!results[idx]) results[idx] = { ok: false, error: 'Task not processed', title: task.title };
    });

    return { ok: true, results };
  }

  return { ok: false, error: `Unknown server type: ${serverInfo.type}` };
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
