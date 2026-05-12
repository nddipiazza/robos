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
  'app-launcher': { label: 'Apps',        icon: '🚀', desc: 'Open all apps'           },
  'dev-central':  { label: 'Dev Central', icon: '🏠', desc: 'Daily dashboard'          },
  'git-projects': { label: 'Git',         icon: '🌿', desc: 'Git workspaces'           },
  'ai-prompt':    { label: 'AI Prompt',   icon: '✨', desc: 'AI-powered OS prompt'     },
};

// ── X11 window list ────────────────────────────────────────────────────────────
// Maps WM_CLASS instance prefix → { label, icon }
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
  'robos-desktop', 'desktop-widgets', 'robos-toast',
  'gjs',           // GNOME shell extensions
]);

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
        const [, wid, desktop, wmclass, title] = m;
        if (parseInt(desktop, 10) < 0) continue; // skip sticky system windows
        const instance = wmclass.split('.')[0].toLowerCase();
        if (WM_CLASS_IGNORE.has(instance)) continue;
        const meta = WM_CLASS_META[instance] || { label: instance, icon: '🪟' };
        windows.push({ wid, wmclass, instance, title: title.trim(), ...meta });
      }
      resolve(windows);
    });
  });
}

function focusWindow(wid) {
  exec(`wmctrl -ia ${wid}`, { env: { ...process.env, DISPLAY: ':0' } });
}

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
