const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs   = require('fs');
const { exec, execSync, execFileSync } = require('child_process');

const GNUPG_DIR  = path.join(process.env.HOME, '.gnupg');
const AGENT_CONF = path.join(GNUPG_DIR, 'gpg-agent.conf');
const PASS_STORE = path.join(process.env.HOME, '.password-store');

// ── Window ───────────────────────────────────────────────────────────────────
let win;
app.setName('security-setup');
app.whenReady().then(() => {
  win = new BrowserWindow({
    width: 620, height: 580,
    title: 'RobOS GPG Pass Initializer',
    backgroundColor: '#0d1117',
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.setMenuBarVisibility(false);
});
app.on('window-all-closed', () => app.quit());

// ── Helpers ───────────────────────────────────────────────────────────────────
function run(cmd, opts = {}) {
  return new Promise((resolve, reject) => {
    exec(cmd, { timeout: 30000, env: { ...process.env, DISPLAY: ':0' }, ...opts },
      (err, stdout, stderr) => {
        if (err) reject(new Error(stderr || err.message));
        else resolve(stdout.trim());
      });
  });
}

function configureGpgAgent() {
  fs.mkdirSync(GNUPG_DIR, { recursive: true, mode: 0o700 });
  // Find best available pinentry binary
  let pinentry = '/usr/bin/pinentry-gtk-2';
  for (const p of ['/usr/bin/pinentry-gtk-2', '/usr/bin/pinentry-qt', '/usr/bin/pinentry-gnome3', '/usr/bin/pinentry']) {
    if (fs.existsSync(p)) { pinentry = p; break; }
  }
  const conf = [
    `pinentry-program ${pinentry}`,
    'default-cache-ttl 86400',   // cache passphrase all day
    'max-cache-ttl 86400',
    'allow-preset-passphrase',   // allows gpg-preset-passphrase to inject passphrase
  ].join('\n') + '\n';
  fs.writeFileSync(AGENT_CONF, conf, { mode: 0o600 });
  // Reload agent config (don't start a new daemon — just signal existing one)
  try { execSync('gpgconf --reload gpg-agent 2>/dev/null', { timeout: 3000 }); } catch {}
}

// ── IPC: status ───────────────────────────────────────────────────────────────
ipcMain.handle('get-security-status', async () => {
  // GPG keys
  let gpgKeys = [];
  try {
    const out = execSync('gpg --list-keys --with-colons 2>/dev/null', { encoding: 'utf8' });
    const uids = out.split('\n').filter(l => l.startsWith('uid:'));
    gpgKeys = uids.map(l => {
      const parts = l.split(':');
      return parts[9] || parts[7] || '';
    }).filter(Boolean);
  } catch {}

  // pass store initialized?
  const passReady = fs.existsSync(path.join(PASS_STORE, '.gpg-id'));

  // gpg-agent pinentry configured?
  let pinentryConfigured = false;
  try {
    const conf = fs.readFileSync(AGENT_CONF, 'utf8');
    pinentryConfigured = conf.includes('pinentry-program');
  } catch {}

  return { gpgKeys, passReady, pinentryConfigured };
});

// ── IPC: create GPG key ───────────────────────────────────────────────────────
ipcMain.handle('create-gpg-key', async (_, { name, email, passphrase }) => {
  const batch = `
%echo Generating RobOS GPG key
Key-Type: RSA
Key-Length: 4096
Subkey-Type: RSA
Subkey-Length: 4096
Name-Real: ${name}
Name-Email: ${email}
Expire-Date: 0
Passphrase: ${passphrase}
%commit
%echo done
`.trim();

  const batchFile = path.join(process.env.HOME, '.config', 'robos', '_gpg_batch.tmp');
  fs.mkdirSync(path.dirname(batchFile), { recursive: true });
  fs.writeFileSync(batchFile, batch, { mode: 0o600 });

  try {
    await run(`gpg --batch --gen-key "${batchFile}"`);
    fs.unlinkSync(batchFile);
    return { ok: true };
  } catch (e) {
    try { fs.unlinkSync(batchFile); } catch {}
    return { ok: false, error: e.message };
  }
});

// ── IPC: init pass ────────────────────────────────────────────────────────────
ipcMain.handle('init-pass', async (_, { gpgId }) => {
  try {
    await run(`pass init "${gpgId}"`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ── IPC: reset everything ─────────────────────────────────────────────────────
ipcMain.handle('reset-all', async () => {
  try {
    // Delete all GPG secret keys associated with the pass store
    const gpgIdFile = path.join(PASS_STORE, '.gpg-id');
    if (fs.existsSync(gpgIdFile)) {
      const gpgId = fs.readFileSync(gpgIdFile, 'utf8').trim();
      if (gpgId) {
        try { execSync(`gpg --batch --yes --delete-secret-and-public-key "${gpgId}" 2>/dev/null`); } catch {}
      }
    }
    // Delete pass store
    if (fs.existsSync(PASS_STORE)) {
      execSync(`rm -rf "${PASS_STORE}"`);
    }
    // Kill gpg-agent to clear cache
    try { execSync('gpgconf --kill gpg-agent 2>/dev/null'); } catch {}
    // Remove gpg-agent.conf
    try { fs.unlinkSync(AGENT_CONF); } catch {}
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('configure-pinentry', async () => {
  try {
    configureGpgAgent();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ── IPC: list GPG key IDs ─────────────────────────────────────────────────────
ipcMain.handle('list-gpg-keys', async () => {
  try {
    const out = execSync('gpg --list-keys --with-colons 2>/dev/null', { encoding: 'utf8' });
    const keys = [];
    let curFpr = '';
    for (const line of out.split('\n')) {
      const parts = line.split(':');
      if (parts[0] === 'fpr') curFpr = parts[9];
      if (parts[0] === 'uid') {
        keys.push({ id: curFpr, label: parts[9] || curFpr });
      }
    }
    return keys;
  } catch { return []; }
});
