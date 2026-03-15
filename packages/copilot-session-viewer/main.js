'use strict';
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');

const SESSION_STATE = path.join(os.homedir(), '.copilot', 'session-state');

let win;
function createWindow() {
  win = new BrowserWindow({
    width: 1400, height: 900,
    minWidth: 900, minHeight: 600,
    title: 'RobOS Copilot Session Viewer',
    autoHideMenuBar: true,
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}
app.setName('copilot-session-viewer');
app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

// ── Helpers ───────────────────────────────────────────────────────────────────
function readJsonlFile(filePath) {
  try {
    const lines = fs.readFileSync(filePath, 'utf8').trim().split('\n');
    return lines.filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}

// ── IPC ───────────────────────────────────────────────────────────────────────

// List all sessions (root .jsonl + folder-based events.jsonl)
ipcMain.handle('list-sessions', () => {
  const sessions = [];

  // Folder-based sessions (have events.jsonl)
  try {
    const entries = fs.readdirSync(SESSION_STATE, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const eventsPath = path.join(SESSION_STATE, e.name, 'events.jsonl');
      if (!fs.existsSync(eventsPath)) continue;

      const events = readJsonlFile(eventsPath);
      const startEvt = events.find(ev => ev.type === 'session.start');
      const firstUser = events.find(ev => ev.type === 'user.message');
      const lastEvt   = events[events.length - 1];
      const userMsgs  = events.filter(ev => ev.type === 'user.message').length;
      const toolCalls = events.filter(ev => ev.type === 'tool.execution_start').length;

      // Count checkpoints
      const cpDir = path.join(SESSION_STATE, e.name, 'checkpoints');
      let checkpoints = [];
      try { checkpoints = fs.readdirSync(cpDir).filter(f => f.endsWith('.md')); } catch {}

      // workspace info
      let cwd = '';
      const wy = path.join(SESSION_STATE, e.name, 'workspace.yaml');
      try {
        const wyContent = fs.readFileSync(wy, 'utf8');
        const m = wyContent.match(/cwd:\s*(.+)/);
        if (m) cwd = m[1].trim();
      } catch {}

      sessions.push({
        id: e.name,
        source: 'folder',
        eventsPath,
        startTime: startEvt?.data?.startTime || startEvt?.timestamp || null,
        endTime: lastEvt?.timestamp || null,
        firstMessage: firstUser?.data?.content?.slice(0, 120) || '(no messages)',
        userMessages: userMsgs,
        toolCalls,
        checkpoints: checkpoints.length,
        cwd,
      });
    }
  } catch (err) {
    console.error('list-sessions folder error:', err);
  }

  // Root-level .jsonl files (legacy format)
  try {
    const entries = fs.readdirSync(SESSION_STATE, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isFile() || !e.name.endsWith('.jsonl')) continue;
      const filePath = path.join(SESSION_STATE, e.name);
      const events   = readJsonlFile(filePath);
      const startEvt = events.find(ev => ev.type === 'session.start');
      const firstUser= events.find(ev => ev.type === 'user.message');
      const lastEvt  = events[events.length - 1];
      const userMsgs = events.filter(ev => ev.type === 'user.message').length;
      const toolCalls= events.filter(ev => ev.type === 'tool.execution_start').length;

      sessions.push({
        id: e.name.replace('.jsonl', ''),
        source: 'root-jsonl',
        eventsPath: filePath,
        startTime: startEvt?.data?.startTime || startEvt?.timestamp || null,
        endTime: lastEvt?.timestamp || null,
        firstMessage: firstUser?.data?.content?.slice(0, 120) || '(no messages)',
        userMessages: userMsgs,
        toolCalls,
        checkpoints: 0,
        cwd: '',
      });
    }
  } catch (err) {
    console.error('list-sessions root error:', err);
  }

  // Sort by start time descending
  sessions.sort((a, b) => {
    const ta = a.startTime ? new Date(a.startTime).getTime() : 0;
    const tb = b.startTime ? new Date(b.startTime).getTime() : 0;
    return tb - ta;
  });

  return sessions;
});

// Load full events for a session
ipcMain.handle('load-session', (_, { eventsPath }) => {
  return readJsonlFile(eventsPath);
});

// Load checkpoints list for a folder session
ipcMain.handle('list-checkpoints', (_, { sessionId }) => {
  const cpDir = path.join(SESSION_STATE, sessionId, 'checkpoints');
  try {
    const files = fs.readdirSync(cpDir).filter(f => f.endsWith('.md')).sort();
    return files.map(f => ({
      filename: f,
      content: fs.readFileSync(path.join(cpDir, f), 'utf8'),
    }));
  } catch { return []; }
});

// Read a file from the session files/ directory
ipcMain.handle('read-session-file', (_, { sessionId, filename }) => {
  try {
    const p = path.join(SESSION_STATE, sessionId, 'files', filename);
    return { content: fs.readFileSync(p, 'utf8') };
  } catch (err) { return { error: err.message }; }
});
