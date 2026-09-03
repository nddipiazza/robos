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

const { app, BrowserWindow, ipcMain, screen, dialog, globalShortcut } = require('electron');
const path   = require('path');
const fs     = require('fs');
const net    = require('net');
const { spawn, exec } = require('child_process');

try {
  const { setupGlobalErrorHandlers } = require('/usr/local/share/robos/robos-lib/logger');
  setupGlobalErrorHandlers('robos-desktop', dialog);
} catch {
  try {
    const { setupGlobalErrorHandlers } = require('../robos-lib/logger');
    setupGlobalErrorHandlers('robos-desktop', dialog);
  } catch {}
}


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
  const libPaths = [
    process.env.ROBOS_LIB_PATH && path.join(process.env.ROBOS_LIB_PATH, 'dom-snapshot'),
    path.resolve(__dirname, '..', 'robos-lib', 'dom-snapshot'),
    '/usr/local/share/robos/robos-lib/dom-snapshot',
  ].filter(Boolean);
  for (const p of libPaths) {
    try { debugServer = require(p); break; } catch {}
  }
} catch {}

// ── Constants ─────────────────────────────────────────────────────────────────
const APP_BASE      = '/usr/local/share/robos';
const CONFIG_DIR    = path.join(process.env.HOME || '/home/robos', '.config', 'robos');
const PINNED_FILE   = path.join(CONFIG_DIR, 'desktop-pinned.json');
const SOCKET_PATH   = `/run/user/${process.getuid()}/robos-dm.sock`;

const MENUBAR_H = 28;   // thin top menu bar (macOS menu bar style)
const DOCK_H    = 72;   // bottom dock height

// ── Module-level state for dock (must be accessible from IPC handlers before ready-to-show) ──
const BASE_DOCK_ZONE = DOCK_H + 16;
let dockZone = BASE_DOCK_ZONE;
let dockRect = null;
let dragLock = false;
let menuOpen = false;  // true while any popup menu is visible — disables click-through

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
  if (process.env.ROBOS_SCENARIO || process.env.ROBOS_TEST_MODE || process.env.ROBOS_HEADLESS) return;
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
async function restoreGnomePanelAndQuit() {
  if (process.env.ROBOS_SCENARIO || process.env.ROBOS_TEST_MODE || process.env.ROBOS_HEADLESS) {
    process.env.ROBOS_DESKTOP_QUIT = '1';
    app.quit();
    return;
  }
  try {
    await dmRequest({ pauseKeepAlive: 'robos-desktop' });
    console.log('[robos-desktop] paused DM watchdog for robos-desktop');
  } catch (e) {
    console.warn('[robos-desktop] failed to pause DM watchdog:', e.message);
  }
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
  const localPkg = path.resolve(__dirname, '..', id);
  const baseDir = fs.existsSync(localPkg) ? path.resolve(__dirname, '..') : APP_BASE;
  const appDir = path.join(baseDir, id);

  const electronCandidates = [
    path.join(appDir, 'node_modules', 'electron', 'dist', 'electron'),
    path.join(appDir, 'node_modules', '.bin', 'electron'),
    path.join(__dirname, 'node_modules', 'electron', 'dist', 'electron'),
    path.join(__dirname, 'node_modules', '.bin', 'electron'),
    'electron',
  ];
  const bin = electronCandidates.find(c => fs.existsSync(c)) || 'electron';
  return {
    bin,
    args: [appDir, '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  };
}

function launchAppDirect(appId) {
  const cfg = mkBin(appId);
  const uid = process.getuid ? process.getuid() : null;
  const env = { ...process.env, DISPLAY: process.env.DISPLAY || ':0' };
  if (!env.DBUS_SESSION_BUS_ADDRESS && uid !== null) {
    env.DBUS_SESSION_BUS_ADDRESS = `unix:path=/run/user/${uid}/bus`;
  }
  const child = spawn(cfg.bin, cfg.args, {
    detached: true,
    stdio: 'ignore',
    env,
  });
  child.unref();
  console.log(`[robos-desktop] launched ${appId} pid=${child.pid}`);
}

const _testHistory = { launchedApps: [], executedActions: [] };

function launchApp(appId) {
  _testHistory.launchedApps.push(appId);
  launchAppDirect(appId);
  return { ok: true, appId };
}

/**
 * Scan /proc to find running RobOS apps by matching their command-line
 * against /usr/local/share/robos/<appId>. This works for any app
 * regardless of how it was launched (DM, direct spawn, or manual).
 */
function getRunningApps() {
  const result = {};
  try {
    const pids = fs.readdirSync('/proc').filter(d => /^\d+$/.test(d));
    for (const pid of pids) {
      try {
        const cmdline = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8');
        // cmdline is NUL-separated; check if it references a robos app path
        const m = cmdline.match(/\/usr\/local\/share\/robos\/([^/\0]+)/);
        if (m) {
          const appId = m[1];
          // Skip internal system/infra apps
          if (appId === 'robos-lib' || appId === 'robos-icons') continue;
          if (!result[appId]) {
            result[appId] = { pid: parseInt(pid, 10), alive: true };
          }
        }
      } catch {}
    }
  } catch (e) {
    console.warn('[robos-desktop] proc scan error:', e.message);
  }
  return result;
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

// ── App registry — 4 pinned apps shown in the dock ────────────────────────────
// Keep this short. Full app list lives in app-launcher.
const APP_META = {
  'dev-central':  { label: 'Dev Central', icon: '🏠', desc: 'Daily dashboard'          },
  'git-projects': { label: 'Git',         icon: '🌿', desc: 'Git workspaces'           },
  'ai-prompt':    { label: 'AI Prompt',   icon: '✨', desc: 'AI-powered OS prompt'     },
};

// ── X11 window list ────────────────────────────────────────────────────────────
// Maps WM_CLASS instance prefix → { label, icon } for non-RobOS apps
const WM_CLASS_META = {
  'gnome-terminal-server': { label: 'Terminal',  icon: '🖥️'  },
  'gnome-terminal':        { label: 'Terminal',  icon: '🖥️'  },
  tilix:                   { label: 'Tilix',     icon: '🖥️'  },
  code:                    { label: 'VS Code',   icon: '💻'   },
  'code-oss':              { label: 'VS Code',   icon: '💻'   },
  'intellij-idea':         { label: 'IntelliJ',  icon: '🧠'   },
  'idea':                  { label: 'IntelliJ',  icon: '🧠'   },
  firefox:                 { label: 'Firefox',   icon: '🦊'   },
  navigator:               { label: 'Firefox',   icon: '🦊'   }, // Firefox snap WM_CLASS
  chromium:                { label: 'Chromium',  icon: '🌐'   },
  'google-chrome':         { label: 'Chrome',    icon: '🌐'   },
  nautilus:                { label: 'Files',     icon: '📁'   },
  gedit:                   { label: 'Text Edit', icon: '📝'   },
  eog:                     { label: 'Image',     icon: '🖼️'   },
  evince:                  { label: 'PDF',       icon: '📄'   },
  'gnome-calculator':      { label: 'Calculator', icon: '🔢' },
  calculator:              { label: 'Calculator', icon: '🔢' },
};

// Ignore these in the window taskbar (our own shell + background daemons)
const WM_CLASS_IGNORE = new Set([
  'robos-desktop',              // taskbar shell itself
  'robos-desktop-dashboard',    // legacy desktop-dashboard alias
  'robos-app-launcher',         // app launcher (opened via taskbar button)
  'desktop-widgets', 'robos-toast',
  'gjs',                        // GNOME shell extensions
  'electron',                   // Electron runtime & helper windows
  'chromium clipboard',
]);

// ── Icon helpers ──────────────────────────────────────────────────────────────

// Cache of appId → SVG data URI (RobOS apps)
const iconCache = {};

function getRobosIconDataUri(appId) {
  if (!appId) return null;
  if (iconCache[appId] !== undefined) return iconCache[appId];
  const paths = [
    `/usr/local/share/robos/${appId}/icon.svg`,
    `/usr/local/share/robos/robos-${appId}/icon.svg`,
  ];
  for (const p of paths) {
    if (fs.existsSync(p)) {
      try {
        const svg = fs.readFileSync(p, 'utf-8');
        iconCache[appId] = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
        return iconCache[appId];
      } catch {}
    }
  }
  try {
    let getIcon = null;
    try { getIcon = require('/usr/local/share/robos/robos-icons').getIcon; } catch {}
    if (!getIcon) {
      try { getIcon = require('../robos-icons').getIcon; } catch {}
    }
    if (getIcon) {
      const iconObj = getIcon(appId) || getIcon(`robos-${appId}`);
      const svg = typeof iconObj === 'string' ? iconObj : iconObj?.iconSvg;
      if (svg) {
        iconCache[appId] = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
        return iconCache[appId];
      }
    }
  } catch {}

  iconCache[appId] = null;
  return iconCache[appId];
}

// Maps instance/wmclass key → icon name (from .desktop files)
let desktopIconNameMap = null;
let desktopNameMap = null;
// Maps instance/wmclass key → [{name, exec}] (desktop actions like "New Window")
let desktopActionsMap = null;
// Maps instance/wmclass key → exec command string (for launching pinned apps)
let desktopExecMap = null;
// Maps icon name (lowercase) → best file path (SVG > large PNG > small PNG)
let systemIconIndex = null;
// Maps icon name → data URI (lazy-loaded)
const systemIconDataUriCache = {};

/**
 * Pre-scan ALL icon directories into a name→path index.
 * Priority: SVG (scalable) > 256px PNG > 128px > 96px > 64px > 48px > 32px.
 * Covers every installed theme automatically.
 */
function getSearchHomes() {
  const list = [process.env.HOME, process.env.REAL_HOME, process.env.ROBOS_HOST_HOME, '/home/robos', '/home/ndipiazza'];
  if (process.env.USER) list.push(`/home/${process.env.USER}`);
  return Array.from(new Set(list.filter(Boolean)));
}

function buildSystemIconIndex() {
  if (systemIconIndex !== null) return;
  systemIconIndex = {};
  const SIZE_ORDER = [
    'scalable', '512x512', '256x256', '192x192', '128x128', '96x96', '64x64', '48x48', '32x32', '24x24', '16x16',
  ];
  // Preferred themes first — their icons win over accessibility/fallback themes
  const PREFERRED = ['Yaru', 'hicolor', 'Adwaita', 'gnome', 'Papirus', 'breeze', 'elementary'];
  const DEPRIORITIZED = new Set(['HighContrast', 'HighContrastInverse', 'locolor', 'Mono', 'Humanity']);
  const homes = getSearchHomes();
  const iconBaseDirs = [
    '/usr/share/icons',
    '/usr/local/share/icons',
    '/var/lib/snapd/desktop/icons',
    ...homes.map(h => path.join(h, '.local/share/icons')),
  ];

  const allThemes = [];
  for (const base of iconBaseDirs) {
    try { for (const t of fs.readdirSync(base)) allThemes.push({ base, name: t }); } catch {}
  }
  const preferred = allThemes.filter(t => PREFERRED.includes(t.name));
  const normal    = allThemes.filter(t => !PREFERRED.includes(t.name) && !DEPRIORITIZED.has(t.name));
  const low       = allThemes.filter(t => DEPRIORITIZED.has(t.name));
  const themeDirs = [...preferred, ...normal, ...low].map(t => path.join(t.base, t.name));

  const SUBDIRS = ['apps', 'categories', 'status', 'devices', 'mimetypes', 'places', 'actions', 'emblems'];

  // Iterate sizes first so SVG wins over PNG regardless of theme
  for (const size of SIZE_ORDER) {
    const isSvg = size === 'scalable';
    for (const themeDir of themeDirs) {
      for (const sub of SUBDIRS) {
        const appsDir = path.join(themeDir, size, sub);
        let files;
        try { files = fs.readdirSync(appsDir); } catch { continue; }
        for (const file of files) {
          const isSvgFile = file.endsWith('.svg');
          const isPngFile = file.endsWith('.png');
          const isXpmFile = file.endsWith('.xpm');
          if (!isSvgFile && !isPngFile && !isXpmFile) continue;
          if (isSvg && !isSvgFile) continue; // scalable pass: SVG only
          
          const fullName = file.toLowerCase();
          const strippedName = file.replace(/\.(svg|png|xpm)$/i, '').toLowerCase();
          const fullPath = path.join(appsDir, file);

          if (!systemIconIndex[strippedName]) systemIconIndex[strippedName] = fullPath;
          if (!systemIconIndex[fullName]) systemIconIndex[fullName] = fullPath;
        }
      }
    }
  }

  // Pixmaps as final fallback
  try {
    for (const file of fs.readdirSync('/usr/share/pixmaps')) {
      if (!/\.(svg|png|xpm)$/i.test(file)) continue;
      const fullName = file.toLowerCase();
      const strippedName = file.replace(/\.(svg|png|xpm)$/i, '').toLowerCase();
      const fullPath = path.join('/usr/share/pixmaps', file);
      if (!systemIconIndex[strippedName]) systemIconIndex[strippedName] = fullPath;
      if (!systemIconIndex[fullName]) systemIconIndex[fullName] = fullPath;
    }
  } catch {}
}

/**
 * Build a one-time map of WM_CLASS/exec-name → Icon= value and Name= value from all .desktop files.
 * Scans system, snap, and user application dirs.
 */
function ensureDesktopIconMap() {
  if (desktopIconNameMap !== null) return;
  desktopIconNameMap = {};
  desktopNameMap = {};
  const homes = getSearchHomes();
  const dirs = [
    '/usr/share/applications',
    '/usr/local/share/applications',
    '/var/lib/snapd/desktop/applications',
    ...homes.map(h => path.join(h, '.local/share/applications')),
  ];
  for (const dir of dirs) {
    let files;
    try { files = fs.readdirSync(dir).filter(f => f.endsWith('.desktop')); } catch { continue; }
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(dir, file), 'utf-8');
        const iconMatch = content.match(/^Icon=(.+)$/m);
        const nameMatch = content.match(/^Name=(.+)$/m);
        if (!iconMatch && !nameMatch) continue;
        const iconName = iconMatch ? iconMatch[1].trim() : null;
        const appName  = nameMatch ? nameMatch[1].trim() : null;
        const keys = new Set();
        const wmMatch  = content.match(/^StartupWMClass=(.+)$/m);
        const execMatch = content.match(/^Exec=(.+)$/m);
        if (wmMatch) {
          const wmc = wmMatch[1].trim().toLowerCase();
          keys.add(wmc);
          keys.add(wmc.split('_')[0]); // snap variant: "firefox_firefox" → "firefox"
        }
        if (execMatch) {
          // Strip env wrappers (e.g. "env VAR=x /usr/bin/foo arg") to get the real binary
          const parts = execMatch[1].trim().split(/\s+/);
          const binIdx = parts.findIndex(p => p.startsWith('/') || (!p.includes('=') && !p.startsWith('%')));
          const bin = (binIdx >= 0 ? parts[binIdx] : parts[0]).replace(/^.*\//, '').toLowerCase();
          if (bin && !bin.startsWith('%') && bin !== 'env') keys.add(bin);
          // Also strip common packaging suffixes: foo-stable → foo, foo-bin → foo
          const stripped = bin.replace(/-(stable|bin|browser|nightly|beta|esr)$/, '');
          if (stripped !== bin) keys.add(stripped);
        }
        // Filename key (e.g. "google-chrome.desktop" → "google-chrome")
        const fileKey = file.replace(/\.desktop$/, '').toLowerCase();
        keys.add(fileKey);
        // Snap filename variant: "firefox_firefox.desktop" → "firefox"
        keys.add(fileKey.split('_')[0]);

        // Reverse domain name handling: "org.gnome.Nautilus" -> "nautilus"
        const lastPart = fileKey.split('.').pop();
        if (lastPart && lastPart !== fileKey) keys.add(lastPart);

        for (const key of keys) {
          if (key) {
            if (iconName && !desktopIconNameMap[key]) desktopIconNameMap[key] = iconName;
            if (appName && !desktopNameMap[key]) desktopNameMap[key] = appName;
          }
        }
      } catch {}
    }
  }
}

/**
 * Given a WM_CLASS instance string, find the best icon name by trying multiple key variants.
 * Tries desktop map first (most accurate), then falls back to direct icon index lookup.
 */
function resolveIconNameForInstance(instance, wmclassSecond) {
  ensureDesktopIconMap();
  buildSystemIconIndex();

  // Generate key candidates from most specific to most general
  const candidates = [];
  const add = (k) => { if (k && !candidates.includes(k)) candidates.push(k); };
  add(instance);
  add(wmclassSecond?.toLowerCase());
  add(wmclassSecond?.toLowerCase().split('_')[0]);
  // Strip common packaging suffixes
  const SUFFIXES = /-(stable|bin|browser|nightly|beta|esr)$/;
  for (const k of [instance, wmclassSecond?.toLowerCase()]) {
    if (k) add(k.replace(SUFFIXES, ''));
  }

  // 1. Try desktop icon map (maps to declared Icon= value)
  for (const key of candidates) {
    if (key && desktopIconNameMap[key]) return desktopIconNameMap[key];
  }

  // 2. Try candidates directly as icon names in the icon index
  for (const key of candidates) {
    if (key) {
      const lower = key.toLowerCase();
      const stripped = lower.replace(/\.(svg|png|xpm)$/i, '');
      if (systemIconIndex[lower]) return lower;
      if (systemIconIndex[stripped]) return stripped;
    }
  }

  return null;
}

/** Resolve an icon name or absolute path to a data URI. */
function getSystemIconDataUri(iconName) {
  if (!iconName) return null;
  const cacheKey = iconName.toLowerCase();
  if (systemIconDataUriCache[cacheKey] !== undefined) return systemIconDataUriCache[cacheKey];

  buildSystemIconIndex();

  let iconPath = null;
  if (iconName.startsWith('/')) {
    // Absolute path (common with snap apps)
    iconPath = fs.existsSync(iconName) ? iconName : null;
  } else {
    const stripped = cacheKey.replace(/\.(svg|png|xpm)$/i, '');
    iconPath = systemIconIndex[cacheKey] || systemIconIndex[stripped] || null;
  }

  if (!iconPath) { systemIconDataUriCache[cacheKey] = null; return null; }
  try {
    const data = fs.readFileSync(iconPath);
    let mime = 'image/png';
    if (iconPath.endsWith('.svg')) mime = 'image/svg+xml';
    else if (iconPath.endsWith('.xpm')) mime = 'image/x-xpixmap';
    systemIconDataUriCache[cacheKey] = `data:${mime};base64,${data.toString('base64')}`;
  } catch {
    systemIconDataUriCache[cacheKey] = null;
  }
  return systemIconDataUriCache[cacheKey];
}

/**
 * Build a one-time map of WM_CLASS/exec-name → desktop actions array.
 * Each action: { name: string, exec: string }
 * Reads Actions= and [Desktop Action X] sections from all .desktop files.
 */
function ensureDesktopActionsMap() {
  if (desktopActionsMap !== null) return;
  desktopActionsMap = {};
  const homes = getSearchHomes();
  const dirs = [
    '/usr/share/applications',
    '/usr/local/share/applications',
    '/var/lib/snapd/desktop/applications',
    ...homes.map(h => path.join(h, '.local/share/applications')),
  ];

  for (const dir of dirs) {
    let files;
    try { files = fs.readdirSync(dir).filter(f => f.endsWith('.desktop')); } catch { continue; }
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(dir, file), 'utf-8');

        // Parse Actions= from [Desktop Entry] section
        const actionsMatch = content.match(/^Actions=(.+)$/m);
        if (!actionsMatch) continue;
        const actionIds = actionsMatch[1].split(';').map(s => s.trim()).filter(Boolean);
        if (!actionIds.length) continue;

        // Parse each [Desktop Action X] section
        const actions = [];
        for (const id of actionIds) {
          // No 'm' flag: $ = end of string. \n\[ detects next section header.
          const sectionRe = new RegExp(`\\[Desktop Action ${id}\\]([\\s\\S]*?)(?=\\n\\[|$)`);
          const section = content.match(sectionRe);
          if (!section) continue;
          const nameMatch = section[1].match(/^Name=(.+)$/m);
          const execMatch = section[1].match(/^Exec=(.+)$/m);
          if (!nameMatch || !execMatch) continue;
          // Strip .desktop field codes (%f, %u, %F, %U, etc.) from exec
          const exec = execMatch[1].trim().replace(/%[a-zA-Z]/g, '').trim();
          actions.push({ name: nameMatch[1].trim(), exec });
        }
        if (!actions.length) continue;

        // Build the same key set as ensureDesktopIconMap for consistent lookup
        const keys = new Set();
        const wmMatch   = content.match(/^StartupWMClass=(.+)$/m);
        const execMatch = content.match(/^Exec=(.+)$/m);
        if (wmMatch) {
          const wmc = wmMatch[1].trim().toLowerCase();
          keys.add(wmc);
          keys.add(wmc.split('_')[0]);
        }
        if (execMatch) {
          const parts = execMatch[1].trim().split(/\s+/);
          const binIdx = parts.findIndex(p => p.startsWith('/') || (!p.includes('=') && !p.startsWith('%')));
          const bin = (binIdx >= 0 ? parts[binIdx] : parts[0]).replace(/^.*\//, '').toLowerCase();
          if (bin && !bin.startsWith('%') && bin !== 'env') keys.add(bin);
          const stripped = bin.replace(/-(stable|bin|browser|nightly|beta|esr)$/, '');
          if (stripped !== bin) keys.add(stripped);
        }
        const fileKey = file.replace(/\.desktop$/, '').toLowerCase();
        keys.add(fileKey);
        keys.add(fileKey.split('_')[0]);

        for (const key of keys) {
          if (key && !desktopActionsMap[key]) desktopActionsMap[key] = actions;
        }
      } catch {}
    }
  }
}

/**
 * Return desktop actions (like "New Window") for a given WM_CLASS instance.
 * Returns [] if no actions found.
 */
function getDesktopActionsForInstance(instance, wmclassSecond) {
  ensureDesktopActionsMap();
  const candidates = [
    instance,
    wmclassSecond?.toLowerCase(),
    wmclassSecond?.toLowerCase()?.split('_')[0],
    instance?.replace(/-(stable|bin|browser|nightly|beta|esr)$/, ''),
  ].filter(Boolean);
  for (const key of candidates) {
    if (desktopActionsMap[key]) return desktopActionsMap[key];
  }
  return [];
}

/**
 * Build a one-time map of WM_CLASS/exec-name → exec command string.
 * Used to relaunch pinned apps that aren't currently running.
 */
function ensureDesktopExecMap() {
  if (desktopExecMap !== null) return;
  desktopExecMap = {};
  const home = process.env.HOME || '/home/robos';
  const dirs = [
    '/usr/share/applications',
    '/usr/local/share/applications',
    '/var/lib/snapd/desktop/applications',
    path.join(home, '.local/share/applications'),
  ];
  for (const dir of dirs) {
    let files;
    try { files = fs.readdirSync(dir).filter(f => f.endsWith('.desktop')); } catch { continue; }
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(dir, file), 'utf-8');
        const execMatch = content.match(/^Exec=(.+)$/m);
        if (!execMatch) continue;
        const exec = execMatch[1].trim().replace(/%[a-zA-Z]/g, '').trim();
        const keys = new Set();
        const wmMatch = content.match(/^StartupWMClass=(.+)$/m);
        if (wmMatch) {
          const wmc = wmMatch[1].trim().toLowerCase();
          keys.add(wmc); keys.add(wmc.split('_')[0]);
        }
        const parts = execMatch[1].trim().split(/\s+/);
        const binIdx = parts.findIndex(p => p.startsWith('/') || (!p.includes('=') && !p.startsWith('%')));
        const bin = (binIdx >= 0 ? parts[binIdx] : parts[0]).replace(/^.*\//, '').toLowerCase();
        if (bin && !bin.startsWith('%') && bin !== 'env') keys.add(bin);
        const stripped = bin.replace(/-(stable|bin|browser|nightly|beta|esr)$/, '');
        if (stripped !== bin) keys.add(stripped);
        const fileKey = file.replace(/\.desktop$/, '').toLowerCase();
        keys.add(fileKey); keys.add(fileKey.split('_')[0]);
        for (const key of keys) { if (key && !desktopExecMap[key]) desktopExecMap[key] = exec; }
      } catch {}
    }
  }
}

function getExecForInstance(instance, wmclassSecond) {
  ensureDesktopExecMap();
  const candidates = [
    instance,
    wmclassSecond?.toLowerCase(),
    wmclassSecond?.toLowerCase()?.split('_')[0],
    instance?.replace(/-(stable|bin|browser|nightly|beta|esr)$/, ''),
  ].filter(Boolean);
  for (const key of candidates) {
    if (desktopExecMap[key]) return desktopExecMap[key];
  }
  return instance; // fallback: try running the instance name directly
}

function getX11Windows() {
  const display = process.env.DISPLAY || ':0';
  return new Promise((resolve) => {
    exec('wmctrl -lx', { env: { ...process.env, DISPLAY: display } }, (err, stdout) => {
      if (!err && stdout && stdout.trim()) {
        const windows = [];
        for (const line of stdout.trim().split('\n')) {
          if (!line) continue;
          const m = line.match(/^(0x[0-9a-f]+)\s+(-?\d+)\s+(\S+)\s+\S+\s+(.*)/i);
          if (!m) continue;
          const [, wid, , wmclass, title] = m;
          const instance = wmclass.split('.')[0].toLowerCase();
          const secondClass = wmclass.split('.')[1]?.toLowerCase();
          if (WM_CLASS_IGNORE.has(instance) || WM_CLASS_IGNORE.has(secondClass)) continue;
          if (title === 'RobOS Desktop' || title === 'electron' || title.toLowerCase().includes('robos desktop') || title === 'Chromium clipboard') continue;

          ensureDesktopIconMap();
          const meta = WM_CLASS_META[instance];
          const label = meta?.label ||
                        desktopNameMap[instance] ||
                        desktopNameMap[secondClass] ||
                        (instance.startsWith('robos-') ?
                          instance.replace(/^robos-/, '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) :
                          instance.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()));

          let iconSvg = null;
          const iconName = resolveIconNameForInstance(instance, secondClass);
          if (iconName) iconSvg = getSystemIconDataUri(iconName);
          if (!iconSvg) iconSvg = getRobosIconDataUri(instance) || getRobosIconDataUri(instance.replace(/^robos-/, ''));

          const actions = getDesktopActionsForInstance(instance, wmclass.split('.')[1]);
          const execCmd = getExecForInstance(instance, wmclass.split('.')[1]);
          windows.push({ wid, wmclass, instance, title: title.trim(), label, icon: meta?.icon, iconSvg, actions, exec: execCmd });
        }
        if (windows.length > 0) {
          resolve(windows);
          return;
        }
      }

      // Fallback: parse xwininfo -root -tree for client windows (e.g. bare Xvfb)
      exec('xwininfo -root -tree', { env: { ...process.env, DISPLAY: display } }, (err2, stdout2) => {
        if (err2 || !stdout2) { resolve([]); return; }
        const windows = [];
        ensureDesktopIconMap();
        for (const line of stdout2.split('\n')) {
          const m = line.match(/^\s*(0x[0-9a-f]+)\s+"([^"]+)":\s+\("([^"]+)"\s+"([^"]+)"\)\s+(\d+)x(\d+)/i);
          if (!m) continue;
          const [, wid, title, instRaw, secondRaw, wStr, hStr] = m;
          if (parseInt(wStr) < 50 || parseInt(hStr) < 50) continue;
          const instance = instRaw.toLowerCase().split(/\s+/)[0].replace(/[^a-z0-9_-]/g, '');
          const secondClass = secondRaw.toLowerCase();
          if (!instance || WM_CLASS_IGNORE.has(instance) || WM_CLASS_IGNORE.has(secondClass)) continue;
          if (title === 'RobOS Desktop' || title === 'electron' || title.toLowerCase().includes('robos desktop') || title === 'Chromium clipboard') continue;
          const wmclass = `${instRaw}.${secondRaw}`;
          const meta = WM_CLASS_META[instance];
          const label = meta?.label ||
                        desktopNameMap[instance] ||
                        desktopNameMap[secondClass] ||
                        instance.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

          let iconSvg = null;
          const iconName = resolveIconNameForInstance(instance, secondClass);
          if (iconName) iconSvg = getSystemIconDataUri(iconName);
          if (!iconSvg) iconSvg = getRobosIconDataUri(instance);

          const actions = getDesktopActionsForInstance(instance, secondRaw);
          const execCmd = getExecForInstance(instance, secondRaw);
          windows.push({ wid, wmclass, instance, title: title.trim(), label, icon: meta?.icon, iconSvg, actions, exec: execCmd });
        }
        resolve(windows);
      });
    });
  });
}

function focusWindow(wid) {
  const display = process.env.DISPLAY || ':0';
  exec(
    `wmctrl -ir ${wid} -b remove,hidden 2>/dev/null; wmctrl -ia ${wid} 2>/dev/null || xdotool windowactivate ${wid} 2>/dev/null`,
    { env: { ...process.env, DISPLAY: display }, shell: '/bin/bash' }
  );
}

// ── Main window ───────────────────────────────────────────────────────────────
let mainWin = null;

function applyWindowStrutsAndBounds() {
  if (!mainWin || mainWin.isDestroyed()) return;
  if (process.env.ROBOS_SCENARIO || process.env.ROBOS_TEST_MODE || process.env.ROBOS_HEADLESS) return;
  const { bounds } = screen.getPrimaryDisplay();
  mainWin.setBounds({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height });
  const env = { ...process.env, DISPLAY: ':0' };
  const screenW = bounds.width;
  const screenH = bounds.height;
  exec(
    `WID=$(wmctrl -lp 2>/dev/null | awk -v pid=${process.pid} '$3==pid{print $1; exit}'); ` +
    `if [ -n "$WID" ]; then ` +
      `wmctrl -ir $WID -b add,sticky,skip_taskbar,skip_pager 2>/dev/null; ` +
      `xdotool windowmove $WID ${bounds.x} ${bounds.y} 2>/dev/null; ` +
      `xdotool windowsize $WID ${screenW} ${screenH} 2>/dev/null; ` +
      `xprop -id $WID -f _NET_WM_STRUT 32c -set _NET_WM_STRUT "0,0,${MENUBAR_H},0" 2>/dev/null; ` +
      `xprop -id $WID -f _NET_WM_STRUT_PARTIAL 32c -set _NET_WM_STRUT_PARTIAL "0,0,${MENUBAR_H},0,0,0,0,0,0,${screenW - 1},0,0" 2>/dev/null; ` +
    `fi`,
    { env, shell: '/bin/bash', timeout: 5000 }, () => {}
  );
}

function createWindow() {
  const isTest = !!(process.env.ROBOS_SCENARIO || process.env.ROBOS_TEST_MODE || process.env.ROBOS_HEADLESS) && !process.env.ROBOS_DEMO_SHOW;
  const primary = screen.getPrimaryDisplay() || { bounds: { x: 0, y: 0, width: 1920, height: 1080 } };
  const bounds = primary.bounds;

  // Full-screen transparent overlay — renders top menu bar + bottom dock.
  // The transparent area in the middle is click-through (setIgnoreMouseEvents).
  mainWin = new BrowserWindow({
    show: false,
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    closable: false,
    skipTaskbar: true,
    focusable: true,
    alwaysOnTop: true,
    transparent: true,
    title: 'RobOS Taskbar Shell',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  });

  mainWin.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  function enforceAlwaysOnTop() {
    if (!mainWin || mainWin.isDestroyed()) return;
    try {
      mainWin.setAlwaysOnTop(true, 'screen-saver');
      if (process.platform === 'linux' && process.env.DISPLAY) {
        exec('wmctrl -r "RobOS Desktop" -b add,above,sticky || xdotool search --name "RobOS" windowraise 2>/dev/null', { env: process.env }, () => {});
      }
    } catch (_) {}
  }

  let initialized = false;
  const initWindow = () => {
    if (initialized || !mainWin || mainWin.isDestroyed()) return;
    initialized = true;
    mainWin.setAlwaysOnTop(true, 'screen-saver');
    mainWin.show();
    mainWin.setBounds({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height });
    enforceAlwaysOnTop();
    if (!isTest) {
      mainWin.setIgnoreMouseEvents(true); // default: click-through everywhere
      // Don't steal keyboard focus from whatever the user was using
      mainWin.blur();
    }

    // Poll cursor position at 50fps (20ms interval) for instant responsiveness.
    // setIgnoreMouseEvents({forward:true}) is Windows-only — on Linux we poll instead.
    const MENUBAR_HIT_H = 36;
    let ignoring = true;
    setInterval(() => {
      if (!mainWin || mainWin.isDestroyed()) return;
      if (dragLock) {
        if (ignoring) { ignoring = false; mainWin.setIgnoreMouseEvents(false); }
        return;
      }
      const { bounds: b } = screen.getPrimaryDisplay();
      const { x, y } = screen.getCursorScreenPoint();
      const relX = x - b.x;
      const relY = y - b.y;

      const inTopBar = relY >= 0 && relY <= MENUBAR_HIT_H;
      const inDock   = (dockRect && dockRect.width > 0) ? (
        relX >= (dockRect.left - 15) &&
        relX <= (dockRect.right + 15) &&
        relY >= (dockRect.top - 15)
      ) : (relY >= b.height - dockZone);
      const inSysMenuArea = menuOpen && relX >= 0 && relX <= 260 && relY >= 0 && relY <= 240;
      const inBar = menuOpen || inTopBar || inDock || inSysMenuArea;

      if (inBar && ignoring) {
        ignoring = false;
        mainWin.setIgnoreMouseEvents(false);
      } else if (!inBar && !ignoring) {
        ignoring = true;
        mainWin.setIgnoreMouseEvents(true);
      }
    }, 20);

    setTimeout(applyWindowStrutsAndBounds, 1000);
  };

  mainWin.once('ready-to-show', initWindow);
  mainWin.webContents.once('did-finish-load', initWindow);

  mainWin.on('resize', applyWindowStrutsAndBounds);
  screen.on('display-metrics-changed', applyWindowStrutsAndBounds);
  screen.on('display-added', applyWindowStrutsAndBounds);
  screen.on('display-removed', applyWindowStrutsAndBounds);

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
  dmRequest({ resumeKeepAlive: 'robos-desktop' }).catch(() => {});

  ipcMain.handle('launch-app', (_e, appId) => {
    return launchApp(appId);
  });

  ipcMain.handle('get-running-apps', () => {
    return getRunningApps();
  });

  ipcMain.handle('get-pinned-apps', () => readPinned());

  ipcMain.handle('set-pinned-apps', (_e, list) => {
    writePinned(list);
    return { ok: true };
  });

  let _mockWindows = null;
  ipcMain.handle('set-mock-windows', (_e, list) => {
    _mockWindows = list;
    return { ok: true };
  });

  ipcMain.handle('get-x11-windows', () => {
    if (_mockWindows !== null) return _mockWindows;
    return getX11Windows();
  });

  ipcMain.handle('focus-window', (_e, wid) => {
    focusWindow(wid);
    return { ok: true };
  });

  ipcMain.handle('minimize-window', (_e, wid) => {
    const display = process.env.DISPLAY || ':0';
    exec(`xdotool windowminimize ${wid} 2>/dev/null || wmctrl -ir ${wid} -b add,hidden 2>/dev/null`, { env: { ...process.env, DISPLAY: display } });
    return { ok: true };
  });

  ipcMain.handle('restore-window', (_e, wid) => {
    const display = process.env.DISPLAY || ':0';
    exec(`wmctrl -ir ${wid} -b remove,hidden 2>/dev/null; (xdotool windowactivate ${wid} 2>/dev/null || wmctrl -ia ${wid} 2>/dev/null)`, { env: { ...process.env, DISPLAY: display } });
    return { ok: true };
  });

  ipcMain.handle('maximize-window', (_e, wid) => {
    const display = process.env.DISPLAY || ':0';
    exec(`wmctrl -ir ${wid} -b toggle,maximized_vert,maximized_horz 2>/dev/null`,
      { env: { ...process.env, DISPLAY: display } });
    return { ok: true };
  });

  ipcMain.handle('unmaximize-window', (_e, wid) => {
    const display = process.env.DISPLAY || ':0';
    exec(`wmctrl -ir ${wid} -b remove,maximized_vert,maximized_horz 2>/dev/null`, { env: { ...process.env, DISPLAY: display } });
    return { ok: true };
  });

  let showingDesktop = false;
  ipcMain.handle('toggle-show-desktop', () => {
    const display = process.env.DISPLAY || ':0';
    showingDesktop = !showingDesktop;
    if (showingDesktop) {
      exec(`wmctrl -k on 2>/dev/null; for wid in $(wmctrl -l | grep -v -i "robos desktop" | awk '{print $1}'); do xdotool windowminimize $wid 2>/dev/null || wmctrl -ir $wid -b add,hidden 2>/dev/null; done`,
        { env: { ...process.env, DISPLAY: display } });
    } else {
      exec(`wmctrl -k off 2>/dev/null; for wid in $(wmctrl -l | grep -v -i "robos desktop" | awk '{print $1}'); do wmctrl -ir $wid -b remove,hidden 2>/dev/null; xdotool windowactivate $wid 2>/dev/null || wmctrl -ia $wid 2>/dev/null; done`,
        { env: { ...process.env, DISPLAY: display } });
    }
    return { ok: true, showingDesktop };
  });

  ipcMain.handle('get-active-window', () => {
    return new Promise((resolve) => {
      const display = process.env.DISPLAY || ':0';
      exec(`xdotool getactivewindow 2>/dev/null`, { env: { ...process.env, DISPLAY: display } }, (err, stdout) => {
        if (err || !stdout.trim()) {
          exec(`xprop -root _NET_ACTIVE_WINDOW 2>/dev/null`, { env: { ...process.env, DISPLAY: display } }, (err2, stdout2) => {
            const match = stdout2 ? stdout2.match(/0x[0-9a-fA-F]+/) : null;
            resolve({ wid: match ? parseInt(match[0], 16).toString() : null });
          });
        } else {
          resolve({ wid: stdout.trim() });
        }
      });
    });
  });

  // Register standard Ubuntu GNOME window management hotkeys
  try {
    globalShortcut.register('Super+D', () => {
      const display = process.env.DISPLAY || ':0';
      showingDesktop = !showingDesktop;
      exec(showingDesktop ? 'wmctrl -k on 2>/dev/null' : 'wmctrl -k off 2>/dev/null', { env: { ...process.env, DISPLAY: display } });
    });
    globalShortcut.register('Alt+F10', () => {
      const display = process.env.DISPLAY || ':0';
      exec('xdotool getactivewindow windowsize 100% 100% 2>/dev/null || wmctrl -r :ACTIVE: -b toggle,maximized_vert,maximized_horz 2>/dev/null', { env: { ...process.env, DISPLAY: display } });
    });
    globalShortcut.register('Super+Up', () => {
      const display = process.env.DISPLAY || ':0';
      exec('wmctrl -r :ACTIVE: -b add,maximized_vert,maximized_horz 2>/dev/null', { env: { ...process.env, DISPLAY: display } });
    });
    globalShortcut.register('Super+Down', () => {
      const display = process.env.DISPLAY || ':0';
      exec('wmctrl -r :ACTIVE: -b remove,maximized_vert,maximized_horz 2>/dev/null', { env: { ...process.env, DISPLAY: display } });
    });
    globalShortcut.register('Super+H', () => {
      const display = process.env.DISPLAY || ':0';
      exec('xdotool getactivewindow windowminimize 2>/dev/null || wmctrl -r :ACTIVE: -b add,hidden 2>/dev/null', { env: { ...process.env, DISPLAY: display } });
    });
    globalShortcut.register('Alt+F9', () => {
      const display = process.env.DISPLAY || ':0';
      exec('xdotool getactivewindow windowminimize 2>/dev/null || wmctrl -r :ACTIVE: -b add,hidden 2>/dev/null', { env: { ...process.env, DISPLAY: display } });
    });
    globalShortcut.register('Alt+F4', () => {
      const display = process.env.DISPLAY || ':0';
      exec('wmctrl -r :ACTIVE: -c 2>/dev/null || xdotool getactivewindow windowclose 2>/dev/null', { env: { ...process.env, DISPLAY: display } });
    });
  } catch (err) {
    console.warn('[ROBOS] globalShortcut register warning:', err.message);
  }

  ipcMain.handle('close-window', (_e, wid) => {
    const display = process.env.DISPLAY || ':0';
    exec(`wmctrl -ic ${wid} 2>/dev/null || xdotool windowclose ${wid} 2>/dev/null`, { env: { ...process.env, DISPLAY: display } });
    return { ok: true };
  });

  ipcMain.handle('exec-desktop-action', (_e, execStr) => {
    // Strip any remaining field codes and run the action
    const safe = execStr.replace(/%[a-zA-Z]/g, '').trim();
    if (!safe) return { ok: false };
    const uid = process.getuid ? process.getuid() : null;
    const display = process.env.DISPLAY || ':0';
    const env = { ...process.env, DISPLAY: display };
    if (!env.DBUS_SESSION_BUS_ADDRESS && uid !== null) {
      env.DBUS_SESSION_BUS_ADDRESS = `unix:path=/run/user/${uid}/bus`;
    }
    if (!env.XDG_RUNTIME_DIR && uid !== null) {
      env.XDG_RUNTIME_DIR = `/run/user/${uid}`;
    }
    _testHistory.executedActions.push(safe);
    if (!process.env.ROBOS_TEST_MODE) {
      exec(safe, { env, shell: '/bin/bash' });
    }
    return { ok: true, executed: safe };
  });

  ipcMain.handle('get-test-history', () => _testHistory);
  ipcMain.handle('reset-test-history', () => {
    _testHistory.launchedApps = [];
    _testHistory.executedActions = [];
    return { ok: true };
  });

  ipcMain.handle('list-agent-profiles', () => {
    try {
      const pFile = path.join(CONFIG_DIR, 'profiled', 'profiles.json');
      if (fs.existsSync(pFile)) {
        return JSON.parse(fs.readFileSync(pFile, 'utf8'));
      }
    } catch {}
    return [];
  });

  ipcMain.handle('kill-agent-profile', (_e, username) => {
    try {
      const pFile = path.join(CONFIG_DIR, 'profiled', 'profiles.json');
      if (fs.existsSync(pFile)) {
        const list = JSON.parse(fs.readFileSync(pFile, 'utf8'));
        for (const p of list) {
          if (p.username === username || p.name === username) {
            p.status = 'terminated';
          }
        }
        fs.writeFileSync(pFile, JSON.stringify(list, null, 2), 'utf8');
      }
    } catch {}
    return { ok: true };
  });

  ipcMain.handle('wipe-all-agent-profiles', () => {
    try {
      const pFile = path.join(CONFIG_DIR, 'profiled', 'profiles.json');
      if (fs.existsSync(pFile)) {
        const list = JSON.parse(fs.readFileSync(pFile, 'utf8'));
        for (const p of list) {
          p.status = 'terminated';
        }
        fs.writeFileSync(pFile, JSON.stringify(list, null, 2), 'utf8');
      }
    } catch {}
    return { ok: true };
  });

  ipcMain.handle('switch-to-gnome', () => {
    restoreGnomePanelAndQuit();
    return { ok: true };
  });

  ipcMain.handle('set-dock-zone', (_e, h) => { dockZone = Math.ceil(h); });
  ipcMain.handle('set-dock-rect', (_e, r) => { dockRect = r; return { ok: true }; });
  ipcMain.handle('set-drag-lock', (_e, v) => { dragLock = !!v; });
  ipcMain.handle('set-menu-open', (_e, v) => { menuOpen = !!v; });
  // Synchronous version — used by renderer to guarantee click-through is
  // disabled BEFORE the menu is visible (avoids the 50ms polling race).
  ipcMain.on('set-menu-open-sync', (e, v) => {
    menuOpen = !!v;
    if (menuOpen && mainWin && !mainWin.isDestroyed()) mainWin.setIgnoreMouseEvents(false);
    e.returnValue = null;
  });
  ipcMain.on('debug-log', (_e, msg) => { process.stderr.write(`[RENDERER] ${msg}\n`); });

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
