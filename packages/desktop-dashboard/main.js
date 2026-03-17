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

// ── Push window to the desktop layer via xdotool/wmctrl ──────────────────────
function pushToDesktopLayer() {
  if (!win) return;
  const env = { ...process.env, DISPLAY: ':0' };
  // Retry a few times since the window may take a moment to register with X
  let attempts = 0;
  const tryPush = () => {
    attempts++;
    cp.exec(
      `wmctrl -r "${TITLE}" -b add,below,sticky 2>/dev/null; wmctrl -r "${TITLE}" -b add,skip_taskbar,skip_pager 2>/dev/null`,
      { timeout: 3000, env },
      (err) => {
        if (err && attempts < 5) {
          setTimeout(tryPush, 500);
        }
      }
    );
  };
  setTimeout(tryPush, 800);
}

function createWindow() {
  const display = screen.getPrimaryDisplay();

  win = new BrowserWindow({
    x: 0,
    y: 0,
    width:  display.size.width,
    height: display.size.height,
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

  // Once content is ready, push to desktop layer
  win.webContents.on('did-finish-load', () => {
    pushToDesktopLayer();
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
