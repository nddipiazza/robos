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

// ── Provider paths ──────────────────────────────────────────────────────────

const COPILOT_SESSION_DIR = path.join(os.homedir(), '.copilot', 'session-state');
const CLAUDE_DIR          = path.join(os.homedir(), '.claude');
const CLAUDE_SESSIONS_DIR = path.join(CLAUDE_DIR, 'sessions');
const CLAUDE_HISTORY_FILE = path.join(CLAUDE_DIR, 'history.jsonl');
const CLAUDE_SETTINGS     = path.join(CLAUDE_DIR, 'settings.json');

// ── Window ──────────────────────────────────────────────────────────────────

function createWindow() {
  const win = new BrowserWindow({
    width: 1100, height: 720, minWidth: 800, minHeight: 500,
    backgroundColor: '#0d1117',
    icon: path.join(__dirname, 'icon.svg'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true },
    title: 'RobOS Agents',
    autoHideMenuBar: true,
  });
  win.loadFile('renderer/index.html');

  if (_debugServer) _debugServer.startDebugServer(win, 19104);

  return win;
}

app.setName('agents-manager');
app.setPath('userData', path.join(process.env.HOME || '/home/robos', '.config', 'robos', 'electron', 'agents-manager'));
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }
app.on('second-instance', () => {
  const w = require('electron').BrowserWindow.getAllWindows()[0];
  if (w) { if (w.isMinimized()) w.restore(); w.focus(); }
});
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

// ── Startup AI provider check (backward compat) ────────────────────────────

const checkProviderMode = process.argv.includes('--check-provider');

app.whenReady().then(async () => {
  const win = createWindow();
  if (checkProviderMode) {
    win.webContents.on('did-finish-load', () => {
      win.webContents.send('open-provider', 'github-copilot');
    });
  }
});

app.on('window-all-closed', () => app.quit());

// ── Helpers ─────────────────────────────────────────────────────────────────

function run(cmd, args, timeout = 8000) {
  return new Promise(res => {
    cp.exec([cmd, ...args].join(' '), { timeout, env: { ...process.env } }, (err, stdout, stderr) => {
      res({ output: (stdout || '').trim(), error: (stderr || '').trim(), code: err ? (err.code || 1) : 0 });
    });
  });
}

// ── Provider Detection ──────────────────────────────────────────────────────

ipcMain.handle('detect-providers', async () => {
  const providers = [];

  // GitHub Copilot
  const ghVer = await run('gh', ['--version']);
  const copNpm = await run('sh', ['-c', 'which copilot 2>/dev/null || (test -f /usr/bin/copilot && echo /usr/bin/copilot)']);
  const ghUser = await run('gh', ['api', 'user', '--jq', "'.login'"]);
  const copilotInstalled = !!(copNpm.output && copNpm.output.trim());
  providers.push({
    id: 'github-copilot',
    name: 'GitHub Copilot',
    installed: copilotInstalled,
    ghInstalled: !!(ghVer.output && !ghVer.output.includes('not found')),
    authenticated: !!(ghUser.output && !ghUser.output.startsWith('{')),
    version: ghVer.output.split('\n')[0] || '',
    user: ghUser.output && !ghUser.output.startsWith('{') ? ghUser.output : '',
  });

  // Claude Code
  const clVer = await run('claude', ['--version']);
  const clInstalled = !!(clVer.output && !clVer.output.includes('not found') && !clVer.output.includes('No such file'));
  providers.push({
    id: 'claude-code',
    name: 'Claude Code',
    installed: clInstalled,
    authenticated: clInstalled, // claude --version succeeding implies auth
    version: clVer.output.split('\n')[0] || '',
  });

  return providers;
});

// ── GitHub Copilot IPC ──────────────────────────────────────────────────────

ipcMain.handle('copilot-sessions', () => {
  const sessions = [];
  try {
    const ids = fs.readdirSync(COPILOT_SESSION_DIR);
    for (const id of ids) {
      try {
        const yamlPath = path.join(COPILOT_SESSION_DIR, id, 'workspace.yaml');
        const yaml = fs.readFileSync(yamlPath, 'utf8');
        const meta = {};
        yaml.split('\n').forEach(line => {
          const m = line.match(/^(\w+):\s*(.+)/);
          if (m) meta[m[1]] = m[2].trim();
        });

        // Get first user message
        let firstMessage = '';
        try {
          const eventsPath = path.join(COPILOT_SESSION_DIR, id, 'events.jsonl');
          const lines = fs.readFileSync(eventsPath, 'utf8').split('\n').filter(Boolean);
          for (const line of lines) {
            const ev = JSON.parse(line);
            if (ev.type === 'user.message') {
              firstMessage = (ev.data.content || '').slice(0, 120);
              break;
            }
          }
        } catch {}

        sessions.push({
          session_id: id,
          name: meta.summary || id.slice(0, 8),
          cwd: meta.cwd || '',
          created_at: meta.created_at || '',
          updated_at: meta.updated_at || '',
          first_message: firstMessage,
        });
      } catch {}
    }
  } catch {}

  sessions.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
  return sessions;
});

ipcMain.handle('copilot-delete-session', (_, sessionId) => {
  try { fs.rmSync(path.join(COPILOT_SESSION_DIR, sessionId), { recursive: true, force: true }); } catch {}
});

ipcMain.handle('copilot-launch-terminal', (_, sessionId, extraArgs) => {
  const parts = ['/usr/bin/copilot'];
  if (Array.isArray(extraArgs) && extraArgs.length) parts.push(...extraArgs);
  if (sessionId) parts.push('--resume', sessionId);
  const shellCmd = parts.map(a => `'${String(a).replace(/'/g, "'\\''")}'`).join(' ');
  cp.spawn('x-terminal-emulator', ['-e', `bash -lc '${shellCmd}; read -p "Press Enter to close..." x'`], {
    env: { ...process.env, DISPLAY: ':0' }, detached: true,
  });
});

ipcMain.handle('copilot-fetch-models', async () => {
  return new Promise(res => {
    const homeDir = os.homedir();
    const env = { ...process.env, HOME: homeDir, GH_CONFIG_DIR: path.join(homeDir, '.config', 'gh') };
    cp.exec('bash -lc "gh auth token 2>/dev/null"', { timeout: 5000, env }, (err, token) => {
      if (err || !token.trim()) return res({ error: 'Not authenticated with gh CLI' });
      const t = token.trim();
      cp.exec(
        `curl -sf -H "Authorization: Bearer ${t}" -H "Copilot-Integration-Id: vscode-chat" -H "Editor-Version: vscode/1.90.0" https://api.githubcopilot.com/models`,
        { timeout: 15000 }, (err2, stdout) => {
          if (err2) return res({ error: err2.message });
          try {
            const data = JSON.parse(stdout);
            const list = Array.isArray(data) ? data : (data.data || data.models || []);
            // Only return models the user actually has access to (policy=enabled)
            const models = list
              .filter(m => (m.policy || {}).state === 'enabled')
              .map(m => m.id || m.name)
              .filter(Boolean)
              .sort();
            res({ models });
          } catch (e) {
            res({ error: 'Could not parse response: ' + stdout.slice(0, 200) });
          }
        }
      );
    });
  });
});


ipcMain.handle('copilot-login', () => {
  cp.spawn('x-terminal-emulator', ['-e', 'gh auth login'], {
    env: { ...process.env, DISPLAY: ':0' }, detached: true,
  });
});

ipcMain.handle('copilot-update', async () => {
  return new Promise(res => {
    cp.exec('gh extension upgrade gh-copilot 2>&1 || gh extension install github/gh-copilot 2>&1',
      { timeout: 60000 }, (err, stdout, stderr) => {
        res(stdout || stderr || 'Done');
      });
  });
});

ipcMain.handle('copilot-install-extension', async () => {
  return new Promise(res => {
    cp.exec('gh extension install github/gh-copilot',
      { timeout: 60000 }, (err, stdout, stderr) => {
        res((stdout + '\n' + stderr).trim() || (err ? err.message : 'Done'));
      });
  });
});

// ── Claude Code IPC ─────────────────────────────────────────────────────────

ipcMain.handle('claude-sessions', () => {
  // Build session list from ~/.claude/sessions/ + history.jsonl
  const sessionsMap = new Map();

  // Read session files (pid -> sessionId mapping with metadata)
  try {
    const files = fs.readdirSync(CLAUDE_SESSIONS_DIR).filter(f => f.endsWith('.json'));
    for (const file of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(CLAUDE_SESSIONS_DIR, file), 'utf8'));
        if (data.sessionId) {
          sessionsMap.set(data.sessionId, {
            session_id: data.sessionId,
            cwd: data.cwd || '',
            started_at: data.startedAt ? new Date(data.startedAt).toISOString() : '',
            pid: data.pid,
            messages: [],
          });
        }
      } catch {}
    }
  } catch {}

  // Enrich with history.jsonl (user prompts per session)
  try {
    const lines = fs.readFileSync(CLAUDE_HISTORY_FILE, 'utf8').split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.sessionId && sessionsMap.has(entry.sessionId)) {
          const s = sessionsMap.get(entry.sessionId);
          if (entry.display && entry.display !== '/init') {
            s.messages.push({ text: entry.display.slice(0, 120), timestamp: entry.timestamp });
          }
          if (entry.project && !s.cwd) s.cwd = entry.project;
        } else if (entry.sessionId) {
          // Session from history that doesn't have a session file
          const existing = sessionsMap.get(entry.sessionId);
          if (!existing) {
            sessionsMap.set(entry.sessionId, {
              session_id: entry.sessionId,
              cwd: entry.project || '',
              started_at: entry.timestamp ? new Date(entry.timestamp).toISOString() : '',
              messages: entry.display && entry.display !== '/init'
                ? [{ text: entry.display.slice(0, 120), timestamp: entry.timestamp }]
                : [],
            });
          } else {
            if (entry.display && entry.display !== '/init') {
              existing.messages.push({ text: entry.display.slice(0, 120), timestamp: entry.timestamp });
            }
          }
        }
      } catch {}
    }
  } catch {}

  const sessions = Array.from(sessionsMap.values()).map(s => ({
    session_id: s.session_id,
    cwd: s.cwd,
    started_at: s.started_at,
    first_message: s.messages[0]?.text || '',
    message_count: s.messages.length,
    name: s.cwd ? path.basename(s.cwd) : s.session_id.slice(0, 8),
  }));

  sessions.sort((a, b) => (b.started_at || '').localeCompare(a.started_at || ''));
  return sessions;
});

ipcMain.handle('claude-config', () => {
  let settings = {};
  try { settings = JSON.parse(fs.readFileSync(CLAUDE_SETTINGS, 'utf8')); } catch {}

  // Check for project-level CLAUDE.md files
  const projects = [];
  try {
    const projectsDir = path.join(CLAUDE_DIR, 'projects');
    const dirs = fs.readdirSync(projectsDir);
    for (const dir of dirs) {
      const fullPath = path.join(projectsDir, dir);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        const decodedPath = dir.replace(/-/g, '/');
        projects.push({ dirName: dir, decodedPath, path: fullPath });
      }
    }
  } catch {}

  return { settings, projects };
});

ipcMain.handle('claude-launch-terminal', (_, sessionId) => {
  const cmd = sessionId
    ? `claude --resume ${sessionId}`
    : `claude`;
  cp.spawn('x-terminal-emulator', ['-e', `bash -c '${cmd}; read -p "Press Enter to close..." x'`], {
    env: { ...process.env, DISPLAY: ':0' }, detached: true,
  });
});

ipcMain.handle('claude-install', () => {
  cp.spawn('x-terminal-emulator', ['-e', `bash -c 'echo "Installing Claude Code CLI..." && npm install -g @anthropic-ai/claude-code && echo "Done!" && read -p "Press Enter to close..." x'`], {
    env: { ...process.env, DISPLAY: ':0' }, detached: true,
  });
});

ipcMain.handle('claude-write-settings', (_, settings) => {
  fs.mkdirSync(path.dirname(CLAUDE_SETTINGS), { recursive: true });
  fs.writeFileSync(CLAUDE_SETTINGS, JSON.stringify(settings, null, 2));
});

// ── RobOS Settings IPC ──────────────────────────────────────────────────────

ipcMain.handle('read-settings', () => {
  try { return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')); }
  catch { return {}; }
});

ipcMain.handle('write-settings', (_, data) => {
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2));
});

// ── Active provider config ──────────────────────────────────────────────────

const AI_PROVIDER_CONFIG = path.join(os.homedir(), '.config', 'robos', 'ai-provider.json');

ipcMain.handle('get-active-provider', () => {
  try {
    const config = JSON.parse(fs.readFileSync(AI_PROVIDER_CONFIG, 'utf8'));
    return config.activeProvider || 'github-copilot';
  } catch { return 'github-copilot'; }
});

ipcMain.handle('set-active-provider', (_, providerId) => {
  fs.mkdirSync(path.dirname(AI_PROVIDER_CONFIG), { recursive: true });
  let config = {};
  try { config = JSON.parse(fs.readFileSync(AI_PROVIDER_CONFIG, 'utf8')); } catch {}
  config.activeProvider = providerId;
  fs.writeFileSync(AI_PROVIDER_CONFIG, JSON.stringify(config, null, 2));
});

ipcMain.handle('open-dir-dialog', async () => {
  const { dialog } = require('electron');
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  return result.canceled ? null : result.filePaths[0];
});
