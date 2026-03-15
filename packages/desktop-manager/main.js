// Force GtkStatusIcon instead of AppIndicator so tray click events fire on Linux
if (process.env.XDG_CURRENT_DESKTOP) process.env.XDG_CURRENT_DESKTOP = 'Openbox';

const { app, Tray, Menu, ipcMain, nativeImage } = require('electron');
const net  = require('net');
const path = require('path');
const fs   = require('fs');
const { spawn } = require('child_process');

// Ensure only one Desktop Manager tray ever exists
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }

const SOCKET_PATH  = `/run/user/${process.getuid()}/robos-dm.sock`;
const APP_BASE     = '/usr/local/share/robos';
const NOTIF_FILE   = path.join(process.env.HOME, '.config', 'robos', 'notifications.json');
const DESKTOPS_DIR = path.join(process.env.HOME, '.config', 'robos', 'desktops');

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

const APPS = [
  // Notifications
  { id: 'notifications',           label: 'Notifications',          icon: '🔔', desc: 'System notifications',            category: 'RobOS System' },
  // Security
  { id: 'pass-manager',            label: 'Pass Manager',           icon: '🔑', desc: 'Password store',                  category: 'RobOS Security' },
  { id: 'pass-unlock',             label: 'Pass Unlock',            icon: '🔓', desc: 'Unlock password store',           category: 'RobOS Security' },
  { id: 'robos-auth',              label: 'RobOS Auth',             icon: '🔐', desc: 'OAuth providers & identity',      category: 'RobOS Security' },
  { id: 'security-setup',          label: 'Security Setup',         icon: '🛡️', desc: 'GPG & pass initializer',          category: 'RobOS Security' },
  { id: 'git-login-manager',       label: 'Git Login Manager',      icon: '🐙', desc: 'Monitor GitHub auth (keepAlive)', category: 'RobOS Security' },
  { id: 'github-login-manager',    label: 'GitHub Login Manager',   icon: '🐱', desc: 'GitHub auth monitor',             category: 'RobOS Security' },
  // Development
  { id: 'ide-manager',             label: 'Development Apps and IDEs', icon: '💻', desc: 'Manage development apps and IDEs',                     category: 'RobOS Dev' },
  { id: 'git-projects',            label: 'Git Projects',           icon: '🌿', desc: 'Git workspaces',                  category: 'RobOS Dev' },
  { id: 'work-journal',            label: 'Work Journal',           icon: '📓', desc: 'Developer journal',               category: 'RobOS Dev' },
  { id: 'workspace-manager',       label: 'Workspace Manager',      icon: '🗂️', desc: 'Browse IDE workspaces',           category: 'RobOS Dev' },
  { id: 'lang-manager',            label: 'Language Manager',       icon: '🌐', desc: 'Dev language & runtime manager',  category: 'RobOS Dev' },
  { id: 'search-index',            label: 'Search Index',           icon: '🔍', desc: 'File system search index',        category: 'RobOS Dev' },
  { id: 'workflow-studio',          label: 'Workflow Studio',        icon: '🎯', desc: 'Workflow & issue tracker',        category: 'RobOS Dev' },
  { id: 'task-servers',            label: 'Task Servers',           icon: '🔗', desc: 'Jira/GitHub connections',         category: 'RobOS Dev' },
  { id: 'tech-workbench',          label: 'TPS Workbench',          icon: '🛠️', desc: 'Technical problem solver',        category: 'RobOS Dev' },
  // AI
  { id: 'agent-scheduler',         label: 'Agent Scheduler',        icon: '⏰', desc: 'Schedule AI agent jobs',          category: 'RobOS AI' },
  { id: 'agents-manager',          label: 'Agents Manager',         icon: '🤖', desc: 'Manage agent sessions',           category: 'RobOS AI' },
  { id: 'context-manager',         label: 'Context Manager',        icon: '📚', desc: 'AI context sources',              category: 'RobOS AI' },
  { id: 'copilot-session-viewer',  label: 'Copilot Sessions',       icon: '🕵️', desc: 'Browse Copilot session history',  category: 'RobOS AI' },
  { id: 'agent-monitor',           label: 'Agent Monitor',          icon: '📡', desc: 'Monitor AI agent processes',       category: 'RobOS AI' },
  { id: 'claude-console',          label: 'Claude Console',         icon: '🧬', desc: 'Enhanced Claude Code GUI',       category: 'RobOS AI' },
  // People / Team
  { id: 'people-directory',        label: 'People Directory',       icon: '👥', desc: 'Team directory',                  category: 'RobOS People' },
  { id: 'group-dev-settings',      label: 'Group Dev Settings',     icon: '🏢', desc: 'Group developer settings',       category: 'RobOS People' },
  // System / Tools
  { id: 'task-manager',            label: 'Task Manager',           icon: '📋', desc: 'View & kill processes',           category: 'RobOS System' },
  { id: 'robos-icons',             label: 'Icon Manager',           icon: '🎨', desc: 'Manage app icons',                category: 'RobOS System' },
];

function mkBin(id, opts = {}) {
  return {
    bin:  path.join(APP_BASE, `${id}/node_modules/electron/dist/electron`),
    args: [path.join(APP_BASE, id), '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
    ...opts,
  };
}

const APP_BINS = {
  // System / always-present
  'notifications':           mkBin('notifications', { keepAlive: true }),
  'robos-toast':             mkBin('robos-toast', { keepAlive: true }),
  'app-launcher':            mkBin('app-launcher'),
  'task-manager':            mkBin('task-manager'),
  'robos-icons':             mkBin('robos-icons'),
  // Security
  'pass-manager':            mkBin('pass-manager'),
  'pass-unlock':             mkBin('pass-unlock'),
  'robos-auth':              mkBin('robos-auth'),
  'security-setup':          mkBin('security-setup'),
  'git-login-manager':       mkBin('git-login-manager', { keepAlive: true }),
  'github-login-manager':    mkBin('github-login-manager'),
  // Development
  'ide-manager':             mkBin('ide-manager'),
  'git-projects':            mkBin('git-projects'),
  'work-journal':            mkBin('work-journal'),
  'workspace-manager':       mkBin('workspace-manager'),
  'lang-manager':            mkBin('lang-manager'),
  'search-index':            mkBin('search-index'),
  'workflow-studio':         mkBin('workflow-studio'),
  'task-servers':            mkBin('task-servers'),
  'tech-workbench':          mkBin('tech-workbench'),
  // AI
  'agent-scheduler':         mkBin('agent-scheduler'),
  'agents-manager':          mkBin('agents-manager'),
  'context-manager':         mkBin('context-manager'),
  'copilot-session-viewer':  mkBin('copilot-session-viewer'),
  'agent-monitor':           mkBin('agent-monitor'),
  'claude-console':          mkBin('claude-console'),
  // People / Team
  'people-directory':        mkBin('people-directory'),
  'group-dev-settings':      mkBin('group-dev-settings'),
};

const running = {};
const KEEP_ALIVE_DELAY_MS = 3000;

function launchApp(appId) {
  const cfg = APP_BINS[appId];
  if (!cfg) return { error: `unknown app: ${appId}` };

  if (running[appId]) {
    try {
      process.kill(running[appId], 0);
      // For keepAlive apps the window starts hidden — spawn a second instance so
      // Electron's single-instance lock fires 'second-instance' on the running
      // process, which calls showWindow().
      if (cfg.keepAlive) {
        const probe = spawn(cfg.bin, cfg.args, { detached: true, stdio: 'ignore', env: process.env });
        probe.unref();
      } else {
        // Raise/focus the existing window via wmctrl
        try {
          const { execSync } = require('child_process');
          execSync(`wmctrl -i -a $(wmctrl -l | awk '{print $1}' | head -1) || wmctrl -a ""`,
            { env: { ...process.env, DISPLAY: process.env.DISPLAY || ':0' }, stdio: 'ignore' });
          // Try by pid
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

// Poll keepAlive apps every 3s; restart if their process is gone.
// Uses /proc scan to survive DM restarts (running map reset).
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

        // If tracked PID is gone, scan /proc for the binary before relaunching.
        // This prevents a restart loop when the DM itself restarted but the app survived.
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

// ── Notifications badge ───────────────────────────────────────────────────────
function getUnreadCount() {
  try {
    if (!fs.existsSync(NOTIF_FILE)) return 0;
    const data = JSON.parse(fs.readFileSync(NOTIF_FILE, 'utf8'));
    return data.filter(n => !n.read).length;
  } catch { return 0; }
}

function buildWorkspaceItems() {
  try {
    const { execSync } = require('child_process');
    const out = execSync('wmctrl -d', { env: { ...process.env, DISPLAY: process.env.DISPLAY || ':1' } }).toString();
    return out.trim().split('\n').map(line => {
      const parts = line.trim().split(/\s+/);
      const idx   = parseInt(parts[0]);
      const active = parts[1] === '*';
      const name  = parts[parts.length - 1];
      return {
        label: `${active ? '▶' : '  '}  ${name}`,
        click: () => {
          const { execSync: ex } = require('child_process');
          try { ex(`wmctrl -s ${idx}`, { env: { ...process.env, DISPLAY: process.env.DISPLAY || ':1' } }); }
          catch (e) { console.error('[dm] wmctrl switch failed:', e.message); }
        },
      };
    });
  } catch (e) {
    console.error('[dm] wmctrl failed:', e.message);
    return [];
  }
}

function rebuildMenu() {
  const unread = getUnreadCount();
  tray.setToolTip(unread > 0 ? `RobOS — ${unread} unread notification${unread === 1 ? '' : 's'}` : 'RobOS');
  updateTrayIcon(unread);
}

function watchNotifications() {
  // Initial build
  rebuildMenu();
  // Watch for changes to notifications file
  const dir = path.dirname(NOTIF_FILE);
  fs.mkdirSync(dir, { recursive: true });
  // Touch file if missing so watch doesn't fail
  if (!fs.existsSync(NOTIF_FILE)) fs.writeFileSync(NOTIF_FILE, '[]');
  fs.watch(NOTIF_FILE, () => rebuildMenu());
}

// ── Pass lock transition monitor ──────────────────────────────────────────────
// Polls GPG agent cache every 15s. Fires a notification only on the
// unlocked→locked transition. Since the notification is sticky (persists
// until dismissed), never fires a second one while an unread pass-locked
// notification already exists in the feed.
let passLockLastState = null; // null = unknown (startup), true = locked, false = unlocked

function isGpgCacheActive() {
  // keyinfo --list returns lines like:
  //   S KEYINFO <grip> <type> <serial> <id> <cached> <prot> <fpr> ...
  // Field index 6 (0-based) is the cached flag: '1' = cached, '-' or '0' = not.
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
    action: { type: 'open-app', app: 'pass-unlock', label: 'Click here to unlock →' },
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
  // Auto-dismiss the "pass locked" notification once the store is unlocked
  if (!locked && passLockNotificationPending()) {
    dismissPassLockedNotification();
  }
  passLockLastState = locked;
}

function startPassLockMonitor() {
  // Wait 15s for GPG agent to fully initialise before sampling initial state.
  // Then re-confirm once more before firing to avoid false positives on login.
  setTimeout(() => {
    const locked = !isGpgCacheActive();
    passLockLastState = locked;
    if (locked && !passLockNotificationPending()) {
      // Double-check after another 15s to avoid startup false positives
      setTimeout(() => {
        if (!isGpgCacheActive() && !passLockNotificationPending()) {
          firePassLockedNotification();
        }
      }, 15000);
    }
    setInterval(checkPassLockTransition, 5000);
  }, 15000);
}

// ── Claude Code login monitor ────────────────────────────────────────────────
// Checks if Claude Code CLI is installed but not logged in. Fires a sticky
// notification prompting the user to log in. Auto-dismisses once logged in.

function isClaudeInstalled() {
  try {
    const { execSync } = require('child_process');
    execSync('which claude 2>/dev/null', { timeout: 3000 });
    return true;
  } catch { return false; }
}

function isClaudeLoggedIn() {
  try {
    const { execSync } = require('child_process');
    const out = execSync('claude auth status 2>/dev/null', { encoding: 'utf8', timeout: 8000 });
    const status = JSON.parse(out);
    return status.loggedIn === true;
  } catch { return false; }
}

function claudeLoginNotificationPending() {
  try {
    const data = fs.existsSync(NOTIF_FILE) ? JSON.parse(fs.readFileSync(NOTIF_FILE, 'utf8')) : [];
    return data.some(n => n.source === 'claude-code' && n.icon === 'lock' && !n.read);
  } catch { return false; }
}

function fireClaudeLoginNotification() {
  handleNotify({
    title:  'Claude Code not logged in',
    body:   'Claude CLI is installed but not authenticated. Click to log in.',
    icon:   'lock',
    source: 'claude-code',
    sticky: true,
    action: { type: 'open-app', app: 'claude-login', label: 'Log in to Claude Code →' },
  });
}

function dismissClaudeLoginNotification() {
  try {
    if (!fs.existsSync(NOTIF_FILE)) return;
    const data = JSON.parse(fs.readFileSync(NOTIF_FILE, 'utf8'));
    let changed = false;
    for (const n of data) {
      if (n.source === 'claude-code' && n.icon === 'lock' && !n.read) {
        n.read = true;
        changed = true;
      }
    }
    if (changed) fs.writeFileSync(NOTIF_FILE, JSON.stringify(data, null, 2));
  } catch {}
}

function checkClaudeLoginState() {
  if (!isClaudeInstalled()) return;
  const loggedIn = isClaudeLoggedIn();
  if (!loggedIn && !claudeLoginNotificationPending()) {
    fireClaudeLoginNotification();
  }
  if (loggedIn && claudeLoginNotificationPending()) {
    dismissClaudeLoginNotification();
  }
}

function startClaudeLoginMonitor() {
  // Wait 20s after login for desktop to settle, then check every 30s
  setTimeout(() => {
    checkClaudeLoginState();
    setInterval(checkClaudeLoginState, 30000);
  }, 20000);
}

// ── Agent tray icons ─────────────────────────────────────────────────────────
let claudeTray = null;
let copilotTray = null;

function isCopilotInstalled() {
  const { execSync } = require('child_process');
  // Check for standalone copilot binary
  try {
    execSync('which copilot 2>/dev/null', { timeout: 3000 });
    return true;
  } catch {}
  // Check for gh copilot extension
  try {
    execSync('which gh 2>/dev/null', { timeout: 3000 });
    const out = execSync('gh extension list 2>/dev/null', { encoding: 'utf8', timeout: 5000 });
    if (out.includes('copilot')) return true;
  } catch {}
  return false;
}

function countRunningAgents(provider) {
  let count = 0;
  try {
    const dirs = fs.readdirSync('/proc').filter(d => /^\d+$/.test(d));
    for (const pid of dirs) {
      try {
        const raw = fs.readFileSync(`/proc/${pid}/cmdline`);
        const args = raw.toString().split('\0').filter(Boolean);
        if (!args.length) continue;
        const exe = args[0] || '';
        if (provider === 'claude-code') {
          if (exe.endsWith('/claude') || exe === 'claude') count++;
        } else if (provider === 'github-copilot') {
          if ((exe.endsWith('/gh') || exe === 'gh') && args.includes('copilot')) count++;
          else if (exe.endsWith('/copilot') || exe === 'copilot') count++;
        }
      } catch {}
    }
  } catch {}
  return count;
}

function getClaudeTrayBaseSvg() {
  // Anthropic Claude ink-splotch / organic blob mark on dark rounded square
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
    <rect width="24" height="24" rx="5" fill="#1a1a2e"/>
    <path d="M12 4C8.5 4 5.5 6 5 9c-.3 2 .5 4 2 5.5 1 1 1.5 2.5 1 4-.2.8.4 1.5 1.2 1.5h5.6c.8 0 1.4-.7 1.2-1.5-.5-1.5 0-3 1-4C18.5 13 19.3 11 19 9c-.5-3-3.5-5-7-5z" fill="#D97706"/>
    <ellipse cx="10" cy="9.5" rx="1.2" ry="1.5" fill="#1a1a2e" opacity="0.3"/>
    <ellipse cx="14.5" cy="11" rx="1" ry="1.2" fill="#1a1a2e" opacity="0.2"/>
  </svg>`;
}

function getCopilotTrayBaseSvg() {
  // GitHub Copilot ghost face — purple on dark circle
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
    <rect width="24" height="24" rx="5" fill="#1a1a2e"/>
    <ellipse cx="12" cy="10" rx="7" ry="6.5" fill="#6e40c9"/>
    <ellipse cx="12" cy="10.5" rx="5" ry="5" fill="#1a1a2e"/>
    <circle cx="10" cy="10" r="1.5" fill="#fff"/>
    <circle cx="14" cy="10" r="1.5" fill="#fff"/>
    <circle cx="10.3" cy="10.3" r="0.7" fill="#6e40c9"/>
    <circle cx="14.3" cy="10.3" r="0.7" fill="#6e40c9"/>
    <path d="M5 17q1-2 2 0t2 0 2 0 2 0 2 0 2 0l0 3q-3 2-6 2t-6-2z" fill="#6e40c9"/>
  </svg>`;
}

function createAgentTrayIcon(provider, count) {
  const svgPath = `/tmp/robos-${provider}-tray-base.svg`;
  const pngPath = `/tmp/robos-${provider}-tray.png`;
  const svg = provider === 'claude-code' ? getClaudeTrayBaseSvg() : getCopilotTrayBaseSvg();
  fs.writeFileSync(svgPath, svg);

  const { execFileSync } = require('child_process');
  try {
    execFileSync('convert', ['-background', 'none', `svg:${svgPath}`, pngPath], { timeout: 3000 });
  } catch (e) {
    console.error(`[dm] agent tray icon convert failed for ${provider}:`, e.message.split('\n')[0]);
    return svgPath; // fallback
  }

  if (count > 0) {
    const badgedPath = `/tmp/robos-${provider}-tray-badged.png`;
    const label = count > 99 ? '99+' : String(count);
    const fontSize = label.length > 2 ? 6 : label.length > 1 ? 7 : 9;
    try {
      execFileSync('convert', [
        pngPath,
        '-fill', '#56d364', '-stroke', 'none',
        '-draw', 'circle 18,18 18,13',
        '-fill', 'white', '-stroke', 'none',
        '-font', 'DejaVu-Sans-Bold', '-pointsize', String(fontSize),
        '-gravity', 'SouthEast', '-annotate', '+0+0', label,
        badgedPath,
      ], { timeout: 2000 });
      return badgedPath;
    } catch (e) {
      console.error(`[dm] agent tray badge failed for ${provider}:`, e.message.split('\n')[0]);
      return pngPath;
    }
  }

  return pngPath;
}

function buildAgentTrayMenu(provider, count) {
  const name = provider === 'claude-code' ? 'Claude Code' : 'GitHub Copilot';
  const items = [
    { label: name, enabled: false },
  ];
  if (count > 0) {
    items.push({ label: `${count} agent${count === 1 ? '' : 's'} running`, enabled: false });
  }
  items.push({ type: 'separator' });
  items.push({ label: 'Open Agent Monitor', click: () => launchApp('agent-monitor') });
  return Menu.buildFromTemplate(items);
}

function updateAgentTrays() {
  // Claude
  try {
    if (isClaudeInstalled()) {
      const count = countRunningAgents('claude-code');
      const iconPath = createAgentTrayIcon('claude-code', count);
      if (!claudeTray) {
        claudeTray = new Tray(nativeImage.createFromPath(iconPath));
      } else {
        claudeTray.setImage(nativeImage.createFromPath(iconPath));
      }
      claudeTray.setToolTip(count > 0 ? `Claude Code — ${count} running` : 'Claude Code');
      claudeTray.setContextMenu(buildAgentTrayMenu('claude-code', count));
    } else if (claudeTray) {
      claudeTray.destroy();
      claudeTray = null;
    }
  } catch (e) {
    console.error('[dm] claude tray error:', e.message);
  }

  // Copilot
  try {
    if (isCopilotInstalled()) {
      const count = countRunningAgents('github-copilot');
      const iconPath = createAgentTrayIcon('github-copilot', count);
      if (!copilotTray) {
        copilotTray = new Tray(nativeImage.createFromPath(iconPath));
      } else {
        copilotTray.setImage(nativeImage.createFromPath(iconPath));
      }
      copilotTray.setToolTip(count > 0 ? `GitHub Copilot — ${count} running` : 'GitHub Copilot');
      copilotTray.setContextMenu(buildAgentTrayMenu('github-copilot', count));
    } else if (copilotTray) {
      copilotTray.destroy();
      copilotTray = null;
    }
  } catch (e) {
    console.error('[dm] copilot tray error:', e.message);
  }
}

function startAgentTrayMonitor() {
  // Initial check after a short delay
  setTimeout(() => {
    updateAgentTrays();
    // Then poll every 5 seconds
    setInterval(updateAgentTrays, 5000);
  }, 5000);
}

// ── Tray ──────────────────────────────────────────────────────────────────────
let tray;

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

  watchNotifications();
  startSocketServer();
  startPassLockMonitor();
  startClaudeLoginMonitor();
  startAgentTrayMonitor();

  // Auto-launch keepAlive apps on startup, then watchdog keeps them alive
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
  launcherWin?.hide();
  return launchApp(appId);
});

// ── Unix socket server ─────────────────────────────────────────────────────────
function startSocketServer() {
  if (fs.existsSync(SOCKET_PATH)) fs.unlinkSync(SOCKET_PATH);
  const server = net.createServer((sock) => {
    let data = '';
    sock.on('data', c => { data += c; });
    sock.on('end', () => {
      try {
        const msg = JSON.parse(data.trim());
        if (msg.launch)      sock.write(JSON.stringify(launchApp(msg.launch)));
        if (msg.notify)      sock.write(JSON.stringify(handleNotify(msg.notify)));
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

function handleNotify({ title, body, icon, source, sticky, action }) {
  const data = (() => {
    try { return fs.existsSync(NOTIF_FILE) ? JSON.parse(fs.readFileSync(NOTIF_FILE, 'utf8')) : []; }
    catch { return []; }
  })();
  const entry = { id: Date.now().toString(), title, body, icon: icon || 'info', source: source || 'robos', ts: new Date().toISOString(), read: false };
  if (sticky) entry.sticky = true;
  if (action) entry.action = action;
  data.unshift(entry);
  fs.mkdirSync(path.dirname(NOTIF_FILE), { recursive: true });
  fs.writeFileSync(NOTIF_FILE, JSON.stringify(data, null, 2));
  return { ok: true };
}

function updateTrayIcon(unread) {
  const base = path.join(__dirname, 'tray-icon.png');
  if (unread <= 0) {
    try { tray.setImage(nativeImage.createFromPath(base)); } catch {}
    return;
  }

  const label      = unread > 99 ? '99+' : String(unread);
  const badgedPath = `/tmp/robos-tray-badge-${unread}.png`;
  // Badge circle: 7px radius at bottom-right corner (cx=17, cy=17)
  // Font size scales down for 3-char labels
  const fontSize   = label.length > 2 ? 6 : label.length > 1 ? 7 : 9;

  const { execFileSync } = require('child_process');
  try {
    execFileSync('convert', [
      base,
      // Vivid red filled circle, no stroke
      '-fill', '#FF3B30', '-stroke', 'none',
      '-draw', 'circle 17,17 17,10',
      // White ring border for contrast against the bell
      '-fill', 'none', '-stroke', 'white', '-strokewidth', '1',
      '-draw', 'circle 17,17 17,10',
      // White bold count text
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
