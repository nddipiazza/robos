const { app, BrowserWindow, ipcMain } = require('electron');
const path   = require('path');
const fs     = require('fs');
const { execFileSync, execSync } = require('child_process');

const CACHE_DIR       = path.join(process.env.HOME, '.cache', 'robos');
const UNLOCK_TIME_FILE = path.join(CACHE_DIR, 'pass-unlock-time');
const ACCESS_LOG      = path.join(CACHE_DIR, 'pass-access.log');
const PASS_STORE      = path.join(process.env.HOME, '.password-store');
const PRESET_BIN      = '/usr/lib/gnupg/gpg-preset-passphrase';

// Debug server (optional) — checks env override, local dev path, then VM install path
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

let win;
app.setName('pass-unlock');
app.setPath('userData', path.join(process.env.HOME || '/home/robos', '.config', 'robos', 'electron', 'pass-unlock'));
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }
app.on('second-instance', () => {
  const w = require('electron').BrowserWindow.getAllWindows()[0];
  if (w) { if (w.isMinimized()) w.restore(); w.focus(); }
});
app.whenReady().then(() => {
  win = new BrowserWindow({
    width: 460, height: 500,
    title: 'RobOS — Unlock Pass',
    backgroundColor: '#0d1117',
    resizable: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.setMenuBarVisibility(false);
  if (_debugServer) _debugServer.startDebugServer(win, 19122);
});
app.on('window-all-closed', () => app.quit());

// ── Helpers ──────────────────────────────────────────────────────────────────
function getKeygrips() {
  try {
    const out = execSync('gpg --with-keygrip --list-secret-keys --with-colons 2>/dev/null', { encoding: 'utf8' });
    return out.split('\n').filter(l => l.startsWith('grp:')).map(l => l.split(':')[9]).filter(Boolean);
  } catch { return []; }
}

function presetPassphrase(keygrip, passphrase) {
  // gpg-preset-passphrase reads passphrase from stdin
  execFileSync(PRESET_BIN, ['--preset', keygrip], {
    input: passphrase,
    encoding: 'utf8',
    timeout: 5000,
  });
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function isCacheActive() {
  try {
    const out = execSync('gpg-connect-agent "keyinfo --list" /bye 2>/dev/null', { encoding: 'utf8', timeout: 3000 });
    return out.split('\n').some(l => {
      const parts = l.trim().split(/\s+/);
      return parts[0] === 'S' && parts[1] === 'KEYINFO' && parts[6] === '1';
    });
  } catch { return false; }
}

function readAccessLog() {
  if (!fs.existsSync(ACCESS_LOG)) return { total: 0, agents: 0, user: 0, entries: [] };
  const today = todayISO();
  const lines = fs.readFileSync(ACCESS_LOG, 'utf8').trim().split('\n').filter(Boolean);
  let total = 0, agents = 0, user = 0;
  const entries = [];
  for (const line of lines) {
    const [ts, caller, op, entry] = line.split('|');
    if (!ts || !ts.startsWith(today)) continue;
    total++;
    if (caller === 'agent') agents++; else user++;
    entries.push({ ts, caller, op, entry: entry || '' });
  }
  return { total, agents, user, entries };
}

// ── IPC ──────────────────────────────────────────────────────────────────────
ipcMain.handle('get-status', () => {
  const passReady = fs.existsSync(path.join(PASS_STORE, '.gpg-id'));
  const keygrips  = getKeygrips();
  const log       = readAccessLog();
  const hour      = new Date().getHours();
  const greeting  = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  // Check if already unlocked today — requires BOTH a today timestamp AND live GPG cache.
  // If the store was reinitialized (new keys, old timestamp), the cache check returns false
  // and we correctly prompt for the passphrase again.
  let alreadyUnlocked = false;
  let unlockTime = null;
  if (fs.existsSync(UNLOCK_TIME_FILE) && isCacheActive()) {
    const ts = parseInt(fs.readFileSync(UNLOCK_TIME_FILE, 'utf8').trim());
    const d  = new Date(ts * 1000);
    if (d.toISOString().slice(0, 10) === todayISO()) {
      alreadyUnlocked = true;
      unlockTime = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
  }

  return { passReady, keygrips: keygrips.length, greeting, log, alreadyUnlocked, unlockTime };
});

ipcMain.handle('unlock', async (_, passphrase) => {
  const keygrips = getKeygrips();
  if (!keygrips.length) return { ok: false, error: 'No GPG keys found. Run GPG Pass Initializer first.' };
  if (!passphrase) return { ok: false, error: 'Passphrase is required.' };

  try {
    for (const kg of keygrips) {
      presetPassphrase(kg, passphrase);
    }
    // Record unlock time
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(UNLOCK_TIME_FILE, Math.floor(Date.now() / 1000).toString());
    // Log the unlock event
    const ts = new Date().toISOString();
    fs.appendFileSync(ACCESS_LOG, `${ts}|user|unlock|<daily-unlock>\n`);
    return { ok: true };
  } catch (e) {
    // Likely wrong passphrase
    return { ok: false, error: 'Wrong passphrase or GPG error: ' + e.message };
  }
});

ipcMain.handle('skip', () => {
  app.quit();
});
