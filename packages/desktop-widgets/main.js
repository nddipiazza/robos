const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const cp   = require('child_process');
const { execSync } = cp;

// Match the renderer's <title> so xdotool can find the window after document.title
// loads (HTML title wins over BrowserWindow title at runtime in Electron).
const WIDGET_WINDOW_TITLE = 'RobOS Desktop Widgets';

// Pin the widget below every other window via _NET_WM_STATE_BELOW + sticky.
// Ignores TYPE (Electron clobbers that); uses STATE (which survives).
// Re-asserts forever on an interval — Electron raises the window during its
// own startup animations, focus changes, and HMR-style reloads.
function pinBelow() {
  const LOG = '/tmp/dw-pin.log';
  const env = { ...process.env, DISPLAY: ':0' };
  const apply = () => {
    cp.exec(
      `WID=$(xdotool search --name "${WIDGET_WINDOW_TITLE}" 2>/dev/null | head -1); ` +
      `if [ -n "$WID" ]; then ` +
        `wmctrl -ir $WID -b add,below,sticky,skip_taskbar,skip_pager 2>&1; ` +
        `echo "[$(date +%H:%M:%S)] applied to $WID"; ` +
      `else echo "[$(date +%H:%M:%S)] no WID yet"; fi >> ${LOG}`,
      { timeout: 5000, env, shell: '/bin/bash' },
      () => {}
    );
  };
  // Apply initially with a small delay, then every 3s forever.
  setTimeout(apply, 800);
  setInterval(apply, 3000);
}

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

app.setName('desktop-widgets');
app.setPath('userData', path.join(os.homedir(), '.config', 'robos', 'electron', 'desktop-widgets'));

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

function widgetBounds() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const W = 320;
  return {
    x:      width - W - 20,
    y:      40,
    width:  W,
    height: height - 60,
  };
}

app.whenReady().then(() => {
  const b = widgetBounds();

  win = new BrowserWindow({
    ...b,
    // Keep the window WM-managed (NOT override-redirect) so wmctrl's BELOW
    // state actually controls stacking. `focusable: false` and `type: 'desktop'`
    // both force override-redirect on Linux — so we avoid them.
    // `frame: false` and `transparent: true` together do NOT force
    // override-redirect in Electron 28+, so we get real alpha blending AND
    // WM-managed stacking.
    title: WIDGET_WINDOW_TITLE,
    frame: false,
    transparent: true,
    autoHideMenuBar: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.setMenuBarVisibility(false);
  win.setSkipTaskbar(true);

  // Pin below all other windows via wmctrl state flags.
  pinBelow();
  win.webContents.on('did-finish-load', () => pinBelow());

  // Keep widgets anchored to the right edge when resolution changes.
  const onDisplayChange = () => {
    if (win && !win.isDestroyed()) win.setBounds(widgetBounds());
  };
  screen.on('display-metrics-changed', onDisplayChange);
  screen.on('display-added',            onDisplayChange);
  screen.on('display-removed',          onDisplayChange);
  win.on('closed', () => {
    screen.off('display-metrics-changed', onDisplayChange);
    screen.off('display-added',            onDisplayChange);
    screen.off('display-removed',          onDisplayChange);
  });

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
