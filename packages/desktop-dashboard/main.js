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
const TITLE = 'RobOS Desktop';

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

function createWindow() {
  const display = screen.getPrimaryDisplay();
  // Use workAreaSize to avoid covering the panel (dash-to-panel at bottom)
  const { width, height } = display.workAreaSize;

  win = new BrowserWindow({
    x: 0,
    y: 0,
    width,
    height,
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
