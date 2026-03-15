'use strict';
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const cp   = require('child_process');

// Single-instance lock
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }

app.setName('agent-monitor');
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

// ── Provider paths ──────────────────────────────────────────────────────────

const COPILOT_SESSION_DIR = path.join(os.homedir(), '.copilot', 'session-state');
const CLAUDE_DIR          = path.join(os.homedir(), '.claude');
const CLAUDE_SESSIONS_DIR = path.join(CLAUDE_DIR, 'sessions');
const CLAUDE_HISTORY_FILE = path.join(CLAUDE_DIR, 'history.jsonl');

// ── Process scanning ────────────────────────────────────────────────────────

function listAgentProcesses() {
  const procs = [];
  try {
    const dirs = fs.readdirSync('/proc').filter(d => /^\d+$/.test(d));
    for (const pid of dirs) {
      try {
        const raw = fs.readFileSync(`/proc/${pid}/cmdline`);
        const args = raw.toString().split('\0').filter(Boolean);
        if (!args.length) continue;

        const exe = args[0] || '';
        const cmdJoined = args.join(' ');

        // Detect Claude Code
        const isClaude = exe.endsWith('/claude') || exe === 'claude' ||
          (args.some(a => a.endsWith('/claude') || a === 'claude') && !cmdJoined.includes('node_modules'));

        // Detect Copilot: 'gh' binary with 'copilot' arg, or standalone 'copilot' binary
        const isCopilot = ((exe.endsWith('/gh') || exe === 'gh') && args.includes('copilot')) ||
          exe.endsWith('/copilot') || exe === 'copilot';

        if (!isClaude && !isCopilot) continue;

        let cwd = '';
        try { cwd = fs.readlinkSync(`/proc/${pid}/cwd`); } catch {}

        // Get start time from /proc/pid/stat field 22 (in clock ticks since boot)
        let startTime = '';
        try {
          const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
          const fields = stat.split(' ');
          const startTicks = parseInt(fields[21]);
          const uptime = parseFloat(fs.readFileSync('/proc/uptime', 'utf8').split(' ')[0]);
          const hz = 100; // typical jiffies/sec
          const startSec = Date.now() / 1000 - uptime + startTicks / hz;
          startTime = new Date(startSec * 1000).toISOString();
        } catch {}

        procs.push({
          pid: parseInt(pid),
          provider: isClaude ? 'claude-code' : 'github-copilot',
          cmdline: cmdJoined.slice(0, 300),
          cwd,
          startTime,
          args: args.slice(1),
        });
      } catch {} // process may have exited
    }
  } catch {}
  return procs;
}

// ── Session listing ─────────────────────────────────────────────────────────

function listAgentSessions() {
  const sessions = [];
  const runningProcs = listAgentProcesses();
  const runningPids = new Set(runningProcs.map(p => p.pid));

  // ── Claude sessions from ~/.claude/sessions/ + history.jsonl ──
  const claudeMap = new Map();

  try {
    const files = fs.readdirSync(CLAUDE_SESSIONS_DIR).filter(f => f.endsWith('.json'));
    for (const file of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(CLAUDE_SESSIONS_DIR, file), 'utf8'));
        if (data.sessionId) {
          claudeMap.set(data.sessionId, {
            session_id: data.sessionId,
            provider: 'claude-code',
            name: data.cwd ? path.basename(data.cwd) : data.sessionId.slice(0, 8),
            cwd: data.cwd || '',
            started_at: data.startedAt ? new Date(data.startedAt).toISOString() : '',
            first_message: '',
            pid: data.pid || null,
            status: data.pid && runningPids.has(data.pid) ? 'running' : 'completed',
          });
        }
      } catch {}
    }
  } catch {}

  // Enrich with history.jsonl
  try {
    const lines = fs.readFileSync(CLAUDE_HISTORY_FILE, 'utf8').split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (!entry.sessionId) continue;
        if (claudeMap.has(entry.sessionId)) {
          const s = claudeMap.get(entry.sessionId);
          if (entry.display && entry.display !== '/init' && !s.first_message) {
            s.first_message = entry.display.slice(0, 120);
          }
          if (entry.project && !s.cwd) {
            s.cwd = entry.project;
            s.name = path.basename(entry.project);
          }
        } else {
          claudeMap.set(entry.sessionId, {
            session_id: entry.sessionId,
            provider: 'claude-code',
            name: entry.project ? path.basename(entry.project) : entry.sessionId.slice(0, 8),
            cwd: entry.project || '',
            started_at: entry.timestamp ? new Date(entry.timestamp).toISOString() : '',
            first_message: entry.display && entry.display !== '/init' ? entry.display.slice(0, 120) : '',
            pid: null,
            status: 'completed',
          });
        }
      } catch {}
    }
  } catch {}

  for (const s of claudeMap.values()) sessions.push(s);

  // ── Copilot sessions from ~/.copilot/session-state/ ──
  try {
    const ids = fs.readdirSync(COPILOT_SESSION_DIR);
    for (const id of ids) {
      try {
        const dirPath = path.join(COPILOT_SESSION_DIR, id);
        if (!fs.statSync(dirPath).isDirectory()) continue;

        const yamlPath = path.join(dirPath, 'workspace.yaml');
        const meta = {};
        try {
          const yaml = fs.readFileSync(yamlPath, 'utf8');
          yaml.split('\n').forEach(line => {
            const m = line.match(/^(\w+):\s*(.+)/);
            if (m) meta[m[1]] = m[2].trim();
          });
        } catch {}

        let firstMessage = '';
        try {
          const eventsPath = path.join(dirPath, 'events.jsonl');
          const evLines = fs.readFileSync(eventsPath, 'utf8').split('\n').filter(Boolean);
          for (const evLine of evLines) {
            const ev = JSON.parse(evLine);
            if (ev.type === 'user.message') {
              firstMessage = (ev.data?.content || '').slice(0, 120);
              break;
            }
          }
        } catch {}

        sessions.push({
          session_id: id,
          provider: 'github-copilot',
          name: meta.summary || id.slice(0, 8),
          cwd: meta.cwd || '',
          started_at: meta.created_at || '',
          first_message: firstMessage,
          pid: null,
          status: 'completed',
        });
      } catch {}
    }
  } catch {}

  // Cross-reference running processes with sessions
  for (const proc of runningProcs) {
    const match = sessions.find(s => s.pid === proc.pid);
    if (match) {
      match.status = 'running';
    }
  }

  sessions.sort((a, b) => (b.started_at || '').localeCompare(a.started_at || ''));
  return sessions;
}

// ── Session prompt ──────────────────────────────────────────────────────────

function getSessionPrompt(sessionId, provider) {
  if (provider === 'github-copilot') {
    try {
      const eventsPath = path.join(COPILOT_SESSION_DIR, sessionId, 'events.jsonl');
      const lines = fs.readFileSync(eventsPath, 'utf8').split('\n').filter(Boolean);
      for (const line of lines) {
        const ev = JSON.parse(line);
        if (ev.type === 'user.message') {
          return ev.data?.content || '';
        }
      }
    } catch {}
    return '';
  }

  // Claude Code — find first user message from history.jsonl
  if (provider === 'claude-code') {
    // Strip proc- prefix for synthetic sessions
    const realId = sessionId.startsWith('proc-') ? null : sessionId;
    if (!realId) return '';
    try {
      const lines = fs.readFileSync(CLAUDE_HISTORY_FILE, 'utf8').split('\n').filter(Boolean);
      for (const line of lines) {
        const entry = JSON.parse(line);
        if (entry.sessionId === realId && entry.display && entry.display !== '/init') {
          return entry.display;
        }
      }
    } catch {}
    return '';
  }

  return '';
}

// ── Session log ─────────────────────────────────────────────────────────────

function getSessionLog(sessionId, provider) {
  const logLines = [];

  if (provider === 'github-copilot') {
    try {
      const eventsPath = path.join(COPILOT_SESSION_DIR, sessionId, 'events.jsonl');
      const lines = fs.readFileSync(eventsPath, 'utf8').split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const ev = JSON.parse(line);
          const ts = ev.timestamp || ev.created_at || '';
          const type = ev.type || 'unknown';
          const content = ev.data?.content || ev.data?.text || JSON.stringify(ev.data || {}).slice(0, 500);
          logLines.push(`[${ts}] ${type}: ${content}`);
        } catch {
          logLines.push(line);
        }
      }
    } catch {}
    return logLines.join('\n') || '';
  }

  if (provider === 'claude-code') {
    const realId = sessionId.startsWith('proc-') ? null : sessionId;
    if (!realId) return '';

    // Try reading session JSON file
    try {
      const sessionFile = path.join(CLAUDE_SESSIONS_DIR, realId + '.json');
      if (fs.existsSync(sessionFile)) {
        const data = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
        if (data.messages && Array.isArray(data.messages)) {
          for (const msg of data.messages) {
            const ts = msg.timestamp || '';
            const role = msg.role || 'unknown';
            const content = typeof msg.content === 'string'
              ? msg.content.slice(0, 500)
              : JSON.stringify(msg.content || '').slice(0, 500);
            logLines.push(`[${ts}] ${role}: ${content}`);
          }
        }
      }
    } catch {}

    // Also read from history.jsonl
    if (logLines.length === 0) {
      try {
        const lines = fs.readFileSync(CLAUDE_HISTORY_FILE, 'utf8').split('\n').filter(Boolean);
        for (const line of lines) {
          try {
            const entry = JSON.parse(line);
            if (entry.sessionId === realId) {
              const ts = entry.timestamp ? new Date(entry.timestamp).toISOString() : '';
              const display = entry.display || '';
              logLines.push(`[${ts}] user: ${display}`);
            }
          } catch {}
        }
      } catch {}
    }

    return logLines.join('\n') || '';
  }

  return '';
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
    title: 'RobOS Agent Monitor',
  });
  win.loadFile('renderer/index.html');
  win.once('ready-to-show', () => win.show());
}

app.whenReady().then(() => {
  createWindow();
});

app.on('second-instance', () => {
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
});

app.on('window-all-closed', () => app.quit());

// ── IPC handlers ────────────────────────────────────────────────────────────

ipcMain.handle('list-agent-processes', () => listAgentProcesses());
ipcMain.handle('list-agent-sessions',  () => listAgentSessions());
ipcMain.handle('get-session-prompt',   (_, id, prov) => getSessionPrompt(id, prov));
ipcMain.handle('get-session-log',      (_, id, prov) => getSessionLog(id, prov));

ipcMain.handle('kill-agent', (_, pid) => {
  try {
    process.kill(pid, 'SIGTERM');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('open-terminal', (_, sessionId, provider) => {
  let cmd;
  if (provider === 'claude-code') {
    cmd = sessionId && !sessionId.startsWith('proc-')
      ? `claude --resume ${sessionId}`
      : 'claude';
  } else {
    cmd = sessionId
      ? `gh copilot -- --resume ${sessionId}`
      : 'gh copilot';
  }
  cp.spawn('tilix', ['-e', `bash -c '${cmd}; read -p "Press Enter to close..." x'`], {
    env: { ...process.env, DISPLAY: ':0' }, detached: true,
  });
});

ipcMain.handle('minimize', () => win && win.minimize());
ipcMain.handle('close',    () => win && win.close());
