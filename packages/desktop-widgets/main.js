const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const { execSync } = require('child_process');

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

const SETTINGS_FILE = path.join(os.homedir(), '.config', 'robos', 'settings.json');
const WIDGETS_FILE  = path.join(os.homedir(), '.config', 'robos', 'widgets.json');
const ACTIVE_TASK_FILE = path.join(os.homedir(), '.config', 'robos', 'active-issue');

// Default widget configuration
const DEFAULT_WIDGETS = [
  { id: 'active-task', label: 'Active Task', enabled: true, x: 20, y: 80, w: 280, h: 80 },
  { id: 'system-stats', label: 'System Stats', enabled: true, x: 20, y: 180, w: 280, h: 120 },
  { id: 'journal-summary', label: 'Journal Summary', enabled: true, x: 20, y: 320, w: 280, h: 100 },
];

function loadWidgetConfig() {
  try {
    if (fs.existsSync(WIDGETS_FILE)) return JSON.parse(fs.readFileSync(WIDGETS_FILE, 'utf8'));
  } catch {}
  return DEFAULT_WIDGETS;
}

function saveWidgetConfig(config) {
  fs.mkdirSync(path.dirname(WIDGETS_FILE), { recursive: true });
  fs.writeFileSync(WIDGETS_FILE, JSON.stringify(config, null, 2));
}

function getActiveTask() {
  try {
    if (fs.existsSync(ACTIVE_TASK_FILE)) {
      const content = fs.readFileSync(ACTIVE_TASK_FILE, 'utf8').trim();
      return content || null;
    }
  } catch {}
  return null;
}

function getSystemStats() {
  const cpus = os.cpus();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const memPct = Math.round((usedMem / totalMem) * 100);

  let diskUsage = 'N/A';
  try {
    const out = execSync('df -h / | tail -1', { encoding: 'utf8', timeout: 3000 });
    const parts = out.trim().split(/\s+/);
    diskUsage = parts[4] || 'N/A'; // Usage percentage
  } catch {}

  let loadAvg = os.loadavg();

  return {
    cpuCount: cpus.length,
    memTotal: Math.round(totalMem / (1024 * 1024 * 1024) * 10) / 10,
    memUsed: Math.round(usedMem / (1024 * 1024 * 1024) * 10) / 10,
    memPct,
    diskUsage,
    loadAvg: loadAvg.map(v => v.toFixed(2)),
    uptime: Math.floor(os.uptime() / 3600),
  };
}

function getJournalSummary() {
  try {
    const settingsRaw = fs.readFileSync(SETTINGS_FILE, 'utf8');
    const settings = JSON.parse(settingsRaw);
    const repoUrl = settings.journal_repo || '';
    if (!repoUrl) return { entries: 0, lastEntry: null };

    const repo = repoUrl.replace('https://github.com/', '').replace('git@github.com:', '').replace('.git', '');
    const parts = repo.split('/');
    const journalDir = path.join(os.homedir(), 'source', 'github.com', parts[0], parts[1], 'daily');

    const today = new Date().toISOString().split('T')[0];
    const dailyFile = path.join(journalDir, today + '.md');

    if (!fs.existsSync(dailyFile)) return { entries: 0, lastEntry: null };

    const content = fs.readFileSync(dailyFile, 'utf8');
    const lines = content.split('\n').filter(l => l.startsWith('- ['));
    return {
      entries: lines.length,
      lastEntry: lines.length > 0 ? lines[lines.length - 1].replace(/^- \[\d{2}:\d{2}:\d{2}\] /, '') : null,
    };
  } catch {
    return { entries: 0, lastEntry: null };
  }
}

let win;
app.setName('desktop-widgets');

app.whenReady().then(() => {
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.workAreaSize;

  win = new BrowserWindow({
    width: 320,
    height: height - 60,
    x: width - 340,
    y: 40,
    frame: false,
    transparent: true,
    alwaysOnTop: false,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Set window type to desktop (below all windows)
  try {
    win.setIgnoreMouseEvents(true, { forward: true });
  } catch {}

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.setMenuBarVisibility(false);

  if (_debugServer) _debugServer.startDebugServer(win, 19127);

  // Refresh widget data periodically
  setInterval(() => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('widget-data', collectWidgetData());
    }
  }, 10000);

  // Initial data push after load
  win.webContents.once('did-finish-load', () => {
    win.webContents.send('widget-data', collectWidgetData());
  });
});

app.on('window-all-closed', () => {});

function collectWidgetData() {
  return {
    activeTask: getActiveTask(),
    systemStats: getSystemStats(),
    journalSummary: getJournalSummary(),
    widgets: loadWidgetConfig(),
  };
}

ipcMain.handle('get-widget-data', () => collectWidgetData());
ipcMain.handle('get-widget-config', () => loadWidgetConfig());
ipcMain.handle('save-widget-config', (_, config) => {
  saveWidgetConfig(config);
  return { ok: true };
});

// Export for testing
module.exports = { getActiveTask, getSystemStats, getJournalSummary, loadWidgetConfig, DEFAULT_WIDGETS };
