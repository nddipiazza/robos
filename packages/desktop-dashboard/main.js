'use strict';

const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const cp   = require('child_process');

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

app.setPath('userData', path.join(require('os').homedir(), '.config', 'robos', 'electron', 'desktop-dashboard'));

const lock = app.requestSingleInstanceLock();
if (!lock) { app.quit(); }

app.setName('robos-desktop-dashboard');

let win = null;
const TITLE = 'RobOS Desktop Dashboard';

// ── Set X11 window type to DESKTOP via xprop ─────────────────────────────────
function setDesktopWindowType() {
  if (!win) return;
  const env = { ...process.env, DISPLAY: ':0' };
  let attempts = 0;

  const trySet = () => {
    attempts++;
    // Find the X11 window ID by PID since focusable:false windows may not have a name
    cp.exec(
      `WID=$(xdotool search --pid $$ --name "${TITLE}" 2>/dev/null | head -1); ` +
      `[ -z "$WID" ] && WID=$(xdotool search --name "${TITLE}" 2>/dev/null | head -1); ` +
      `if [ -n "$WID" ]; then ` +
        `xprop -id $WID -f _NET_WM_WINDOW_TYPE 32a -set _NET_WM_WINDOW_TYPE _NET_WM_WINDOW_TYPE_DESKTOP; ` +
        `echo "OK $WID"; ` +
      `else echo "NOTFOUND"; fi`,
      { timeout: 5000, env },
      (err, stdout) => {
        const out = (stdout || '').trim();
        if (out.startsWith('OK')) {
          // Success
        } else if (attempts < 10) {
          setTimeout(trySet, 500);
        }
      }
    );
  };

  setTimeout(trySet, 1000);
}

let lastSize = { width: 0, height: 0 };
function fitToPrimaryDisplay() {
  if (!win || win.isDestroyed()) return;
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  if (!width || !height) return;
  if (width === lastSize.width && height === lastSize.height) return;
  lastSize = { width, height };
  // setBounds works regardless of the `resizable: false` flag on BrowserWindow.
  win.setBounds({ x: 0, y: 0, width, height });
}

// On GNOME, workAreaSize can report a stub size (e.g. 640x480) at first boot
// before Mutter finishes initializing. Poll for the first ~30s and apply any
// size change — cheap, bounded, and much more reliable than relying only on
// display-metrics-changed.
function startSizePolling() {
  const start = Date.now();
  const tick = () => {
    if (!win || win.isDestroyed()) return;
    fitToPrimaryDisplay();
    if (Date.now() - start < 30_000) setTimeout(tick, 500);
  };
  tick();
}

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  win = new BrowserWindow({
    x: 0,
    y: 0,
    width,
    height,
    // type: 'desktop' tells Electron to set _NET_WM_WINDOW_TYPE_DESKTOP
    // natively. Without this, Electron re-asserts NORMAL after every xprop
    // call and the window floats over other apps.
    type: 'desktop',
    frame: false,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    backgroundColor: '#0d1117',
    title: TITLE,
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
    },
  });

  win.setAlwaysOnTop(false);
  win.setVisibleOnAllWorkspaces(true);

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  win.on('closed', () => { win = null; });

  win.webContents.on('did-finish-load', () => {
    setDesktopWindowType();
    // After the DESKTOP window type is set, some WMs refuse further size
    // changes. Run a quick polling pass so we converge on the real display
    // size even if display-metrics-changed never fires.
    startSizePolling();
  });

  // Track screen resolution changes. GNOME fires display-metrics-changed on
  // resolution/scale updates; display-added/removed covers monitor hotplug.
  const onDisplayChange = () => { lastSize = { width: 0, height: 0 }; fitToPrimaryDisplay(); };
  screen.on('display-metrics-changed', onDisplayChange);
  screen.on('display-added',            onDisplayChange);
  screen.on('display-removed',          onDisplayChange);
  win.on('closed', () => {
    screen.off('display-metrics-changed', onDisplayChange);
    screen.off('display-added',            onDisplayChange);
    screen.off('display-removed',          onDisplayChange);
  });
}

// ── IPC ───────────────────────────────────────────────────────────────────────
ipcMain.handle('dd-get-screen-info', () => {
  const display = screen.getPrimaryDisplay();
  return {
    width:    display.size.width,
    height:   display.size.height,
    workArea: display.workAreaSize,
  };
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
