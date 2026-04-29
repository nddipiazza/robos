'use strict';
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const cp   = require('child_process');

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

// ── Journal helpers ───────────────────────────────────────────────────────────
function getJournalDir() {
  try {
    const s = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    const repo = s.journal_repo;
    if (!repo) return null;
    const parts = repo.replace('https://github.com/', '').replace('git@github.com:', '').replace('.git', '').split('/');
    return path.join(os.homedir(), 'source', 'github.com', parts[0], parts[1]);
  } catch { return null; }
}
function journalAppend(section, text) {
  try {
    const dir = getJournalDir();
    if (!dir || !fs.existsSync(path.join(dir, '.git'))) return;
    const subDir = path.join(dir, 'workflow-studio');
    fs.mkdirSync(subDir, { recursive: true });
    const today = new Date().toISOString().slice(0, 10);
    const file = path.join(subDir, `${today}.md`);
    const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : `# Workflow Studio — ${today}\n\n`;
    fs.writeFileSync(file, existing + `\n## ${section} — ${new Date().toLocaleTimeString()}\n\n${text}\n`);
    cp.spawnSync('git', ['-C', dir, 'add', '-A'], { encoding: 'utf8' });
    const status = cp.spawnSync('git', ['-C', dir, 'status', '--porcelain'], { encoding: 'utf8' });
    if (!status.stdout.trim()) return;
    cp.spawnSync('git', ['-C', dir, 'commit', '-m', `workflow-studio: ${section} ${today}`], { encoding: 'utf8' });
    cp.spawn('git', ['-C', dir, 'push'], { detached: true, stdio: 'ignore' }).unref();
  } catch { /* non-fatal */ }
}

// ── Journal event logging ─────────────────────────────────────────────────────
const JOURNAL_EVENTS_FILE = path.join(os.homedir(), '.config', 'robos', 'journal-events.json');
function writeJournalEvent(evt) {
  try {
    fs.mkdirSync(path.dirname(JOURNAL_EVENTS_FILE), { recursive: true });
    let events = [];
    try { events = JSON.parse(fs.readFileSync(JOURNAL_EVENTS_FILE, 'utf8')); } catch {}
    events.unshift({ id: `${Date.now()}-${Math.random().toString(36).slice(2,7)}`, timestamp: new Date().toISOString(), ...evt });
    if (events.length > 2000) events = events.slice(0, 2000);
    fs.writeFileSync(JOURNAL_EVENTS_FILE, JSON.stringify(events, null, 2));
  } catch {}
}

// Issue number or "config" passed as CLI arg
const cliArg   = process.argv.slice(2).find(a => /^(config|#?\d+)$/.test(a));
const issueNum = cliArg && cliArg !== 'config' ? cliArg.replace('#', '') : null;
const startView = cliArg === 'config' ? 'config' : 'issue';

function createWindow() {
  const win = new BrowserWindow({
    width: 1000, height: 760,
    minWidth: 700, minHeight: 500,
    backgroundColor: '#0d1117',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
    title: issueNum ? `Issue #${issueNum} — RobOS Issue Manager` : 'RobOS Issue Manager',
    autoHideMenuBar: true,
  });
  win.loadFile('renderer/index.html', { query: { view: startView, issue: issueNum || '' } });
  if (_debugServer) _debugServer.startDebugServer(win, 19103);
}

app.setName('issue-manager');
app.setPath('userData', path.join(process.env.HOME || '/home/robos', '.config', 'robos', 'electron', 'issue-manager'));
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }
app.on('second-instance', () => {
  const w = require('electron').BrowserWindow.getAllWindows()[0];
  if (w) { if (w.isMinimized()) w.restore(); w.focus(); }
});
app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

// ── Settings ─────────────────────────────────────────────────────────────────

function readSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')); }
  catch { return {}; }
}
function writeSettings(data) {
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function activeTS(settings) {
  const id = settings.active_task_server;
  return (settings.task_servers || []).find(ts => ts.id === id)
      || (settings.task_servers || [])[0]
      || {};
}

function spawnStream(event, cmd, args, opts) {
  const proc = cp.spawn(cmd, args, {
    ...opts,
    env: { ...process.env, DISPLAY: ':0', ...(opts && opts.env || {}) },
  });
  proc.stdout.on('data', d => event.sender.send('stream', d.toString()));
  proc.stderr.on('data', d => event.sender.send('stream', d.toString()));
  return new Promise(res => proc.on('close', code => res(code)));
}

function stripAiFooter(text) {
  const cut = text.indexOf('\nTotal usage');
  return cut >= 0 ? text.slice(0, cut).trim() : text.trim();
}

// ── IPC ───────────────────────────────────────────────────────────────────────

ipcMain.handle('read-settings',  () => readSettings());
ipcMain.handle('write-settings', (_, data) => {
  writeSettings(data);
  // Journal: log workflow config save
  const ts = (data.task_servers || [{}])[0] || {};
  const types = (ts.issue_types || []).map(t => `- **${t.label}** (${t.id})`).join('\n');
  if (types) journalAppend('Workflow Config Saved', `Issue types:\n${types}`);
});
ipcMain.handle('open-app', (_, appName) => {
  const scripts = {
    'work-journal': '/usr/local/share/robos/work-journal/work-journal.sh',
    'context-manager': '/usr/local/share/robos/context-manager/context-manager.sh',
    'task-planner': '/usr/local/share/robos/task-planner/task-planner.sh',
  };
  const s = scripts[appName];
  if (!s) return { ok: false };
  cp.spawn('bash', [s], { detached: true, stdio: 'ignore', env: { ...process.env, DISPLAY: ':0' } }).unref();
  return { ok: true };
});

ipcMain.handle('fetch-issue', async (_, { repo, num }) => {
  try {
    const r = cp.spawnSync('gh', [
      'issue', 'view', String(num), '--repo', repo,
      '--json', 'number,title,body,labels,state,url,assignees,createdAt,updatedAt,comments',
    ], { encoding: 'utf8', timeout: 15000 });
    if (r.status === 0) return { ok: true, data: JSON.parse(r.stdout) };
    return { ok: false, error: r.stderr || 'gh failed' };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('list-issues', async (_, { repo, assignee, state }) => {
  try {
    const args = ['issue', 'list', '--repo', repo,
      '--json', 'number,title,labels,state,assignees,updatedAt',
      '--limit', '100'];
    if (assignee) args.push('--assignee', assignee);
    if (state)    args.push('--state',    state);
    const r = cp.spawnSync('gh', args, { encoding: 'utf8', timeout: 15000 });
    if (r.status === 0) return { ok: true, data: JSON.parse(r.stdout) };
    return { ok: false, error: r.stderr };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('transition-issue', async (event, { repo, num, removeLabel, addLabel }) => {
  if (removeLabel) {
    await spawnStream(event, 'gh', ['issue', 'edit', String(num), '--repo', repo, '--remove-label', removeLabel], {});
  }
  if (addLabel) {
    cp.spawnSync('gh', ['label', 'create', addLabel, '--repo', repo, '--color', '5319e7', '--force'], { timeout: 8000 });
    await spawnStream(event, 'gh', ['issue', 'edit', String(num), '--repo', repo, '--add-label', addLabel], {});
  }
  // persist active-issue
  const af = path.join(os.homedir(), '.config', 'robos', 'active-issue');
  fs.mkdirSync(path.dirname(af), { recursive: true });
  fs.writeFileSync(af, String(num));
});

ipcMain.handle('run-script', async (event, { script, env }) => {
  return spawnStream(event, 'bash', ['-c', script], { env: { ...process.env, ...env, DISPLAY: ':0' } });
});

ipcMain.handle('run-ai-prompt', async (event, { prompt, env }) => {
  let p = prompt;
  if (env) {
    Object.entries(env).forEach(([k, v]) => {
      p = p.replace(new RegExp(`\\{${k.toLowerCase()}\\}`, 'gi'), v);
      p = p.replace(new RegExp(`\\$${k}`, 'g'), v);
    });
  }
  writeJournalEvent({ source: 'issue-manager', type: 'ai-prompt', title: '🔍 Issue AI Prompt', detail: p.slice(0, 200), status: 'started' });
  return spawnStream(event, 'gh', ['copilot', '--', '-p', p, '--allow-all-tools', '--plain-diff'], {
    env: { ...process.env, ...(env || {}), DISPLAY: ':0' },
  });
});

ipcMain.handle('generate-with-ai', async (_, { prompt }) => {
  try {
    const text = await new Promise((resolve, reject) => {
      const child = cp.spawn('gh', ['copilot', '--', '-p', prompt, '--allow-all-tools', '--silent'],
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
    const clean = stripAiFooter(text).replace(/^```[\w]*\r?\n?/gm, '').replace(/^```\r?$/gm, '').trim();
    try { return { ok: true, data: JSON.parse(clean), raw: text }; } catch (_) {}
    const m = clean.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
    if (!m) return { ok: false, error: 'No JSON in response. Output:\n' + text.slice(0, 400) };
    try {
      const parsed = JSON.parse(m[0]);
      const types = Array.isArray(parsed) ? parsed.map(t => `- **${t.label || t.id}**`).join('\n') : '';
      if (types) journalAppend('AI Generated Workflow', `Generated ${parsed.length} issue type(s):\n${types}`);
      writeJournalEvent({ source: 'issue-manager', type: 'ai-generate', title: `✦ AI Generated Issue Data`, detail: `${Array.isArray(parsed) ? parsed.length : 1} item(s): ${prompt.slice(0, 100)}`, status: 'completed' });
      return { ok: true, data: parsed, raw: text };
    }
    catch (e) { return { ok: false, error: 'JSON parse error: ' + e.message + '\nRaw:\n' + text.slice(0, 400) }; }
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('setup-workspace', async (event, { repo, num, org, workspace_setup_script }) => {
  const repoName = repo.split('/').pop();
  const repoDir  = path.join(os.homedir(), 'source', org || repoName, repoName);
  const branch   = `issue-${num}`;
  if (workspace_setup_script && workspace_setup_script.trim()) {
    return spawnStream(event, 'bash', ['-c', workspace_setup_script], {
      env: { ...process.env, ISSUE_NUM: String(num), ORG: org || '', REPO: repoName, REPO_DIR: repoDir, DISPLAY: ':0' },
    });
  }
  const script = `
    set -e
    echo "==> Cloning/updating repo..."
    if [ ! -d "${repoDir}/.git" ]; then
      mkdir -p "$(dirname "${repoDir}")"
      gh repo clone "${repo}" "${repoDir}"
    else
      cd "${repoDir}" && git fetch origin
    fi
    cd "${repoDir}"
    echo "==> Checking out branch ${branch}..."
    git checkout "${branch}" 2>/dev/null || git checkout -b "${branch}"
    echo "✓ Workspace ready at ${repoDir}"
  `;
  return spawnStream(event, 'bash', ['-c', script], {});
});

ipcMain.handle('open-vscode', (_, { repo, org }) => {
  const repoName = repo.split('/').pop();
  const repoDir  = path.join(os.homedir(), 'source', org || repoName, repoName);
  const target   = fs.existsSync(repoDir) ? repoDir : os.homedir();
  cp.spawn('code', [target], { env: { ...process.env, DISPLAY: ':0' }, detached: true });
});

ipcMain.handle('open-url', (_, url) => shell.openExternal(url));
