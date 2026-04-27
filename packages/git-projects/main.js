const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const cp   = require('child_process');

const DATA_FILE       = path.join(os.homedir(), '.config', 'robos', 'git-projects.json');
const GROUPS_DIR      = path.join(os.homedir(), '.config', 'robos', 'groups');
const REPO_CACHE_FILE = path.join(os.homedir(), '.config', 'robos', 'gh-repos-cache.json');

// Debug server (optional) — same resolution order as every other RobOS app.
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

function readProjects() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return { projects: [] }; }
}

function writeProjects(data) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  buildGitReposIndex(); // keep search index in sync
}

function buildGitReposIndex() {
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    const lines = (data.projects || []).map(p => `github.com/${p.org}/${p.repo}`);
    const indexDir = path.join(os.homedir(), '.config', 'robos', 'search-index');
    fs.mkdirSync(indexDir, { recursive: true });
    fs.writeFileSync(path.join(indexDir, 'git-repos.txt'), lines.join('\n') + '\n');
  } catch {}
}

let _win = null;
function createWindow() {
  _win = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 800,
    minHeight: 500,
    backgroundColor: '#0d1117',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
    title: 'RobOS Git Projects',
    autoHideMenuBar: true,
  });
  _win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  if (_debugServer) _debugServer.startDebugServer(_win, 19138);
}

app.setName('git-projects');
app.setPath('userData', path.join(os.homedir(), '.config', 'robos', 'electron', 'git-projects'));
app.whenReady().then(() => { buildGitReposIndex(); createWindow(); });
app.on('window-all-closed', () => app.quit());

// ── URL helpers ──────────────────────────────────────────────────────────────

function parseGitUrl(url) {
  // Normalise ssh git@github.com:org/repo.git → https form
  let u = url.trim().replace(/\.git$/, '');
  const ssh = u.match(/^git@([^:]+):(.+)$/);
  if (ssh) u = `https://${ssh[1]}/${ssh[2]}`;

  try {
    const parsed = new URL(u);
    const host   = parsed.hostname.replace(/^www\./, '');
    const parts  = parsed.pathname.replace(/^\//, '').split('/');
    const org    = parts[0] || '';
    const repo   = parts[1] || '';
    const localPath = path.join(os.homedir(), 'source', host, org, repo);
    // Generate SSH URL for GitHub hosts
    const sshUrl = host.includes('github') ? `git@${host}:${org}/${repo}.git` : null;
    return { ok: true, host, org, repo, url: u, sshUrl, localPath };
  } catch {
    return { ok: false, error: 'Invalid URL' };
  }
}

// ── IPC ──────────────────────────────────────────────────────────────────────

ipcMain.handle('read-projects', () => readProjects());
ipcMain.handle('write-projects', (_, data) => writeProjects(data));

ipcMain.handle('parse-url', (_, url) => parseGitUrl(url));

ipcMain.handle('check-cloned', (_, localPath) => {
  return fs.existsSync(path.join(localPath, '.git'));
});

ipcMain.handle('clone', async (event, { url, localPath }) => {
  if (fs.existsSync(path.join(localPath, '.git'))) {
    return { ok: true, message: 'Already cloned' };
  }
  fs.mkdirSync(path.dirname(localPath), { recursive: true });
  return new Promise(resolve => {
    const proc = cp.spawn('git', ['clone', url, localPath], {
      env: { ...process.env },
    });
    let out = '';
    proc.stdout.on('data', d => { out += d; event.sender.send('clone-output', d.toString()); });
    proc.stderr.on('data', d => { out += d; event.sender.send('clone-output', d.toString()); });
    proc.on('close', code => {
      if (code === 0) resolve({ ok: true, message: 'Cloned successfully' });
      else            resolve({ ok: false, error: `git clone failed (exit ${code})\n${out.slice(-300)}` });
    });
  });
});

ipcMain.handle('pull', async (event, { localPath }) => {
  if (!fs.existsSync(path.join(localPath, '.git')))
    return { ok: false, error: 'Not cloned' };
  return new Promise(resolve => {
    const proc = cp.spawn('git', ['pull'], { cwd: localPath, env: { ...process.env } });
    let out = '';
    proc.stdout.on('data', d => { out += d; event.sender.send('clone-output', d.toString()); });
    proc.stderr.on('data', d => { out += d; event.sender.send('clone-output', d.toString()); });
    proc.on('close', code => {
      if (code === 0) resolve({ ok: true, message: out.trim() || 'Already up to date' });
      else            resolve({ ok: false, error: out.slice(-300) });
    });
  });
});

// ── IDE detection & launch ────────────────────────────────────────────────────
const KNOWN_IDES = [
  { id: 'cursor', name: 'Cursor',              cmd: 'cursor' },
  { id: 'code',   name: 'VS Code',             cmd: 'code'   },
  { id: 'idea',   name: 'IntelliJ IDEA',       cmd: 'idea'   },
  { id: 'webstorm', name: 'WebStorm',          cmd: 'webstorm' },
  { id: 'pycharm',  name: 'PyCharm',           cmd: 'pycharm' },
  { id: 'goland',   name: 'GoLand',            cmd: 'goland' },
  { id: 'clion',    name: 'CLion',             cmd: 'clion' },
  { id: 'rider',    name: 'Rider',             cmd: 'rider' },
  { id: 'rustrover', name: 'RustRover',        cmd: 'rustrover' },
  { id: 'fleet',    name: 'Fleet',             cmd: 'fleet' },
  { id: 'zed',      name: 'Zed',              cmd: 'zed' },
  { id: 'sublime',  name: 'Sublime Text',      cmd: 'subl' },
  { id: 'windsurf', name: 'Windsurf',         cmd: 'windsurf' },
];

function detectInstalledIDEs() {
  return KNOWN_IDES.filter(ide => {
    try {
      cp.execFileSync('which', [ide.cmd], { stdio: 'ignore' });
      return true;
    } catch { return false; }
  });
}

ipcMain.handle('get-installed-ides', () => detectInstalledIDEs());

ipcMain.handle('open-in-ide', (_, { cmd, localPath }) => {
  cp.spawn(cmd, [localPath], {
    env: { ...process.env, DISPLAY: process.env.DISPLAY || ':1' },
    detached: true, stdio: 'ignore',
  }).unref();
  return { ok: true };
});

ipcMain.handle('open-vscode', (_, localPath) => {
  cp.spawn('code', [localPath], {
    env: { ...process.env, DISPLAY: process.env.DISPLAY || ':1' },
    detached: true, stdio: 'ignore',
  }).unref();
  return { ok: true };
});

ipcMain.handle('open-vscode-script', (_, { projectId, script, type }) => {
  const dir = path.join(os.homedir(), '.config', 'robos', 'git-projects', projectId);
  fs.mkdirSync(dir, { recursive: true });
  const fileName   = type === 'start' ? 'start.sh' : 'setup.sh';
  const scriptPath = path.join(dir, fileName);
  fs.writeFileSync(scriptPath, script || '', { mode: 0o755 });
  cp.spawn('code', [scriptPath], {
    env: { ...process.env, DISPLAY: process.env.DISPLAY || ':1' },
    detached: true, stdio: 'ignore',
  }).unref();
  return { ok: true, scriptPath };
});

// ── Save all scripts to disk + generate IDE launch configs ────────────────────
const SCRIPT_NAMES = { setup: 'setup.sh', start: 'start.sh', test: 'test.sh', e2e: 'e2e.sh' };

ipcMain.handle('save-scripts-to-disk', (_, { projectId, projectName, scripts }) => {
  const dir = path.join(os.homedir(), '.config', 'robos', 'git-projects', projectId);
  fs.mkdirSync(dir, { recursive: true });

  // Write each script
  for (const [key, content] of Object.entries(scripts)) {
    if (!content) continue;
    const filePath = path.join(dir, SCRIPT_NAMES[key] || `${key}.sh`);
    fs.writeFileSync(filePath, content, { mode: 0o755 });
  }

  // ── .vscode/launch.json ──────────────────────────────────────────────────
  const vscodeDir = path.join(dir, '.vscode');
  fs.mkdirSync(vscodeDir, { recursive: true });
  const vscodeLaunch = {
    version: '0.2.0',
    configurations: Object.entries(scripts)
      .filter(([, v]) => v)
      .map(([key]) => ({
        name: `RobOS: ${key}`,
        type: 'node',
        request: 'launch',
        runtimeExecutable: 'bash',
        args: [path.join(dir, SCRIPT_NAMES[key] || `${key}.sh`)],
        console: 'integratedTerminal',
        presentation: { group: 'robos', order: Object.keys(SCRIPT_NAMES).indexOf(key) + 1 },
      })),
  };
  fs.writeFileSync(path.join(vscodeDir, 'launch.json'), JSON.stringify(vscodeLaunch, null, 2));

  // ── .idea/runConfigurations/*.xml ────────────────────────────────────────
  const ideaDir = path.join(dir, '.idea', 'runConfigurations');
  fs.mkdirSync(ideaDir, { recursive: true });
  for (const [key, content] of Object.entries(scripts)) {
    if (!content) continue;
    const scriptPath = path.join(dir, SCRIPT_NAMES[key] || `${key}.sh`);
    const xml = `<component name="ProjectRunConfigurationManager">
  <configuration default="false" name="RobOS: ${key}" type="ShConfigurationType">
    <option name="SCRIPT_TEXT" value="" />
    <option name="INDEPENDENT_SCRIPT_PATH" value="true" />
    <option name="SCRIPT_PATH" value="${scriptPath}" />
    <option name="SCRIPT_OPTIONS" value="" />
    <option name="INDEPENDENT_SCRIPT_WORKING_DIRECTORY" value="true" />
    <option name="SCRIPT_WORKING_DIRECTORY" value="${dir}" />
    <method v="2" />
  </configuration>
</component>`;
    fs.writeFileSync(path.join(ideaDir, `RobOS_${key}.xml`), xml);
  }

  return { ok: true, dir };
});

// ── Run script in IntelliJ via RobOS plugin IPC ───────────────────────────────
const INTELLIJ_IPC_PORT = 63343;
const http = require('http');

async function intellijGet(endpoint) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost', port: INTELLIJ_IPC_PORT,
      path: endpoint, method: 'GET', timeout: 3000,
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({ ok: true }); } });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

async function intellijPost(endpoint, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request({
      hostname: 'localhost', port: INTELLIJ_IPC_PORT,
      path: endpoint, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      timeout: 5000,
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({ ok: true }); } });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(payload);
    req.end();
  });
}

// Ping /robos/health every `intervalMs` until it responds or `timeoutMs` elapses.
// Sends progress events to the renderer via `win`.
async function waitForIntellijPlugin(win, timeoutMs = 180_000, intervalMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;
  while (Date.now() < deadline) {
    attempt++;
    try {
      const res = await intellijGet('/robos/health');
      if (res && res.ok) return true;
    } catch { /* not up yet */ }
    const remaining = Math.ceil((deadline - Date.now()) / 1000);
    win.webContents.send('intellij-wait', { attempt, remaining });
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return false;
}

ipcMain.handle('run-in-intellij', async (evt, { projectId, projectPath, scripts, scriptKey }) => {
  const win = BrowserWindow.fromWebContents(evt.sender);

  // 1. Save shell scripts to robos config dir
  const dir = path.join(os.homedir(), '.config', 'robos', 'git-projects', projectId);
  fs.mkdirSync(dir, { recursive: true });
  for (const [key, content] of Object.entries(scripts)) {
    if (!content) continue;
    fs.writeFileSync(path.join(dir, SCRIPT_NAMES[key] || `${key}.sh`), content, { mode: 0o755 });
  }

  // 2. Write .idea run configurations into the git project so IntelliJ picks them up
  //    CWD for each run config = the git project directory
  const workDir = (projectPath && fs.existsSync(projectPath)) ? projectPath : dir;
  const ideaDir = path.join(workDir, '.idea', 'runConfigurations');
  fs.mkdirSync(ideaDir, { recursive: true });
  for (const [key, content] of Object.entries(scripts)) {
    if (!content) continue;
    const scriptFile = path.join(dir, SCRIPT_NAMES[key] || `${key}.sh`);
    fs.writeFileSync(path.join(ideaDir, `RobOS_${key}.xml`), `<component name="ProjectRunConfigurationManager">
  <configuration default="false" name="RobOS: ${key}" type="ShConfigurationType">
    <option name="INDEPENDENT_SCRIPT_PATH" value="true" />
    <option name="SCRIPT_PATH" value="${scriptFile}" />
    <option name="INDEPENDENT_SCRIPT_WORKING_DIRECTORY" value="true" />
    <option name="SCRIPT_WORKING_DIRECTORY" value="${workDir}" />
    <method v="2" />
  </configuration>
</component>`);
  }

  const scriptPath = path.join(dir, SCRIPT_NAMES[scriptKey] || `${scriptKey}.sh`);
  const configName = `RobOS: ${scriptKey}`;

  // 3. Check if plugin is already up; if not, launch IntelliJ then wait up to 3 min
  let pluginReady = false;
  try { pluginReady = (await intellijGet('/robos/health')).ok === true; } catch { /* not running */ }

  if (!pluginReady) {
    // Find and launch IntelliJ
    let ideaBin = '';
    try { ideaBin = cp.execSync('which idea 2>/dev/null').toString().trim(); } catch { }
    if (!ideaBin) return { ok: false, error: 'IntelliJ not found. Install it via the IDE Manager.' };

    cp.spawn(ideaBin, [workDir], {
      env: { ...process.env, DISPLAY: process.env.DISPLAY || ':1' },
      detached: true, stdio: 'ignore',
    }).unref();

    win.webContents.send('intellij-wait', { attempt: 0, remaining: 180, launching: true });
    pluginReady = await waitForIntellijPlugin(win);
  }

  if (!pluginReady) {
    return { ok: false, error: 'IntelliJ did not become ready within 3 minutes.' };
  }

  // 4. Open project, focus script file, execute run configuration
  await intellijPost('/robos/open-project', { path: workDir });
  await new Promise(r => setTimeout(r, 800));
  await intellijPost('/robos/open-file', { file: scriptPath });
  await new Promise(r => setTimeout(r, 400));
  await intellijPost('/robos/run', { configuration: configName });
  win.webContents.send('intellij-wait', null); // signal done
  return { ok: true, workDir, scriptPath };
});

ipcMain.handle('open-terminal', (_, localPath) => {
  cp.spawn('gnome-terminal', ['--working-directory', localPath, '--'], {
    env: { ...process.env, DISPLAY: process.env.DISPLAY || ':1' },
    detached: true, stdio: 'ignore',
  }).unref();
  return { ok: true };
});

ipcMain.handle('open-browser', (_, url) => {
  shell.openExternal(url);
  return { ok: true };
});

ipcMain.handle('get-branches', (_, localPath) => {
  if (!fs.existsSync(path.join(localPath, '.git'))) return { ok: false, branches: [] };
  const r = cp.spawnSync('git', ['branch', '-a', '--format=%(refname:short)'], {
    cwd: localPath, encoding: 'utf8', timeout: 8000,
  });
  const branches = (r.stdout || '').split('\n').map(b => b.trim()).filter(Boolean);
  return { ok: true, branches };
});

ipcMain.handle('get-log', (_, localPath) => {
  if (!fs.existsSync(path.join(localPath, '.git'))) return { ok: false, commits: [] };
  const r = cp.spawnSync('git', ['log', '--oneline', '-20'], {
    cwd: localPath, encoding: 'utf8', timeout: 8000,
  });
  const commits = (r.stdout || '').split('\n').map(l => l.trim()).filter(Boolean);
  return { ok: true, commits };
});

ipcMain.handle('list-gh-repos', () => {
  try {
    const cache = JSON.parse(fs.readFileSync(REPO_CACHE_FILE, 'utf8'));
    if (cache.repos?.length) return { ok: true, repos: cache.repos, fromCache: true };
  } catch { /* cache missing or corrupt — fall through */ }

  // Fallback: live fetch (first launch before git-login-manager has cached)
  const JSON_FIELDS = 'nameWithOwner,url,description,isPrivate,isFork';
  const seen = new Set();
  const repos = [];

  function collect(args) {
    const r = cp.spawnSync('gh', [...args, '--json', JSON_FIELDS],
      { encoding: 'utf8', timeout: 30000, env: { ...process.env } });
    if (r.status !== 0) return;
    try {
      const list = JSON.parse(r.stdout || '[]');
      list.forEach(repo => {
        if (!seen.has(repo.nameWithOwner)) {
          seen.add(repo.nameWithOwner);
          repos.push(repo);
        }
      });
    } catch { /* ignore parse errors */ }
  }

  collect(['repo', 'list', '--limit', '200']);
  collect(['repo', 'list', '--limit', '200', '--fork']);

  const orgR = cp.spawnSync('gh', ['org', 'list', '--limit', '100'],
    { encoding: 'utf8', timeout: 15000, env: { ...process.env } });
  const orgs = (orgR.stdout || '').split('\n').map(l => l.trim()).filter(Boolean);
  for (const org of orgs) {
    collect(['repo', 'list', org, '--limit', '200']);
    collect(['repo', 'list', org, '--limit', '200', '--fork']);
  }

  return { ok: true, repos };
});

ipcMain.handle('search-gh-repos', (_, { query }) => {
  if (!query || !query.trim()) return { ok: true, repos: [] };
  const r = cp.spawnSync('gh', [
    'search', 'repos', query.trim(),
    '--limit', '30',
    '--json', 'fullName,description,isPrivate,isFork',
  ], { encoding: 'utf8', timeout: 20000, env: { ...process.env } });
  if (r.status !== 0) return { ok: false, error: r.stderr || 'gh search repos failed' };
  try {
    const raw = JSON.parse(r.stdout || '[]');
    // Normalize to the same shape as list-gh-repos results
    const repos = raw.map(r => ({
      nameWithOwner: r.fullName,
      url: `https://github.com/${r.fullName}`,
      description: r.description,
      isPrivate: r.isPrivate,
      isFork: r.isFork,
    }));
    return { ok: true, repos };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('run-dev-setup', (_, { localPath, script }) => {
  const tmpScript = path.join(os.tmpdir(), `robos-devsetup-${Date.now()}.sh`);
  fs.writeFileSync(tmpScript, script, { mode: 0o755 });
  const r = cp.spawnSync('bash', [tmpScript], {
    cwd: localPath, encoding: 'utf8', timeout: 120000,
    env: { ...process.env, HOME: os.homedir() },
  });
  fs.unlinkSync(tmpScript);
  return { ok: r.status === 0, output: (r.stdout || '') + (r.stderr || '') };
});

ipcMain.handle('open-in-explorer', (_, localPath) => {
  cp.spawn('xdg-open', [localPath], {
    detached: true, stdio: 'ignore', env: { ...process.env, DISPLAY: process.env.DISPLAY || ':0' },
  }).unref();
  return { ok: true };
});

// ── AI Dev Setup ──────────────────────────────────────────────────────────────
// ── Shared AI runner — uses robos-copilot-lib ─────────────────────────────────
const copilot = require('/usr/local/share/robos/robos-copilot-lib');

// Context injected into every AI prompt in this module
const ROBOS_CTX = `IMPORTANT CONTEXT: You are assisting RobOS, an AI-powered developer OS. The scripts and instructions you generate are stored in RobOS config files (~/.config/robos/git-projects/), NOT committed to the git repository. They exist solely so RobOS can automatically set up a developer's local environment when they pick up a ticket. Keep everything self-contained and runnable on the developer's machine using the project's own tooling. IMPORTANT: All scripts are executed with cwd already set to the project clone directory — do NOT include any "cd" commands to change into the project directory.`;

ipcMain.handle('ai-dev-setup-step', async (_, { localPath, repoUrl, extraPrompt, step }) => {
  try {
    const filesToRead = ['README.md', 'README.rst', 'package.json', 'pom.xml',
      'build.gradle', 'Makefile', 'docker-compose.yml', 'docker-compose.yaml',
      '.env.example', 'requirements.txt', 'go.mod', 'Cargo.toml'];
    let context = `Repository: ${repoUrl || 'unknown'}\nLocal path: ${localPath || 'not cloned'}\n\n`;
    for (const f of filesToRead) {
      const fp = path.join(localPath || '', f);
      try { if (fs.existsSync(fp)) context += `--- ${f} ---\n${fs.readFileSync(fp, 'utf8').slice(0, 2000)}\n\n`; } catch {}
    }
    const extraCtx = extraPrompt ? `\n\nExtra context from developer: ${extraPrompt}` : '';
    const clean = t => (t || '').replace(/^```[\w]*\r?\n?/gm, '').replace(/^```\r?$/gm, '').trim();
    const isNA  = t => !t || t.trim() === 'NOT_APPLICABLE' || !t.includes('#!/bin/bash');

    if (step === 'instructions') {
      const prompt = `${ROBOS_CTX}\n\nYou are writing developer onboarding documentation. Output ONLY a Markdown document with clear step-by-step local development setup instructions. Include: prerequisites, env vars to set, how to install and start the app using the project's own scripts. Do NOT include conversational text — only the Markdown.${extraCtx}\n\n${context}`;
      const result = await copilot.ask(prompt, { title: 'Generate setup instructions', source: 'git-projects' });
      return { text: clean(result.text) };
    }

    if (step === 'setup') {
      const prompt = `${ROBOS_CTX}\n\nYou are writing a minimal bash setup script. Output ONLY a bash script (starting with #!/bin/bash) that INSTALLS DEPENDENCIES and SETS UP the project for local development. Do NOT start/run the application — a separate start script handles that. Rules:
- Use the project's OWN scripts/commands (e.g. npm install, mvn install, pip install -r requirements.txt, go mod download, make setup, etc)
- Do NOT re-implement what the project already provides
- Copy .env.example to .env only if .env does not already exist
- Keep it as short as possible — ideally under 10 lines
- No markdown, no explanation, only the script${extraCtx}\n\n${context}`;
      const result = await copilot.ask(prompt, { title: 'Generate setup script', source: 'git-projects' });
      return { text: clean(result.text) };
    }

    if (step === 'start') {
      const prompt = `${ROBOS_CTX}\n\nYou are writing a minimal bash start script. Output ONLY a bash script (starting with #!/bin/bash) that STARTS this project for local development (assumes dependencies already installed). Rules:
- Use the project's OWN scripts/commands (e.g. npm run dev, mvn spring-boot:run, go run ., python -m uvicorn, etc)
- Do NOT install dependencies
- Keep it under 5 lines
- No markdown, no explanation, only the script
- If the project has no separate start command (e.g. it is a library, a proto package, or a build-only project), output exactly the string "NOT_APPLICABLE" with no other text${extraCtx}\n\n${context}`;
      const result = await copilot.ask(prompt, { title: 'Generate start script', source: 'git-projects' });
      const text = clean(result.text);
      return { text, notApplicable: isNA(text) };
    }

    if (step === 'test') {
      const prompt = `${ROBOS_CTX}\n\nYou are writing a minimal bash test script. Output ONLY a bash script (starting with #!/bin/bash) that runs unit/integration tests for this project using the project's own tooling (e.g. npm test, mvn test, go test ./..., pytest, etc). Keep it under 5 lines. No markdown, no explanation, only the script — or output exactly the string "NOT_APPLICABLE" if this project has no tests.${extraCtx}\n\n${context}`;
      const result = await copilot.ask(prompt, { title: 'Generate test script', source: 'git-projects' });
      const text = clean(result.text);
      return { text: isNA(text) ? '' : text, notApplicable: isNA(text) };
    }

    if (step === 'e2e') {
      const prompt = `${ROBOS_CTX}\n\nYou are writing a minimal bash E2E test script. Output ONLY a bash script (starting with #!/bin/bash) that runs end-to-end tests for this project (e.g. npx cypress run, npx playwright test, etc). Keep it under 5 lines. No markdown, no explanation, only the script — or output exactly the string "NOT_APPLICABLE" if this project has no E2E test setup.${extraCtx}\n\n${context}`;
      const result = await copilot.ask(prompt, { title: 'Generate E2E script', source: 'git-projects' });
      const text = clean(result.text);
      return { text: isNA(text) ? '' : text, notApplicable: isNA(text) };
    }

    return { error: `Unknown step: ${step}` };
  } catch (e) {
    return { error: e.message || String(e) };
  }
});

ipcMain.handle('ai-dev-setup-interview', async (_, { localPath, repoUrl, extraPrompt }) => {
  try {
    const filesToRead = ['README.md', 'package.json', 'pom.xml', 'build.gradle', '.env.example', 'docker-compose.yml', 'go.mod'];
    let context = `Repository: ${repoUrl || 'unknown'}\nLocal path: ${localPath || 'not cloned'}\n\n`;
    for (const f of filesToRead) {
      const fp = path.join(localPath || '', f);
      try { if (fs.existsSync(fp)) context += `--- ${f} ---\n${fs.readFileSync(fp, 'utf8').slice(0, 1500)}\n\n`; } catch {}
    }
    const extraCtx = extraPrompt ? `Developer already provided: ${extraPrompt}\n\n` : '';
    const prompt = `${ROBOS_CTX}\n\nYou are helping a developer set up this project for local development. Based on the project files, generate 4-6 targeted questions that will help you produce a correct setup script. Ask about things not obvious from the code: VPN requirements, private package registries, required secrets, platform-specific steps, non-standard tooling, external service dependencies, etc. Output ONLY a JSON array of question strings, e.g. ["Question 1?","Question 2?"]. No other text.\n\n${extraCtx}${context}`;
    const result = await copilot.ask(prompt, { title: 'Dev setup interview', source: 'git-projects' });
    const raw = (result.text || '').trim();
    // Extract JSON array from response
    const match = raw.match(/\[[\s\S]*\]/);
    const questions = match ? JSON.parse(match[0]) : [];
    return { questions };
  } catch (e) {
    return { error: e.message || String(e) };
  }
});

ipcMain.handle('ai-fix-devsetup-script', async (_, { localPath, repoUrl, script, errorOutput, type }) => {
  try {
    const errSnip    = (errorOutput || '').split('\n').slice(-30).join('\n');
    const scriptSnip = (script || '').slice(0, 1500);
    const desc = type === 'start' ? 'start' : 'setup';
    const prompt = `${ROBOS_CTX}\n\nFix this minimal bash ${desc} script. It failed with:\n${errSnip}\n\nScript:\n${scriptSnip}\n\nKeep the fix minimal — use the project's own scripts/commands. Output ONLY the fixed bash script starting with #!/bin/bash. No explanation, no fences.`;
    const result = await copilot.ask(prompt, { title: `Fix ${desc} script`, source: 'git-projects' });
    const fixed = (result.text || '').replace(/^```[\w]*\r?\n?/gm, '').replace(/^```\r?$/gm, '').trim();
    return { script: fixed };
  } catch (e) {
    return { error: e.message || String(e) };
  }
});

ipcMain.handle('ai-refine-devsetup', async (_, { localPath, repoUrl, field, current, feedback }) => {
  try {
    const isBash = field === 'script' || field === 'start' || field === 'test' || field === 'e2e';
    const feedbackLine = feedback ? `\n\nUser feedback: ${feedback}` : '';
    const prompt = isBash
      ? `${ROBOS_CTX}\n\nImprove this RobOS bash ${field} script. Output ONLY the improved bash script (starting with #!/bin/bash). Keep it minimal — use the project's own scripts. No explanation, no fences.${feedbackLine}\n\nCurrent script:\n${current}`
      : `${ROBOS_CTX}\n\nImprove this RobOS developer onboarding document. Output ONLY the improved Markdown. No conversational text, no preamble.${feedbackLine}\n\nCurrent instructions:\n${current}`;

    const { ok, text, error } = await copilot.ask(prompt, { title: `Refine dev setup ${field}`, source: 'git-projects' });
    if (!ok && !text) return { error };
    const refined = isBash
      ? text.replace(/^```[\w]*\r?\n?/gm, '').replace(/^```\r?$/gm, '').trim()
      : text.trim();
    return { text: refined };
  } catch (e) {
    return { error: e.message || String(e) };
  }
});


ipcMain.handle('ai-detect-secrets', async (_, { localPath, repoUrl }) => {
  try {
    const filesToRead = ['README.md', '.env.example', '.env.sample', 'package.json',
      'docker-compose.yml', 'docker-compose.yaml', 'pom.xml', 'build.gradle',
      'application.yml', 'application.properties', 'config.yml', 'config.yaml',
      '.env.dist', 'Makefile', 'requirements.txt'];
    let context = `Repository: ${repoUrl || 'unknown'}\nLocal path: ${localPath || 'not cloned'}\n\n`;
    for (const f of filesToRead) {
      const fp = path.join(localPath || '', f);
      try {
        if (fs.existsSync(fp)) {
          context += `--- ${f} ---\n${fs.readFileSync(fp, 'utf8').slice(0, 3000)}\n\n`;
        }
      } catch {}
    }
    const prompt = `${ROBOS_CTX}\n\nAnalyze the project files below and identify all environment variables or secrets the project needs (API keys, passwords, tokens, connection strings, etc.). These will be stored in the RobOS pass store and injected as env vars when a developer's workspace is set up.

Return ONLY a JSON array of objects with this exact shape, no explanation:
[{"envName":"DB_PASSWORD","passPath":"project/db-password"},{"envName":"API_KEY","passPath":"project/api-key"}]

Use short, sensible pass paths (lowercase, hyphens, no special chars). Project name from repo URL: ${(repoUrl || '').split('/').pop() || 'project'}.

${context}`;
    const { text, error } = await copilot.ask(prompt, { title: 'Detect project secrets', source: 'git-projects' });
    if (error && !text) return { error };
    // Strip markdown fences
    const stripped = (text || '').replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();
    // 1. Try direct parse (clean JSON array or object)
    try {
      const direct = JSON.parse(stripped);
      if (Array.isArray(direct)) return { secrets: direct };
      if (direct && Array.isArray(direct.secrets)) return { secrets: direct.secrets };
    } catch {}
    // 2. Try to extract outermost JSON array (greedy — handles multi-line, nested)
    const greedy = stripped.match(/\[[\s\S]*\]/);
    if (greedy) {
      try { return { secrets: JSON.parse(greedy[0]) }; } catch {}
    }
    // 3. Try to find a JSON object with a "secrets" key
    const objMatch = stripped.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try {
        const obj = JSON.parse(objMatch[0]);
        if (Array.isArray(obj.secrets)) return { secrets: obj.secrets };
      } catch {}
    }
    // 4. If AI found nothing to report, treat as empty
    if (/no secrets|no environment|no env|none found|not found|no api/i.test(stripped)) {
      return { secrets: [] };
    }
    return { error: `No JSON array in AI response: ${stripped.slice(0, 200)}` };
  } catch (e) {
    return { error: e.message || String(e) };
  }
});

// ── Secrets ───────────────────────────────────────────────────────────────────

// ── list-path: @ file mention typeahead ──────────────────────────────────────
ipcMain.handle('list-path', (_, prefix) => {
  try {
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
            if (p.startsWith('person:')) {
              const [, username, ...nameParts] = p.split(':');
              const displayName = nameParts.join(':');
              if (!username && !displayName) continue;
              items.push({ name: displayName || username, path: username, isPerson: true });
              continue;
            }
            if (p.startsWith('group:')) {
              const [, groupId, ...nameParts] = p.split(':');
              const groupName = nameParts.join(':');
              if (!groupId && !groupName) continue;
              items.push({ name: groupName || groupId, path: groupId, isGroup: true });
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
      return { ok: true, items };
    }

    if (!fs.existsSync(dir)) return { ok: true, items: [] };
    if (!fs.statSync(dir).isDirectory()) return { ok: true, items: [] };
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
    return { ok: true, items };
  } catch { return { ok: true, items: [] }; }
});

// ── Dev Groups ────────────────────────────────────────────────────────────────
ipcMain.handle('list-groups', () => {
  try {
    if (!fs.existsSync(GROUPS_DIR)) return { ok: true, groups: [] };
    const groups = fs.readdirSync(GROUPS_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => { try { return JSON.parse(fs.readFileSync(path.join(GROUPS_DIR, f), 'utf8')); } catch { return null; } })
      .filter(Boolean)
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    return { ok: true, groups };
  } catch (e) {
    return { ok: false, error: e.message, groups: [] };
  }
});
