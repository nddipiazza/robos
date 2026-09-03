const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const { exec, spawn } = require('child_process');

const HOME_DIR = process.env.HOME || os.homedir();
const CLI_DIR  = __dirname;

// Single-instance lock (bypassed in test mode)
if (process.env.ROBOS_TEST !== '1' && process.env.ROBOS_TEST_MODE !== '1') {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) { app.quit(); process.exit(0); }
}

app.setName('robos-cli');
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

// Debug server (optional)
let _debugServer = null;
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

let win = null;

app.whenReady().then(() => {
  win = new BrowserWindow({
    title: 'RobOS CLI Console',
    width: 920,
    height: 640,
    minWidth: 700,
    minHeight: 450,
    backgroundColor: '#0d1117',
    show: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.setMenuBarVisibility(false);

  win.once('ready-to-show', () => {
    win.show();
    win.focus();
  });

  if (_debugServer) _debugServer.startDebugServer(win, 19143);
});

app.on('window-all-closed', () => app.quit());

// ── IPC Handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('run-cli', async (_, { binary, args = [], input = '' }) => {
  const binPath = path.join(CLI_DIR, binary);
  if (!fs.existsSync(binPath)) {
    return { error: `Binary ${binary} not found at ${binPath}`, code: 127 };
  }

  return new Promise((resolve) => {
    const proc = spawn('bash', [binPath, ...args], {
      env: { ...process.env, HOME: HOME_DIR },
    });

    let stdout = '';
    let stderr = '';

    if (input) {
      proc.stdin.write(input);
      proc.stdin.end();
    }

    proc.stdout.on('data', d => stdout += d.toString());
    proc.stderr.on('data', d => stderr += d.toString());

    proc.on('close', (code) => {
      resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
});

ipcMain.handle('get-cli-tools', () => [
  { name: 'robos-notify', desc: 'Send categorized & tiered notifications' },
  { name: 'robos-active-task', desc: 'Session active task tracker' },
  { name: 'robos-journal-append', desc: 'Git work journal logger' },
  { name: 'robos-event', desc: 'Event Bus publisher and listener' },
]);
