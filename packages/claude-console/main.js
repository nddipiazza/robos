'use strict';
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const cp   = require('child_process');

// Single-instance lock
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }

app.setName('claude-console');
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

// ── Claude CLI path ─────────────────────────────────────────────────────────

function findClaude() {
  const candidates = [
    path.join(os.homedir(), '.local', 'bin', 'claude'),
    '/usr/local/bin/claude',
    '/usr/bin/claude',
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return 'claude'; // hope it's on PATH
}

// ── Session history ─────────────────────────────────────────────────────────

const CLAUDE_DIR          = path.join(os.homedir(), '.claude');
const CLAUDE_HISTORY_FILE = path.join(CLAUDE_DIR, 'history.jsonl');

function listSessions() {
  const sessions = [];
  const seen = new Set();
  try {
    const lines = fs.readFileSync(CLAUDE_HISTORY_FILE, 'utf8').split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (!entry.sessionId) continue;
        if (seen.has(entry.sessionId)) {
          const existing = sessions.find(s => s.id === entry.sessionId);
          if (existing && entry.display && entry.display !== '/init' && !existing.prompt) {
            existing.prompt = entry.display.slice(0, 200);
          }
          continue;
        }
        seen.add(entry.sessionId);
        sessions.push({
          id:      entry.sessionId,
          project: entry.project || '',
          name:    entry.project ? path.basename(entry.project) : entry.sessionId.slice(0, 8),
          prompt:  (entry.display && entry.display !== '/init') ? entry.display.slice(0, 200) : '',
          time:    entry.timestamp ? new Date(entry.timestamp).toISOString() : '',
        });
      } catch {}
    }
  } catch {}
  sessions.sort((a, b) => (b.time || '').localeCompare(a.time || ''));
  return sessions;
}

// ── Claude process management ───────────────────────────────────────────────

let claudeProc = null;
let currentSessionId = null;

function spawnClaudeForMessage(prompt, opts) {
  const { cwd, resume, permissionMode } = opts || {};
  const claudePath = findClaude();
  const args = ['-p', '--output-format', 'stream-json', '--verbose'];

  if (resume) args.push('--resume', resume);
  if (permissionMode) args.push('--permission-mode', permissionMode);

  const proc = cp.spawn(claudePath, args, {
    cwd: cwd || os.homedir(),
    env: { ...process.env, TERM: 'dumb' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let buffer = '';

  proc.stdout.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop(); // keep incomplete line
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        if (win && !win.isDestroyed()) {
          win.webContents.send('claude-event', event);
        }
        if (event.type === 'system' && event.session_id) {
          currentSessionId = event.session_id;
        }
      } catch {}
    }
  });

  proc.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    if (win && !win.isDestroyed()) {
      win.webContents.send('claude-stderr', text);
    }
  });

  proc.on('close', (code) => {
    // flush remaining buffer
    if (buffer.trim()) {
      try {
        const event = JSON.parse(buffer);
        if (win && !win.isDestroyed()) {
          win.webContents.send('claude-event', event);
        }
      } catch {}
    }
    claudeProc = null;
    if (win && !win.isDestroyed()) {
      win.webContents.send('claude-done', code);
    }
  });

  claudeProc = proc;

  // Write the prompt to stdin and close it
  proc.stdin.write(prompt);
  proc.stdin.end();

  return { pid: proc.pid };
}

// ── Window ──────────────────────────────────────────────────────────────────

let win;

function createWindow() {
  win = new BrowserWindow({
    width:     1400,
    height:    900,
    minWidth:  900,
    minHeight: 550,
    frame:     false,
    show:      false,
    backgroundColor: '#0d1117',
    autoHideMenuBar: true,
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
    title: 'RobOS Claude Console',
  });
  win.loadFile('renderer/index.html');
  win.once('ready-to-show', () => win.show());
}

app.whenReady().then(createWindow);

app.on('second-instance', () => {
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
});

app.on('window-all-closed', () => {
  if (claudeProc) { try { claudeProc.kill(); } catch {} }
  app.quit();
});

// ── IPC handlers ────────────────────────────────────────────────────────────

ipcMain.handle('list-sessions', () => listSessions());

ipcMain.handle('send-message', (_, prompt, opts) => {
  if (claudeProc) return { ok: false, error: 'Claude is already running' };
  const result = spawnClaudeForMessage(prompt, opts);
  return { ok: true, pid: result.pid };
});

ipcMain.handle('stop-claude', () => {
  if (claudeProc) {
    try { claudeProc.kill('SIGTERM'); } catch {}
    claudeProc = null;
    return { ok: true };
  }
  return { ok: false };
});

ipcMain.handle('get-session-id', () => currentSessionId);
ipcMain.handle('get-home-dir', () => os.homedir());

ipcMain.handle('get-cwd-choices', () => {
  const dirs = new Set();
  try {
    const lines = fs.readFileSync(CLAUDE_HISTORY_FILE, 'utf8').split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.project && fs.existsSync(entry.project)) dirs.add(entry.project);
      } catch {}
    }
  } catch {}
  return [...dirs].slice(0, 30);
});

ipcMain.handle('list-path', (_, query) => {
  try {
    const expanded = query.startsWith('~') ? query.replace('~', os.homedir()) :
                     query.startsWith('/') ? query :
                     path.join(os.homedir(), query);
    // Determine directory to list and prefix to filter by
    let dir, prefix;
    try {
      if (fs.statSync(expanded).isDirectory()) {
        dir = expanded;
        prefix = '';
      } else {
        dir = path.dirname(expanded);
        prefix = path.basename(expanded);
      }
    } catch {
      // Path doesn't exist — list parent dir and filter by partial name
      dir = path.dirname(expanded);
      prefix = path.basename(expanded);
    }
    if (!fs.existsSync(dir)) return { ok: true, items: [] };
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const items = entries
      .filter(e => !e.name.startsWith('.') && (!prefix || e.name.toLowerCase().startsWith(prefix.toLowerCase())))
      .slice(0, 30)
      .map(e => ({
        name: e.name,
        path: path.join(dir, e.name),
        isPath: true,
        isDir: e.isDirectory(),
      }));
    return { ok: true, items };
  } catch {
    return { ok: true, items: [] };
  }
});

ipcMain.handle('minimize', () => win && win.minimize());
ipcMain.handle('maximize', () => { if (win) { win.isMaximized() ? win.unmaximize() : win.maximize(); } });
ipcMain.handle('close', () => win && win.close());
