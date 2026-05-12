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
/**
 * Hide all GNOME panels: disables dash-to-panel extension and applies
 * a user-theme CSS that hides the Activities top bar. No gnome-shell restart needed.
 */
function hideGnomePanel() {
  exec('sudo /usr/local/bin/robos-desktop-panel hide',
    { shell: '/bin/bash' },
    (err, stdout, stderr) => {
      if (err) console.warn('[robos-desktop] panel hide failed:', stderr.trim());
      else console.log('[robos-desktop] panel hidden:', stdout.trim());
    }
  );
}

/**
 * Restore the GNOME panel, then quit.
 * The show script re-enables dash-to-panel and restores the user-theme (no gnome-shell restart).
 */
function restoreGnomePanelAndQuit() {
  exec('sudo /usr/local/bin/robos-desktop-panel show',
    { shell: '/bin/bash' },
    (err, stdout, stderr) => {
      if (err) console.warn('[robos-desktop] panel show failed:', stderr.trim());
      else console.log('[robos-desktop] panel shown:', stdout.trim());
      process.env.ROBOS_DESKTOP_QUIT = '1';
      app.quit();
    }
  );
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
    const res = await dmRequest({ status: true });
    if (res && res.status) return res.status;
    return {};
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

// ── App registry — all user-visible apps shown in the unified dock ────────────
// Order determines dock order. System background apps are excluded.
const APP_META = {
  // ── Core ──────────────────────────────────────────────────────────────────
  'app-launcher':     { label: 'App Launcher',     icon: '🚀', desc: 'Open all apps',              category: 'core' },
  'dev-central':      { label: 'Dev Central',      icon: '🏠', desc: 'Daily dashboard',             category: 'core' },
  // ── Development ───────────────────────────────────────────────────────────
  'git-projects':     { label: 'Git Projects',     icon: '🌿', desc: 'Git workspaces',              category: 'dev' },
  'issue-manager':    { label: 'Issue Manager',    icon: '📋', desc: 'GitHub Issues',               category: 'dev' },
  'task-board':       { label: 'Task Board',       icon: '📌', desc: 'Kanban task board',           category: 'dev' },
  'pr-review':        { label: 'PR Review',        icon: '🔀', desc: 'Pull request reviews',        category: 'dev' },
  'ci-monitor':       { label: 'CI Monitor',       icon: '🚦', desc: 'CI/CD status',                category: 'dev' },
  'task-planner':     { label: 'Task Planner',     icon: '🎯', desc: 'Plan tasks with AI',          category: 'dev' },
  'task-implementer': { label: 'Implementer',      icon: '⚡', desc: 'Implement tasks with AI',     category: 'dev' },
  'work-journal':     { label: 'Work Journal',     icon: '📓', desc: 'Developer journal',           category: 'dev' },
  'workspace-manager':{ label: 'Workspaces',       icon: '🗂️', desc: 'Browse IDE workspaces',       category: 'dev' },
  'ide-manager':      { label: 'Dev Tools',        icon: '💻', desc: 'IDEs and dev tools',          category: 'dev' },
  'lang-manager':     { label: 'Languages',        icon: '🌐', desc: 'Dev language runtimes',       category: 'dev' },
  'workflow-studio':  { label: 'Workflows',        icon: '🔄', desc: 'Workflow management',         category: 'dev' },
  'tech-workbench':   { label: 'Workbench',        icon: '🛠️', desc: 'Technical problem solver',    category: 'dev' },
  'automation-studio':{ label: 'Automation',       icon: '⚙', desc: 'Automation workflows',        category: 'dev' },
  'task-servers':     { label: 'Task Servers',     icon: '🔗', desc: 'Jira/GitHub connections',     category: 'dev' },
  // ── AI ────────────────────────────────────────────────────────────────────
  'ai-prompt':        { label: 'AI Prompt',        icon: '✨', desc: 'AI-powered OS prompt',        category: 'ai' },
  'agents-manager':   { label: 'Agents',           icon: '🤖', desc: 'Manage AI agent sessions',    category: 'ai' },
  'skills-manager':   { label: 'Skills',           icon: '🔮', desc: 'Browse & manage OS skills',   category: 'ai' },
  'context-manager':  { label: 'Context',          icon: '📚', desc: 'AI context sources',          category: 'ai' },
  'claude-console':   { label: 'Claude',           icon: '🧬', desc: 'Enhanced Claude Code GUI',    category: 'ai' },
  'agent-scheduler':  { label: 'Scheduler',        icon: '⏰', desc: 'Schedule AI agent jobs',      category: 'ai' },
  // ── People ────────────────────────────────────────────────────────────────
  'people-directory': { label: 'People',           icon: '👤', desc: 'Team people directory',       category: 'people' },
  'group-manager':    { label: 'Groups',           icon: '👥', desc: 'GitHub orgs & teams',         category: 'people' },
  // ── Tools ─────────────────────────────────────────────────────────────────
  'pass-manager':     { label: 'Passwords',        icon: '🔑', desc: 'GPG password store',          category: 'tools' },
  'security-setup':   { label: 'Security',         icon: '🛡️', desc: 'GPG & SSH key setup',         category: 'tools' },
  'robos-preferences':{ label: 'Preferences',      icon: '⚙️', desc: 'System-wide settings',        category: 'tools' },
  'file-explorer':    { label: 'Files',            icon: '📁', desc: 'File browser',                category: 'tools' },
  'robos-icons':      { label: 'Icons',            icon: '🎨', desc: 'Manage app icons',            category: 'tools' },
  'notifications':    { label: 'Notifications',    icon: '🔔', desc: 'Notification history',        category: 'tools' },
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
