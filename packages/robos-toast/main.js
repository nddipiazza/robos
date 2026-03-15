const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');

// Single-instance lock — only one toast daemon
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }

app.setName('robos-toast');

const NOTIF_FILE = path.join(os.homedir(), '.config', 'robos', 'notifications.json');

// Track last known notification IDs to detect new ones
let knownIds = new Set();
// Active toast windows (bottom-right stack)
const activeToasts = [];
const TOAST_HEIGHT = 90;
const TOAST_GAP    = 8;
const TOAST_MARGIN = 20;
const TOAST_WIDTH  = 340;

function loadNotifications() {
  try {
    if (fs.existsSync(NOTIF_FILE)) return JSON.parse(fs.readFileSync(NOTIF_FILE, 'utf8'));
  } catch {}
  return [];
}

function initKnownIds() {
  const notifs = loadNotifications();
  notifs.forEach(n => {
    // Sticky unread notifications get a toast even on startup — they're important
    // and may have been written before robos-toast launched.
    if (n.sticky && !n.read) {
      createToast(n);
    }
    knownIds.add(n.id);
  });
}

function getToastY(index) {
  const display = screen.getPrimaryDisplay();
  const { height } = display.workAreaSize;
  return height - TOAST_MARGIN - (TOAST_HEIGHT + TOAST_GAP) * (index + 1);
}

function repositionToasts() {
  activeToasts.forEach((win, i) => {
    if (!win.isDestroyed()) {
      win.setPosition(win.getBounds().x, getToastY(i));
    }
  });
}

function createToast(notif) {
  const display = screen.getPrimaryDisplay();
  const { width } = display.workAreaSize;
  const index = activeToasts.length;

  const win = new BrowserWindow({
    width: TOAST_WIDTH,
    height: TOAST_HEIGHT,
    x: width - TOAST_WIDTH - TOAST_MARGIN,
    y: getToastY(index),
    frame: false,
    transparent: false,
    backgroundColor: '#161b22',
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    hasShadow: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  win.setIgnoreMouseEvents(false);
  win.loadFile(path.join(__dirname, 'toast.html'));

  win.webContents.once('did-finish-load', () => {
    win.webContents.send('toast-data', notif);
  });

  activeToasts.push(win);

  // Auto-dismiss: skip if sticky, use notif.duration if set, else 6s
  if (!notif.sticky) {
    const duration = notif.duration || 6000;
    const timer = setTimeout(() => {
      dismissToast(win);
    }, duration);
    win.on('closed', () => clearTimeout(timer));
  }

  win.on('closed', () => {
    const idx = activeToasts.indexOf(win);
    if (idx !== -1) activeToasts.splice(idx, 1);
    repositionToasts();
  });
}

function dismissToast(win) {
  if (!win.isDestroyed()) win.close();
}

ipcMain.on('dismiss-toast', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) dismissToast(win);
});

ipcMain.on('toast-action', (event, action) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (action && action.type === 'open-app') {
    const scripts = {
      'work-journal':    '/usr/local/share/robos/work-journal/work-journal.sh',
      'workflow-studio':  '/usr/local/share/robos/workflow-studio/workflow-studio.sh',
      'agent-scheduler': '/usr/local/share/robos/agent-scheduler/agent-scheduler.sh',
      'pass-unlock':     '/usr/local/share/robos/pass-unlock/pass-unlock.sh',
      'pass-manager':    '/usr/local/share/robos/pass-manager/pass-manager.sh',
    };
    if (action.app === 'claude-login') {
      // Open a terminal for interactive Claude login
      const { spawn: spawnProc } = require('child_process');
      const cmd = 'claude auth login; echo; echo "=== Press Enter to close ==="; read';
      const terms = [
        ['tilix', ['--title', 'Claude Code Login', '-e', `bash -c '${cmd}'`]],
        ['gnome-terminal', ['--title', 'Claude Code Login', '--', 'bash', '-c', cmd]],
        ['xterm', ['-title', 'Claude Code Login', '-e', `bash -c '${cmd}'`]],
      ];
      for (const [term, args] of terms) {
        try {
          const { execSync } = require('child_process');
          execSync(`which ${term} 2>/dev/null`, { timeout: 1000 });
          const child = spawnProc(term, args, { detached: true, stdio: 'ignore', env: { ...process.env, DISPLAY: ':0' } });
          child.on('error', () => {});
          child.unref();
          break;
        } catch {}
      }
    } else {
      const script = scripts[action.app];
      if (script) {
        const { exec } = require('child_process');
        exec(`bash "${script}"`, { env: { ...process.env, DISPLAY: ':0' } });
      }
    }
  }
  if (win) dismissToast(win);
});

function checkForNewNotifications() {
  const notifs = loadNotifications();
  const newOnes = notifs.filter(n => !knownIds.has(n.id) && !n.read);
  newOnes.forEach(n => {
    knownIds.add(n.id);
    createToast(n);
  });
}

app.on('ready', () => {
  if (app.dock) app.dock.hide();

  initKnownIds();

  const dir = path.dirname(NOTIF_FILE);
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(NOTIF_FILE)) fs.writeFileSync(NOTIF_FILE, '[]');

  fs.watch(NOTIF_FILE, { persistent: true }, (event) => {
    if (event === 'change') {
      setTimeout(checkForNewNotifications, 100);
    }
  });
});

app.on('window-all-closed', () => {
  // Keep running even with no windows
});
