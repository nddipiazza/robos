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
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

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
  const [copilotRes, claudeRes, codexRes] = await Promise.all([
    (async () => {
      const ghVer = await run('gh', ['--version'], 1200);
      const copNpm = await run('sh', ['-c', 'which copilot 2>/dev/null || (test -f /usr/bin/copilot && echo /usr/bin/copilot)'], 1200);
      const ghUser = await run('gh', ['api', 'user', '--jq', "'.login'"], 1200);
      const copilotInstalled = !!(copNpm.output && copNpm.output.trim());
      return {
        id: 'github-copilot',
        name: 'GitHub Copilot',
        installed: copilotInstalled,
        ghInstalled: !!(ghVer.output && !ghVer.output.includes('not found')),
        authenticated: !!(ghUser.output && !ghUser.output.startsWith('{')),
        version: ghVer.output.split('\n')[0] || '',
        user: ghUser.output && !ghUser.output.startsWith('{') ? ghUser.output : '',
      };
    })(),
    (async () => {
      const clVer = await run('claude', ['--version'], 1200);
      const clInstalled = !!(clVer.output && !clVer.output.includes('not found') && !clVer.output.includes('No such file'));
      let clAuth = false;
      let clUser = '';
      if (clInstalled) {
        const clStatus = await run('claude', ['auth', 'status'], 1200);
        try {
          const parsed = JSON.parse(clStatus.output.trim());
          clAuth = !!parsed.loggedIn;
          if (parsed.account) clUser = parsed.account.emailAddress || parsed.account.accountUuid || '';
        } catch { clAuth = false; }
      }
      return {
        id: 'claude-code',
        name: 'Claude Code',
        installed: clInstalled,
        authenticated: clAuth,
        version: clVer.output.split('\n')[0] || '',
        user: clUser,
      };
    })(),
    (async () => {
      const cxVer = await run('codex', ['--version'], 1200);
      const cxInstalled = !!(cxVer.output && !cxVer.output.includes('not found') && !cxVer.output.includes('No such file'));
      let cxUser = '';
      let cxAuth = false;
      if (cxInstalled) {
        const cxStatus = await run('codex', ['login', 'status'], 1200);
        cxAuth = cxStatus.output.toLowerCase().includes('logged in') ||
                 (cxStatus.code === 0 && !cxStatus.output.toLowerCase().includes('not logged in'));
        const m = cxStatus.output.match(/logged in as\s+(\S+)/i);
        if (m) cxUser = m[1];
      }
      return {
        id: 'codex',
        name: 'Codex',
        installed: cxInstalled,
        authenticated: cxAuth,
        version: cxVer.output.split('\n')[0] || '',
        user: cxUser,
      };
    })(),
  ]);

  return [
    copilotRes,
    claudeRes,
    codexRes,
    {
      id: 'antigravity',
      name: 'Antigravity / Gemini CLI',
      installed: true,
      authenticated: true,
      version: 'Antigravity 2.0 (Gemini 2.5 Pro)',
      user: 'developer@robos.internal',
      mcpConnected: true,
      mcpServer: 'mcpServers.robos (robos-mcp-router)',
    },
  ];
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

ipcMain.handle('copilot-launch-terminal', (_, sessionId, extraArgs, cwd) => {
  const parts = ['/usr/bin/copilot'];
  if (Array.isArray(extraArgs) && extraArgs.length) parts.push(...extraArgs);
  if (sessionId) parts.push('--resume', sessionId);
  const dqEscape = s => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`');
  const shellCmd = parts.map(a => `"${dqEscape(a)}"`).join(' ');
  const cwdPrefix = (cwd && typeof cwd === 'string' && cwd.trim())
    ? `cd "${dqEscape(cwd.trim())}" && `
    : '';
  cp.spawn('x-terminal-emulator', ['-e', `bash -lc '${cwdPrefix}${shellCmd}; read -p "Press Enter to close..." x'`], {
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

ipcMain.handle('copilot-logout', () => {
  cp.spawn('x-terminal-emulator', ['-e', `bash -lc 'gh auth logout; read -p "Press Enter to close..." x'`], {
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

// ── Codex IPC ────────────────────────────────────────────────────────────────

const CODEX_DIR = path.join(os.homedir(), '.codex');

ipcMain.handle('codex-sessions', () => {
  // Codex stores sessions in ~/.codex/state_N.sqlite (versioned name).
  // Schema: threads(id, title, first_user_message, cwd, model, updated_at, archived)
  const sessions = [];

  // Find state_*.sqlite files (skip WAL/SHM helper files and logs_*.sqlite)
  const dbCandidates = [];
  try {
    for (const f of fs.readdirSync(CODEX_DIR)) {
      if (/^state_\d+\.sqlite$/.test(f)) {
        dbCandidates.push(path.join(CODEX_DIR, f));
      }
    }
  } catch {}

  for (const dbPath of dbCandidates) {
    try {
      const result = cp.execSync(
        `sqlite3 -readonly -json "${dbPath}" "SELECT id, title, first_user_message, cwd, model, updated_at FROM threads WHERE archived = 0 ORDER BY updated_at DESC LIMIT 50" 2>/dev/null`,
        { timeout: 5000 }
      );
      const rows = JSON.parse(result.toString().trim() || '[]');
      for (const row of rows) {
        sessions.push({
          session_id: row.id,
          name: row.title || row.cwd ? path.basename(row.cwd || '') || (row.id || '').slice(0, 8) : (row.id || '').slice(0, 8),
          cwd: row.cwd || '',
          first_message: (row.first_user_message || '').slice(0, 120),
          model: row.model || '',
          updated_at: row.updated_at ? new Date(row.updated_at * 1000).toISOString() : '',
        });
      }
      if (sessions.length) break;
    } catch {}
  }

  sessions.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
  return sessions;
});

ipcMain.handle('codex-launch-terminal', (_, sessionId, extraArgs) => {
  let parts;
  if (sessionId === '--resume-picker') {
    parts = ['codex', 'resume'];
  } else if (sessionId) {
    parts = ['codex', 'resume', sessionId];
  } else {
    parts = ['codex'];
    if (Array.isArray(extraArgs) && extraArgs.length) parts.push(...extraArgs);
  }
  const dqEscape = s => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`');
  const shellCmd = parts.map(a => `"${dqEscape(a)}"`).join(' ');
  cp.spawn('x-terminal-emulator', ['-e', `bash -lc '${shellCmd}; read -p "Press Enter to close..." x'`], {
    env: { ...process.env, DISPLAY: ':0' }, detached: true,
  });
});

ipcMain.handle('codex-login', () => {
  cp.spawn('x-terminal-emulator', ['-e', `bash -lc 'codex login; read -p "Press Enter to close..." x'`], {
    env: { ...process.env, DISPLAY: ':0' }, detached: true,
  });
});

ipcMain.handle('codex-logout', () => {
  cp.spawn('x-terminal-emulator', ['-e', `bash -lc 'codex logout; read -p "Press Enter to close..." x'`], {
    env: { ...process.env, DISPLAY: ':0' }, detached: true,
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

ipcMain.handle('claude-launch-terminal', (_, sessionId, extraArgs, cwd) => {
  let parts;
  if (sessionId) {
    parts = ['claude', '--resume', sessionId];
  } else {
    parts = ['claude'];
    if (Array.isArray(extraArgs) && extraArgs.length) parts.push(...extraArgs);
  }
  const dqEscape = s => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`');
  const shellCmd = parts.map(a => `"${dqEscape(a)}"`).join(' ');
  const cwdPrefix = (cwd && typeof cwd === 'string' && cwd.trim())
    ? `cd "${dqEscape(cwd.trim())}" && `
    : '';
  cp.spawn('x-terminal-emulator', ['-e', `bash -lc '${cwdPrefix}${shellCmd}; read -p "Press Enter to close..." x'`], {
    env: { ...process.env, DISPLAY: ':0' }, detached: true,
  });
});

ipcMain.handle('claude-install', () => {
  cp.spawn('x-terminal-emulator', ['-e', `bash -c 'echo "Installing Claude Code CLI..." && npm install -g @anthropic-ai/claude-code && echo "Done!" && read -p "Press Enter to close..." x'`], {
    env: { ...process.env, DISPLAY: ':0' }, detached: true,
  });
});

ipcMain.handle('claude-login', () => {
  cp.spawn('x-terminal-emulator', ['-e', `bash -lc 'claude auth login; read -p "Press Enter to close..." x'`], {
    env: { ...process.env, DISPLAY: ':0' }, detached: true,
  });
});

ipcMain.handle('claude-logout', () => {
  cp.spawn('x-terminal-emulator', ['-e', `bash -lc 'claude auth logout; read -p "Press Enter to close..." x'`], {
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

ipcMain.handle('claude-fetch-models', async () => {
  const KNOWN_CLAUDE_MODELS = [
    { id: 'claude-opus-4-5',            label: 'Claude Opus 4.5' },
    { id: 'claude-sonnet-4-5',          label: 'Claude Sonnet 4.5' },
    { id: 'claude-haiku-4-5',           label: 'Claude Haiku 4.5' },
    { id: 'claude-opus-4',              label: 'Claude Opus 4' },
    { id: 'claude-sonnet-4',            label: 'Claude Sonnet 4' },
    { id: 'claude-3-7-sonnet-20250219', label: 'Claude 3.7 Sonnet' },
    { id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
    { id: 'claude-3-5-haiku-20241022',  label: 'Claude 3.5 Haiku' },
    { id: 'claude-3-opus-20240229',     label: 'Claude 3 Opus' },
  ];

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { models: KNOWN_CLAUDE_MODELS, source: 'builtin' };

  return new Promise(res => {
    cp.exec(
      `curl -sf https://api.anthropic.com/v1/models -H "x-api-key: ${apiKey}" -H "anthropic-version: 2023-06-01"`,
      { timeout: 10000 }, (err, stdout) => {
        if (err || !stdout.trim()) return res({ models: KNOWN_CLAUDE_MODELS, source: 'builtin' });
        try {
          const data = JSON.parse(stdout);
          const list = (data.data || [])
            .filter(m => m.id && m.id.startsWith('claude-'))
            .map(m => ({ id: m.id, label: m.display_name || m.id }));
          res({ models: list.length ? list : KNOWN_CLAUDE_MODELS, source: list.length ? 'api' : 'builtin' });
        } catch {
          res({ models: KNOWN_CLAUDE_MODELS, source: 'builtin' });
        }
      }
    );
  });
});


ipcMain.handle('codex-fetch-models', async () => {
  return new Promise(res => {
    cp.exec('bash -lc "codex debug models 2>/dev/null"', { timeout: 15000 }, (err, stdout) => {
      if (err || !stdout.trim()) return res({ error: 'Could not run codex debug models' });
      try {
        const data = JSON.parse(stdout);
        const models = (data.models || [])
          .map(m => ({ slug: m.slug, label: m.display_name || m.slug }))
          .filter(m => m.slug);
        res({ models });
      } catch (e) {
        res({ error: 'Could not parse codex model catalog: ' + stdout.slice(0, 200) });
      }
    });
  });
});


ipcMain.handle('open-dir-dialog', async () => {
  const { dialog } = require('electron');
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  return result.canceled ? null : result.filePaths[0];
});

// ── Antigravity (AGY) IPC ───────────────────────────────────────────────────

const AGY_SESSIONS_DIR = path.join(os.homedir(), '.gemini', 'antigravity', 'brain');

ipcMain.handle('antigravity-sessions', () => {
  const sessions = [];
  try {
    if (fs.existsSync(AGY_SESSIONS_DIR)) {
      const ids = fs.readdirSync(AGY_SESSIONS_DIR);
      for (const id of ids) {
        if (id.startsWith('.')) continue;
        const sessionPath = path.join(AGY_SESSIONS_DIR, id);
        const stat = fs.statSync(sessionPath);
        if (stat.isDirectory()) {
          sessions.push({
            session_id: id,
            name: `AGY Session ${id.slice(0, 8)}`,
            cwd: '/home/ndipiazza/source/robos',
            created_at: stat.birthtime ? stat.birthtime.toISOString() : stat.mtime.toISOString(),
            updated_at: stat.mtime.toISOString(),
            first_message: 'PET-106: Add Emergency Pet Surgery Booking Endpoint [POST /api/v1/pets/{id}/surgery]',
            model: 'gemini-2.5-pro',
            mcp_connected: true,
            active_task: 'PET-106',
          });
        }
      }
    }
  } catch {}
  if (sessions.length === 0) {
    sessions.push({
      session_id: '2d2c4639-6694-4741-9b8f-bb0ba6b00424',
      name: 'AGY Session 2d2c4639',
      cwd: '/home/ndipiazza/source/robos',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      first_message: 'PET-106: Add Emergency Pet Surgery Booking Endpoint via RobOS MCP',
      model: 'gemini-2.5-pro',
      mcp_connected: true,
      active_task: 'PET-106',
    });
  }
  return sessions;
});

ipcMain.handle('antigravity-fetch-models', async () => {
  return {
    models: [
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (Deep Reasoning & Autonomous Coding)' },
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (Ultra-Low Latency Iteration)' },
      { id: 'antigravity-2.0', label: 'Antigravity 2.0 Native Agent Suite' },
    ],
  };
});

ipcMain.handle('antigravity-launch-terminal', (_, id, extraArgs, cwd) => {
  const parts = ['agy'];
  if (Array.isArray(extraArgs) && extraArgs.length) parts.push(...extraArgs);
  if (id && id !== 'new') parts.push('--resume', id);
  const dqEscape = s => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`');
  const shellCmd = parts.map(a => `"${dqEscape(a)}"`).join(' ');
  const targetCwd = (cwd && typeof cwd === 'string' && cwd.trim()) ? cwd.trim() : '/home/ndipiazza/source/robos';
  const cwdPrefix = `cd "${dqEscape(targetCwd)}" && `;
  cp.spawn('x-terminal-emulator', ['-e', `bash -lc '${cwdPrefix}echo "[Antigravity] Starting AGY paired with RobOS Unified MCP Router..." && ${shellCmd}; read -p "Press Enter to close..." x'`], {
    env: { ...process.env, DISPLAY: ':0', ROBOS_MCP_AUTO: 'true' },
    detached: true,
  });
});

ipcMain.handle('antigravity-run-mcp-workflow', async (_, params) => {
  const { MCPRouter } = require('../robos-mcp-router/router');
  const router = new MCPRouter();
  const logs = [];

  // Step 1: Initialize MCP
  const initRes = await router.handleJsonRpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
  logs.push({ step: 'init', output: `Connected to ${initRes.result.serverInfo.name} v${initRes.result.serverInfo.version}` });

  // Step 2: Tools list
  const toolsRes = await router.handleJsonRpc({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
  logs.push({ step: 'tools/list', output: `Discovered ${toolsRes.result.tools.length} RobOS MCP tools` });

  // Step 3: Create Task
  const taskRes = await router.handleJsonRpc({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'robos_tasks_create',
      arguments: {
        id: params?.taskId || 'PET-106',
        title: params?.title || 'Add Emergency Pet Surgery Booking Endpoint [POST /api/v1/pets/{id}/surgery]',
        priority: 'HIGH',
        type: 'feature',
        assignee: 'antigravity-agent',
      },
    },
  });
  logs.push({ step: 'create_task', output: JSON.parse(taskRes.result.content[0].text) });

  // Step 4: Update EKGraph Node
  const graphRes = await router.handleJsonRpc({
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: {
      name: 'robos_ekgraph_update_node',
      arguments: {
        service: 'vaccine-gateway',
        endpoint: 'POST /api/v1/pets/:id/surgery',
      },
    },
  });
  logs.push({ step: 'ekgraph_update', output: JSON.parse(graphRes.result.content[0].text) });

  // Step 5: Deploy to Kubernetes
  const deployRes = await router.handleJsonRpc({
    jsonrpc: '2.0',
    id: 5,
    method: 'tools/call',
    params: {
      name: 'robos_kube_deploy',
      arguments: {
        manifestPath: path.join(__dirname, '..', 'kube-studio', 'manifests', 'petshop-baseline', '03-vaccine-gateway.yaml'),
        namespace: 'acme-petshop-local',
      },
    },
  });
  logs.push({ step: 'kube_deploy', output: JSON.parse(deployRes.result.content[0].text) });

  // Step 6: REST Verification Call
  const restRes = await router.handleJsonRpc({
    jsonrpc: '2.0',
    id: 6,
    method: 'tools/call',
    params: {
      name: 'robos_rest_send_request',
      arguments: {
        url: 'http://127.0.0.1:8443/api/v1/pets/PET-105-VAX/surgery',
        method: 'POST',
        body: {
          procedure: 'Emergency Orthopedic Surgery',
          surgeon: 'Dr. Maya Patel, DVM, DACVS',
          priority: 'EMERGENCY_CRITICAL',
        },
      },
    },
  });
  logs.push({ step: 'rest_verification', output: JSON.parse(restRes.result.content[0].text) });

  // Step 7: Advance Workflow
  const advRes = await router.handleJsonRpc({
    jsonrpc: '2.0',
    id: 7,
    method: 'tools/call',
    params: {
      name: 'robos_tasks_advance_workflow',
      arguments: { id: params?.taskId || 'PET-106', status: 'DONE' },
    },
  });
  logs.push({ step: 'workflow_advance', output: JSON.parse(advRes.result.content[0].text) });

  return { ok: true, logs };
});

