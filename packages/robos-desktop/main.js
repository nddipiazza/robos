'use strict';
/**
 * RobOS Desktop Shell — main.js
 *
 * Acts like explorer.exe on Windows: a persistent fullscreen background app
 * that provides the taskbar (clock, pinned apps, running apps, launcher button).
 *
 * Strategy:
 *  1. On launch, hide the GNOME panel via gsettings (stored & reversible).
 *  2. Open a fullscreen BrowserWindow with type:'desktop' so it sits below
 *     all other windows but above the X11 root (wallpaper).
 *  3. Communicate with the desktop-manager via its UNIX socket to launch apps
 *     and query running app status. Falls back to direct spawn if the socket
 *     is unavailable.
 *  4. Expose IPC to the renderer for launching apps, getting status, and
 *     reading/writing the pinned-apps config.
 */

const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path   = require('path');
const fs     = require('fs');
const net    = require('net');
const { spawn, exec } = require('child_process');

// ── Single instance + app identity ───────────────────────────────────────────
app.setName('robos-desktop');
app.setPath('userData', path.join(
  process.env.HOME || '/home/robos', '.config', 'robos', 'electron', 'robos-desktop'
));

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }

app.on('second-instance', () => {
  if (mainWin && !mainWin.isDestroyed()) mainWin.focus();
});

// ── VM flags ─────────────────────────────────────────────────────────────────
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

// ── Debug server (optional robos-lib) ────────────────────────────────────────
let debugServer = null;
try {
  debugServer = require('/usr/local/share/robos/robos-lib/dom-snapshot');
} catch {}

// ── Constants ─────────────────────────────────────────────────────────────────
const APP_BASE      = '/usr/local/share/robos';
const CONFIG_DIR    = path.join(process.env.HOME || '/home/robos', '.config', 'robos');
const PINNED_FILE   = path.join(CONFIG_DIR, 'desktop-pinned.json');
const SOCKET_PATH   = `/run/user/${process.getuid()}/robos-dm.sock`;

const DEFAULT_PINNED = [
  'dev-central',
  'git-projects',
  'issue-manager',
  'ai-prompt',
  'agents-manager',
  'app-launcher',
];

// ── GNOME panel management ────────────────────────────────────────────────────
const DASH_TO_PANEL = 'dash-to-panel@jderose9.github.com';
const UBUNTU_DOCK   = 'ubuntu-dock@ubuntu.com';

function gnomeEnv() {
  return {
    ...process.env,
    DISPLAY: process.env.DISPLAY || ':0',
    DBUS_SESSION_BUS_ADDRESS: process.env.DBUS_SESSION_BUS_ADDRESS ||
      `unix:path=/run/user/${process.getuid()}/bus`,
  };
}

/**
 * Disable dash-to-panel + ubuntu-dock so both the top bar and bottom dock
 * disappear, leaving only the RobOS Desktop taskbar visible.
 */
function hideGnomePanel() {
  const env = gnomeEnv();
  const cmds = [
    `gnome-extensions disable "${DASH_TO_PANEL}"`,
    `gnome-extensions disable "${UBUNTU_DOCK}"`,
  ];
  for (const cmd of cmds) {
    exec(`${cmd} 2>/dev/null || true`, { env, shell: '/bin/bash' }, (err, _out, stderr) => {
      console.log(`[robos-desktop] ${cmd}:`, err ? stderr.trim() : 'ok');
    });
  }
}

/**
 * Re-enable dash-to-panel + ubuntu-dock so the native GNOME UI is restored,
 * then quit so the user is back on the normal GNOME desktop.
 */
function restoreGnomePanelAndQuit() {
  const env = gnomeEnv();
  const cmds = [
    `gnome-extensions enable "${UBUNTU_DOCK}"`,
    `gnome-extensions enable "${DASH_TO_PANEL}"`,
  ];
  let pending = cmds.length;
  function done(cmd, err, stderr) {
    console.log(`[robos-desktop] ${cmd}:`, err ? stderr.trim() : 'ok');
    pending--;
    if (pending <= 0) {
      // Give GNOME Shell a moment to reload extensions before we quit
      setTimeout(() => {
        console.log('[robos-desktop] quitting — GNOME desktop restored');
        process.env.ROBOS_DESKTOP_QUIT = '1';
        app.quit();
      }, 1000);
    }
  }
  for (const cmd of cmds) {
    exec(`${cmd} 2>/dev/null || true`, { env, shell: '/bin/bash' },
      (err, _out, stderr) => done(cmd, err, stderr));
  }
}

// ── Desktop-manager socket communication ─────────────────────────────────────
function dmRequest(payload) {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection(SOCKET_PATH);
    let data = '';
    sock.setTimeout(3000);
    sock.on('connect', () => {
      sock.write(JSON.stringify(payload) + '\n');
    });
    sock.on('data', chunk => { data += chunk; });
    sock.on('end', () => {
      try { resolve(JSON.parse(data)); }
      catch { resolve({ ok: false, error: 'bad json' }); }
    });
    sock.on('error', reject);
    sock.on('timeout', () => { sock.destroy(); reject(new Error('timeout')); });
  });
}

function mkBin(id) {
  return {
    bin:  path.join(APP_BASE, `${id}/node_modules/electron/dist/electron`),
    args: [path.join(APP_BASE, id), '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  };
}

function launchAppDirect(appId) {
  const cfg = mkBin(appId);
  if (!fs.existsSync(cfg.bin)) {
    console.warn(`[robos-desktop] binary not found: ${cfg.bin}`);
    return;
  }
  const child = spawn(cfg.bin, cfg.args, {
    detached: true,
    stdio: 'ignore',
    env: process.env,
  });
  child.unref();
  console.log(`[robos-desktop] launched ${appId} pid=${child.pid}`);
}

async function launchApp(appId) {
  try {
    const res = await dmRequest({ cmd: 'launch', appId });
    if (res && res.ok) return res;
  } catch {}
  // Fallback: direct spawn
  launchAppDirect(appId);
  return { ok: true, fallback: true };
}

async function getRunningApps() {
  try {
    const res = await dmRequest({ cmd: 'status' });
    if (res && res.statuses) return res.statuses;
    // desktop-manager may return differently
    if (res && typeof res === 'object' && !res.ok) return {};
    return res || {};
  } catch {
    return {};
  }
}

// ── Pinned apps ───────────────────────────────────────────────────────────────
function readPinned() {
  try {
    if (fs.existsSync(PINNED_FILE)) {
      return JSON.parse(fs.readFileSync(PINNED_FILE, 'utf8'));
    }
  } catch {}
  return DEFAULT_PINNED;
}

function writePinned(list) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(PINNED_FILE, JSON.stringify(list, null, 2));
}

// ── App registry (subset — the ones users would pin / see as running) ─────────
const APP_META = {
  'app-launcher':    { label: 'App Launcher',    icon: '🚀', desc: 'Open all apps' },
  'dev-central':     { label: 'Dev Central',     icon: '🏠', desc: 'Daily dashboard' },
  'git-projects':    { label: 'Git Projects',    icon: '🌿', desc: 'Git workspaces' },
  'issue-manager':   { label: 'Issue Manager',   icon: '📋', desc: 'GitHub Issues' },
  'ai-prompt':       { label: 'AI Prompt',       icon: '✨', desc: 'AI OS prompt' },
  'agents-manager':  { label: 'Agents Manager',  icon: '🤖', desc: 'AI agents' },
  'skills-manager':  { label: 'Skills Manager',  icon: '🔮', desc: 'Skills library' },
  'context-manager': { label: 'Context Manager', icon: '📚', desc: 'AI context' },
  'work-journal':    { label: 'Work Journal',    icon: '📓', desc: 'Dev journal' },
  'task-planner':    { label: 'Task Planner',    icon: '🎯', desc: 'Plan tasks' },
  'workspace-manager':{ label: 'Workspaces',     icon: '🗂️', desc: 'IDE workspaces' },
  'pass-manager':    { label: 'Pass Manager',    icon: '🔑', desc: 'Passwords' },
  'robos-preferences':{ label: 'Preferences',    icon: '⚙️', desc: 'Settings' },
  'claude-console':  { label: 'Claude Console',  icon: '🧬', desc: 'Claude Code GUI' },
  'notifications':   { label: 'Notifications',   icon: '🔔', desc: 'Notifications' },
};

// ── Main window ───────────────────────────────────────────────────────────────
let mainWin = null;

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  // Use the full bounds, not work area, to cover everything
  const { bounds } = screen.getPrimaryDisplay();

  mainWin = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    closable: false,     // never close — this is the desktop shell
    skipTaskbar: true,
    focusable: true,
    // 'desktop' type sets _NET_WM_WINDOW_TYPE_DESKTOP on X11 — sits behind all windows
    type: 'desktop',
    title: 'RobOS Desktop',
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  });

  mainWin.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Ensure it covers the full screen on X11
  mainWin.once('ready-to-show', () => {
    mainWin.setFullScreen(false);
    mainWin.setBounds(bounds);
    mainWin.show();
    mainWin.setAlwaysOnTop(false);
    // Lower it below all normal windows
    try {
      exec(
        `WID=$(xdotool search --name "RobOS Desktop" 2>/dev/null | head -1);` +
        `[ -n "$WID" ] && xdotool windowlower "$WID" 2>/dev/null || true`,
        { env: { ...process.env, DISPLAY: process.env.DISPLAY || ':0' }, shell: '/bin/bash' },
        () => {}
      );
    } catch {}
  });

  // Re-lower when another window takes focus (keep desktop behind)
  mainWin.on('focus', () => {
    if (mainWin && !mainWin.isDestroyed()) mainWin.setAlwaysOnTop(false);
  });

  mainWin.on('closed', () => { mainWin = null; });

  if (debugServer) {
    debugServer.registerSnapshotIPC(mainWin);
    debugServer.startDebugServer(mainWin, 19141, 'robos-desktop');
  }
}

// ── IPC handlers ──────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  // Hide GNOME panel so only our taskbar is visible
  hideGnomePanel();

  ipcMain.handle('launch-app', async (_e, appId) => {
    return await launchApp(appId);
  });

  ipcMain.handle('get-running-apps', async () => {
    return await getRunningApps();
  });

  ipcMain.handle('get-pinned-apps', () => readPinned());

  ipcMain.handle('set-pinned-apps', (_e, list) => {
    writePinned(list);
    return { ok: true };
  });

  ipcMain.handle('get-app-meta', () => APP_META);

  ipcMain.handle('switch-to-gnome', () => {
    restoreGnomePanelAndQuit();
    return { ok: true };
  });

  createWindow();
});

// Prevent the desktop shell from quitting — it must always run
app.on('window-all-closed', () => {
  // Re-create window if destroyed (should not happen since closable:false)
  setTimeout(createWindow, 1000);
});

app.on('before-quit', (e) => {
  // Only allow quit if explicitly requested via special env flag
  if (!process.env.ROBOS_DESKTOP_QUIT) {
    e.preventDefault();
  }
});
