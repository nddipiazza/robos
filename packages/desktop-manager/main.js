// Force GtkStatusIcon instead of AppIndicator so tray click events fire on Linux
if (process.env.XDG_CURRENT_DESKTOP) process.env.XDG_CURRENT_DESKTOP = 'GNOME';

const { app, Tray, Menu, BrowserWindow, ipcMain, nativeImage } = require('electron');
const net  = require('net');
const path = require('path');
const fs   = require('fs');
const { spawn } = require('child_process');

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

// Ensure only one Desktop Manager tray ever exists
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }

const SOCKET_PATH  = `/run/user/${process.getuid()}/robos-dm.sock`;
const APP_BASE     = '/usr/local/share/robos';
const NOTIF_FILE   = path.join(process.env.HOME, '.config', 'robos', 'notifications.json');
const DESKTOPS_DIR = path.join(process.env.HOME, '.config', 'robos', 'desktops');

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
  // People
  { id: 'people-directory',         label: 'People Directory',       icon: '👤', desc: 'Team people directory',             category: 'RobOS People' },
  // AI
  { id: 'agent-scheduler',         label: 'Agent Scheduler',        icon: '⏰', desc: 'Schedule AI agent jobs',          category: 'RobOS AI' },
  { id: 'agents-manager',          label: 'Agents Manager',         icon: '🤖', desc: 'Manage agent sessions',           category: 'RobOS AI' },
  { id: 'context-manager',         label: 'Context Manager',        icon: '📚', desc: 'AI context sources',              category: 'RobOS AI' },
  { id: 'claude-console',          label: 'Claude Console',         icon: '🧬', desc: 'Enhanced Claude Code GUI',       category: 'RobOS AI' },
  // System / Tools
  { id: 'task-manager',            label: 'Task Manager',           icon: '📋', desc: 'View & kill processes',           category: 'RobOS System' },
  { id: 'robos-icons',             label: 'Icon Manager',           icon: '🎨', desc: 'Manage app icons',                category: 'RobOS System' },
  { id: 'robos-logs',              label: 'RobOS Logs',             icon: '📋', desc: 'View all app logs',               category: 'RobOS System' },
];

function mkBin(id, opts = {}) {
  return {
    bin:  path.join(APP_BASE, `${id}/node_modules/electron/dist/electron`),
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
  // AI
  'agent-scheduler':         mkBin('agent-scheduler'),
  'agents-manager':          mkBin('agents-manager'),
  'context-manager':         mkBin('context-manager'),
  'claude-console':          mkBin('claude-console'),
  // People
  'people-directory':        mkBin('people-directory'),
  // System tools
  'robos-logs':              mkBin('robos-logs'),
};

const running = {};
const KEEP_ALIVE_DELAY_MS = 3000;

// ── Process Management ──────────────────────────────────────────────────────

function launchApp(appId) {
  const cfg = APP_BINS[appId];
  if (!cfg) return { error: `unknown app: ${appId}` };

  if (running[appId]) {
    try {
      process.kill(running[appId], 0);
      if (cfg.keepAlive) {
        const probe = spawn(cfg.bin, cfg.args, { detached: true, stdio: 'ignore', env: process.env });
        probe.unref();
      } else {
        try {
          spawn('bash', ['-c',
            `DISPLAY=:0 wmctrl -l -p | awk '$3=="${running[appId]}"{print $1}' | head -1 | xargs -r wmctrl -i -a`
          ], { detached: true, stdio: 'ignore', env: { ...process.env, DISPLAY: ':0' } }).unref();
        } catch {}
      }
      return { ok: true, pid: running[appId], alreadyRunning: true };
    }
    catch { delete running[appId]; }
  }

  const child = spawn(cfg.bin, cfg.args, { detached: true, stdio: 'ignore', env: process.env });
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

function startWatchdog() {
  setInterval(() => {
    try {
      Object.entries(APP_BINS).forEach(([appId, cfg]) => {
        if (!cfg.keepAlive) return;
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
  const unread = getUnreadCount();
  tray.setToolTip(unread > 0 ? `RobOS — ${unread} unread notification${unread === 1 ? '' : 's'}` : 'RobOS');
  updateTrayIcon(unread);
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
  try {
    const { execSync } = require('child_process');
    const out = execSync('gpg-connect-agent "keyinfo --list" /bye 2>/dev/null', { encoding: 'utf8', timeout: 8000 });
    return out.split('\n').some(l => {
      const parts = l.trim().split(/\s+/);
      return parts[0] === 'S' && parts[1] === 'KEYINFO' && parts[6] === '1';
    });
  } catch { return false; }
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

function checkPassLockTransition() {
  const locked = !isGpgCacheActive();
  if (passLockLastState === false && locked && !passLockNotificationPending()) {
    firePassLockedNotification();
  }
  if (!locked && passLockNotificationPending()) {
    dismissPassLockedNotification();
  }
  passLockLastState = locked;
}

function startPassLockMonitor() {
  setTimeout(() => {
    const locked = !isGpgCacheActive();
    passLockLastState = locked;
    if (locked && !passLockNotificationPending()) {
      setTimeout(() => {
        if (!isGpgCacheActive() && !passLockNotificationPending()) {
          firePassLockedNotification();
        }
      }, 15000);
    }
    setInterval(checkPassLockTransition, 5000);
  }, 15000);
}

// ── Tray ────────────────────────────────────────────────────────────────────

let tray;
let statusWin = null;

app.whenReady().then(() => {
  app.setName('RobOS');

  const iconPath = path.join(__dirname, 'tray-icon.png');
  const icon = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath)
    : nativeImage.createFromDataURL(makeTrayIconDataURL());

  tray = new Tray(icon);
  tray.on('click',        () => launchApp('notifications'));
  tray.on('right-click',  () => launchApp('notifications'));
  tray.on('double-click', () => launchApp('notifications'));

  // Create a hidden status window for debug server
  statusWin = new BrowserWindow({
    width: 640, height: 480,
    show: false,
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
  }, 2000);
});

app.on('window-all-closed', (e) => e.preventDefault());

ipcMain.handle('get-apps', () => APPS);
ipcMain.handle('launch-app', (_, appId) => {
  return launchApp(appId);
});
ipcMain.handle('kill-app', (_, appId) => killApp(appId));
ipcMain.handle('get-status', () => getStatus());

// ── Unix socket server ──────────────────────────────────────────────────────

function startSocketServer() {
  if (fs.existsSync(SOCKET_PATH)) fs.unlinkSync(SOCKET_PATH);
  const server = net.createServer((sock) => {
    let data = '';
    sock.on('data', c => { data += c; });
    sock.on('end', () => {
      try {
        const msg = JSON.parse(data.trim());
        if (msg.launch)       sock.write(JSON.stringify(launchApp(msg.launch)));
        if (msg.kill)         sock.write(JSON.stringify(killApp(msg.kill)));
        if (msg.notify)       sock.write(JSON.stringify(handleNotify(msg.notify)));
        if (msg.status)       sock.write(JSON.stringify({ status: getStatus() }));
        if (msg.listDesktops) sock.write(JSON.stringify({ desktops: listDesktops() }));
      } catch (e) { sock.write(JSON.stringify({ error: e.message })); }
      sock.end();
    });
  });
  server.listen(SOCKET_PATH, () => {
    fs.chmodSync(SOCKET_PATH, 0o600);
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
