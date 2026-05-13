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

const MENUBAR_H = 28;   // thin top menu bar (macOS menu bar style)
const DOCK_H    = 72;   // bottom dock height

// ── Module-level state for dock (must be accessible from IPC handlers before ready-to-show) ──
const BASE_DOCK_ZONE = DOCK_H + 16;
let dockZone = BASE_DOCK_ZONE;
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
  // Ensure dbus session bus is available — it may be missing if robos-desktop
  // was started outside a full GNOME session (e.g. restarted from SSH).
  const uid = process.getuid ? process.getuid() : null;
  const env = { ...process.env };
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

function launchApp(appId) {
  launchAppDirect(appId);
  return { ok: true };
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
  chromium:                { label: 'Chromium',  icon: '🌐'   },
  'google-chrome':         { label: 'Chrome',    icon: '🌐'   },
  nautilus:                { label: 'Files',     icon: '📁'   },
  gedit:                   { label: 'Text Edit', icon: '📝'   },
  eog:                     { label: 'Image',     icon: '🖼️'   },
  evince:                  { label: 'PDF',       icon: '📄'   },
};

// Ignore these in the window taskbar (our own shell + background daemons)
const WM_CLASS_IGNORE = new Set([
  'robos-desktop',              // taskbar shell itself
  'robos-desktop-dashboard',    // legacy desktop-dashboard alias
  'robos-app-launcher',         // app launcher (opened via taskbar button)
  'desktop-widgets', 'robos-toast',
  'gjs',                        // GNOME shell extensions
]);

// ── Icon helpers ──────────────────────────────────────────────────────────────

// Cache of appId → SVG data URI (RobOS apps)
const iconCache = {};

function getRobosIconDataUri(appId) {
  if (iconCache[appId] !== undefined) return iconCache[appId];
  const iconPath = `/usr/local/share/robos/${appId}/icon.svg`;
  try {
    const svg = fs.readFileSync(iconPath, 'utf-8');
    iconCache[appId] = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
  } catch {
    iconCache[appId] = null;
  }
  return iconCache[appId];
}

// Maps instance/wmclass key → icon name (from .desktop files)
let desktopIconNameMap = null;
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
function buildSystemIconIndex() {
  if (systemIconIndex !== null) return;
  systemIconIndex = {};
  const SIZE_ORDER = [
    'scalable', '256x256', '192x192', '128x128', '96x96', '64x64', '48x48', '32x32', '24x24', '16x16',
  ];
  // Preferred themes first — their icons win over accessibility/fallback themes
  const PREFERRED = ['Yaru', 'hicolor', 'Adwaita', 'gnome', 'Papirus', 'breeze', 'elementary'];
  const DEPRIORITIZED = new Set(['HighContrast', 'HighContrastInverse', 'locolor', 'Mono', 'Humanity']);
  const iconBaseDirs = ['/usr/share/icons', '/usr/local/share/icons'];
  // Collect all theme dirs sorted: preferred first, deprioritized last
  const allThemes = [];
  for (const base of iconBaseDirs) {
    try { for (const t of fs.readdirSync(base)) allThemes.push({ base, name: t }); } catch {}
  }
  const preferred = allThemes.filter(t => PREFERRED.includes(t.name));
  const normal    = allThemes.filter(t => !PREFERRED.includes(t.name) && !DEPRIORITIZED.has(t.name));
  const low       = allThemes.filter(t => DEPRIORITIZED.has(t.name));
  const themeDirs = [...preferred, ...normal, ...low].map(t => path.join(t.base, t.name));
  // Iterate sizes first so SVG wins over PNG regardless of theme
  for (const size of SIZE_ORDER) {
    const isSvg = size === 'scalable';
    for (const themeDir of themeDirs) {
      const appsDir = path.join(themeDir, size, 'apps');
      let files;
      try { files = fs.readdirSync(appsDir); } catch { continue; }
      for (const file of files) {
        const isSvgFile = file.endsWith('.svg');
        const isPngFile = file.endsWith('.png');
        if (!isSvgFile && !isPngFile) continue;
        if (isSvg && !isSvgFile) continue; // scalable pass: SVG only
        const name = file.replace(/\.(svg|png)$/, '').toLowerCase();
        if (!systemIconIndex[name]) systemIconIndex[name] = path.join(appsDir, file);
      }
    }
  }
  // Pixmaps as final fallback
  try {
    for (const file of fs.readdirSync('/usr/share/pixmaps')) {
      if (!file.endsWith('.svg') && !file.endsWith('.png')) continue;
      const name = file.replace(/\.(svg|png)$/, '').toLowerCase();
      if (!systemIconIndex[name]) systemIconIndex[name] = path.join('/usr/share/pixmaps', file);
    }
  } catch {}
}

/**
 * Build a one-time map of WM_CLASS/exec-name → Icon= value from all .desktop files.
 * Scans system, snap, and user application dirs.
 */
function ensureDesktopIconMap() {
  if (desktopIconNameMap !== null) return;
  desktopIconNameMap = {};
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
        const iconMatch = content.match(/^Icon=(.+)$/m);
        if (!iconMatch) continue;
        const iconName = iconMatch[1].trim();
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
        for (const key of keys) {
          if (key && !desktopIconNameMap[key]) desktopIconNameMap[key] = iconName;
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
    if (key && systemIconIndex[key.toLowerCase()]) return key;
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
    iconPath = systemIconIndex[cacheKey] || null;
  }

  if (!iconPath) { systemIconDataUriCache[cacheKey] = null; return null; }
  try {
    const data = fs.readFileSync(iconPath);
    const mime = iconPath.endsWith('.svg') ? 'image/svg+xml' : 'image/png';
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
  return new Promise((resolve) => {
    exec('wmctrl -lx', { env: { ...process.env, DISPLAY: ':0' } }, (err, stdout) => {
      if (err) { resolve([]); return; }
      const windows = [];
      for (const line of stdout.trim().split('\n')) {
        if (!line) continue;
        // Format: <wid> <desktop> <wmclass> <host> <title...>
        const m = line.match(/^(0x[0-9a-f]+)\s+(-?\d+)\s+(\S+)\s+\S+\s+(.*)/i);
        if (!m) continue;
        const [, wid, , wmclass, title] = m;
        // instance is the part before the dot, lowercase
        const instance = wmclass.split('.')[0].toLowerCase();
        if (WM_CLASS_IGNORE.has(instance)) continue;

        // RobOS apps have WM_CLASS like "robos-app-launcher.robos-app-launcher"
        let label, iconSvg = null;
        if (instance.startsWith('robos-')) {
          const appId = instance.replace(/^robos-/, '');
          label = appId.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          iconSvg = getRobosIconDataUri(appId);
        } else {
          const meta = WM_CLASS_META[instance] || { label: instance, icon: '🪟' };
          label = meta.label;
          // Resolve icon from system .desktop files + icon index
          const iconName = resolveIconNameForInstance(instance, wmclass.split('.')[1]);
          if (iconName) iconSvg = getSystemIconDataUri(iconName);
        }
        const actions = getDesktopActionsForInstance(instance, wmclass.split('.')[1]);
        const exec    = getExecForInstance(instance, wmclass.split('.')[1]);
        windows.push({ wid, wmclass, instance, title: title.trim(), label, iconSvg, actions, exec });
      }
      resolve(windows);
    });
  });
}

function focusWindow(wid) {
  // Remove minimized/hidden state first, then activate — works even if window is minimized
  exec(
    `wmctrl -ir ${wid} -b remove,hidden; wmctrl -ia ${wid}`,
    { env: { ...process.env, DISPLAY: ':0' }, shell: '/bin/bash' }
  );
}

// ── Main window ───────────────────────────────────────────────────────────────
let mainWin = null;

function createWindow() {
  const { bounds } = screen.getPrimaryDisplay();

  // Full-screen transparent overlay — renders top menu bar + bottom dock.
  // The transparent area in the middle is click-through (setIgnoreMouseEvents).
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
    closable: false,
    skipTaskbar: true,
    focusable: true,
    alwaysOnTop: true,
    transparent: true,
    title: 'RobOS Desktop',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  });

  mainWin.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWin.once('ready-to-show', () => {
    mainWin.setAlwaysOnTop(true, 'dock');
    mainWin.setIgnoreMouseEvents(true); // default: click-through everywhere
    mainWin.show();
    // Force position to (0,0) — WM may offset due to other windows' struts
    mainWin.setBounds({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height });
    // Don't steal keyboard focus from whatever the user was using
    mainWin.blur();

    // Poll cursor position at 20fps and toggle click-through.
    // setIgnoreMouseEvents({forward:true}) is Windows-only — on Linux we poll instead.
    let ignoring = true;
    setInterval(() => {
      if (!mainWin || mainWin.isDestroyed()) return;
      if (dragLock) {
        if (ignoring) { ignoring = false; mainWin.setIgnoreMouseEvents(false); }
        return;
      }
      const { bounds: b } = screen.getPrimaryDisplay();
      const { x, y } = screen.getCursorScreenPoint();
      const inBar = menuOpen || y - b.y <= MENUBAR_H || y - b.y >= b.height - dockZone;
      if (inBar && ignoring) {
        ignoring = false;
        mainWin.setIgnoreMouseEvents(false);
      } else if (!inBar && !ignoring) {
        ignoring = true;
        mainWin.setIgnoreMouseEvents(true);
      }
    }, 50);

    const env = { ...process.env, DISPLAY: ':0' };
    setTimeout(() => {
      const screenW = bounds.width;
      const screenH = bounds.height;
      // Reserve top space for menu bar only. Dock floats over windows (no bottom strut)
      // so apps can use the full screen height — just like macOS/Windows 11.
      exec(
        // Get our specific window by PID (not just name, to avoid matching desktop-dashboard)
        `WID=$(wmctrl -lp 2>/dev/null | awk -v pid=${process.pid} '$3==pid{print $1; exit}'); ` +
        `if [ -n "$WID" ]; then ` +
          `wmctrl -ir $WID -b add,sticky,skip_taskbar,skip_pager 2>/dev/null; ` +
          `xdotool windowmove $WID 0 0 2>/dev/null; ` +
          `xdotool windowsize $WID ${screenW} ${screenH} 2>/dev/null; ` +
          `xprop -id $WID -f _NET_WM_STRUT 32c -set _NET_WM_STRUT "0,0,${MENUBAR_H},0" 2>/dev/null; ` +
          `xprop -id $WID -f _NET_WM_STRUT_PARTIAL 32c -set _NET_WM_STRUT_PARTIAL "0,0,${MENUBAR_H},0,0,0,0,0,0,${screenW - 1},0,0" 2>/dev/null; ` +
        `fi`,
        { env, shell: '/bin/bash', timeout: 5000 }, () => {}
      );
    }, 1000);
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

  ipcMain.handle('get-app-meta', () => APP_META);

  ipcMain.handle('get-x11-windows', () => getX11Windows());

  ipcMain.handle('focus-window', (_e, wid) => {
    focusWindow(wid);
    return { ok: true };
  });

  ipcMain.handle('minimize-window', (_e, wid) => {
    exec(`xdotool windowminimize ${wid}`, { env: { ...process.env, DISPLAY: ':0' } });
    return { ok: true };
  });

  ipcMain.handle('maximize-window', (_e, wid) => {
    exec(`wmctrl -ir ${wid} -b toggle,maximized_vert,maximized_horz`,
      { env: { ...process.env, DISPLAY: ':0' } });
    return { ok: true };
  });

  ipcMain.handle('close-window', (_e, wid) => {
    exec(`wmctrl -ic ${wid}`, { env: { ...process.env, DISPLAY: ':0' } });
    return { ok: true };
  });

  ipcMain.handle('exec-desktop-action', (_e, execStr) => {
    // Strip any remaining field codes and run the action
    const safe = execStr.replace(/%[a-zA-Z]/g, '').trim();
    if (!safe) return { ok: false };
    exec(safe, { env: { ...process.env, DISPLAY: ':0' }, shell: '/bin/bash' });
    return { ok: true };
  });

  ipcMain.handle('switch-to-gnome', () => {
    restoreGnomePanelAndQuit();
    return { ok: true };
  });

  ipcMain.handle('set-dock-zone', (_e, h) => { dockZone = Math.ceil(h); });
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
