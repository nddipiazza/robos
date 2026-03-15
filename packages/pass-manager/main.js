const { app, BrowserWindow, ipcMain, clipboard } = require('electron');
const path  = require('path');
const fs    = require('fs');
const { exec, execSync, execFileSync } = require('child_process');


// Single-instance lock — second launch focuses the existing window
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }

const PASS_STORE = path.join(process.env.HOME, '.password-store');

let win;

app.on('second-instance', () => {
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); win.moveTop(); }
});

app.setName('pass-manager');
app.whenReady().then(() => {
  const iconPath = path.join(__dirname, 'icon.png');
  win = new BrowserWindow({
    skipTaskbar: true,
    width: 820, height: 600,
    title: 'RobOS Pass Manager',
    backgroundColor: '#0d1117',
    icon: iconPath,
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
    win.setAlwaysOnTop(true);
    win.focus();
    setTimeout(() => win.setAlwaysOnTop(false), 500);
    if (!isCacheActive()) launchUnlockDialog();
  });
});
app.on('window-all-closed', () => app.quit());

// ── Helpers ──────────────────────────────────────────────────────────────────
function run(cmd, opts = {}) {
  return new Promise((resolve, reject) => {
    exec(cmd, { timeout: 90000, env: { ...process.env, DISPLAY: process.env.DISPLAY || ':0' }, ...opts },
      (err, stdout, stderr) => {
        if (err) reject(new Error(stderr || err.message));
        else resolve(stdout.trim());
      });
  });
}

function walkStore(dir, prefix = '') {
  if (!fs.existsSync(dir)) return [];
  const items = [];
  for (const name of fs.readdirSync(dir).sort()) {
    if (name.startsWith('.')) continue;
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      const label = name;
      const children = walkStore(full, prefix ? prefix + '/' + name : name);
      items.push({ type: 'dir', name: label, path: prefix ? prefix + '/' + name : name, children });
    } else if (name.endsWith('.gpg')) {
      const entryName = name.slice(0, -4);
      const entryPath = prefix ? prefix + '/' + entryName : entryName;
      items.push({ type: 'entry', name: entryName, path: entryPath });
    }
  }
  return items;
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

// ── IPC ──────────────────────────────────────────────────────────────────────
ipcMain.handle('list-entries', () => {
  const initialized = fs.existsSync(path.join(PASS_STORE, '.gpg-id'));
  if (!initialized) return { ok: false, notInitialized: true, error: 'Pass store not initialized.' };
  try {
    return { ok: true, tree: walkStore(PASS_STORE), locked: !isCacheActive() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('init-store', async (_, { name, email, passphrase }) => {
  const dbg = (msg) => {
    fs.appendFileSync('/tmp/pass-init.log', `[${new Date().toISOString()}] ${msg}\n`);
  };
  fs.writeFileSync('/tmp/pass-init.log', '');
  try {
    dbg('start');
    const gnupgDir = path.join(process.env.HOME, '.gnupg');
    fs.mkdirSync(gnupgDir, { recursive: true, mode: 0o700 });
    const agentConf = path.join(gnupgDir, 'gpg-agent.conf');
    const agentConfContent = 'allow-preset-passphrase\ndefault-cache-ttl 86400\nmax-cache-ttl 86400\n';
    if (!fs.existsSync(agentConf) || !fs.readFileSync(agentConf, 'utf8').includes('allow-preset-passphrase')) {
      fs.writeFileSync(agentConf, agentConfContent, { mode: 0o600 });
    }
    dbg('gpg-agent.conf written');
    try { await run('gpgconf --kill gpg-agent'); dbg('agent killed'); } catch(e) { dbg('agent kill skipped: ' + e.message); }
    await new Promise(r => setTimeout(r, 1000));

    const batchInput = [
      '%echo Generating RobOS GPG key',
      'Key-Type: RSA',
      'Key-Length: 2048',
      'Subkey-Type: RSA',
      'Subkey-Length: 2048',
      `Name-Real: ${name}`,
      `Name-Email: ${email}`,
      'Expire-Date: 0',
      passphrase ? `Passphrase: ${passphrase}` : '%no-protection',
      '%commit',
      '%echo done',
    ].join('\n');

    const tmpBatch = path.join(process.env.HOME, '.config', 'robos', '_gpg_batch.tmp');
    fs.mkdirSync(path.dirname(tmpBatch), { recursive: true });
    fs.writeFileSync(tmpBatch, batchInput, { mode: 0o600 });
    dbg('batch file written');

    dbg('starting gpg keygen...');
    const gpgOut = await run(`gpg --batch --pinentry-mode loopback --gen-key "${tmpBatch}"`);
    dbg('gpg done: ' + gpgOut.slice(0, 100));
    fs.unlinkSync(tmpBatch);

    dbg('running pass init...');
    const passOut = await run(`pass init "${email}"`);
    dbg('pass init done: ' + passOut.slice(0, 100));

    // Preset the passphrase for ALL keygrips so pass can encrypt/decrypt without pinentry.
    if (passphrase) {
      try {
        const grips = execSync('gpg --with-keygrip --list-secret-keys --with-colons 2>/dev/null', { encoding: 'utf8' })
          .split('\n').filter(l => l.startsWith('grp:')).map(l => l.split(':')[9]).filter(Boolean);
        dbg('keygrips to preset: ' + grips.join(', '));
        for (const grip of grips) {
          execFileSync('/usr/lib/gnupg/gpg-preset-passphrase', ['--preset', grip], {
            input: passphrase, encoding: 'utf8', timeout: 5000,
          });
          dbg('preset ok: ' + grip);
        }
      } catch (e) { dbg('preset passphrase failed (non-fatal): ' + e.message); }
    }

    return { ok: true };
  } catch (e) {
    dbg('ERROR: ' + e.message);
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('get-entry', async (_, entryPath) => {
  try {
    const out = await run(`pass show "${entryPath}"`);
    const lines = out.split('\n');
    const password = lines[0] || '';
    const meta = lines.slice(1).join('\n');
    return { ok: true, password, meta };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('copy-entry', async (_, entryPath) => {
  try {
    const out = await run(`pass show "${entryPath}"`);
    clipboard.writeText(out.split('\n')[0] || '');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('add-entry', async (_, { entryPath, value }) => {
  try {
    // pass insert --force reads from stdin
    await run(`printf '%s\n%s\n' "${value.replace(/'/g,"'\\''")}" "${value.replace(/'/g,"'\\''")}" | pass insert --force "${entryPath}"`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('add-multiline', async (_, { entryPath, value }) => {
  try {
    const tmp = path.join(process.env.HOME, '.config', 'robos', '_pass_insert.tmp');
    fs.mkdirSync(path.dirname(tmp), { recursive: true });
    fs.writeFileSync(tmp, value + '\n', { mode: 0o600 });
    await run(`pass insert --multiline --force "${entryPath}" < "${tmp}"`);
    fs.unlinkSync(tmp);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('delete-entry', async (_, entryPath) => {
  try {
    await run(`pass rm --force "${entryPath}"`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('rename-entry', async (_, { from, to }) => {
  try {
    await run(`pass mv "${from}" "${to}"`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('get-lock-status', () => {
  return { locked: !isCacheActive() };
});

function launchUnlockDialog() {
  const { spawn } = require('child_process');
  spawn(
    '/usr/local/share/robos/pass-unlock/node_modules/electron/dist/electron',
    ['/usr/local/share/robos/pass-unlock', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
    { env: { ...process.env, DISPLAY: process.env.DISPLAY || ':0' }, detached: true, stdio: 'ignore' }
  ).unref();
}

ipcMain.handle('open-unlock-dialog', () => {
  launchUnlockDialog();
});

ipcMain.handle('lock-store', () => {
  try {
    execSync('gpgconf --kill gpg-agent 2>/dev/null', { timeout: 3000 });
    const unlockFile = path.join(process.env.HOME, '.cache', 'robos', 'pass-unlock-time');
    try { fs.unlinkSync(unlockFile); } catch {}

    // Write sticky notification to robos-toast
    const notifFile = path.join(process.env.HOME, '.config', 'robos', 'notifications.json');
    let notifs = [];
    try { notifs = JSON.parse(fs.readFileSync(notifFile, 'utf8')); } catch {}
    notifs.push({
      id:      'pass-locked-' + Date.now(),
      title:   'Pass store locked',
      message: 'Agents cannot access secrets until you log in.',
      icon:    'lock',
      sticky:  true,
      read:    false,
      action:  { type: 'open-app', app: 'pass-unlock', label: 'Click here to log in →' },
      ts:      new Date().toISOString(),
    });
    fs.mkdirSync(path.dirname(notifFile), { recursive: true });
    fs.writeFileSync(notifFile, JSON.stringify(notifs, null, 2));

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('generate-entry', async (_, { entryPath, length }) => {
  try {
    await run(`pass generate --force "${entryPath}" ${length || 32}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});
