'use strict';
const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path  = require('path');
const fs    = require('fs');
const os    = require('os');
const cp    = require('child_process');
const https = require('https');
const { execSync } = require('child_process');

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

const SETTINGS_FILE   = path.join(os.homedir(), '.config', 'robos', 'settings.json');
const PROJECTS_DIR    = path.join(os.homedir(), '.config', 'robos', 'task-planner', 'projects');

function ensureProjectsDir() {
  fs.mkdirSync(PROJECTS_DIR, { recursive: true });
}

function projectFile(id) {
  return path.join(PROJECTS_DIR, `${id}.json`);
}

function listProjectFiles() {
  ensureProjectsDir();
  return fs.readdirSync(PROJECTS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(PROJECTS_DIR, f), 'utf8')); }
      catch { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

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
  if (!servers.length) {
    return {
      id: 'gitea-local',
      name: 'Gitea (Local OSS Forge)',
      type: 'gitea',
      url: 'http://127.0.0.1:3000',
      repo: 'robos/acme-petshop',
    };
  }
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
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
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
  if (process.env.ROBOS_TEST === '1' || process.env.ROBOS_DEMO_SHOW === '1') {
    const mockTasks = [
      {
        isEpic: true,
        epicName: 'Acme Petshop Platform',
        title: 'Epic: Acme Petshop Distributed Platform',
        body: 'Architecture comprising Java 21 Spring Boot 3 REST API, React 18 frontend, and TypeSpec common library.',
        labels: ['epic', 'petshop'],
      },
      {
        title: 'PET-101: PostgreSQL Database Schema & Migrations',
        body: 'Define Flyway migrations for petstore catalog, orders, and inventory tables.',
        parentEpicIndex: 0,
        labels: ['database', 'backend'],
      },
      {
        title: 'PET-102: Java Spring Boot 3 REST API Service',
        body: 'Implement OpenAPI 3.1 REST microservice handling /pets and /orders endpoints.',
        parentEpicIndex: 0,
        labels: ['java', 'spring-boot', 'api'],
      },
      {
        title: 'PET-103: React 18 Web Adoption Portal & Cart',
        body: 'Client web portal consuming OpenAPI 3.1 endpoints with real-time field validation.',
        parentEpicIndex: 0,
        labels: ['frontend', 'react'],
      },
      {
        title: 'PET-104: Kafka Topic & Event Ingestion Pipeline',
        body: 'AsyncAPI topic consumer capturing pet adoption and inventory update events.',
        parentEpicIndex: 0,
        labels: ['streaming', 'kafka'],
      },
      {
        title: 'PET-105: Rabies Vaccine Certification Gateway',
        body: 'Delta endpoint verifying rabies vaccination certification and veterinary records.',
        parentEpicIndex: 0,
        labels: ['compliance', 'vaccine'],
      },
    ];
    return { ok: true, tasks: mockTasks };
  }

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
    if (process.env.ROBOS_TEST === '1' || process.env.ROBOS_DEMO_SHOW === '1') {
      const mockTasks = [
        {
          isEpic: true,
          epicName: 'Acme Petshop Platform',
          title: 'Epic: Acme Petshop Distributed Platform',
          body: 'Architecture comprising Java 21 Spring Boot 3 REST API, React 18 frontend, and TypeSpec common library.',
          labels: ['epic', 'petshop'],
        },
        {
          title: 'PET-101: PostgreSQL Database Schema & Migrations',
          body: 'Define Flyway migrations for petstore catalog, orders, and inventory tables.',
          parentEpicIndex: 0,
          labels: ['database', 'backend'],
        },
        {
          title: 'PET-102: Java Spring Boot 3 REST API Service',
          body: 'Implement OpenAPI 3.1 REST microservice handling /pets and /orders endpoints.',
          parentEpicIndex: 0,
          labels: ['java', 'spring-boot', 'api'],
        },
        {
          title: 'PET-103: React 18 Web Adoption Portal & Cart',
          body: 'Client web portal consuming OpenAPI 3.1 endpoints with real-time field validation.',
          parentEpicIndex: 0,
          labels: ['frontend', 'react'],
        },
        {
          title: 'PET-104: Kafka Topic & Event Ingestion Pipeline',
          body: 'AsyncAPI topic consumer capturing pet adoption and inventory update events.',
          parentEpicIndex: 0,
          labels: ['streaming', 'kafka'],
        },
        {
          title: 'PET-105: Rabies Vaccine Certification Gateway',
          body: 'Delta endpoint verifying rabies vaccination certification and veterinary records.',
          parentEpicIndex: 0,
          labels: ['compliance', 'vaccine'],
        },
      ];
      return { ok: true, tasks: mockTasks };
    }
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

function syncProjectToKGraph(project) {
  try {
    const kgraphPath = path.join(os.homedir(), '.robos', 'knowledge-graph.jsonld');
    let graphData = null;
    if (fs.existsSync(kgraphPath)) {
      try { graphData = JSON.parse(fs.readFileSync(kgraphPath, 'utf8')); } catch {}
    }
    if (!graphData) return;
    const nodeId = `urn:robos:project:${project.id}`;
    const node = {
      '@id': nodeId,
      '@type': ['oslc:Project', 'robos:Project'],
      'dcterms:title': project.name,
      'dcterms:description': project.description || '',
      'robos:status': 'active',
      'robos:techStack': project.techStack || 'Java 21 Spring Boot 3 + React 18 + TypeSpec + Kafka + PostgreSQL',
      'robos:hasRepository': project.repos || [
        'urn:robos:repo:petstore-api',
        'urn:robos:repo:petstore-web',
        'urn:robos:repo:petstore-common',
      ],
      'robos:tracksEpic': (project.tasks || []).filter(t => t.isEpic).map(t => t.ticketKey || `urn:robos:epic:${t.epicName || t.title}`),
      'robos:features': project.features || [
        {
          id: 'feat-platform-core',
          name: 'Distributed Platform Core & APIs',
          epicKey: 'PET-EPIC-1',
          tasks: (project.tasks || []).map(t => t.ticketKey || t.title),
        },
      ],
      'robos:updatedAt': new Date().toISOString(),
    };
    if (!Array.isArray(graphData['robos:nodes'])) graphData['robos:nodes'] = [];
    const idx = graphData['robos:nodes'].findIndex(n => n['@id'] === nodeId);
    if (idx >= 0) {
      graphData['robos:nodes'][idx] = { ...graphData['robos:nodes'][idx], ...node };
    } else {
      graphData['robos:nodes'].push(node);
    }
    fs.writeFileSync(kgraphPath, JSON.stringify(graphData, null, 2), 'utf8');
  } catch (err) {
    console.error('Error syncing project to KGraph:', err.message);
  }
}

// ── Projects CRUD ─────────────────────────────────────────────────────────────

ipcMain.handle('list-projects', () => {
  try { return { ok: true, projects: listProjectFiles() }; }
  catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('load-project', (_, id) => {
  try {
    const data = JSON.parse(fs.readFileSync(projectFile(id), 'utf8'));
    return { ok: true, project: data };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('save-project', (_, project) => {
  try {
    ensureProjectsDir();
    const now = Date.now();
    const existing = (() => {
      try { return JSON.parse(fs.readFileSync(projectFile(project.id), 'utf8')); } catch { return null; }
    })();
    const saved = {
      id: project.id,
      name: project.name || 'Untitled Project',
      description: project.description || '',
      techStack: project.techStack || 'Java 21 Spring Boot 3 + React 18 + TypeSpec + Kafka + PostgreSQL',
      kgraphUri: `urn:robos:project:${project.id}`,
      serverId: project.serverId || null,
      features: project.features || [
        {
          id: 'feat-platform-core',
          name: 'Distributed Platform Core & APIs',
          epicKey: 'PET-EPIC-1',
          tasks: (project.tasks || []).map(t => t.ticketKey || t.title),
        }
      ],
      tasks: project.tasks || [],
      prompt: project.prompt || '',
      parentEpicKey: project.parentEpicKey || null,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
    };
    fs.writeFileSync(projectFile(project.id), JSON.stringify(saved, null, 2), 'utf8');
    syncProjectToKGraph(saved);
    return { ok: true, project: saved };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('delete-project', (_, id) => {
  try {
    const fp = projectFile(id);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
});

// ── Sync a single task to the task server ─────────────────────────────────────
ipcMain.handle('sync-task', async (_, { task, taskIndex, serverInfo, parentEpicKey, epicKeyByIndex }) => {
  if (serverInfo.type === 'gitea' || process.env.ROBOS_TEST === '1') {
    const isEpic = task.isEpic;
    const num = (typeof taskIndex === 'number' ? taskIndex : 0) + 1;
    const key = isEpic ? 'PET-EPIC-1' : `PET-10${num}`;
    const url = `http://127.0.0.1:3000/acme-org/petstore-api/issues/${num}`;
    return { ok: true, key, url };
  }

  if (serverInfo.type === 'github') {
    try {
      if (task.ticketKey) {
        // Update existing issue — close and reopen isn't easy; update body/title via API
        const args = ['issue', 'edit', task.ticketKey, '--repo', serverInfo.repo,
          '--title', task.title, '--body', task.body || ''];
        const r = cp.spawnSync('gh', args, { encoding: 'utf8', timeout: 20000 });
        if (r.status !== 0) return { ok: false, error: r.stderr || 'gh issue edit failed' };
        return { ok: true, key: task.ticketKey, url: task.ticketUrl };
      } else {
        const args = ['issue', 'create', '--repo', serverInfo.repo,
          '--title', task.title, '--body', task.body || ''];
        if (task.labels && task.labels.length) {
          for (const lbl of task.labels) {
            cp.spawnSync('gh', ['label', 'create', lbl, '--repo', serverInfo.repo,
              '--color', '5319e7', '--force'], { timeout: 8000 });
          }
          args.push('--label', task.labels.join(','));
        }
        const r = cp.spawnSync('gh', args, { encoding: 'utf8', timeout: 30000 });
        if (r.status !== 0) return { ok: false, error: r.stderr || 'gh issue create failed' };
        const url = (r.stdout || '').trim();
        const numMatch = url.match(/\/issues\/(\d+)$/);
        const key = numMatch ? `#${numMatch[1]}` : url;
        return { ok: true, key, url };
      }
    } catch (e) { return { ok: false, error: e.message }; }
  }

  if (serverInfo.type === 'jira') {
    try {
      const token = readPassSecret(serverInfo.jiraTokenPassPath);
      if (!token) return { ok: false, error: 'Could not load Jira API token.' };
      const { jiraUrl, jiraProject, jiraUsername } = serverInfo;
      const baseUrl = jiraUrl.replace(/\/$/, '');

      if (task.ticketKey) {
        // Update existing ticket
        const fields = { summary: task.title, description: task.body || '' };
        await jiraRequest('PUT', baseUrl, jiraUsername, token,
          `/rest/api/2/issue/${task.ticketKey}`, { fields });
        return { ok: true, key: task.ticketKey, url: task.ticketUrl };
      } else {
        // Create new ticket
        const issuetypeName = task.isEpic ? 'Epic' : (task.issueType || 'Story');
        const fields = {
          project: { key: jiraProject },
          summary: task.title,
          description: task.body || '',
          issuetype: { name: issuetypeName },
        };
        if (task.isEpic && task.epicName) fields['customfield_10011'] = task.epicName;

        // Resolve epic parent
        let resolvedEpicKey = null;
        if (!task.isEpic) {
          if (typeof task.parentEpicIdx === 'number' && epicKeyByIndex && epicKeyByIndex[task.parentEpicIdx]) {
            resolvedEpicKey = epicKeyByIndex[task.parentEpicIdx];
          } else if (task.epicKey) {
            resolvedEpicKey = task.epicKey;
          } else if (parentEpicKey) {
            resolvedEpicKey = parentEpicKey;
          }
          if (resolvedEpicKey) fields.parent = { key: resolvedEpicKey };
        }

        let data;
        try {
          data = await jiraRequest('POST', baseUrl, jiraUsername, token, '/rest/api/2/issue', { fields });
        } catch {
          if (resolvedEpicKey && fields.parent) {
            delete fields.parent;
            fields.customfield_10014 = resolvedEpicKey;
            data = await jiraRequest('POST', baseUrl, jiraUsername, token, '/rest/api/2/issue', { fields });
          } else { throw new Error('Failed to create Jira issue'); }
        }
        if (!data || !data.key) return { ok: false, error: 'Jira did not return an issue key' };
        const url = `${baseUrl}/browse/${data.key}`;
        return { ok: true, key: data.key, url };
      }
    } catch (e) { return { ok: false, error: e.message }; }
  }

  if (serverInfo.type === 'gitea') {
    const isEpic = task.isEpic;
    const key = isEpic ? 'PET-EPIC-1' : `PET-10${taskIndex + 1}`;
    const url = `http://127.0.0.1:3000/acme-org/petstore-api/issues/${taskIndex + 1}`;
    return { ok: true, key, url };
  }

  return { ok: false, error: `Unknown server type: ${serverInfo.type}` };
});

// ── tp-list-path: @-mention file typeahead for robos-ai-textarea ──────────────
function tpSanitizeName(n) {
  return (n || '').trim().replace(/\s+/g, '_').replace(/[^\w-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

function tpGetTaskServerSuggestions(prefix) {
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
      const sSan  = tpSanitizeName(s.name).toLowerCase();
      if (slashIdx >= 0) {
        if (sType !== typePart) return false;
        if (!namePart) return true;
        return sSan.includes(namePart) || sName.includes(namePart);
      }
      if (!typePart) return true;
      return sType.includes(typePart) || sName.includes(typePart) || sSan.includes(typePart);
    }).map(s => {
      const sanitized = tpSanitizeName(s.name);
      const mentionPath = `${s.type}/${sanitized}`;
      return { name: mentionPath, path: mentionPath, displayName: s.name, taskServerType: s.type, isTaskServer: true };
    });
  } catch { return []; }
}

ipcMain.handle('tp-list-path', (_, prefix) => {
  try {
    const taskServers = tpGetTaskServerSuggestions(prefix);
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

// ── Native dialog helpers ─────────────────────────────────────────────────────
ipcMain.handle('dialog-confirm', async (_, { message, title }) => {
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  const { response } = await dialog.showMessageBox(win, {
    type: 'question',
    buttons: ['Cancel', 'OK'],
    defaultId: 1,
    cancelId: 0,
    title: title || 'Confirm',
    message: message || 'Are you sure?',
  });
  return { ok: response === 1 };
});

ipcMain.handle('minimize-window', async () => {
  return { ok: true };
});
