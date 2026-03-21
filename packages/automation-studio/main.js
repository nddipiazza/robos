const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');

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

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

const CONFIG_DIR     = path.join(os.homedir(), '.config', 'robos');
const RULES_FILE     = path.join(CONFIG_DIR, 'event-rules.json');
const JOBS_FILE      = path.join(CONFIG_DIR, 'scheduled-jobs.json');
const EVENT_LOG_DIR  = path.join(CONFIG_DIR, 'event-log');

// ── Rule helpers ────────────────────────────────────────────────────────────

function loadRules() {
  try {
    if (fs.existsSync(RULES_FILE)) return JSON.parse(fs.readFileSync(RULES_FILE, 'utf8'));
  } catch {}
  return [];
}

function saveRules(rules) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(RULES_FILE, JSON.stringify(rules, null, 2));
}

// ── Scheduled job helpers ───────────────────────────────────────────────────

function loadJobs() {
  try {
    if (fs.existsSync(JOBS_FILE)) return JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8'));
  } catch {}
  return [];
}

function saveJobs(jobs) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(JOBS_FILE, JSON.stringify(jobs, null, 2));
}

// ── Event log helpers ───────────────────────────────────────────────────────

function loadEventLog(dateStr) {
  const file = path.join(EVENT_LOG_DIR, dateStr + '.jsonl');
  try {
    if (!fs.existsSync(file)) return [];
    const lines = fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean);
    return lines.map(line => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
  } catch {}
  return [];
}

function getTodayDateStr() {
  return new Date().toISOString().split('T')[0];
}

// ── Cron human-readable ─────────────────────────────────────────────────────

function cronToHuman(expr) {
  if (!expr) return 'No schedule';
  const parts = expr.trim().split(/\s+/);
  if (parts.length < 5) return expr;

  const [min, hour, dom, mon, dow] = parts;

  if (min === '*' && hour === '*') return 'Every minute';
  if (hour === '*' && min !== '*') return `Every hour at :${min.padStart(2, '0')}`;
  if (dom === '*' && mon === '*' && dow === '*') {
    if (min !== '*' && hour !== '*') return `Daily at ${hour}:${min.padStart(2, '0')}`;
  }
  if (dow !== '*' && dom === '*' && mon === '*') {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const day = days[parseInt(dow)] || dow;
    return `${day} at ${hour}:${min.padStart(2, '0')}`;
  }

  return expr;
}

// ── Window ──────────────────────────────────────────────────────────────────

let win;
app.setName('automation-studio');

app.whenReady().then(() => {
  win = new BrowserWindow({
    width: 1100,
    height: 750,
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.setMenuBarVisibility(false);

  if (_debugServer) _debugServer.startDebugServer(win, 19128);
});

app.on('window-all-closed', () => app.quit());

// ── IPC handlers ────────────────────────────────────────────────────────────

ipcMain.handle('load-rules', () => loadRules());
ipcMain.handle('save-rules', (_, rules) => { saveRules(rules); return { ok: true }; });

ipcMain.handle('load-jobs', () => loadJobs());
ipcMain.handle('save-jobs', (_, jobs) => { saveJobs(jobs); return { ok: true }; });

ipcMain.handle('load-event-log', (_, dateStr) => loadEventLog(dateStr || getTodayDateStr()));
ipcMain.handle('get-today', () => getTodayDateStr());

ipcMain.handle('cron-to-human', (_, expr) => cronToHuman(expr));

// Export for testing
module.exports = { loadRules, saveRules, loadJobs, saveJobs, loadEventLog, cronToHuman, getTodayDateStr };
