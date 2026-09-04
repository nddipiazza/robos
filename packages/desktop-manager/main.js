// Force GtkStatusIcon instead of AppIndicator so tray click events fire on Linux
if (process.env.XDG_CURRENT_DESKTOP) process.env.XDG_CURRENT_DESKTOP = 'GNOME';

const { app, Tray, Menu, BrowserWindow, ipcMain, nativeImage, dialog } = require('electron');
const net  = require('net');
const path = require('path');
const fs   = require('fs');
const { spawn } = require('child_process');

// Onboarding state module
let onboardingState = null;
try {
  onboardingState = require('/usr/local/share/robos/robos-lib/onboarding-state');
} catch {
  try {
    onboardingState = require('../robos-lib/onboarding-state');
  } catch {}
}

// Install global failure logging & error dialog tracking
try {
  const { setupGlobalErrorHandlers } = require('/usr/local/share/robos/robos-lib/logger');
  setupGlobalErrorHandlers('desktop-manager', dialog);
} catch {
  try {
    const { setupGlobalErrorHandlers } = require('../robos-lib/logger');
    setupGlobalErrorHandlers('desktop-manager', dialog);
  } catch {}
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

// Ensure only one Desktop Manager tray ever exists (except during test runs)
if (process.env.ROBOS_TEST !== '1' && process.env.ROBOS_TEST_MODE !== '1') {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) { app.quit(); process.exit(0); }
}

function getSocketPath() {
  if (process.env.ROBOS_DM_SOCKET) return process.env.ROBOS_DM_SOCKET;
  const runtimeDir = process.env.XDG_RUNTIME_DIR || (process.getuid ? `/run/user/${process.getuid()}` : '/run/user/1000');
  if (fs.existsSync(runtimeDir)) return path.join(runtimeDir, 'robos-dm.sock');
  const uid = process.getuid ? process.getuid() : 1000;
  return `/tmp/robos-dm-${uid}.sock`;
}

const SOCKET_PATH  = getSocketPath();
const APP_BASE     = process.env.ROBOS_APP_BASE || '/usr/local/share/robos';
const NOTIF_FILE   = path.join(process.env.HOME || '/tmp', '.config', 'robos', 'notifications.json');
const DESKTOPS_DIR = path.join(process.env.HOME || '/tmp', '.config', 'robos', 'desktops');

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

function listDesktops() {
  try {
    if (!fs.existsSync(DESKTOPS_DIR)) return [];
    return fs.readdirSync(DESKTOPS_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => { try { return JSON.parse(fs.readFileSync(path.join(DESKTOPS_DIR, f), 'utf8')); } catch { return null; } })
      .filter(Boolean)
      .sort((a, b) => (a.ticket || '').localeCompare(b.ticket || ''));
  } catch { return []; }
}

// ── APP_REGISTRY ────────────────────────────────────────────────────────────

const APPS = [
  // System
  { id: 'notifications',           label: 'Notifications',          icon: '🔔', desc: 'System notifications',            category: 'RobOS System' },
  { id: 'robos-preferences',       label: 'RobOS Preferences',      icon: '⚙️', desc: 'System-wide settings',            category: 'RobOS System' },
  { id: 'search-index',            label: 'Search Index',           icon: '🔍', desc: 'File system search index',        category: 'RobOS System' },
  // Security
  { id: 'pass-manager',            label: 'Pass Manager',           icon: '🔑', desc: 'Password store',                  category: 'RobOS Security' },
  { id: 'pass-unlock',             label: 'Pass Unlock',            icon: '🔓', desc: 'Unlock password store',           category: 'RobOS Security' },
  { id: 'security-setup',          label: 'Security Setup',         icon: '🛡️', desc: 'GPG & pass initializer',          category: 'RobOS Security' },
  { id: 'robos-onboarding',        label: 'RobOS Setup Wizard',     icon: '⚡', desc: 'Unified Setup Assistant',          category: 'RobOS Security' },
  { id: 'git-login-manager',       label: 'Git Login Manager',      icon: '🐙', desc: 'Monitor GitHub auth (keepAlive)', category: 'RobOS Security' },
  // Development
  { id: 'ide-manager',             label: 'Development Apps and IDEs', icon: '💻', desc: 'Manage development apps and IDEs', category: 'RobOS Dev' },
  { id: 'git-projects',            label: 'Git Projects',           icon: '🌿', desc: 'Git workspaces',                  category: 'RobOS Dev' },
  { id: 'work-journal',            label: 'Work Journal',           icon: '📓', desc: 'Developer journal',               category: 'RobOS Dev' },
  { id: 'workspace-manager',       label: 'Workspace Manager',      icon: '🗂️', desc: 'Browse IDE workspaces',           category: 'RobOS Dev' },
  { id: 'lang-manager',            label: 'Language Manager',       icon: '🌐', desc: 'Dev language & runtime manager',  category: 'RobOS Dev' },
  { id: 'workflow-studio',         label: 'Workflow Studio',        icon: '🎯', desc: 'Workflow & issue tracker',        category: 'RobOS Dev' },
  { id: 'task-servers',            label: 'Task Servers',           icon: '🔗', desc: 'Jira/GitHub connections',         category: 'RobOS Dev' },
  { id: 'tech-workbench',          label: 'TPS Workbench',          icon: '🛠️', desc: 'Technical problem solver',        category: 'RobOS Dev' },
  { id: 'kube-studio',             label: 'Kube Studio',            icon: '☸️', desc: 'Multi-cluster Kubernetes & GitOps navigator', category: 'RobOS Dev' },
  { id: 'rest-client',             label: 'REST API Client (Bruno)', icon: '⚡', desc: 'Bruno-powered REST API Client & Collection Runner', category: 'RobOS Dev' },
  // People
  { id: 'people-directory',         label: 'People Directory',       icon: '👤', desc: 'Team people directory',             category: 'RobOS People' },
  // AI
  { id: 'agent-scheduler',         label: 'Agent Scheduler',        icon: '⏰', desc: 'Schedule AI agent jobs',          category: 'RobOS AI' },
  { id: 'agents-manager',          label: 'Agents Manager',         icon: '🤖', desc: 'Manage agent sessions',           category: 'RobOS AI' },
  { id: 'context-manager',         label: 'Context Manager',        icon: '📚', desc: 'AI context sources',              category: 'RobOS AI' },
  { id: 'claude-console',          label: 'Claude Console',         icon: '🧬', desc: 'Enhanced Claude Code GUI',        category: 'RobOS AI' },
  { id: 'skills-manager',          label: 'Skills Manager',         icon: '🔮', desc: 'Browse & manage OS skills',       category: 'RobOS AI' },
  { id: 'ai-prompt',               label: 'AI Prompt',              icon: '✨', desc: 'AI-powered OS prompt',            category: 'RobOS AI' },
  // System / Tools
  { id: 'task-manager',            label: 'Task Manager',           icon: '📋', desc: 'View & kill processes',           category: 'RobOS System' },
  { id: 'robos-icons',             label: 'Icon Manager',           icon: '🎨', desc: 'Manage app icons',                category: 'RobOS System' },
  { id: 'robos-logs',              label: 'RobOS Logs',             icon: '📋', desc: 'View all app logs',               category: 'RobOS System' },
  { id: 'robos-desktop',          label: 'RobOS Desktop',          icon: '🖥️',  desc: 'Desktop shell (taskbar)',         category: 'RobOS System' },
];

function mkBin(id, opts = {}) {
  const localBin = path.join(APP_BASE, `${id}/node_modules/electron/dist/electron`);
  const bin = fs.existsSync(localBin) ? localBin : '/usr/bin/electron';
  return {
    bin,
    args: [path.join(APP_BASE, id), '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
    ...opts,
  };
}

// ── APP_BINS ──────────────────────────────────────────────────────────────────

const APP_BINS = {
  // System / always-present
  'notifications':           mkBin('notifications', { keepAlive: true }),
  'robos-toast':             mkBin('robos-toast', { keepAlive: true }),
  'robos-preferences':       mkBin('robos-preferences'),
  'search-index':            mkBin('search-index'),
  'app-launcher':            mkBin('app-launcher'),
  'task-manager':            mkBin('task-manager'),
  'robos-icons':             mkBin('robos-icons'),
  'desktop-widgets':         mkBin('desktop-widgets', { keepAlive: true }),
  // Security
  'pass-manager':            mkBin('pass-manager'),
  'pass-unlock':             mkBin('pass-unlock'),
  'security-setup':          mkBin('security-setup'),
  'robos-onboarding':        mkBin('robos-onboarding'),
  'git-login-manager':       mkBin('git-login-manager', { keepAlive: true }),
  // Development
  'ide-manager':             mkBin('ide-manager'),
  'git-projects':            mkBin('git-projects'),
  'work-journal':            mkBin('work-journal'),
  'workspace-manager':       mkBin('workspace-manager'),
  'lang-manager':            mkBin('lang-manager'),
  'workflow-studio':         mkBin('workflow-studio'),
  'task-servers':            mkBin('task-servers'),
  'tech-workbench':          mkBin('tech-workbench'),
  'kube-studio':             mkBin('kube-studio'),
  'rest-client':             mkBin('rest-client'),
  // AI
  'agent-scheduler':         mkBin('agent-scheduler'),
  'agents-manager':          mkBin('agents-manager'),
  'context-manager':         mkBin('context-manager'),
  'claude-console':          mkBin('claude-console'),
  'skills-manager':          mkBin('skills-manager'),
  'ai-prompt':               mkBin('ai-prompt'),
  // People
  'people-directory':        mkBin('people-directory'),
  // System tools
  'robos-logs':              mkBin('robos-logs'),
  'robos-desktop':           mkBin('robos-desktop', { keepAlive: true }),
};

const running = {};
const KEEP_ALIVE_DELAY_MS = 3000;

// ── Process Management ──────────────────────────────────────────────────────

function launchApp(appId) {
  const cfg = APP_BINS[appId];
  if (!cfg) return { error: `unknown app: ${appId}` };

  const childEnv = { ...process.env };
  if (!childEnv.DISPLAY) childEnv.DISPLAY = ':0';
  if (!childEnv.WAYLAND_DISPLAY && fs.existsSync('/run/user/1000/wayland-0')) {
    childEnv.WAYLAND_DISPLAY = 'wayland-0';
  }
  if (!childEnv.XDG_RUNTIME_DIR) {
    childEnv.XDG_RUNTIME_DIR = '/run/user/1000';
  }
  if (!childEnv.XAUTHORITY) {
    try {
      const glob = fs.readdirSync('/run/user/1000/').find(f => f.startsWith('.mutter-Xwaylandauth'));
      if (glob) childEnv.XAUTHORITY = `/run/user/1000/${glob}`;
    } catch {}
  }

  if (running[appId]) {
    try {
      process.kill(running[appId], 0);
      const probe = spawn(cfg.bin, cfg.args, { detached: true, stdio: 'ignore', env: childEnv });
      probe.unref();
      return { ok: true, pid: running[appId], alreadyRunning: true };
    }
    catch { delete running[appId]; }
  }

  const child = spawn(cfg.bin, cfg.args, { detached: true, stdio: 'ignore', env: childEnv });
  child.unref();
  running[appId] = child.pid;
  console.log(`[dm] launched ${appId} pid=${child.pid}`);
  return { ok: true, pid: child.pid };
}

function killApp(appId) {
  if (!running[appId]) return { ok: false, error: 'not running' };
  try {
    process.kill(running[appId], 'SIGTERM');
    delete running[appId];
    return { ok: true };
  } catch (e) {
    delete running[appId];
    return { ok: false, error: e.message };
  }
}

function getStatus() {
  const statuses = {};
  for (const [id, pid] of Object.entries(running)) {
    try { process.kill(pid, 0); statuses[id] = { pid, alive: true }; }
    catch { statuses[id] = { pid, alive: false }; delete running[id]; }
  }
  return statuses;
}

// ── Watchdog ────────────────────────────────────────────────────────────────

function findPidByBin(bin) {
  try {
    const dirs = fs.readdirSync('/proc').filter(d => /^\d+$/.test(d));
    for (const pid of dirs) {
      try {
        const exe = fs.readlinkSync(`/proc/${pid}/exe`);
        if (exe === bin) return parseInt(pid, 10);
      } catch {}
    }
  } catch {}
  return null;
}

const pausedKeepAlive = new Set();

function startWatchdog() {
  setInterval(() => {
    try {
      Object.entries(APP_BINS).forEach(([appId, cfg]) => {
        if (!cfg.keepAlive || pausedKeepAlive.has(appId)) return;
        let pid = running[appId];
        let alive = false;

        if (pid) {
          try { process.kill(pid, 0); alive = true; } catch { alive = false; }
        }

        if (!alive) {
          const foundPid = findPidByBin(cfg.bin);
          if (foundPid) {
            running[appId] = foundPid;
            alive = true;
          }
        }

        if (!alive) {
          console.log(`[dm] watchdog: ${appId} not running, restarting`);
          delete running[appId];
          launchApp(appId);
        }
      });
    } catch (e) {
      console.error('[dm] watchdog error:', e.message);
    }
  }, KEEP_ALIVE_DELAY_MS);
}

// ── Notifications badge ─────────────────────────────────────────────────────

function getUnreadCount() {
  try {
    if (!fs.existsSync(NOTIF_FILE)) return 0;
    const data = JSON.parse(fs.readFileSync(NOTIF_FILE, 'utf8'));
    return data.filter(n => !n.read).length;
  } catch { return 0; }
}

function rebuildMenu() {
  if (!tray) return;
  const unread = getUnreadCount();
  try {
    tray.setToolTip(unread > 0 ? `RobOS — ${unread} unread notification${unread === 1 ? '' : 's'}` : 'RobOS');
    updateTrayIcon(unread);
  } catch {}
}

function watchNotifications() {
  rebuildMenu();
  const dir = path.dirname(NOTIF_FILE);
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(NOTIF_FILE)) fs.writeFileSync(NOTIF_FILE, '[]');
  fs.watch(NOTIF_FILE, () => rebuildMenu());
}

// ── Pass lock transition monitor ────────────────────────────────────────────

let passLockLastState = null;

function isGpgCacheActive() {
  return new Promise((resolve) => {
    const { exec } = require('child_process');
    exec('gpg-connect-agent "keyinfo --list" /bye 2>/dev/null', { timeout: 8000 }, (err, stdout) => {
      if (err || !stdout) return resolve(false);
      const active = stdout.split('\n').some(l => {
        const parts = l.trim().split(/\s+/);
        return parts[0] === 'S' && parts[1] === 'KEYINFO' && parts[6] === '1';
      });
      resolve(active);
    });
  });
}

function passLockNotificationPending() {
  try {
    const data = fs.existsSync(NOTIF_FILE) ? JSON.parse(fs.readFileSync(NOTIF_FILE, 'utf8')) : [];
    return data.some(n => n.source === 'pass-manager' && n.icon === 'lock' && !n.read);
  } catch { return false; }
}

function firePassLockedNotification() {
  handleNotify({
    title:  'Pass store locked',
    body:   'Agents cannot access secrets until you unlock.',
    icon:   'lock',
    source: 'pass-manager',
    sticky: true,
    category: 'system',
    tier: 'warning',
    action: { type: 'open-app', app: 'pass-unlock', label: 'Click here to unlock' },
  });
}

function dismissPassLockedNotification() {
  try {
    if (!fs.existsSync(NOTIF_FILE)) return;
    const data = JSON.parse(fs.readFileSync(NOTIF_FILE, 'utf8'));
    let changed = false;
    for (const n of data) {
      if (n.source === 'pass-manager' && n.icon === 'lock' && !n.read) {
        n.read = true;
        changed = true;
      }
    }
    if (changed) fs.writeFileSync(NOTIF_FILE, JSON.stringify(data, null, 2));
  } catch {}
}

async function checkPassLockTransition() {
  if (onboardingState && !onboardingState.isOnboardingCompleted()) return;
  const active = await isGpgCacheActive();
  const locked = !active;
  if (passLockLastState === false && locked && !passLockNotificationPending()) {
    firePassLockedNotification();
  }
  if (!locked && passLockNotificationPending()) {
    dismissPassLockedNotification();
  }
  passLockLastState = locked;
}

function startPassLockMonitor() {
  setTimeout(async () => {
    if (onboardingState && !onboardingState.isOnboardingCompleted()) return;
    const active = await isGpgCacheActive();
    const locked = !active;
    passLockLastState = locked;
    if (locked && !passLockNotificationPending()) {
      setTimeout(async () => {
        if (onboardingState && !onboardingState.isOnboardingCompleted()) return;
        const recheckActive = await isGpgCacheActive();
        if (!recheckActive && !passLockNotificationPending()) {
          firePassLockedNotification();
        }
      }, 15000);
    }
    setInterval(checkPassLockTransition, 15000);
  }, 15000);
}

// ── Tray ────────────────────────────────────────────────────────────────────

let tray;
let statusWin = null;

app.whenReady().then(() => {
  app.setName('RobOS');

  try {
    const iconPath = path.join(__dirname, 'tray-icon.png');
    const icon = fs.existsSync(iconPath)
      ? nativeImage.createFromPath(iconPath)
      : nativeImage.createFromDataURL(makeTrayIconDataURL());

    tray = new Tray(icon);
    tray.on('click',        () => launchApp('notifications'));
    tray.on('right-click',  () => launchApp('notifications'));
    tray.on('double-click', () => launchApp('notifications'));
  } catch (err) {
    console.warn('[dm] Warning: Tray could not be initialized:', err.message);
  }

  // Create status window for debug server & testing
  statusWin = new BrowserWindow({
    width: 900, height: 620,
    show: process.env.ROBOS_DEMO_SHOW === '1' || process.env.ROBOS_TEST === '1',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  statusWin.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  if (_debugServer) _debugServer.startDebugServer(statusWin, 19125);

  watchNotifications();
  startSocketServer();
  startPassLockMonitor();

  // Auto-launch keepAlive apps
  setTimeout(() => {
    Object.entries(APP_BINS).forEach(([id, cfg]) => {
      if (cfg.keepAlive) launchApp(id);
    });
    startWatchdog();

    // First boot check: Launch setup wizard if onboarding incomplete
    try {
      if (onboardingState && !onboardingState.isOnboardingCompleted()) {
        launchApp('robos-onboarding');
      }
    } catch {}
  }, 2000);
});

app.on('window-all-closed', (e) => e.preventDefault());

ipcMain.handle('get-apps', () => APPS);
ipcMain.handle('launch-app', (_, appId) => launchApp(appId));
ipcMain.handle('kill-app', (_, appId) => killApp(appId));
ipcMain.handle('get-status', () => getStatus());
ipcMain.handle('get-socket-path', () => SOCKET_PATH);

ipcMain.handle('send-socket-message', async (_, payload) => {
  return new Promise((resolve) => {
    try {
      const client = net.createConnection(SOCKET_PATH, () => {
        client.write(JSON.stringify(payload));
        client.end();
      });
      let raw = '';
      client.on('data', chunk => { raw += chunk; });
      client.on('end', () => {
        try { resolve(JSON.parse(raw)); } catch { resolve({ result: raw }); }
      });
      client.on('error', (err) => resolve({ error: err.message }));
    } catch (e) {
      resolve({ error: e.message });
    }
  });
});

ipcMain.handle('get-notifications', () => {
  try {
    return fs.existsSync(NOTIF_FILE) ? JSON.parse(fs.readFileSync(NOTIF_FILE, 'utf8')) : [];
  } catch { return []; }
});

ipcMain.handle('send-notification', (_, payload) => {
  return handleNotify(payload);
});

ipcMain.handle('clear-notifications', () => {
  try {
    fs.writeFileSync(NOTIF_FILE, '[]');
    rebuildMenu();
    return { ok: true };
  } catch (e) { return { error: e.message }; }
});

ipcMain.handle('get-keepalive-state', () => {
  const keepAliveApps = Object.entries(APP_BINS)
    .filter(([_, cfg]) => cfg.keepAlive)
    .map(([id]) => id);
  return {
    keepAliveApps,
    paused: Array.from(pausedKeepAlive),
    running: getStatus(),
  };
});

ipcMain.handle('toggle-keepalive', (_, appId, paused) => {
  if (paused) {
    pausedKeepAlive.add(appId);
  } else {
    pausedKeepAlive.delete(appId);
  }
  return { ok: true, appId, paused: pausedKeepAlive.has(appId) };
});

ipcMain.handle('get-onboarding-status', () => {
  return onboardingState ? onboardingState.getOnboardingState() : { completed: false };
});

ipcMain.handle('complete-onboarding', (_, details) => {
  return onboardingState ? onboardingState.setOnboardingCompleted(details) : { ok: true };
});

// ── Unix socket server ──────────────────────────────────────────────────────

function startSocketServer() {
  const dir = path.dirname(SOCKET_PATH);
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  if (fs.existsSync(SOCKET_PATH)) {
    try { fs.unlinkSync(SOCKET_PATH); } catch {}
  }
  const server = net.createServer((sock) => {
    let data = '';
    sock.on('error', (err) => {
      // Ignore broken client pipe / connection reset
      if (err.code === 'EPIPE' || err.code === 'ECONNRESET') return;
    });
    sock.on('data', c => { data += c; });
    sock.on('end', () => {
      try {
        if (!data.trim()) { sock.end(); return; }
        const msg = JSON.parse(data.trim());
        let res = null;
        if (msg.ping)                 res = { pong: true, time: Date.now() };
        else if (msg.getApps)         res = { apps: APPS };
        else if (msg.getUnread)       res = { unread: getUnreadCount() };
        else if (msg.launch)          res = launchApp(msg.launch);
        else if (msg.kill)            res = killApp(msg.kill);
        else if (msg.notify)          res = handleNotify(msg.notify);
        else if (msg.status)          res = { status: getStatus() };
        else if (msg.listDesktops)    res = { desktops: listDesktops() };
        else if (msg.pauseKeepAlive)  { pausedKeepAlive.add(msg.pauseKeepAlive); res = { ok: true, paused: msg.pauseKeepAlive }; }
        else if (msg.resumeKeepAlive) { pausedKeepAlive.delete(msg.resumeKeepAlive); res = { ok: true, resumed: msg.resumeKeepAlive }; }

        if (res && !sock.destroyed && sock.writable) {
          sock.write(JSON.stringify(res));
        }
      } catch (e) {
        if (!sock.destroyed && sock.writable) {
          try { sock.write(JSON.stringify({ error: e.message })); } catch {}
        }
      }
      try { sock.end(); } catch {}
    });
  });
  server.on('error', (err) => {
    console.error(`[dm] socket server error: ${err.message}`);
  });
  server.listen(SOCKET_PATH, () => {
    try { fs.chmodSync(SOCKET_PATH, 0o600); } catch {}
    console.log(`[dm] socket ready: ${SOCKET_PATH}`);
  });
}

function handleNotify({ title, body, icon, source, sticky, action, category, tier }) {
  const data = (() => {
    try { return fs.existsSync(NOTIF_FILE) ? JSON.parse(fs.readFileSync(NOTIF_FILE, 'utf8')) : []; }
    catch { return []; }
  })();
  const entry = {
    id: Date.now().toString(),
    title,
    body,
    icon: icon || 'info',
    source: source || 'robos',
    category: category || 'system',
    tier: tier || 'info',
    ts: new Date().toISOString(),
    read: false,
  };
  if (sticky) entry.sticky = true;
  if (action) entry.action = action;
  data.unshift(entry);
  // Keep max 500 entries
  if (data.length > 500) data.length = 500;
  fs.mkdirSync(path.dirname(NOTIF_FILE), { recursive: true });
  fs.writeFileSync(NOTIF_FILE, JSON.stringify(data, null, 2));
  return { ok: true };
}

function updateTrayIcon(unread) {
  const base = path.join(__dirname, 'tray-icon.png');
  if (!fs.existsSync(base)) return;
  if (unread <= 0) {
    try { tray.setImage(nativeImage.createFromPath(base)); } catch {}
    return;
  }

  const label      = unread > 99 ? '99+' : String(unread);
  const badgedPath = `/tmp/robos-tray-badge-${unread}.png`;
  const fontSize   = label.length > 2 ? 6 : label.length > 1 ? 7 : 9;

  const { execFileSync } = require('child_process');
  try {
    execFileSync('convert', [
      base,
      '-fill', '#FF3B30', '-stroke', 'none',
      '-draw', 'circle 17,17 17,10',
      '-fill', 'none', '-stroke', 'white', '-strokewidth', '1',
      '-draw', 'circle 17,17 17,10',
      '-fill', 'white', '-stroke', 'none',
      '-font', 'DejaVu-Sans-Bold', '-pointsize', String(fontSize),
      '-gravity', 'SouthEast', '-annotate', '+0+0', label,
      badgedPath,
    ], { timeout: 2000 });
    tray.setImage(nativeImage.createFromPath(badgedPath));
  } catch (e) {
    console.error('[dm] badge icon failed:', e.message.split('\n')[0]);
  }
}

function makeTrayIconDataURL() {
  return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABYAAAAWCAYAAADEtGw7AAAABmJLR0QA/wD/AP+gvaeTAAABLklEQVQ4je2UMS8EURSFv/eGTUZBIVRiQ3QUFCsR09IpROUnqGS1Go1WVHRa/8HOZqIgiChkpt2NzRYa0a1kszNXI2J2570dhEKc7t17zsnJuzcX/i788IZKeJWXrnKxKtEkSh4AEFVkZbbRT6Kt3T3RVMMDlNQ/RKnhR4cEwcDXjb3wCKGc5okDsk1n/MQmNX+Ff7+k0JdDjqYVJ0gWJ8Fjde7ik4n1zrRboDTsMuUWDBTKRrXRV5jPTJmGZ2qYB6Ao1l/aPLY7tOLExBozNWzDGxSwmVr19q34Bn7ZOIhmcjsYuL3G1WiRWDJ3MxOxXHMWLneXe7dCZAM4T9WenyZSUUZGm13x1oBUmHxH6Pj0Dlh4e92ytVnqJ7EeknfEyTqO3kUhKGc/l+YfP45XiTtR15vgy2UAAAAASUVORK5CYII=';
}

// Export for testing
module.exports = { APPS, APP_BINS, launchApp, killApp, getStatus, handleNotify, getUnreadCount };
