const { app, BrowserWindow, ipcMain, shell, nativeImage } = require('electron');
const path  = require('path');
const { execSync, spawn } = require('child_process');

// ── single instance ───────────────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }

let win = null;
let loginProc = null;
let pollTimer = null;
let lastStatus = null; // 'ok' | 'fail'

const CHECK_INTERVAL_MS = 60_000;

app.on('second-instance', () => {
  // If another process tries to open us, just surface the window
  showWindow();
});

app.setName('github-login-manager');
app.whenReady().then(() => {
  createWindow();
  startPoller();
});

// ── window ────────────────────────────────────────────────────────────────────

function createWindow() {
  win = new BrowserWindow({
    width: 520, height: 460,
    title: 'RobOS GitHub Login Manager',
    backgroundColor: '#0d1117',
    show: false, // start hidden; only show when auth fails or user opens manually
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.setMenuBarVisibility(false);

  win.on('close', (e) => {
    // Hide instead of quit — poller keeps running in background.
    // The DM watchdog will reopen us if needed.
    e.preventDefault();
    win.hide();
  });
}

function showWindow() {
  if (!win) return;
  if (!win.isVisible()) win.show();
  win.focus();
  win.moveTop();
}

// ── auth polling ──────────────────────────────────────────────────────────────

function checkAuth() {
  let ok = false;
  let output = '';
  try {
    output = execSync('gh auth status 2>&1', { encoding: 'utf8', timeout: 15_000 }).trim();
    ok = output.toLowerCase().includes('logged in');
  } catch (e) {
    output = (e.stdout || e.stderr || e.message || '').trim();
    ok = false;
  }

  const newStatus = ok ? 'ok' : 'fail';

  // Push status to renderer if window is open
  if (win && !win.isDestroyed()) {
    win.webContents.send('auth-status', { ok, output });
  }

  // If status just flipped to fail → pop the window
  if (newStatus === 'fail' && lastStatus !== 'fail') {
    showWindow();
  }

  lastStatus = newStatus;
  return { ok, output };
}

function startPoller() {
  // Run immediately, then on interval
  checkAuth();
  pollTimer = setInterval(checkAuth, CHECK_INTERVAL_MS);
}

// ── IPC ───────────────────────────────────────────────────────────────────────

ipcMain.handle('get-status', () => checkAuth());

ipcMain.handle('start-login', () => {
  if (loginProc) {
    try { process.kill(loginProc.pid, 0); return { error: 'Login already in progress.' }; } catch {}
  }

  // gh auth login --web will print a one-time code + URL; we capture and forward to renderer
  loginProc = spawn('gh', ['auth', 'login', '--web', '--hostname', 'github.com'], {
    env: { ...process.env, GH_PROMPT_DISABLED: '0' },
  });

  loginProc.stdout.on('data', (d) => {
    const txt = d.toString();
    if (win && !win.isDestroyed()) win.webContents.send('login-output', txt);
  });
  loginProc.stderr.on('data', (d) => {
    const txt = d.toString();
    if (win && !win.isDestroyed()) win.webContents.send('login-output', txt);
  });
  loginProc.on('close', (code) => {
    loginProc = null;
    const result = checkAuth();
    if (win && !win.isDestroyed()) {
      win.webContents.send('login-done', { code, ok: result.ok });
    }
  });

  return { ok: true };
});

ipcMain.handle('cancel-login', () => {
  if (loginProc) { try { loginProc.kill(); } catch {} loginProc = null; }
  return { ok: true };
});

ipcMain.handle('open-url', (_, url) => {
  shell.openExternal(url);
  return { ok: true };
});

ipcMain.handle('hide-window', () => {
  if (win && !win.isDestroyed()) win.hide();
  return { ok: true };
});
